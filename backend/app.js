const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const PORT = process.env.PORT || 8000;

const app = express();

app.use(cors());
app.use(express.json());

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

let pool;

async function connectToDB() {
  try {
    pool = await sql.connect(config);
    console.log("✅ Đã kết nối thành công tới SQL Server (IGSMasanDB)");
  } catch (err) {
    console.error("Kết nối thất bại: ", err.message);
  }
}

connectToDB();

app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});

app.get("/", (req, res) => {
  res.render("index", { title: "Trang chủ sản phẩm" });
});

// Get production orders with pagination and status counts
app.get("/api/production-orders", async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "Database chưa kết nối",
      });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 20);
    const searchQuery = req.query.searchQuery || "";
    const dateFrom = req.query.dateFrom || "";
    const dateTo = req.query.dateTo || "";

    const skip = (page - 1) * limit;

    // Build WHERE clause
    let whereConditions = [];
    let request = pool.request();

    if (searchQuery && searchQuery.trim() !== "") {
      request.input("searchQuery", sql.NVarChar, `%${searchQuery.trim()}%`);
      whereConditions.push(`(
        ProductionOrderNumber LIKE @searchQuery OR
        ProductCode LIKE @searchQuery OR
        ProductionLine LIKE @searchQuery OR
        RecipeCode LIKE @searchQuery
      )`);
    }

    if (dateFrom) {
      request.input("dateFrom", sql.DateTime2, new Date(dateFrom));
      whereConditions.push(
        `CAST(PlannedStart AS DATE) >= CAST(@dateFrom AS DATE)`,
      );
    }

    if (dateTo) {
      request.input("dateTo", sql.DateTime2, new Date(dateTo));
      whereConditions.push(
        `CAST(PlannedStart AS DATE) <= CAST(@dateTo AS DATE)`,
      );
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // Get total count with filters
    const countResult = await request.query(
      `SELECT COUNT(*) as total FROM ProductionOrders ${whereClause}`,
    );
    const totalRecords = countResult.recordset[0].total;
    const totalPages = Math.ceil(totalRecords / limit);

    // Get status counts based on new logic
    // Get all production order numbers that exist in MESMaterialConsumption
    const runningOrdersResult = await pool
      .request()
      .query(
        `SELECT DISTINCT ProductionOrderNumber FROM MESMaterialConsumption`,
      );
    const runningOrderNumbers = new Set(
      runningOrdersResult.recordset.map((row) => row.ProductionOrderNumber),
    );

    // Count total and get other statuses
    const statusCountQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN Status = 2 THEN 1 ELSE 0 END) as completed
      FROM ProductionOrders
    `;
    const statusCountResult = await pool.request().query(statusCountQuery);
    const baseStatusCounts = statusCountResult.recordset[0];

    // Count inProgress and stopped based on MESMaterialConsumption
    const allOrdersResult = await pool
      .request()
      .query(`SELECT ProductionOrderNumber FROM ProductionOrders`);
    const inProgressCount = allOrdersResult.recordset.filter((order) =>
      runningOrderNumbers.has(order.ProductionOrderNumber),
    ).length;
    const stoppedCount = allOrdersResult.recordset.filter(
      (order) => !runningOrderNumbers.has(order.ProductionOrderNumber),
    ).length;

    const statusCounts = {
      total: baseStatusCounts.total,
      inProgress: inProgressCount,
      completed: baseStatusCounts.completed || 0,
      stopped: stoppedCount,
    };

    // Get paginated data with filters
    const result = await request.query(
      `SELECT * FROM ProductionOrders ${whereClause} ORDER BY ProductionOrderId DESC OFFSET ${skip} ROWS FETCH NEXT ${limit} ROWS ONLY`,
    );

    // Get current BatchNumber for each production order
    const batchNumbersResult = await pool.request().query(`
        SELECT ProductionOrderId, MAX(BatchNumber) as maxBatchNumber
        FROM Batches
        GROUP BY ProductionOrderId
      `);
    const batchNumberMap = new Map(
      batchNumbersResult.recordset.map((row) => [
        row.ProductionOrderId,
        row.maxBatchNumber,
      ]),
    );

    const totalBatchesResult = await pool.request().query(`
        SELECT ProductionOrderId, COUNT(*) as totalBatches
        FROM Batches
        GROUP BY ProductionOrderId
    `);
    const totalBatchesMap = new Map(
      totalBatchesResult.recordset.map((row) => [
        row.ProductionOrderId,
        row.totalBatches,
      ]),
    );

    // Update status based on whether the order exists in MESMaterialConsumption
    const dataWithUpdatedStatus = result.recordset.map((order) => ({
      ...order,
      Status: runningOrderNumbers.has(order.ProductionOrderNumber) ? 1 : 0,
      CurrentBatch: batchNumberMap.get(order.ProductionOrderId) || null,
      TotalBatches: totalBatchesMap.get(order.ProductionOrderId) || 0,
    }));

    res.json({
      success: true,
      message: "Success",
      total: totalRecords,
      totalPages: totalPages,
      page: page,
      limit: limit,
      stats: {
        total: statusCounts.total,
        inProgress: statusCounts.inProgress,
        completed: statusCounts.completed,
        stopped: statusCounts.stopped,
      },
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

// Render production order detail page
app.get("/production-order/:id", (req, res) => {
  res.render("production-order-detail", { orderId: req.params.id });
});

// Get production order detail by ID
app.get("/api/production-order/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "Database chưa kết nối",
      });
    }

    const result = await pool
      .request()
      .input("ProductionOrderId", sql.Int, id)
      .query(
        "SELECT * FROM ProductionOrders WHERE ProductionOrderId = @ProductionOrderId",
      );

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    const order = result.recordset[0];

    // Check if this order has any MESMaterialConsumption data
    const mesDataResult = await pool
      .request()
      .input("ProductionOrderNumber", sql.NVarChar, order.ProductionOrderNumber)
      .query(
        "SELECT COUNT(*) as count FROM MESMaterialConsumption WHERE ProductionOrderNumber = @ProductionOrderNumber",
      );

    const hasMESData = mesDataResult.recordset[0].count > 0;

    // Get current batch and total batches for progress calculation
    const batchDataResult = await pool
      .request()
      .input("ProductionOrderId", sql.Int, id).query(`
        SELECT 
          MAX(BatchNumber) as maxBatchNumber,
          COUNT(*) as totalBatches
        FROM Batches
        WHERE ProductionOrderId = @ProductionOrderId
      `);

    const currentBatch = batchDataResult.recordset[0]?.maxBatchNumber || 0;
    const totalBatches = batchDataResult.recordset[0]?.totalBatches || 0;

    // Update status dynamically and calculate progress like in modal view
    const dataWithUpdatedStatus = {
      ...order,
      Status: hasMESData ? 1 : 0,
      CurrentBatch: currentBatch,
      TotalBatches: totalBatches,
    };

    res.json({
      success: true,
      message: "Lấy chi tiết đơn hàng thành công",
      data: dataWithUpdatedStatus,
    });
  } catch (error) {
    console.error("Lỗi khi lấy chi tiết đơn hàng: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi: " + error.message,
    });
  }
});

// Get batches for a production order
app.get("/api/batches", async (req, res) => {
  try {
    const { productionOrderId } = req.query;

    // Get ProductionOrderNumber from ProductionOrders
    const orderResult = await pool
      .request()
      .input("ProductionOrderId", sql.Int, productionOrderId)
      .query(
        "SELECT ProductionOrderNumber FROM ProductionOrders WHERE ProductionOrderId = @ProductionOrderId",
      );

    if (orderResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    const productionOrderNumber =
      orderResult.recordset[0].ProductionOrderNumber;

    // Get batches
    const batchesResult = await pool
      .request()
      .input("ProductionOrderId", sql.Int, productionOrderId)
      .query(
        "SELECT * FROM Batches WHERE ProductionOrderId = @ProductionOrderId",
      );

    // Get actual quantities from MESMaterialConsumption grouped by batchCode and unitOfMeasurement
    const materialsResult = await pool
      .request()
      .input("ProductionOrderNumber", sql.NVarChar, productionOrderNumber)
      .query(`
    SELECT 
      LOWER(mmc.batchCode) AS batchCode,
      mmc.unitOfMeasurement,
      SUM(CAST(mmc.quantity AS FLOAT)) AS totalQuantity
    FROM ProductionOrders po
    JOIN Batches b
      ON po.ProductionOrderId = b.ProductionOrderId
    JOIN MESMaterialConsumption mmc
      ON b.BatchId = mmc.batchCode
    WHERE po.ProductionOrderNumber = @ProductionOrderNumber
    AND mmc.unitOfMeasurement IS NOT NULL
    AND LTRIM(RTRIM(mmc.unitOfMeasurement)) <> ''
    GROUP BY LOWER(mmc.batchCode), mmc.unitOfMeasurement
  `);
    // Create map for quick lookup - group all units for each batch code
    const materialsMap = new Map();
    materialsResult.recordset.forEach((material) => {
      const batchKey = material.batchCode;
      if (!materialsMap.has(batchKey)) {
        materialsMap.set(batchKey, []);
      }
      materialsMap.get(batchKey).push(material);
    });

    // Add actualQuantity to batches
    const batchesWithActualQty = batchesResult.recordset.map((batch) => {
      const batchKey = batch.BatchNumber.toLowerCase();
      const materials = materialsMap.get(batchKey);

      let actualQuantity = null;
      if (materials && materials.length > 0) {
        // Format all quantities with their units
        actualQuantity = materials
          .map((m) => `${m.totalQuantity} ${m.unitOfMeasurement}`)
          .join(", ");
      }

      return {
        ...batch,
        ActualQuantity: actualQuantity,
      };
    });

    res.json({
      success: true,
      message: "Lấy danh sách lô sản xuất thành công",
      data: batchesWithActualQty,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách lô sản xuất: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi: " + error.message,
    });
  }
});

// Get material consumptions with filters, search, and pagination
app.get("/api/material-consumptions", async (req, res) => {
  try {
    const {
      batchCodes,
      productionOrderNumber,
      page = 1,
      limit = 10,
      ingredientCode = "",
      batchCode = "",
      lot = "",
      quantity = "",
    } = req.query;
    const pageNum = parseInt(page) || 1;
    const pageLimit = parseInt(limit) || 10;
    const offset = (pageNum - 1) * pageLimit;

    const request = pool.request();
    let baseConditions = [];
    let filterConditions = [];

    // Base conditions (batchCodes OR productionOrderNumber)
    if (batchCodes && batchCodes.trim() !== "") {
      const batchCodesArray = batchCodes.split(",").map((code) => code.trim());

      const placeholders = batchCodesArray
        .map((_, i) => `@batchCode${i}`)
        .join(", ");

      batchCodesArray.forEach((code, i) => {
        request.input(`batchCode${i}`, sql.NVarChar, code);
      });

      baseConditions.push(`batchCode IN (${placeholders})`);
    }

    if (productionOrderNumber) {
      request.input("prodOrderNum", sql.NVarChar, productionOrderNumber);
      baseConditions.push("ProductionOrderNumber = @prodOrderNum");
    }

    if (baseConditions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cần cung cấp ít nhất batchCodes hoặc productionOrderNumber",
      });
    }

    // Add individual filters (AND with base conditions)
    if (ingredientCode && ingredientCode.trim() !== "") {
      request.input(
        "ingredientCode",
        sql.NVarChar,
        `%${ingredientCode.trim()}%`,
      );
      filterConditions.push("ingredientCode LIKE @ingredientCode");
    }

    if (batchCode && batchCode.trim() !== "") {
      request.input("filterBatchCode", sql.NVarChar, batchCode.trim());
      filterConditions.push("batchCode = @filterBatchCode");
    }

    if (lot && lot.trim() !== "") {
      request.input("filterLot", sql.NVarChar, `%${lot.trim()}%`);
      filterConditions.push("lot LIKE @filterLot");
    }

    if (quantity && quantity.trim() !== "") {
      request.input("filterQuantity", sql.NVarChar, `%${quantity.trim()}%`);
      filterConditions.push("CAST(quantity AS NVARCHAR) LIKE @filterQuantity");
    }

    const baseConditionString = baseConditions.join(" OR ");
    let whereClause = `(${baseConditionString})`;

    if (filterConditions.length > 0) {
      whereClause += ` AND (${filterConditions.join(" AND ")})`;
    }

    // Count total records
    const countQuery = `
      SELECT COUNT(*) as totalCount FROM MESMaterialConsumption 
      WHERE ${whereClause}
    `;

    const countResult = await request.query(countQuery);
    const totalCount = countResult.recordset[0].totalCount;
    const totalPages = Math.ceil(totalCount / pageLimit);

    // Fetch paginated data
    const dataQuery = `
      SELECT * FROM MESMaterialConsumption 
      WHERE ${whereClause}
      ORDER BY batchCode ASC, id DESC
      OFFSET ${offset} ROWS
      FETCH NEXT ${pageLimit} ROWS ONLY
    `;

    const result = await request.query(dataQuery);

    res.json({
      success: true,
      message: "Lấy danh sách tiêu hao vật liệu thành công",
      page: pageNum,
      limit: pageLimit,
      totalCount: totalCount,
      totalPages: totalPages,
      data: result.recordset,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách tiêu hao vật liệu: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi Server: " + error.message,
    });
  }
});

// Get batch codes that have materials in MESMaterialConsumption for a production order
app.get("/api/batch-codes-with-materials", async (req, res) => {
  try {
    const { productionOrderNumber } = req.query;

    if (!productionOrderNumber) {
      return res.status(400).json({
        success: false,
        message: "productionOrderNumber là bắt buộc",
      });
    }

    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "Database chưa kết nối",
      });
    }

    // Get batch codes with actual quantities grouped by unitOfMeasurement
    const result = await pool
      .request()
      .input("productionOrderNumber", sql.NVarChar, productionOrderNumber)
      .query(`
        SELECT 
          batchCode,
          CONCAT(SUM(CAST(quantity AS FLOAT)), ISNULL(unitOfMeasurement, '')) as actualQuantity
        FROM MESMaterialConsumption 
        WHERE ProductionOrderNumber = @productionOrderNumber
        AND unitOfMeasurement IS NOT NULL
        AND LTRIM(RTRIM(unitOfMeasurement)) <> ''
        GROUP BY batchCode, unitOfMeasurement
        ORDER BY batchCode ASC
      `);

    // Group all units by batch code
    const batchCodesMap = new Map();
    result.recordset.forEach((row) => {
      if (!batchCodesMap.has(row.batchCode)) {
        batchCodesMap.set(row.batchCode, []);
      }
      batchCodesMap.get(row.batchCode).push(row);
    });

    // Transform to array with combined actual quantities
    const data = Array.from(batchCodesMap.entries()).map(
      ([batchCode, materials]) => {
        const actualQuantity = materials
          .map((m) => m.actualQuantity)
          .join(", ");

        return {
          batchCode: batchCode,
          actualQuantity: actualQuantity,
        };
      },
    );

    res.json({
      success: true,
      message: "Lấy danh sách batch codes có dữ liệu thành công",
      data: data,
    });
  } catch (error) {
    console.error("Lỗi khi lấy batch codes: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi: " + error.message,
    });
  }
});

module.exports = { sql, pool };
