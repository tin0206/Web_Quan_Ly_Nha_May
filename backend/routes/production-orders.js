const express = require("express");
const router = express.Router();
const { getPool, sql } = require("../db");

router.get("/filters", async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT DISTINCT ProcessArea FROM ProductionOrders WHERE ProcessArea IS NOT NULL AND LTRIM(RTRIM(ProcessArea)) <> '';
      SELECT DISTINCT Shift FROM ProductionOrders WHERE Shift IS NOT NULL AND LTRIM(RTRIM(Shift)) <> '';
    `);

    // MSSQL returns multiple recordsets for multiple queries
    const processAreas = result.recordsets[0].map((row) => row.ProcessArea);
    const shifts = result.recordsets[1].map((row) => row.Shift);

    res.json({
      processAreas,
      shifts,
    });
  } catch (error) {
    console.error("❌ Lỗi khi lấy filters:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.get("/stats", async (req, res) => {
  try {
    // Optimized stats query - avoid full table scan on MESMaterialConsumption
    const statsResult = await getPool().request().query(`
      WITH RunningPO AS (
        SELECT DISTINCT ProductionOrderNumber
        FROM MESMaterialConsumption
      )
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN po.Status = 2 THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN r.ProductionOrderNumber IS NOT NULL THEN 1 ELSE 0 END) AS inProgress
      FROM ProductionOrders po
      LEFT JOIN RunningPO r
        ON r.ProductionOrderNumber = po.ProductionOrderNumber;
    `);

    const stats = statsResult.recordset[0];
    const stopped = stats.total - (stats.inProgress || 0);

    res.json({
      success: true,
      message: "Success",
      stats: {
        total: stats.total,
        inProgress: stats.inProgress || 0,
        completed: stats.completed || 0,
        stopped: stopped,
      },
    });
  } catch (error) {
    console.error("❌ Lỗi khi lấy thống kê: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi: " + error.message,
    });
  }
});

// API: Get stats with filters (searchQuery, dateFrom, dateTo, processAreas)
router.get("/stats/search", async (req, res) => {
  try {
    const searchQuery = req.query.searchQuery || "";
    const dateFrom = req.query.dateFrom || "";
    const dateTo = req.query.dateTo || "";
    const processAreas = req.query.processAreas || "";
    const shifts = req.query.shifts || "";

    const request = getPool().request();
    const where = [];

    if (searchQuery.trim()) {
      request.input("search", sql.NVarChar, `%${searchQuery.trim()}%`);
      where.push(`(
        po.ProductionOrderNumber LIKE @search OR
        po.ProductCode LIKE @search OR
        po.ProductionLine LIKE @search OR
        po.RecipeCode LIKE @search
      )`);
    }

    if (dateFrom) {
      request.input("dateFrom", sql.DateTime2, new Date(dateFrom));
      where.push(`po.PlannedStart >= @dateFrom`);
    }

    if (dateTo) {
      request.input("dateTo", sql.DateTime2, new Date(dateTo));
      where.push(`po.PlannedStart < DATEADD(DAY, 1, @dateTo)`);
    }

    if (processAreas.trim()) {
      const arr = processAreas
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

      arr.forEach((v, i) => request.input(`pa${i}`, sql.NVarChar, v));
      where.push(
        `po.ProcessArea IN (${arr.map((_, i) => `@pa${i}`).join(",")})`,
      );
    }

    if (shifts.trim()) {
      const arr = shifts
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

      arr.forEach((v, i) => request.input(`sh${i}`, sql.NVarChar, v));
      where.push(`po.Shift IN (${arr.map((_, i) => `@sh${i}`).join(",")})`);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const result = await request.query(`
      WITH RunningPO AS (
        SELECT DISTINCT ProductionOrderNumber
        FROM MESMaterialConsumption
      )
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN po.Status = 2 THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN r.ProductionOrderNumber IS NOT NULL THEN 1 ELSE 0 END) AS inProgress
      FROM ProductionOrders po
      LEFT JOIN RunningPO r
        ON r.ProductionOrderNumber = po.ProductionOrderNumber
      ${whereClause}
    `);

    const stats = result.recordset[0];
    const stopped = stats.total - (stats.inProgress || 0);

    res.json({
      success: true,
      message: "Success",
      stats: {
        total: stats.total || 0,
        inProgress: stats.inProgress || 0,
        completed: stats.completed || 0,
        stopped,
      },
    });
  } catch (error) {
    console.error("❌ Lỗi khi lấy thống kê có filter:", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi: " + error.message,
    });
  }
});

// Get production orders - Simple endpoint (pagination only)
router.get("/", async (req, res) => {
  try {
    const pool = getPool();

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let totalRecords = parseInt(req.query.total) || 0;

    if (page === 1 || totalRecords === 0) {
      const countResult = await pool.request().query(`
        SELECT COUNT(*) AS total
        FROM ProductionOrders
      `);
      totalRecords = countResult.recordset[0].total;
    }

    const totalPages = totalRecords > 0 ? Math.ceil(totalRecords / limit) : 0;

    const result = await pool.request().query(`
      SELECT
          po.ProductionOrderId,
          po.ProductionOrderNumber,
          po.ProductionLine,
          po.ProductCode,
          po.RecipeCode,
          po.RecipeVersion,
          po.Shift,
          po.PlannedStart,
          po.PlannedEnd,
          po.Quantity,
          po.UnitOfMeasurement,
          po.LotNumber,
          po.Plant,
          po.Shopfloor,
          po.ProcessArea,

          pm.ItemName,
          rd.RecipeName,

          CASE
            WHEN mmc.ProductionOrderNumber IS NOT NULL THEN 1
            ELSE 0
          END AS Status,

          ISNULL(mmc.MaxBatchCode, 0) AS CurrentBatch,
          ISNULL(b.TotalBatches, 0) AS TotalBatches

      FROM ProductionOrders po

      LEFT JOIN ProductMasters pm
        ON po.ProductCode = pm.ItemCode

      LEFT JOIN RecipeDetails rd
        ON po.RecipeCode = rd.RecipeCode
       AND po.RecipeVersion = rd.Version
       AND po.ProductionLine = rd.ProductionLine

      /* ---- running + current batch ---- */
      LEFT JOIN (
        SELECT
            ProductionOrderNumber,
            MAX(BatchCode) AS MaxBatchCode
        FROM MESMaterialConsumption
        GROUP BY ProductionOrderNumber
      ) mmc
        ON po.ProductionOrderNumber = mmc.ProductionOrderNumber

      /* ---- total batches ---- */
      LEFT JOIN (
        SELECT
            ProductionOrderId,
            COUNT(*) AS TotalBatches
        FROM Batches
        GROUP BY ProductionOrderId
      ) b
        ON po.ProductionOrderId = b.ProductionOrderId

      ORDER BY po.ProductionOrderId DESC
      OFFSET ${offset} ROWS
      FETCH NEXT ${limit} ROWS ONLY
    `);

    const data = result.recordset.map((row) => ({
      ...row,
      ProductCode: row.ItemName
        ? `${row.ProductCode} - ${row.ItemName}`
        : row.ProductCode,
      RecipeCode:
        row.RecipeName && row.RecipeCode
          ? `${row.RecipeCode} - ${row.RecipeName}`
          : row.RecipeCode,
    }));

    res.json({
      success: true,
      message: "Success",
      total: totalRecords,
      totalPages,
      page,
      limit,
      data,
    });
  } catch (error) {
    console.error("❌ Lỗi API / :", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get production orders with advanced filters
router.get("/search", async (req, res) => {
  try {
    const pool = getPool();

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const {
      searchQuery = "",
      dateFrom = "",
      dateTo = "",
      processAreas = "",
      statuses = "",
      shifts = "",
    } = req.query;

    const request = pool.request();
    let where = [];

    /* ================= SEARCH ================= */
    if (searchQuery.trim()) {
      request.input("q", sql.NVarChar, `%${searchQuery.trim()}%`);
      where.push(`
        (
          po.ProductionOrderNumber LIKE @q OR
          po.ProductCode LIKE @q OR
          po.ProductionLine LIKE @q OR
          po.RecipeCode LIKE @q
        )
      `);
    }

    /* ================= DATE (INDEX SAFE) ================= */
    if (dateFrom) {
      request.input("dateFrom", sql.DateTime2, new Date(dateFrom));
      where.push(`po.PlannedStart >= @dateFrom`);
    }
    if (dateTo) {
      request.input("dateTo", sql.DateTime2, new Date(dateTo));
      where.push(`po.PlannedStart < DATEADD(day, 1, @dateTo)`);
    }

    /* ================= PROCESS AREA ================= */
    if (processAreas.trim()) {
      const arr = processAreas.split(",").map((v) => v.trim());
      const ps = arr.map((_, i) => `@pa${i}`).join(",");
      arr.forEach((v, i) => request.input(`pa${i}`, sql.NVarChar, v));
      where.push(`po.ProcessArea IN (${ps})`);
    }

    /* ================= SHIFT ================= */
    if (shifts.trim()) {
      const arr = shifts.split(",").map((v) => v.trim());
      const ps = arr.map((_, i) => `@sh${i}`).join(",");
      arr.forEach((v, i) => request.input(`sh${i}`, sql.NVarChar, v));
      where.push(`po.Shift IN (${ps})`);
    }

    /* ================= STATUS (LOGIC GỐC – QUAN TRỌNG) ================= */
    let statusCondition = "";

    if (statuses.trim()) {
      const arr = statuses.split(",").map((s) => s.trim());
      const conds = [];

      if (arr.includes("Đang chạy")) {
        conds.push("mmc.ProductionOrderNumber IS NOT NULL");
      }
      if (arr.includes("Đang chờ")) {
        conds.push("mmc.ProductionOrderNumber IS NULL");
      }

      if (conds.length === 1) {
        statusCondition = conds[0];
      } else if (conds.length === 2) {
        statusCondition = `(${conds.join(" OR ")})`;
      }
    }

    const whereClause =
      where.length || statusCondition
        ? `WHERE ${[...where, statusCondition].filter(Boolean).join(" AND ")}`
        : "";

    /* ================= COUNT (PAGE 1 ONLY) ================= */
    let total = parseInt(req.query.total) || 0;

    if (page === 1 || !total) {
      const countSql = `
        SELECT COUNT(*) AS total
        FROM ProductionOrders po
        LEFT JOIN (
          SELECT DISTINCT ProductionOrderNumber
          FROM MESMaterialConsumption
        ) mmc
          ON po.ProductionOrderNumber = mmc.ProductionOrderNumber
        ${whereClause}
      `;
      const c = await request.query(countSql);
      total = c.recordset[0].total;
    }

    /* ================= MAIN QUERY ================= */
    const sqlQuery = `
      SELECT
        po.ProductionOrderId,
        po.ProductionOrderNumber,
        po.ProductionLine,
        po.ProductCode,
        po.RecipeCode,
        po.RecipeVersion,
        po.LotNumber,
        po.ProcessArea,
        po.PlannedStart,
        po.PlannedEnd,
        po.Quantity,
        po.UnitOfMeasurement,
        po.Plant,
        po.Shopfloor,
        po.Shift,

        pm.ItemName,
        rd.RecipeName,

        CASE
          WHEN mmc.ProductionOrderNumber IS NOT NULL THEN 1
          ELSE 0
        END AS Status,

        ISNULL(mmc.MaxBatch, 0) AS CurrentBatch,
        ISNULL(b.TotalBatches, 0) AS TotalBatches

      FROM ProductionOrders po

      LEFT JOIN ProductMasters pm
        ON po.ProductCode = pm.ItemCode

      LEFT JOIN RecipeDetails rd
        ON po.RecipeCode = rd.RecipeCode
       AND po.RecipeVersion = rd.Version

      LEFT JOIN (
        SELECT
          ProductionOrderNumber,
          MAX(BatchCode) AS MaxBatch
        FROM MESMaterialConsumption
        GROUP BY ProductionOrderNumber
      ) mmc
        ON po.ProductionOrderNumber = mmc.ProductionOrderNumber

      LEFT JOIN (
        SELECT
          ProductionOrderId,
          COUNT(*) AS TotalBatches
        FROM Batches
        GROUP BY ProductionOrderId
      ) b
        ON po.ProductionOrderId = b.ProductionOrderId

      ${whereClause}
      ORDER BY po.ProductionOrderId DESC
      OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
    `;

    const result = await request.query(sqlQuery);

    /* ================= FORMAT ================= */
    const data = result.recordset.map((o) => ({
      ...o,
      ProductCode: o.ItemName
        ? `${o.ProductCode} - ${o.ItemName}`
        : o.ProductCode,
      RecipeCode:
        o.RecipeName && o.RecipeCode
          ? `${o.RecipeCode} - ${o.RecipeName}`
          : o.RecipeCode,
    }));

    res.json({
      success: true,
      message: "Success",
      total,
      totalPages: Math.ceil(total / limit),
      page,
      limit,
      data,
    });
  } catch (err) {
    console.error("❌ /search error:", err.message);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

module.exports = router;
