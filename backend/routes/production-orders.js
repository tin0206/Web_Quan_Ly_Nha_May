const express = require("express");
const router = express.Router();
const { getPool, sql } = require("../db");

router.get("/stats", async (req, res) => {
  try {
    // Optimized stats query - avoid full table scan on MESMaterialConsumption
    const statsResult = await getPool().request().query(`
      SELECT
        (SELECT COUNT(*) FROM ProductionOrders) as total,
        (SELECT COUNT(*) FROM ProductionOrders WHERE Status = 2) as completed,
        (
          SELECT COUNT(DISTINCT po.ProductionOrderId)
          FROM ProductionOrders po
          WHERE EXISTS (
            SELECT 1 FROM MESMaterialConsumption mmc 
            WHERE mmc.ProductionOrderNumber = po.ProductionOrderNumber
          )
        ) as inProgress
    `);

    const stats = statsResult.recordset[0];
    const stopped = stats.total - (stats.inProgress || 0);

    res.json({
      success: true,
      message: "Success",
      stats: {
        total: stats.total,
        inProgress: stats.inProgress || 0,
        completed: stats.completed || 0,
        stopped: stopped,
      },
    });
  } catch (error) {
    console.error("❌ Lỗi khi lấy thống kê: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi: " + error.message,
    });
  }
});

// API: Get stats with filters (searchQuery, dateFrom, dateTo, processAreas)
router.get("/stats/search", async (req, res) => {
  try {
    const searchQuery = req.query.searchQuery || "";
    const dateFrom = req.query.dateFrom || "";
    const dateTo = req.query.dateTo || "";
    const processAreas = req.query.processAreas || "";

    let whereConditions = [];
    let baseRequest = getPool().request();

    if (searchQuery && searchQuery.trim() !== "") {
      baseRequest.input("searchQuery", sql.NVarChar, `%${searchQuery.trim()}%`);
      whereConditions.push(`(
        ProductionOrderNumber LIKE @searchQuery OR
        ProductCode LIKE @searchQuery OR
        ProductionLine LIKE @searchQuery OR
        RecipeCode LIKE @searchQuery
      )`);
    }
    if (dateFrom) {
      baseRequest.input("dateFrom", sql.DateTime2, new Date(dateFrom));
      whereConditions.push(
        `CAST(PlannedStart AS DATE) >= CAST(@dateFrom AS DATE)`,
      );
    }
    if (dateTo) {
      baseRequest.input("dateTo", sql.DateTime2, new Date(dateTo));
      whereConditions.push(
        `CAST(PlannedStart AS DATE) <= CAST(@dateTo AS DATE)`,
      );
    }
    if (processAreas && processAreas.trim() !== "") {
      const processAreasArray = processAreas
        .split(",")
        .map((pa) => pa.trim())
        .filter((pa) => pa);
      if (processAreasArray.length > 0) {
        const processAreaPlaceholders = processAreasArray
          .map((_, i) => `@processArea${i}`)
          .join(",");
        processAreasArray.forEach((pa, i) => {
          baseRequest.input(`processArea${i}`, sql.NVarChar, pa);
        });
        whereConditions.push(`ProcessArea IN (${processAreaPlaceholders})`);
      }
    }
    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // Helper for WHERE/AND logic
    function getWhereAndClause(baseWhere, extra) {
      if (!baseWhere) return `WHERE ${extra}`;
      return `${baseWhere} AND ${extra}`;
    }

    // Query stats with filter (fix WHERE/AND logic)
    const statsResult = await baseRequest.query(`
      SELECT
        (SELECT COUNT(*) FROM ProductionOrders ${whereClause}) as total,
        (SELECT COUNT(*) FROM ProductionOrders ${getWhereAndClause(whereClause, "Status = 2")}) as completed,
        (
          SELECT COUNT(DISTINCT po.ProductionOrderId)
          FROM ProductionOrders po
          ${whereClause}
          ${whereClause ? "AND" : "WHERE"} EXISTS (
            SELECT 1 FROM MESMaterialConsumption mmc 
            WHERE mmc.ProductionOrderNumber = po.ProductionOrderNumber
          )
        ) as inProgress
    `);
    const stats = statsResult.recordset[0];
    const stopped = stats.total - (stats.inProgress || 0);
    res.json({
      success: true,
      message: "Success",
      stats: {
        total: stats.total,
        inProgress: stats.inProgress || 0,
        completed: stats.completed || 0,
        stopped: stopped,
      },
    });
  } catch (error) {
    console.error("❌ Lỗi khi lấy thống kê có filter: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi: " + error.message,
    });
  }
});

