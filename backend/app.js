require("dotenv").config();

const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 8000;

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

// Connect tới app database (IGSMasanDB)
async function waitForSqlServer(maxRetries = 30, delay = 2000) {
  const masterConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 1433,
    database: "master",
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  };

  let retries = 0;
  while (retries < maxRetries) {
    try {
      const testPool = await sql.connect(masterConfig);
      await testPool.close();
      console.log("✅ SQL Server sẵn sàng");
      return true;
    } catch (err) {
      retries++;
      console.log(`⏳ Chờ SQL Server (${retries}/${maxRetries})...`);
      if (retries < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  console.error("❌ SQL Server không sẵn sàng sau 30 lần thử");
  return false;
}

// Connect tới app database (IGSMasanDB)
async function restoreDatabase() {
  let masterPool;
  try {
    const masterConfig = {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      server: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 1433,
      database: "master",
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    };

    masterPool = await sql.connect(masterConfig);
    console.log("🔄 Đang kiểm tra và restore database...");

    const restoreQuery = `
      IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = '${process.env.DB_NAME}')
      BEGIN
        RESTORE DATABASE [${process.env.DB_NAME}]
        FROM DISK = '/var/opt/mssql/backup/IGS-260116.bak'
        WITH REPLACE
      END
    `;

    await masterPool.request().query(restoreQuery);
    console.log("✅ Restore database thành công!");
    return true;
  } catch (err) {
    console.error("❌ Lỗi restore database:", err.message);
    return false;
  } finally {
    if (masterPool) {
      await masterPool.close();
    }
  }
}

// Connect tới app database (IGSMasanDB)
async function connectToAppDB() {
  try {
    pool = await sql.connect(config);
    console.log("✅ App connected to " + process.env.DB_NAME);
    return true;
  } catch (err) {
    console.error("❌ Lỗi kết nối tới app database:", err.message);
    return false;
  }
}

// Connect tới app database (IGSMasanDB)
async function startServer() {
  // Chờ SQL Server sẵn sàng
  const sqlReady = await waitForSqlServer();
  if (!sqlReady) {
    console.error("❌ Server không thể khởi động - SQL Server không sẵn sàng");
    process.exit(1);
  }

  // Restore database
  const restored = await restoreDatabase();
  if (!restored) {
    console.error("⚠️ Restore fail nhưng tiếp tục thử connect...");
  }

  // Thêm delay nhỏ để database sẵn sàng
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Connect tới app database
  const connected = await connectToAppDB();
  if (!connected) {
    console.error(
      "❌ Server không thể khởi động - không kết nối được app database",
    );
    process.exit(1);
  }

  // Khởi động Express server
  app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
  });
}

startServer();

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

// Delete production order
app.delete("/api/production-orders/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await pool
      .request()
      .input("ProductionOrderId", sql.Int, id)
      .query(
        "DELETE FROM ProductionOrders WHERE ProductionOrderId = @ProductionOrderId",
      );

    res.json({
      success: true,
      message: "Xóa lệnh sản xuất thành công",
    });
  } catch (error) {
    console.error("Lỗi khi xóa lệnh sản xuất: ", error.message);
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
      searchQuery = "",
    } = req.query;
    const pageNum = parseInt(page) || 1;
    const pageLimit = parseInt(limit) || 10;
    const offset = (pageNum - 1) * pageLimit;

    const request = pool.request();
    let baseConditions = [];
    let searchCondition = "";

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

    // Add search filter (AND with base conditions)
    if (searchQuery && searchQuery.trim() !== "") {
      request.input("searchQuery", sql.NVarChar, `%${searchQuery}%`);
      searchCondition = ` AND (
        ingredientCode LIKE @searchQuery OR 
        batchCode LIKE @searchQuery OR 
        lot LIKE @searchQuery OR 
        CAST(quantity AS NVARCHAR) LIKE @searchQuery
      )`;
    }

    const baseConditionString = baseConditions.join(" OR ");
    const whereClause = `(${baseConditionString})${searchCondition}`;

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
