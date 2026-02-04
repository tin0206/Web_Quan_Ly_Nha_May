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
        (SELECT COUNT(DISTINCT Version) FROM RecipeDetails) as totalVersions
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

// API thống kê có lọc theo từ khóa và trạng thái
router.get("/stats/search", async (req, res) => {
  try {
    const search = req.query.search ? String(req.query.search).trim() : "";
    const status = req.query.status ? String(req.query.status).trim() : "";
    const statusesParam = req.query.statuses
      ? String(req.query.statuses).trim()
      : "";

    const request = getPool().request();
    let whereCommon = "1=1";
    if (search) {
      request.input("search", sql.NVarChar, `%${search}%`);
      whereCommon +=
        " AND (RecipeCode LIKE @search OR ProductCode LIKE @search OR ProductName LIKE @search)";
    }

    // Build status clause supporting multiple selections
    let statusClause = "";
    if (statusesParam) {
      const statuses = statusesParam
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const parts = [];
      if (statuses.includes("active")) parts.push("RecipeStatus = 'Active'");
      if (statuses.includes("inactive"))
        parts.push("(RecipeStatus NOT IN ('Active') OR RecipeStatus IS NULL)");
      if (parts.length > 0) statusClause = ` AND (${parts.join(" OR ")})`;
    } else if (status) {
      if (status === "active") statusClause = " AND RecipeStatus = 'Active'";
      else if (status === "inactive")
        statusClause =
          " AND (RecipeStatus NOT IN ('Active') OR RecipeStatus IS NULL)";
    }

    const whereTotal = whereCommon + statusClause;

    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM RecipeDetails WHERE ${whereTotal}) as total,
        (SELECT COUNT(*) FROM RecipeDetails WHERE ${whereCommon} AND RecipeStatus = 'Active'${statusClause}) as active,
        (SELECT COUNT(DISTINCT Version) FROM RecipeDetails WHERE ${whereTotal}) as totalVersions
    `;

    const statsResult = await request.query(statsQuery);
    const stats = statsResult.recordset[0] || {};

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
    console.error("❌ Lỗi khi lấy thống kê recipes (search): ", error.message);
    res.status(500).json({ success: false, message: "Lỗi: " + error.message });
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
    const statusesParam = req.query.statuses ? req.query.statuses.trim() : "";

    let where = "1=1";
    if (search) {
      where += ` AND (RecipeCode LIKE N'%${search.replace(/'/g, "''")}%'
        OR ProductCode LIKE N'%${search.replace(/'/g, "''")}%'
        OR ProductName LIKE N'%${search.replace(/'/g, "''")}%')`;
    }
    // Multi-status support
    if (statusesParam) {
      const statuses = statusesParam
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const parts = [];
      if (statuses.includes("active")) parts.push("RecipeStatus = 'Active'");
      if (statuses.includes("inactive"))
        parts.push("(RecipeStatus NOT IN ('Active') OR RecipeStatus IS NULL)");
      if (parts.length > 0) where += ` AND (${parts.join(" OR ")})`;
    } else if (status) {
      if (status === "active") where += ` AND RecipeStatus = 'Active'`;
      else if (status === "inactive")
        where += ` AND (RecipeStatus NOT IN ('Active') OR RecipeStatus IS NULL)`;
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