// Get production orders - Simple endpoint (pagination only)
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    // Only do expensive COUNT on first page
    // For subsequent pages, frontend should pass cached total from page 1
    let totalRecords = parseInt(req.query.total) || 0;
    if (page === 1 || totalRecords === 0) {
      const countResult = await getPool()
        .request()
        .query(`SELECT COUNT(*) as total FROM ProductionOrders`);
      totalRecords = countResult.recordset[0].total;
    }

    const totalPages = totalRecords > 0 ? Math.ceil(totalRecords / limit) : 0;

    // Get paginated data with ProductMasters join
    const result = await getPool()
      .request()
      .query(
        `SELECT 
          po.*,
          pm.ItemName
        FROM ProductionOrders po
        LEFT JOIN ProductMasters pm ON po.ProductCode = pm.ItemCode
        ORDER BY po.ProductionOrderId DESC 
        OFFSET ${skip} ROWS FETCH NEXT ${limit} ROWS ONLY`,
      );

    // Get batch info ONLY for the paginated orders (not all)
    const productionOrderNumbers = result.recordset.map(
      (o) => o.ProductionOrderNumber,
    );
    const productionOrderIds = result.recordset.map((o) => o.ProductionOrderId);
    let batchMaps = { batchNumbers: new Map(), totalBatches: new Map() };

    if (productionOrderNumbers.length > 0) {
      // Get CurrentBatch from MESMaterialConsumption (MAX BatchCode)
      const poPlaceholders = productionOrderNumbers
        .map((_, i) => `@po${i}`)
        .join(",");

      const currentBatchRequest = getPool().request();
      productionOrderNumbers.forEach((num, i) => {
        currentBatchRequest.input(`po${i}`, sql.NVarChar, num);
      });

      const currentBatchResult = await currentBatchRequest.query(`
        SELECT 
          ProductionOrderNumber,
          MAX(BatchCode) as maxBatchCode
        FROM MESMaterialConsumption
        WHERE ProductionOrderNumber IN (${poPlaceholders})
        GROUP BY ProductionOrderNumber
      `);

      currentBatchResult.recordset.forEach((row) => {
        batchMaps.batchNumbers.set(row.ProductionOrderNumber, row.maxBatchCode);
      });
    }

    // Get TotalBatches from Batches table
    if (productionOrderIds.length > 0) {
      const idPlaceholders = productionOrderIds
        .map((_, i) => `@id${i}`)
        .join(",");

      const totalBatchRequest = getPool().request();
      productionOrderIds.forEach((id, i) => {
        totalBatchRequest.input(`id${i}`, sql.Int, id);
      });

      const totalBatchResult = await totalBatchRequest.query(`
        SELECT 
          ProductionOrderId,
          COUNT(*) as totalBatches
        FROM Batches
        WHERE ProductionOrderId IN (${idPlaceholders})
        GROUP BY ProductionOrderId
      `);

      totalBatchResult.recordset.forEach((row) => {
        batchMaps.totalBatches.set(row.ProductionOrderId, row.totalBatches);
      });
    }
    const runningOrderNumbers = new Set();

    if (productionOrderNumbers.length > 0) {
      const poPlaceholders = productionOrderNumbers
        .map((_, i) => `@po${i}`)
        .join(",");

      const runningRequest = getPool().request();
      productionOrderNumbers.forEach((num, i) => {
        runningRequest.input(`po${i}`, sql.NVarChar, num);
      });

      const runningOrdersResult = await runningRequest.query(
        `SELECT DISTINCT ProductionOrderNumber FROM MESMaterialConsumption WHERE ProductionOrderNumber IN (${poPlaceholders})`,
      );

      runningOrdersResult.recordset.forEach((row) => {
        runningOrderNumbers.add(row.ProductionOrderNumber);
      });
    }

    // Update status based on whether the order exists in MESMaterialConsumption
    const dataWithUpdatedStatus = result.recordset.map((order) => ({
      ...order,
      ProductCode: order.ItemName
        ? `${order.ProductCode} - ${order.ItemName}`
        : order.ProductCode,
      Status: runningOrderNumbers.has(order.ProductionOrderNumber) ? 1 : 0,
      CurrentBatch:
        batchMaps.batchNumbers.get(order.ProductionOrderNumber) || 0,
      TotalBatches: batchMaps.totalBatches.get(order.ProductionOrderId) || 0,
    }));

    res.json({
      success: true,
      message: "Success",
      total: totalRecords,
      totalPages: totalPages,
      page: page,
      limit: limit,
      data: dataWithUpdatedStatus,
    });
  } catch (error) {
    console.error("❌ Lỗi khi truy vấn dữ liệu: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi: " + error.message,
    });
  }
});

