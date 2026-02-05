const express = require("express");
const router = express.Router();
const { getPool, sql } = require("../db");

// List all items with optional pagination
router.get("/", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const pageSize = Math.max(parseInt(req.query.pageSize || "100", 10), 1);
    const offset = (page - 1) * pageSize;

    const query = `
      SELECT *
      FROM MESMaterialConsumption
      ORDER BY datetime DESC
      OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY;
    `;

    const result = await getPool().request().query(query);
    res.json({ success: true, message: "Success", data: result.recordset });
  } catch (error) {
    console.error("❌ Lỗi lấy tất cả items:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 1) Distinct Production Order Numbers
router.get("/production-orders", async (req, res) => {
  try {
    const result = await getPool().request().query(`
        SELECT DISTINCT productionOrderNumber
        FROM MESMaterialConsumption
        ORDER BY productionOrderNumber ASC
    `);

    res.json({
      success: true,
      message: "Success",
      data: result.recordset.map((r) => ({
        productionOrderNumber: r.productionOrderNumber,
      })),
    });
  } catch (error) {
    console.error("❌ Lỗi lấy danh sách PO:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2) Distinct Batch Codes (optional filter by productionOrderNumber)
router.get("/batch-codes", async (req, res) => {
  try {
    const { productionOrderNumber } = req.query;
    const request = getPool().request();

    const where = ["batchCode IS NOT NULL", "LTRIM(RTRIM(batchCode)) <> ''"];

    if (productionOrderNumber && productionOrderNumber.trim()) {
      request.input("po", sql.NVarChar, productionOrderNumber.trim());
      where.push("productionOrderNumber = @po");
    }

    const query = `
        SELECT batchCode
        FROM (
        SELECT DISTINCT batchCode
        FROM MESMaterialConsumption
        ) t
        ORDER BY CAST(batchCode AS INT) ASC;
    `;

    const result = await request.query(query);

    res.json({
      success: true,
      message: "Success",
      data: result.recordset.map((r) => ({ batchCode: r.batchCode })),
    });
  } catch (error) {
    console.error("❌ Lỗi lấy danh sách batch:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3) Distinct Ingredient Codes (optional filter by productionOrderNumber or batchCode)
router.get("/ingredients", async (req, res) => {
  try {
    const { productionOrderNumber, batchCode } = req.query;
    const request = getPool().request();

    const where = [
      "ingredientCode IS NOT NULL",
      "LTRIM(RTRIM(ingredientCode)) <> ''",
    ];

    if (productionOrderNumber && productionOrderNumber.trim()) {
      request.input("po", sql.NVarChar, productionOrderNumber.trim());
      where.push("productionOrderNumber = @po");
    }

    if (batchCode && batchCode.trim()) {
      request.input("bc", sql.NVarChar, batchCode.trim());
      where.push("batchCode = @bc");
    }

    const query = `
        SELECT DISTINCT ingredientCode
        FROM MESMaterialConsumption
        WHERE ${where.join(" AND ")}
        ORDER BY ingredientCode ASC
    `;

    const result = await request.query(query);

    res.json({
      success: true,
      message: "Success",
      data: result.recordset.map((r) => ({ ingredientCode: r.ingredientCode })),
    });
  } catch (error) {
    console.error("❌ Lỗi lấy danh sách ingredient:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper: build WHERE clause for search filters
function buildSearchWhere(req, request) {
  const where = [];

  // Production Orders (CSV)
  if (req.query.productionOrderNumber) {
    const values = String(req.query.productionOrderNumber)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (values.length) {
      const placeholders = values.map((v, i) => `@po${i}`);
      values.forEach((v, i) => request.input(`po${i}`, sql.NVarChar, v));
      where.push(`productionOrderNumber IN (${placeholders.join(",")})`);
    }
  }

  // Batch Codes (CSV)
  if (req.query.batchCode) {
    const values = String(req.query.batchCode)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (values.length) {
      const placeholders = values.map((v, i) => `@bc${i}`);
      values.forEach((v, i) => request.input(`bc${i}`, sql.NVarChar, v));
      where.push(`batchCode IN (${placeholders.join(",")})`);
    }
  }

  // Ingredient Codes (CSV)
  if (req.query.ingredientCode) {
    const values = String(req.query.ingredientCode)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (values.length) {
      const placeholders = values.map((v, i) => `@ing${i}`);
      values.forEach((v, i) => request.input(`ing${i}`, sql.NVarChar, v));
      where.push(`ingredientCode IN (${placeholders.join(",")})`);
    }
  }

  // Result/Status (CSV) — column name: respone
  if (req.query.respone) {
    const values = String(req.query.respone)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (values.length) {
      const placeholders = values.map((v, i) => `@rs${i}`);
      values.forEach((v, i) => request.input(`rs${i}`, sql.NVarChar, v));
      where.push(`respone IN (${placeholders.join(",")})`);
    }
  }

  // Date range — column name: datetime
  const fromDate = req.query.fromDate ? String(req.query.fromDate).trim() : "";
  const toDate = req.query.toDate ? String(req.query.toDate).trim() : "";
  if (fromDate && toDate) {
    request.input("fromDate", sql.DateTime, new Date(fromDate));
    request.input("toDate", sql.DateTime, new Date(toDate));
    where.push("datetime BETWEEN @fromDate AND @toDate");
  } else if (fromDate) {
    request.input("fromDate", sql.DateTime, new Date(fromDate));
    where.push("datetime >= @fromDate");
  } else if (toDate) {
    request.input("toDate", sql.DateTime, new Date(toDate));
    where.push("datetime <= @toDate");
  }

  return where.length ? `WHERE ${where.join(" AND ")}` : "";
}

// Search with filters + pagination
router.get("/search", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const pageSize = Math.max(parseInt(req.query.pageSize || "100", 10), 1);
    const offset = (page - 1) * pageSize;

    const request = getPool().request();
    const whereClause = buildSearchWhere(req, request);

    const query = `
      SELECT *
      FROM MESMaterialConsumption
      ${whereClause}
      ORDER BY datetime DESC
      OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY;
    `;

    const result = await request.query(query);
    res.json({ success: true, message: "Success", data: result.recordset });
  } catch (error) {
    console.error("❌ Lỗi tìm kiếm items:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Stats: total rows
router.get("/stats", async (req, res) => {
  try {
    const result = await getPool()
      .request()
      .query(`SELECT COUNT(*) AS total FROM MESMaterialConsumption`);
    const total = result.recordset[0]?.total ?? 0;
    res.json({ success: true, message: "Success", data: { total } });
  } catch (error) {
    console.error("❌ Lỗi thống kê tổng:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Stats: total rows matching filters
router.get("/stats/search", async (req, res) => {
  try {
    const request = getPool().request();
    const whereClause = buildSearchWhere(req, request);
    const query = `
      SELECT COUNT(*) AS total
      FROM MESMaterialConsumption
      ${whereClause};
    `;
    const result = await request.query(query);
    const total = result.recordset[0]?.total ?? 0;
    res.json({ success: true, message: "Success", data: { total } });
  } catch (error) {
    console.error("❌ Lỗi thống kê theo filter:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
