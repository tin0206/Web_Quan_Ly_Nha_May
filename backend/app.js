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

    // Get status counts (always all data for stats)
    const statusCountResult = await pool.request().query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN Status = 1 THEN 1 ELSE 0 END) as inProgress,
          SUM(CASE WHEN Status = 2 THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN Status = 0 THEN 1 ELSE 0 END) as failed
        FROM ProductionOrders
      `);
    const statusCounts = statusCountResult.recordset[0];

    // Get paginated data with filters
    const result = await request.query(
      `SELECT * FROM ProductionOrders ${whereClause} ORDER BY ProductionOrderId DESC OFFSET ${skip} ROWS FETCH NEXT ${limit} ROWS ONLY`,
    );

    res.json({
      success: true,
      message: "Success",
      total: totalRecords,
      totalPages: totalPages,
      page: page,
      limit: limit,
      stats: {
        total: statusCounts.total,
        inProgress: statusCounts.inProgress || 0,
        completed: statusCounts.completed || 0,
        failed: statusCounts.failed || 0,
      },
      data: result.recordset,
    });
  } catch (error) {
    console.error("❌ Lỗi khi truy vấn dữ liệu: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi: " + error.message,
    });
  }
});

// Create new production order
app.post("/api/production-orders", async (req, res) => {
  try {
    const {
      ProductionOrderNumber,
      ProductCode,
      ProductionLine,
      RecipeCode,
      RecipeVersion,
      LotNumber,
      Quantity,
      UnitOfMeasurement,
      PlannedStart,
      PlannedEnd,
      Shift,
      Plant,
      Shopfloor,
      ProcessArea,
      Status,
    } = req.body;

    const result = await pool
      .request()
      .input("ProductionOrderNumber", sql.NVarChar, ProductionOrderNumber)
      .input("ProductCode", sql.NVarChar, ProductCode)
      .input("ProductionLine", sql.NVarChar, ProductionLine)
      .input("RecipeCode", sql.NVarChar, RecipeCode)
      .input("RecipeVersion", sql.NVarChar, RecipeVersion)
      .input("LotNumber", sql.NVarChar, LotNumber)
      .input("Quantity", sql.Int, Quantity || 0)
      .input("UnitOfMeasurement", sql.NVarChar, UnitOfMeasurement)
      .input("PlannedStart", sql.DateTime2, PlannedStart)
      .input("PlannedEnd", sql.DateTime2, PlannedEnd || null)
      .input("Shift", sql.NVarChar, Shift)
      .input("Plant", sql.NVarChar, Plant)
      .input("Shopfloor", sql.NVarChar, Shopfloor)
      .input("ProcessArea", sql.NVarChar, ProcessArea)
      .input("Status", sql.Int, Status || 1)
      .query(`INSERT INTO ProductionOrders 
        (ProductionOrderNumber, ProductCode, ProductionLine, RecipeCode, RecipeVersion, 
         LotNumber, Quantity, UnitOfMeasurement, PlannedStart, PlannedEnd, Shift, 
         Plant, Shopfloor, ProcessArea, Status)
        VALUES 
        (@ProductionOrderNumber, @ProductCode, @ProductionLine, @RecipeCode, @RecipeVersion,
         @LotNumber, @Quantity, @UnitOfMeasurement, @PlannedStart, @PlannedEnd, @Shift,
         @Plant, @Shopfloor, @ProcessArea, @Status)`);
    res.json({
      success: true,
      message: "Tạo lệnh sản xuất thành công",
      data: req.body,
    });
  } catch (error) {
    console.error("Lỗi khi tạo lệnh sản xuất: ", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update production order
app.put("/api/production-orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      ProductCode,
      ProductionLine,
      RecipeCode,
      RecipeVersion,
      LotNumber,
      Quantity,
      UnitOfMeasurement,
      PlannedStart,
      PlannedEnd,
      Shift,
      Plant,
      Shopfloor,
      ProcessArea,
      Status,
    } = req.body;

    const result = await pool
      .request()
      .input("ProductionOrderId", sql.Int, id)
      .input("ProductCode", sql.NVarChar, ProductCode)
      .input("ProductionLine", sql.NVarChar, ProductionLine)
      .input("RecipeCode", sql.NVarChar, RecipeCode)
      .input("RecipeVersion", sql.NVarChar, RecipeVersion)
      .input("LotNumber", sql.NVarChar, LotNumber)
      .input("Quantity", sql.Int, Quantity || 0)
      .input("UnitOfMeasurement", sql.NVarChar, UnitOfMeasurement)
      .input("PlannedStart", sql.DateTime2, PlannedStart)
      .input("PlannedEnd", sql.DateTime2, PlannedEnd || null)
      .input("Shift", sql.NVarChar, Shift)
      .input("Plant", sql.NVarChar, Plant)
      .input("Shopfloor", sql.NVarChar, Shopfloor)
      .input("ProcessArea", sql.NVarChar, ProcessArea)
      .input("Status", sql.Int, Status || 1).query(`UPDATE ProductionOrders SET
        ProductCode = @ProductCode,
        ProductionLine = @ProductionLine,
        RecipeCode = @RecipeCode,
        RecipeVersion = @RecipeVersion,
        LotNumber = @LotNumber,
        Quantity = @Quantity,
        UnitOfMeasurement = @UnitOfMeasurement,
        PlannedStart = @PlannedStart,
        PlannedEnd = @PlannedEnd,
        Shift = @Shift,
        Plant = @Plant,
        Shopfloor = @Shopfloor,
        ProcessArea = @ProcessArea,
        Status = @Status
        WHERE ProductionOrderId = @ProductionOrderId`);

    res.json({
      success: true,
      message: "Cập nhật lệnh sản xuất thành công",
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật lệnh sản xuất: ", error.message);
    res.status(500).json({ success: false, message: error.message });
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

    res.json({
      success: true,
      message: "Lấy chi tiết đơn hàng thành công",
      data: result.recordset[0],
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
    const result = await pool
      .request()
      .input("ProductionOrderId", sql.Int, productionOrderId)
      .query(
        "SELECT * FROM Batches WHERE ProductionOrderId = @ProductionOrderId",
      );
    res.json({
      success: true,
      message: "Lấy danh sách lô sản xuất thành công",
      data: result.recordset,
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
      request.input("ingredientCode", sql.NVarChar, `%${ingredientCode.trim()}%`);
      filterConditions.push("ingredientCode LIKE @ingredientCode");
    }

    if (batchCode && batchCode.trim() !== "") {
      request.input("filterBatchCode", sql.NVarChar, `%${batchCode.trim()}%`);
      filterConditions.push("batchCode LIKE @filterBatchCode");
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

module.exports = { sql, pool };
