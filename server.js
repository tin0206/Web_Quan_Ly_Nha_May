const express = require("express");
const sql = require("mssql");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

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

const PORT = process.env.PORT || 3000;

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

app.get("/api/production-orders", async (req, res) => {
  try {
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
        `SELECT * FROM ProductionOrders ORDER BY ProductionOrderId DESC OFFSET ${skip} ROWS FETCH NEXT ${pageSize} ROWS ONLY`
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
    console.error("Lỗi khi truy vấn dữ liệu: ", error.message);
    res.status(500).json({ success: false, message: "Fail" });
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
        "DELETE FROM ProductionOrders WHERE ProductionOrderId = @ProductionOrderId"
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

app.listen(PORT, async () => {
  console.log(`Server đang chạy tại: http://localhost:${PORT}`);
});

app.post("/api/production-orders/edit/:id", async (req, res) => {});
