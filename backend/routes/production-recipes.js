const express = require("express");
const router = express.Router();
const { getPool, sql } = require("../db");

// API để lấy thống kê recipes
router.get("/stats", async (req, res) => {
  try {
    const statsResult = await getPool().request().query(`
      SELECT
        (SELECT COUNT(*) FROM RecipeDetails) as total,
        (SELECT COUNT(*) FROM RecipeDetails WHERE RecipeStatus = 'Active') as active,
        (SELECT COUNT(DISTINCT Version) FROM RecipeDetails) as totalVersions,
        (SELECT COUNT(*) FROM RecipeDetails WHERE RecipeStatus = 'Draft') as draft
    `);

    const stats = statsResult.recordset[0];

    res.json({
      success: true,
      message: "Success",
      stats: {
        total: stats.total || 0,
        active: stats.active || 0,
        totalVersions: stats.totalVersions || 0,
        draft: stats.draft || 0,
      },
    });
  } catch (error) {
    console.error("❌ Lỗi khi lấy thống kê recipes: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi: " + error.message,
    });
  }
});

// API để lấy tất cả RecipeDetails
router.get("/", async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT * FROM RecipeDetails
        ORDER BY RecipeDetailsId DESC
    `);

    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length,
    });
  } catch (error) {
    console.error("Error fetching RecipeDetails:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// API lấy danh sách recipes có phân trang, tìm kiếm, lọc trạng thái
router.get("/search", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : "";
    const status = req.query.status ? req.query.status.trim() : "";

    let where = "1=1";
    if (search) {
      where += ` AND (RecipeCode LIKE N'%${search.replace(/'/g, "''")}%'
        OR ProductCode LIKE N'%${search.replace(/'/g, "''")}%'
        OR ProductName LIKE N'%${search.replace(/'/g, "''")}%')`;
    }
    if (status) {
      if (status === "active") where += ` AND RecipeStatus = 'Active'`;
      else if (status === "draft") where += ` AND RecipeStatus = 'Draft'`;
      else if (status === "inactive")
        where += ` AND RecipeStatus NOT IN ('Active','Draft')`;
    }

    // Đếm tổng số bản ghi
    const countResult = await getPool().request().query(`
      SELECT COUNT(*) as total FROM RecipeDetails WHERE ${where}
    `);
    const total = countResult.recordset[0].total;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

    // Lấy dữ liệu trang hiện tại
    const result = await getPool().request().query(`
      SELECT * FROM RecipeDetails WHERE ${where}
      ORDER BY RecipeDetailsId DESC
      OFFSET ${skip} ROWS FETCH NEXT ${limit} ROWS ONLY
    `);

    res.json({
      success: true,
      data: result.recordset,
      total,
      totalPages,
      page,
      limit,
    });
  } catch (error) {
    console.error("Error fetching paged recipes:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
