const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const config = {
  user: "sa",
  password: "123456",
  server: "localhost",
  database: "IGSMasanDB",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  port: 1433,
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
    const pageSize = 20;
    const skip = (page - 1) * pageSize;

    // Get total count
    const countResult = await pool
      .request()
      .query("SELECT COUNT(*) as total FROM ProductionOrders");
    const totalRecords = countResult.recordset[0].total;

    // Get status counts
    const statusCountResult = await pool.request().query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN Status = 1 THEN 1 ELSE 0 END) as inProgress,
          SUM(CASE WHEN Status = 2 THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN Status = 0 THEN 1 ELSE 0 END) as failed
        FROM ProductionOrders
      `);
    const statusCounts = statusCountResult.recordset[0];

    // Get paginated data
    const result = await pool
      .request()
      .query(
        `SELECT * FROM ProductionOrders ORDER BY ProductionOrderId DESC OFFSET ${skip} ROWS FETCH NEXT ${pageSize} ROWS ONLY`,
      );

    res.json({
      success: true,
      message: "Success",
      total: totalRecords,
      page: page,
      pageSize: pageSize,
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

app.listen(PORT, async () => {
  console.log(`Server đang chạy tại: http://localhost:${PORT}`);
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

//
app.get("/api/material-consumptions", async (req, res) => {
  try {
    const { batchCodes, productionOrderNumber } = req.query;
    const request = pool.request();
    let conditions = [];

    if (batchCodes && batchCodes.trim() !== "") {
      const batchCodesArray = batchCodes.split(",").map((code) => code.trim());

      const placeholders = batchCodesArray
        .map((_, i) => `@batchCode${i}`)
        .join(", ");

      batchCodesArray.forEach((code, i) => {
        request.input(`batchCode${i}`, sql.NVarChar, code);
      });

      conditions.push(`batchCode IN (${placeholders})`);
    }

    if (productionOrderNumber) {
      request.input("prodOrderNum", sql.NVarChar, productionOrderNumber);
      conditions.push("ProductionOrderNumber = @prodOrderNum");
    }

    if (conditions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cần cung cấp ít nhất batchCodes hoặc productionOrderNumber",
      });
    }

    const finalQuery = `
      SELECT * FROM MESMaterialConsumption 
      WHERE ${conditions.join(" OR ")}
      ORDER BY batchCode ASC, id DESC
    `;

    const result = await request.query(finalQuery);

    res.json({
      success: true,
      message: "Lấy danh sách tiêu hao vật liệu thành công",
      count: result.recordset.length,
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
