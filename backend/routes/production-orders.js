const express = require("express");
const router = express.Router();
const { getPool, sql } = require("../db");

router.get("/filters", async (req, res) => {
  try {
    const pool = getPool();
    const { dateFrom = "", dateTo = "" } = req.query;

    const request = pool.request();
    const where = [];

    if (dateFrom) {
      request.input("dateFrom", sql.DateTime2, new Date(dateFrom));
      where.push(`PlannedStart >= @dateFrom`);
    }
    if (dateTo) {
      request.input("dateTo", sql.DateTime2, new Date(dateTo));
      where.push(`PlannedStart < DATEADD(day, 1, @dateTo)`);
    }

    const whereClause = where.length ? `AND ${where.join(" AND ")}` : "";

    const result = await request.query(`
      SELECT DISTINCT ProcessArea FROM ProductionOrders WHERE ProcessArea IS NOT NULL AND LTRIM(RTRIM(ProcessArea)) <> '' ${whereClause};
      SELECT DISTINCT Shift FROM ProductionOrders WHERE Shift IS NOT NULL AND LTRIM(RTRIM(Shift)) <> '' ${whereClause};
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

router.get("/filters-v2", async (req, res) => {
  try {
    const pool = getPool();
    const { dateFrom = "", dateTo = "" } = req.query;

    const request = pool.request();
    const where = [];

    if (dateFrom) {
      request.input("dateFrom", sql.DateTime2, new Date(dateFrom));
      where.push(`PlannedStart >= @dateFrom`);
    }
    if (dateTo) {
      request.input("dateTo", sql.DateTime2, new Date(dateTo));
      where.push(`PlannedStart < DATEADD(day, 1, @dateTo)`);
    }

    const whereClause = where.length ? `AND ${where.join(" AND ")}` : "";

    const result = await request.query(`
      SELECT DISTINCT ProcessArea FROM ProductionOrders WHERE ProcessArea IS NOT NULL AND LTRIM(RTRIM(ProcessArea)) <> '' ${whereClause};
      SELECT DISTINCT Shift FROM ProductionOrders WHERE Shift IS NOT NULL AND LTRIM(RTRIM(Shift)) <> '' ${whereClause};
      SELECT DISTINCT ProductionOrderNumber FROM ProductionOrders WHERE ProductionOrderNumber IS NOT NULL AND LTRIM(RTRIM(ProductionOrderNumber)) <> '' ${whereClause} ORDER BY ProductionOrderNumber DESC;
    `);

    // MSSQL returns multiple recordsets for multiple queries
    const processAreas = result.recordsets[0].map((row) => row.ProcessArea);
    const shifts = result.recordsets[1].map((row) => row.Shift);
    const productionOrderNumbers = result.recordsets[2].map(
      (row) => row.ProductionOrderNumber,
    );

    res.json({
      processAreas,
      shifts,
      productionOrderNumbers,
    });
  } catch (error) {
    console.error("❌ Lỗi khi lấy filters:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// API: Get stats with filters (searchQuery, dateFrom, dateTo, processAreas)
router.get("/stats/search", async (req, res) => {
  try {
    const {
      searchQuery = "",
      dateFrom = "",
      dateTo = "",
      processAreas = "",
      shifts = "",
      statuses = "",
    } = req.query;

    const request = getPool().request();
    const where = [];

    // 1. Đồng bộ Search (Dùng @q cho giống /search)
    if (searchQuery.trim()) {
      request.input("q", sql.NVarChar, `%${searchQuery.trim()}%`);
      where.push(
        `(po.ProductionOrderNumber LIKE @q OR po.ProductCode LIKE @q OR po.ProductionLine LIKE @q OR po.RecipeCode LIKE @q)`,
      );
    }

    // 2. Đồng bộ Date
    if (dateFrom) {
      request.input("dateFrom", sql.DateTime2, new Date(dateFrom));
      where.push(`po.PlannedStart >= @dateFrom`);
    }
    if (dateTo) {
      request.input("dateTo", sql.DateTime2, new Date(dateTo));
      where.push(`po.PlannedStart < DATEADD(DAY, 1, @dateTo)`);
    }

    // 3. Đồng bộ Area & Shift
    const addInClause = (input, field, paramPrefix) => {
      if (input.trim()) {
        const arr = input
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
        const ps = arr.map((_, i) => `@${paramPrefix}${i}`).join(",");
        arr.forEach((v, i) =>
          request.input(`${paramPrefix}${i}`, sql.NVarChar, v),
        );
        where.push(`${field} IN (${ps})`);
      }
    };
    addInClause(processAreas, "po.ProcessArea", "pa");
    addInClause(shifts, "po.Shift", "sh");

    // 4. QUAN TRỌNG: Thêm logic Status để khớp với /search
    let statusCondition = "";
    if (statuses.trim()) {
      const arr = statuses.split(",").map((s) => s.trim());
      const conds = [];
      if (arr.includes("Đang chạy"))
        conds.push("mmc.ProductionOrderNumber IS NOT NULL");
      if (arr.includes("Đang chờ"))
        conds.push("mmc.ProductionOrderNumber IS NULL");
      if (conds.length === 1) statusCondition = conds[0];
      else if (conds.length === 2) statusCondition = `(${conds.join(" OR ")})`;
    }

    const whereClause =
      where.length || statusCondition
        ? `WHERE ${[...where, statusCondition].filter(Boolean).join(" AND ")}`
        : "";

    // 5. Query dùng LEFT JOIN y hệt /search để kết quả COUNT chính xác
    const result = await request.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN po.Status = 2 THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN mmc.ProductionOrderNumber IS NOT NULL THEN 1 ELSE 0 END) AS inProgress
      FROM ProductionOrders po
      LEFT JOIN (
        SELECT DISTINCT ProductionOrderNumber FROM MESMaterialConsumption
      ) mmc ON po.ProductionOrderNumber = mmc.ProductionOrderNumber
      ${whereClause}
    `);

    const stats = result.recordset[0] || {
      total: 0,
      completed: 0,
      inProgress: 0,
    };
    const total = stats.total || 0;
    const inProgress = stats.inProgress || 0;

    res.json({
      success: true,
      stats: {
        total,
        inProgress,
        completed: stats.completed || 0,
        stopped: total - inProgress, // Stopped bây giờ sẽ khớp vì total đã được lọc
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: Get stats with filters (searchQuery, dateFrom, dateTo, processAreas)
router.get("/stats-v2/search", async (req, res) => {
  try {
    const searchQuery = req.query.searchQuery || "";
    const dateFrom = req.query.dateFrom || "";
    const dateTo = req.query.dateTo || "";
    const processAreas = req.query.processAreas || "";
    const shifts = req.query.shifts || "";
    const statuses = req.query.statuses || "";
    const productionOrderNumbers =
      req.query.pos || req.query.productionOrderNumbers || "";
    const batchIds = req.query.batchIds || "";

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

    /* ================= SHIFT ================= */
    if (shifts.trim()) {
      const arr = shifts.split(",").map((v) => v.trim());
      const ps = arr.map((_, i) => `@sh${i}`).join(",");
      arr.forEach((v, i) => request.input(`sh${i}`, sql.NVarChar, v));
      where.push(`po.Shift IN (${ps})`);
    }

    let statusCondition = "";
    if (statuses.trim()) {
      const arr = statuses
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const conds = [];
      if (arr.includes("Bình thường")) {
        conds.push("po.Status = 1");
      }
      if (arr.includes("Đã hủy")) {
        conds.push("po.Status = -1");
      }

      if (conds.length === 1) {
        statusCondition = conds[0];
      } else if (conds.length > 1) {
        statusCondition = `(${conds.join(" OR ")})`;
      }
    }

    if (productionOrderNumbers.trim()) {
      request.input(
        "poSearch",
        sql.NVarChar,
        `%${productionOrderNumbers.trim()}%`,
      );
      where.push("po.ProductionOrderNumber LIKE @poSearch");
    }

    if (batchIds.trim()) {
      const arr = batchIds.split(",").map((v) => v.trim());

      if (arr.length > 0) {
        const ps = arr.map((_, i) => `@batch${i}`).join(",");
        arr.forEach((v, i) => request.input(`batch${i}`, sql.NVarChar, v));
        where.push(`b.BatchId IN (${ps})`);
      }
    }

    const whereClause =
      where.length || statusCondition
        ? `WHERE ${[...where, statusCondition].filter(Boolean).join(" AND ")}`
        : "";

    const result = await request.query(`
      WITH FilteredPO AS (
        SELECT DISTINCT
          po.ProductionOrderNumber,
          po.Status
        FROM ProductionOrders po
        LEFT JOIN Batches b
          ON b.ProductionOrderId = po.ProductionOrderId
        ${whereClause}
      )
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN Status = 2 THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN Status = 1 THEN 1 ELSE 0 END) AS inProgress,
        SUM(CASE WHEN Status = -1 THEN 1 ELSE 0 END) AS stopped
      FROM FilteredPO
    `);

    const stats = result.recordset[0];

    res.json({
      success: true,
      message: "Success",
      stats: {
        total: stats.total || 0,
        inProgress: stats.inProgress || 0,
        completed: stats.completed || 0,
        stopped: stats.stopped || 0,
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

// Get production orders with advanced filters
router.get("/search-v2", async (req, res) => {
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
      pos = "",
      batchIds = "",
    } = req.query;

    const productionOrderNumbers = pos || "";

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

    /* ================= PRODUCTION ORDER NUMBERS (POs) ================= */
    if (productionOrderNumbers.trim()) {
      request.input(
        "poSearch",
        sql.NVarChar,
        `%${productionOrderNumbers.trim()}%`,
      );
      where.push("po.ProductionOrderNumber LIKE @poSearch");
    }

    /* ================= BATCH IDs (JOIN Batches QUA EXISTS) ================= */
    if (batchIds.trim()) {
      const arr = batchIds.split(",").map((v) => v.trim());

      // Tìm PO có ít nhất 1 BatchId nằm trong danh sách chọn
      if (arr.length > 0) {
        const ps = arr.map((_, i) => `@batch${i}`).join(",");
        arr.forEach((v, i) => request.input(`batch${i}`, sql.NVarChar, v));
        where.push(
          `EXISTS (SELECT 1 FROM Batches b WHERE b.ProductionOrderId = po.ProductionOrderId AND b.BatchId IN (${ps}))`,
        );
      }
    }

    /* ================= STATUS (LOGIC GỐC – QUAN TRỌNG) ================= */
    let statusCondition = "";
    if (statuses.trim()) {
      const arr = statuses
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const conds = [];
      if (arr.includes("Bình thường")) {
        conds.push("po.Status = 1");
      }
      if (arr.includes("Đã hủy")) {
        conds.push("po.Status = -1");
      }

      if (conds.length === 1) {
        statusCondition = conds[0];
      } else if (conds.length > 1) {
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
        po.Status,

        pm.ItemName,
        rd.RecipeName,

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

    const rows = result.recordset;

    // Lấy thêm danh sách batches cho từng ProductionOrderId
    const poIds = Array.from(
      new Set(rows.map((r) => r.ProductionOrderId).filter(Boolean)),
    );

    let batchesByPoId = {};

    if (poIds.length > 0) {
      const batchReq = pool.request();
      const inParams = poIds
        .map((id, idx) => {
          const paramName = `poId${idx}`;
          batchReq.input(paramName, sql.Int, id);
          return `@${paramName}`;
        })
        .join(",");

      const batchesResult = await batchReq.query(`
        SELECT
          BatchId,
          ProductionOrderId,
          BatchNumber,
          Quantity,
          UnitOfMeasurement,
          Status
        FROM Batches
        WHERE ProductionOrderId IN (${inParams})
      `);

      batchesByPoId = batchesResult.recordset.reduce((acc, b) => {
        if (!acc[b.ProductionOrderId]) acc[b.ProductionOrderId] = [];
        acc[b.ProductionOrderId].push(b);
        return acc;
      }, {});
    }

    /* ================= FORMAT ================= */
    const data = rows.map((o) => ({
      ...o,
      ProductCode: o.ItemName
        ? `${o.ProductCode} - ${o.ItemName}`
        : o.ProductCode,
      RecipeCode:
        o.RecipeName && o.RecipeCode
          ? `${o.RecipeCode} - ${o.RecipeName}`
          : o.RecipeCode,
      batches: batchesByPoId[o.ProductionOrderId] || [],
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