// Get production orders with advanced filters
router.get("/search", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
    const searchQuery = req.query.searchQuery || "";
    const dateFrom = req.query.dateFrom || "";
    const dateTo = req.query.dateTo || "";
    const processAreas = req.query.processAreas || "";
    const statuses = req.query.statuses || "";
    const skip = (page - 1) * limit;

    // Build statusArray (0: Đang chờ, 1: Đang chạy)
    let statusArray = [];
    if (statuses && statuses.trim() !== "") {
      statuses.split(",").forEach((s) => {
        if (s.trim() === "Đang chạy") {
          statusArray.push(1);
        } else if (s.trim() === "Đang chờ") {
          statusArray.push(0);
        }
      });
    }

    // Build WHERE clause for CTE
    let whereConditions = [];
    let baseRequest = getPool().request();

    if (searchQuery && searchQuery.trim() !== "") {
      baseRequest.input("searchQuery", sql.NVarChar, `%${searchQuery.trim()}%`);
      whereConditions.push(`(
        ProductionOrderNumber LIKE @searchQuery OR
        ProductCode LIKE @searchQuery OR
        ProductionLine LIKE @searchQuery OR
        RecipeCode LIKE @searchQuery
      )`);
    }

    if (dateFrom) {
      baseRequest.input("dateFrom", sql.DateTime2, new Date(dateFrom));
      whereConditions.push(
        `CAST(PlannedStart AS DATE) >= CAST(@dateFrom AS DATE)`,
      );
    }

    if (dateTo) {
      baseRequest.input("dateTo", sql.DateTime2, new Date(dateTo));
      whereConditions.push(
        `CAST(PlannedStart AS DATE) <= CAST(@dateTo AS DATE)`,
      );
    }

    if (processAreas && processAreas.trim() !== "") {
      const processAreasArray = processAreas
        .split(",")
        .map((pa) => pa.trim())
        .filter((pa) => pa);
      if (processAreasArray.length > 0) {
        const processAreaPlaceholders = processAreasArray
          .map((_, i) => `@processArea${i}`)
          .join(",");
        processAreasArray.forEach((pa, i) => {
          baseRequest.input(`processArea${i}`, sql.NVarChar, pa);
        });
        whereConditions.push(`ProcessArea IN (${processAreaPlaceholders})`);
      }
    }

    // Build status filter for CTE
    let statusFilter = "";
    if (statusArray.length > 0) {
      // Use parameterized query for statusArray
      const statusParams = statusArray.map((_, i) => `@status${i}`).join(",");
      statusFilter = `Status IN (${statusParams})`;
      statusArray.forEach((val, i) => {
        baseRequest.input(`status${i}`, sql.Int, val);
      });
    }

    // Combine all filters for CTE
    let allFilters = [...whereConditions];
    if (statusFilter) allFilters.push(statusFilter);
    const cteWhereClause =
      allFilters.length > 0 ? `WHERE ${allFilters.join(" AND ")}` : "";

    // Only do expensive COUNT on first page
    let totalRecords = parseInt(req.query.total) || 0;
    if (page === 1 || totalRecords === 0) {
      const poColumns = [
        "ProductionOrderId",
        "ProductionOrderNumber",
        "ProductCode",
        "ProductionLine",
        "RecipeCode",
        "RecipeVersion",
        "LotNumber",
        "ProcessArea",
        "PlannedStart",
        "PlannedEnd",
        "Quantity",
        "UnitOfMeasurement",
        "Plant",
        "Shopfloor",
        "Shift",
      ];
      const poColumnList = poColumns.map((col) => `po.[${col}]`).join(", ");
      const countCteSql = `WITH POStatus AS (
        SELECT 
          ${poColumnList},
          pm.ItemName,
          CASE WHEN EXISTS (SELECT 1 FROM MESMaterialConsumption mmc WHERE mmc.ProductionOrderNumber = po.ProductionOrderNumber) THEN 1 ELSE 0 END AS Status
        FROM ProductionOrders po
        LEFT JOIN ProductMasters pm ON po.ProductCode = pm.ItemCode
      )
      SELECT COUNT(*) as total FROM POStatus ${cteWhereClause}`;
      const countResult = await baseRequest.query(countCteSql);
      totalRecords = countResult.recordset[0].total;
    }

    const totalPages = totalRecords > 0 ? Math.ceil(totalRecords / limit) : 0;

    // Get paginated data with filters
    const paginatedRequest = getPool().request();
    // Copy parameters to new request
    if (searchQuery && searchQuery.trim() !== "") {
      paginatedRequest.input(
        "searchQuery",
        sql.NVarChar,
        `%${searchQuery.trim()}%`,
      );
    }
    if (dateFrom) {
      paginatedRequest.input("dateFrom", sql.DateTime2, new Date(dateFrom));
    }
    if (dateTo) {
      paginatedRequest.input("dateTo", sql.DateTime2, new Date(dateTo));
    }
    if (processAreas && processAreas.trim() !== "") {
      const processAreasArray = processAreas
        .split(",")
        .map((pa) => pa.trim())
        .filter((pa) => pa);
      if (processAreasArray.length > 0) {
        processAreasArray.forEach((pa, i) => {
          paginatedRequest.input(`processArea${i}`, sql.NVarChar, pa);
        });
      }
    }
    if (statusArray.length > 0) {
      statusArray.forEach((val, i) => {
        paginatedRequest.input(`status${i}`, sql.Int, val);
      });
    }

    // List all columns from ProductionOrders except Status to avoid duplicate column
    const poColumns = [
      "ProductionOrderId",
      "ProductionOrderNumber",
      "ProductCode",
      "ProductionLine",
      "RecipeCode",
      "RecipeVersion",
      "LotNumber",
      "ProcessArea",
      "PlannedStart",
      "PlannedEnd",
      "Quantity",
      "UnitOfMeasurement",
      "Plant",
      "Shopfloor",
      "Shift",
    ];
    const poColumnList = poColumns.map((col) => `po.[${col}]`).join(", ");
    const cteSql = `WITH POStatus AS (
      SELECT 
        ${poColumnList},
        pm.ItemName,
        CASE WHEN EXISTS (SELECT 1 FROM MESMaterialConsumption mmc WHERE mmc.ProductionOrderNumber = po.ProductionOrderNumber) THEN 1 ELSE 0 END AS Status
      FROM ProductionOrders po
      LEFT JOIN ProductMasters pm ON po.ProductCode = pm.ItemCode
    )
    SELECT * FROM POStatus
    ${cteWhereClause}
    ORDER BY ProductionOrderId DESC
    OFFSET ${skip} ROWS FETCH NEXT ${limit} ROWS ONLY`;
    const result = await paginatedRequest.query(cteSql);

    // Get batch info ONLY for the paginated orders (not all)
    const productionOrderNumbers = result.recordset.map(
      (o) => o.ProductionOrderNumber,
    );
    const productionOrderIds = result.recordset.map((o) => o.ProductionOrderId);
    let batchMaps = { batchNumbers: new Map(), totalBatches: new Map() };

    if (productionOrderNumbers.length > 0) {
      // Get CurrentBatch from MESMaterialConsumption (MAX BatchCode)
      const poPlaceholders = productionOrderNumbers
        .map((_, i) => `@po${i}`)
        .join(",");

      const currentBatchRequest = getPool().request();
      productionOrderNumbers.forEach((num, i) => {
        currentBatchRequest.input(`po${i}`, sql.NVarChar, num);
      });

      const currentBatchResult = await currentBatchRequest.query(`
        SELECT 
          ProductionOrderNumber,
          MAX(BatchCode) as maxBatchCode
        FROM MESMaterialConsumption
        WHERE ProductionOrderNumber IN (${poPlaceholders})
        GROUP BY ProductionOrderNumber
      `);

      currentBatchResult.recordset.forEach((row) => {
        batchMaps.batchNumbers.set(row.ProductionOrderNumber, row.maxBatchCode);
      });
    }

    // Get TotalBatches from Batches table
    if (productionOrderIds.length > 0) {
      const idPlaceholders = productionOrderIds
        .map((_, i) => `@id${i}`)
        .join(",");

      const totalBatchRequest = getPool().request();
      productionOrderIds.forEach((id, i) => {
        totalBatchRequest.input(`id${i}`, sql.Int, id);
      });

      const totalBatchResult = await totalBatchRequest.query(`
        SELECT 
          ProductionOrderId,
          COUNT(*) as totalBatches
        FROM Batches
        WHERE ProductionOrderId IN (${idPlaceholders})
        GROUP BY ProductionOrderId
      `);

      totalBatchResult.recordset.forEach((row) => {
        batchMaps.totalBatches.set(row.ProductionOrderId, row.totalBatches);
      });
    }
    const runningOrderNumbers = new Set();

    if (productionOrderNumbers.length > 0) {
      const poPlaceholders = productionOrderNumbers
        .map((_, i) => `@po${i}`)
        .join(",");

      const runningRequest = getPool().request();
      productionOrderNumbers.forEach((num, i) => {
        runningRequest.input(`po${i}`, sql.NVarChar, num);
      });

      const runningOrdersResult = await runningRequest.query(
        `SELECT DISTINCT ProductionOrderNumber FROM MESMaterialConsumption WHERE ProductionOrderNumber IN (${poPlaceholders})`,
      );

      runningOrdersResult.recordset.forEach((row) => {
        runningOrderNumbers.add(row.ProductionOrderNumber);
      });
    }

    const dataWithUpdatedStatus = result.recordset.map((order) => ({
      ...order,
      ProductCode: order.ItemName
        ? `${order.ProductCode} - ${order.ItemName}`
        : order.ProductCode,
      Status: runningOrderNumbers.has(order.ProductionOrderNumber) ? 1 : 0,
      CurrentBatch:
        batchMaps.batchNumbers.get(order.ProductionOrderNumber) || 0,
      TotalBatches: batchMaps.totalBatches.get(order.ProductionOrderId) || 0,
    }));

    res.json({
      success: true,
      message: "Success",
      total: totalRecords,
      totalPages: totalPages,
      page: page,
      limit: limit,
      data: dataWithUpdatedStatus,
    });
  } catch (error) {
    console.error("❌ Lỗi khi tìm kiếm đơn hàng: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi: " + error.message,
    });
  }
});

module.exports = router;
