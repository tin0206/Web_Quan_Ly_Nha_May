// API: Thống kê tổng số sản phẩm và số sản phẩm active
const express = require("express");
const router = express.Router();
const { getPool, sql } = require("../db");

// API: Thống kê tổng số sản phẩm và số sản phẩm active
router.get("/stats", async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT
        COUNT(*) AS totalProducts,
        SUM(CASE WHEN Item_Status = 'ACTIVE' THEN 1 ELSE 0 END) AS activeProducts,
        COUNT(DISTINCT Item_Type) AS totalTypes,
        COUNT(DISTINCT Category) AS totalCategories,
        COUNT(DISTINCT [Group]) AS totalGroups
      FROM ProductMasters
    `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Lấy tất cả ProductMasters, join MHUTypes theo ProductMasterId
router.get("/", async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT 
        p.ProductMasterId,
        p.ItemCode,
        p.ItemName,
        p.Item_Type,
        p.[Group],
        p.Category,
        p.Brand,
        p.BaseUnit,
        p.InventoryUnit,
        p.Item_Status,
        p.[timestamp],
        m.MHUTypeId,
        m.FromUnit,
        m.ToUnit,
        m.Conversion
      FROM ProductMasters p
      LEFT JOIN MHUTypes m ON p.ProductMasterId = m.ProductMasterId
    `);
    const data = result.recordset;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
