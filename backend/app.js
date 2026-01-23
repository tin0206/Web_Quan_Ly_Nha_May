const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const path = require("path");

// const API_ROUTE = `http://${window.location.hostname}:8000`;

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

app.listen(PORT, "0.0.0.0", () => {
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
    let baseRequest = pool.request();

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

    // Execute count and status queries in parallel
    const [countResult, statsResult] = await Promise.all([
      baseRequest.query(
        `SELECT COUNT(*) as total FROM ProductionOrders ${whereClause}`,
      ),
      pool.request().query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN Status = 2 THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN mmc.ProductionOrderNumber IS NOT NULL THEN 1 ELSE 0 END) as inProgress
        FROM ProductionOrders po
        LEFT JOIN (
          SELECT DISTINCT ProductionOrderNumber FROM MESMaterialConsumption
        ) mmc ON po.ProductionOrderNumber = mmc.ProductionOrderNumber
      `),
    ]);

    const totalRecords = countResult.recordset[0].total;
    const totalPages = Math.ceil(totalRecords / limit);
    const stats = statsResult.recordset[0];
    const stopped = stats.total - (stats.inProgress || 0);

    // Get paginated data with filters
    const paginatedRequest = pool.request();
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
    const productionOrderIds = result.recordset.map((o) => o.ProductionOrderId);
    let batchMaps = { batchNumbers: new Map(), totalBatches: new Map() };

    if (productionOrderIds.length > 0) {
      const placeholders = productionOrderIds
        .map((_, i) => `@id${i}`)
        .join(",");

      const batchRequest = pool.request();
      productionOrderIds.forEach((id, i) => {
        batchRequest.input(`id${i}`, sql.Int, id);
      });

      const batchResult = await batchRequest.query(`
        SELECT 
          ProductionOrderId,
          MAX(BatchNumber) as maxBatchNumber,
          COUNT(*) as totalBatches
        FROM Batches
        WHERE ProductionOrderId IN (${placeholders})
        GROUP BY ProductionOrderId
      `);

      batchResult.recordset.forEach((row) => {
        batchMaps.batchNumbers.set(row.ProductionOrderId, row.maxBatchNumber);
        batchMaps.totalBatches.set(row.ProductionOrderId, row.totalBatches);
      });
    }

    // Get running order numbers for status update
    const runningOrdersResult = await pool
      .request()
      .query(
        `SELECT DISTINCT ProductionOrderNumber FROM MESMaterialConsumption`,
      );
    const runningOrderNumbers = new Set(
      runningOrdersResult.recordset.map((row) => row.ProductionOrderNumber),
    );

    // Update status based on whether the order exists in MESMaterialConsumption
    const dataWithUpdatedStatus = result.recordset.map((order) => ({
      ...order,
      Status: runningOrderNumbers.has(order.ProductionOrderNumber) ? 1 : 0,
      CurrentBatch: batchMaps.batchNumbers.get(order.ProductionOrderId) || null,
      TotalBatches: batchMaps.totalBatches.get(order.ProductionOrderId) || 0,
    }));

    res.json({
      success: true,
      message: "Success",
      total: totalRecords,
      totalPages: totalPages,
      page: page,
      limit: limit,
      stats: {
        total: stats.total,
        inProgress: stats.inProgress || 0,
        completed: stats.completed || 0,
        stopped: stopped,
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

    // Get batches
    const batchesResult = await pool
      .request()
      .input("ProductionOrderId", sql.Int, productionOrderId)
      .query(
        "SELECT * FROM Batches WHERE ProductionOrderId = @ProductionOrderId",
      );

    res.json({
      success: true,
      message: "Lấy danh sách lô sản xuất thành công",
      data: batchesResult.recordset,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách lô sản xuất: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi: " + error.message,
    });
  }
});

// Get material consumptions - Simple endpoint (basic query only)
app.get("/api/material-consumptions", async (req, res) => {
  try {
    const { productionOrderNumber, page = 1, limit = 20 } = req.query;

    if (!productionOrderNumber || productionOrderNumber.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "productionOrderNumber là bắt buộc",
      });
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageLimit = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const offset = (pageNum - 1) * pageLimit;

    const request = pool.request();
    request.input("prodOrderNum", sql.NVarChar, productionOrderNumber.trim());

    // Simple query without complex filters
    const paginationQuery = `
      WITH FilteredData AS (
        SELECT 
          COUNT(*) OVER() as totalCount,
          mc.id,
          mc.productionOrderNumber,
          mc.batchCode,
          COALESCE(pm.ItemName, '') as itemName,
          mc.ingredientCode,
          mc.lot,
          mc.quantity,
          mc.unitOfMeasurement,
          mc.datetime,
          ROW_NUMBER() OVER (ORDER BY mc.batchCode ASC, mc.id DESC) as rn
        FROM MESMaterialConsumption mc
        LEFT JOIN ProductMasters pm ON mc.ingredientCode = pm.ItemCode
        WHERE mc.ProductionOrderNumber = @prodOrderNum
      )
      SELECT 
        totalCount,
        id,
        productionOrderNumber,
        batchCode,
        CASE 
          WHEN itemName IS NOT NULL AND itemName != '' THEN ingredientCode + ' - ' + itemName
          ELSE ingredientCode
        END as ingredientCode,
        lot,
        quantity,
        unitOfMeasurement,
        datetime
      FROM FilteredData
      WHERE rn BETWEEN ${offset + 1} AND ${offset + pageLimit}
      ORDER BY batchCode ASC, id DESC
    `;

    const result = await request.query(paginationQuery);

    if (result.recordset.length === 0) {
      return res.json({
        success: true,
        message: "Không có dữ liệu",
        page: pageNum,
        limit: pageLimit,
        totalCount: 0,
        totalPages: 0,
        data: [],
      });
    }

    const totalCount = result.recordset[0].totalCount;
    const totalPages = Math.ceil(totalCount / pageLimit);

    const data = result.recordset.map((row) => ({
      id: row.id,
      productionOrderNumber: row.productionOrderNumber,
      batchCode: row.batchCode,
      ingredientCode: row.ingredientCode,
      lot: row.lot,
      quantity: row.quantity,
      unitOfMeasurement: row.unitOfMeasurement,
      datetime: row.datetime,
    }));

    res.json({
      success: true,
      message: "Lấy danh sách tiêu hao vật liệu thành công",
      page: pageNum,
      limit: pageLimit,
      totalCount: totalCount,
      totalPages: totalPages,
      data: data,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách tiêu hao vật liệu: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi Server: " + error.message,
    });
  }
});

// Get material consumptions with advanced filters
app.get("/api/material-consumptions/search", async (req, res) => {
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

    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageLimit = Math.max(1, Math.min(100, parseInt(limit) || 10));
    const offset = (pageNum - 1) * pageLimit;

    let baseConditions = [];
    let filterConditions = [];
    const request = pool.request();

    // Base conditions (batchCodes OR productionOrderNumber)
    if (batchCodes && batchCodes.trim() !== "") {
      const batchCodesArray = batchCodes
        .split(",")
        .map((code) => code.trim())
        .filter((code) => code.length > 0);

      if (batchCodesArray.length > 0) {
        const placeholders = batchCodesArray
          .map((code, i) => {
            request.input(`batchCode${i}`, sql.NVarChar, code);
            return `@batchCode${i}`;
          })
          .join(", ");
        baseConditions.push(`mc.batchCode IN (${placeholders})`);
      }
    }

    if (productionOrderNumber && productionOrderNumber.trim() !== "") {
      request.input("prodOrderNum", sql.NVarChar, productionOrderNumber.trim());
      baseConditions.push("mc.ProductionOrderNumber = @prodOrderNum");
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
      filterConditions.push("mc.ingredientCode LIKE @ingredientCode");
    }

    if (batchCode && batchCode.trim() !== "") {
      request.input("filterBatchCode", sql.NVarChar, batchCode.trim());
      filterConditions.push("mc.batchCode = @filterBatchCode");
    }

    if (lot && lot.trim() !== "") {
      request.input("filterLot", sql.NVarChar, `%${lot.trim()}%`);
      filterConditions.push("mc.lot LIKE @filterLot");
    }

    if (quantity && quantity.trim() !== "") {
      const qtyValue = quantity.trim();
      request.input("filterQuantity", sql.NVarChar, qtyValue);
      filterConditions.push("mc.quantity = @filterQuantity");
    }

    const baseConditionString = baseConditions.join(" OR ");
    let whereClause = `(${baseConditionString})`;
    if (filterConditions.length > 0) {
      whereClause += ` AND ${filterConditions.join(" AND ")}`;
    }

    // Combined query using window function for count + pagination
    const combinedQuery = `
      SELECT 
        COUNT(*) OVER() as totalCount,
        mc.id,
        mc.productionOrderNumber,
        mc.batchCode,
        COALESCE(pm.ItemName, '') as itemName,
        mc.ingredientCode,
        mc.lot,
        mc.quantity,
        mc.unitOfMeasurement,
        mc.datetime,
        ROW_NUMBER() OVER (ORDER BY mc.batchCode ASC, mc.id DESC) as rn
      FROM MESMaterialConsumption mc
      LEFT JOIN ProductMasters pm ON mc.ingredientCode = pm.ItemCode
      WHERE ${whereClause}
    `;

    // Wrap with pagination
    const paginationQuery = `
      WITH FilteredData AS (
        ${combinedQuery}
      )
      SELECT 
        totalCount,
        id,
        productionOrderNumber,
        batchCode,
        CASE 
          WHEN itemName IS NOT NULL AND itemName != '' THEN ingredientCode + ' - ' + itemName
          ELSE ingredientCode
        END as ingredientCode,
        lot,
        quantity,
        unitOfMeasurement,
        datetime
      FROM FilteredData
      WHERE rn BETWEEN ${offset + 1} AND ${offset + pageLimit}
      ORDER BY batchCode ASC, id DESC
    `;

    const result = await request.query(paginationQuery);

    if (result.recordset.length === 0) {
      return res.json({
        success: true,
        message: "Không có dữ liệu",
        page: pageNum,
        limit: pageLimit,
        totalCount: 0,
        totalPages: 0,
        data: [],
      });
    }

    const totalCount = result.recordset[0].totalCount;
    const totalPages = Math.ceil(totalCount / pageLimit);

    // Format response
    const data = result.recordset.map((row) => ({
      id: row.id,
      productionOrderNumber: row.productionOrderNumber,
      batchCode: row.batchCode,
      ingredientCode: row.ingredientCode,
      lot: row.lot,
      quantity: row.quantity,
      unitOfMeasurement: row.unitOfMeasurement,
      datetime: row.datetime,
    }));

    res.json({
      success: true,
      message: "Lấy danh sách tiêu hao vật liệu thành công",
      page: pageNum,
      limit: pageLimit,
      totalCount: totalCount,
      totalPages: totalPages,
      data: data,
    });
  } catch (error) {
    console.error("Lỗi khi tìm kiếm tiêu hao vật liệu: ", error.message);
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

    // Get distinct batch codes from MESMaterialConsumption for this production order
    const result = await pool
      .request()
      .input("productionOrderNumber", sql.NVarChar, productionOrderNumber)
      .query(
        "SELECT DISTINCT batchCode FROM MESMaterialConsumption WHERE ProductionOrderNumber = @productionOrderNumber ORDER BY batchCode ASC",
      );

    res.json({
      success: true,
      message: "Lấy danh sách batch codes có dữ liệu thành công",
      data: result.recordset.map((row) => ({
        batchCode: row.batchCode,
      })),
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
