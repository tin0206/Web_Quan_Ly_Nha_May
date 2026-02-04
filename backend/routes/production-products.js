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

router.get("/types", async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT DISTINCT Item_Type FROM ProductMasters
    `);
    const types = result.recordset.map((row) => row.Item_Type);
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Tìm kiếm với filter và phân trang
router.get("/search", async (req, res) => {
  try {
    const {
      q = "",
      status = "",
      statuses = "",
      type = "",
      types = "",
      page = "1",
      pageSize = "20",
    } = req.query;

    const pageInt = Math.max(parseInt(page, 10) || 1, 1);
    const pageSizeInt = Math.min(
      Math.max(parseInt(pageSize, 10) || 20, 1),
      100,
    );
    const offset = (pageInt - 1) * pageSizeInt;

    const pool = getPool();

    const whereClauses = [];
    const statusUpper = (status || "").toUpperCase();
    const statusesList = (statuses || "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const typesList = (types || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    // Bind parameters safely
    const bindParams = (request) => {
      if (q) request.input("q", sql.NVarChar, `%${q}%`);
      if (statusesList.length > 0) {
        statusesList.forEach((st, idx) =>
          request.input(`status${idx}`, sql.NVarChar, st),
        );
      } else if (statusUpper === "ACTIVE") {
        request.input("status", sql.NVarChar, "ACTIVE");
      } else if (statusUpper === "INACTIVE") {
        request.input("inactiveStatus", sql.NVarChar, "INACTIVE");
      }
      if (typesList.length > 0) {
        typesList.forEach((tp, idx) =>
          request.input(`type${idx}`, sql.NVarChar, tp),
        );
      } else if (type) {
        request.input("type", sql.NVarChar, type);
      }
    };

    if (q)
      whereClauses.push(
        "(p.ItemCode LIKE @q OR p.ItemName LIKE @q OR p.[Group] LIKE @q)",
      );
    if (statusesList.length > 0) {
      const parts = statusesList.map((st, idx) =>
        st === "ACTIVE"
          ? `p.Item_Status = @status${idx}`
          : `(p.Item_Status = @status${idx} OR p.Item_Status IS NULL)`,
      );
      whereClauses.push(`(${parts.join(" OR ")})`);
    } else if (statusUpper === "ACTIVE") {
      whereClauses.push("p.Item_Status = @status");
    } else if (statusUpper === "INACTIVE") {
      whereClauses.push(
        "(p.Item_Status = @inactiveStatus OR p.Item_Status IS NULL)",
      );
    }

    if (typesList.length > 0) {
      const placeholders = typesList.map((_, idx) => `@type${idx}`).join(", ");
      whereClauses.push(`p.Item_Type IN (${placeholders})`);
    } else if (type) {
      whereClauses.push("p.Item_Type = @type");
    }

    const whereSql = whereClauses.length
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

    // Count total matching rows
    const totalReq = pool.request();
    bindParams(totalReq);
    const totalQuery = `
      SELECT COUNT(*) AS total
      FROM ProductMasters p
      ${whereSql}
    `;
    const totalResult = await totalReq.query(totalQuery);
    const total = totalResult.recordset[0]?.total || 0;

    // Fetch paged data (joined with MHUTypes)
    const dataReq = pool.request();
    bindParams(dataReq);
    dataReq.input("offset", sql.Int, offset);
    dataReq.input("pageSize", sql.Int, pageSizeInt);

    const dataQuery = `
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
        JSON_QUERY(
          (
            SELECT
              m.MHUTypeId,
              m.FromUnit,
              m.ToUnit,
              m.Conversion
            FROM MHUTypes m
            WHERE m.ProductMasterId = p.ProductMasterId
            FOR JSON PATH
          )
        ) AS MhuTypes
      FROM ProductMasters p
      ${whereSql}
      ORDER BY p.[timestamp] DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    const dataResult = await dataReq.query(dataQuery);
    const items = dataResult.recordset.map((row) => {
      let parsed = [];
      try {
        parsed = JSON.parse(row.MhuTypes || "[]");
      } catch (e) {
        parsed = [];
      }
      return { ...row, MhuTypes: parsed };
    });
    res.json({
      items,
      total,
      page: pageInt,
      pageSize: pageSizeInt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Thống kê có filter (q, status, type)
router.get("/stats/search", async (req, res) => {
  try {
    const {
      q = "",
      status = "",
      statuses = "",
      type = "",
      types = "",
    } = req.query;
    const pool = getPool();

    const whereClauses = [];
    const statusUpper = (status || "").toUpperCase();
    const statusesList = (statuses || "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const typesList = (types || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const bindParams = (request) => {
      if (q) request.input("q", sql.NVarChar, `%${q}%`);
      if (statusesList.length > 0) {
        statusesList.forEach((st, idx) =>
          request.input(`status${idx}`, sql.NVarChar, st),
        );
      } else if (statusUpper === "ACTIVE") {
        request.input("status", sql.NVarChar, "ACTIVE");
      } else if (statusUpper === "INACTIVE") {
        request.input("inactiveStatus", sql.NVarChar, "INACTIVE");
      }
      if (typesList.length > 0) {
        typesList.forEach((tp, idx) =>
          request.input(`type${idx}`, sql.NVarChar, tp),
        );
      } else if (type) {
        request.input("type", sql.NVarChar, type);
      }
    };

    if (q) {
      whereClauses.push(
        "(p.ItemCode LIKE @q OR p.ItemName LIKE @q OR p.[Group] LIKE @q)",
      );
    }
    if (statusesList.length > 0) {
      const parts = statusesList.map((st, idx) =>
        st === "ACTIVE"
          ? `p.Item_Status = @status${idx}`
          : `(p.Item_Status = @status${idx} OR p.Item_Status IS NULL)`,
      );
      whereClauses.push(`(${parts.join(" OR ")})`);
    } else if (statusUpper === "ACTIVE") {
      whereClauses.push("p.Item_Status = @status");
    } else if (statusUpper === "INACTIVE") {
      whereClauses.push(
        "(p.Item_Status = @inactiveStatus OR p.Item_Status IS NULL)",
      );
    }

    if (typesList.length > 0) {
      const placeholders = typesList.map((_, idx) => `@type${idx}`).join(", ");
      whereClauses.push(`p.Item_Type IN (${placeholders})`);
    } else if (type) {
      whereClauses.push("p.Item_Type = @type");
    }

    const whereSql = whereClauses.length
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

    const reqStats = pool.request();
    bindParams(reqStats);
    const queryStats = `
      SELECT
        COUNT(*) AS totalProducts,
        SUM(CASE WHEN p.Item_Status = 'ACTIVE' THEN 1 ELSE 0 END) AS activeProducts,
        COUNT(DISTINCT p.Item_Type) AS totalTypes,
        COUNT(DISTINCT p.Category) AS totalCategories,
        COUNT(DISTINCT p.[Group]) AS totalGroups
      FROM ProductMasters p
      ${whereSql}
    `;
    const result = await reqStats.query(queryStats);
    res.json(
      result.recordset[0] || {
        totalProducts: 0,
        activeProducts: 0,
        totalTypes: 0,
        totalCategories: 0,
        totalGroups: 0,
      },
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
