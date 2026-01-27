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

    // Get paginated data
    const result = await getPool()
      .request()
      .query(
        `SELECT * FROM ProductionOrders ORDER BY ProductionOrderId DESC OFFSET ${skip} ROWS FETCH NEXT ${limit} ROWS ONLY`,
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

    const skip = (page - 1) * limit;

    // Build WHERE clause
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

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // Only do expensive COUNT on first page
    // For subsequent pages, frontend should pass cached total from page 1
    let totalRecords = parseInt(req.query.total) || 0;
    if (page === 1 || totalRecords === 0) {
      const countResult = await baseRequest.query(
        `SELECT COUNT(*) as total FROM ProductionOrders ${whereClause}`,
      );
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

    const result = await paginatedRequest.query(
      `SELECT * FROM ProductionOrders ${whereClause} ORDER BY ProductionOrderId DESC OFFSET ${skip} ROWS FETCH NEXT ${limit} ROWS ONLY`,
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
