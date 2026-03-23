const express = require("express");
const router = express.Router();
const { getPool, sql } = require("../db");

// Helper: apply fromDate/toDate filter to WHERE array
function applyDateFilter(req, request, where, tableAlias) {
  const col = tableAlias ? `${tableAlias}.datetime` : "datetime";
  const fromDateRaw = req.query.fromDate
    ? String(req.query.fromDate).trim()
    : "";
  const toDateRaw = req.query.toDate ? String(req.query.toDate).trim() : "";

  function normalizeDateBoundary(str, boundary) {
    if (!str) return null;
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(str);
    try {
      if (isDateOnly) {
        return new Date(
          str + (boundary === "start" ? "T00:00:00" : "T23:59:59.999"),
        );
      }
      return new Date(str);
    } catch (_) {
      return null;
    }
  }

  const fromDate = normalizeDateBoundary(fromDateRaw, "start");
  const toDate = normalizeDateBoundary(toDateRaw, "end");

  if (fromDate && toDate) {
    request.input("fromDate", sql.DateTime, fromDate);
    request.input("toDate", sql.DateTime, toDate);
    where.push(`${col} BETWEEN @fromDate AND @toDate`);
  } else if (fromDate) {
    request.input("fromDate", sql.DateTime, fromDate);
    where.push(`${col} >= @fromDate`);
  } else if (toDate) {
    request.input("toDate", sql.DateTime, toDate);
    where.push(`${col} <= @toDate`);
  }
}

// 1) Distinct Production Order Numbers
router.get("/production-orders", async (req, res) => {
  try {
    const request = getPool().request();
    const where = [];
    applyDateFilter(req, request, where);
    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const query = `
        SELECT DISTINCT productionOrderNumber
        FROM MESMaterialConsumption
        ${whereClause}
        ORDER BY productionOrderNumber ASC
    `;

    const result = await request.query(query);
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

    const extraWhere = [];

    if (productionOrderNumber && productionOrderNumber.trim()) {
      request.input("po", sql.NVarChar, `%${productionOrderNumber.trim()}%`);
      extraWhere.push("productionOrderNumber LIKE @po");
    }

    applyDateFilter(req, request, extraWhere);

    const extraStr = extraWhere.length ? `AND ${extraWhere.join(" AND ")}` : "";

    const query = `
        SELECT batchCode FROM (
            SELECT DISTINCT
                CASE WHEN batchCode IS NULL OR LTRIM(RTRIM(batchCode)) = '' THEN NULL ELSE batchCode END AS batchCode,
                CASE WHEN batchCode IS NULL OR LTRIM(RTRIM(batchCode)) = '' THEN 0 ELSE 1 END AS sort_grp
            FROM MESMaterialConsumption
            WHERE 1=1
            ${extraStr}
        ) combined
        ORDER BY sort_grp ASC, TRY_CAST(batchCode AS INT) ASC;
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
      request.input("po", sql.NVarChar, `%${productionOrderNumber.trim()}%`);
      where.push("productionOrderNumber LIKE @po");
    }

    if (batchCode && batchCode.trim()) {
      request.input("bc", sql.NVarChar, `%${batchCode.trim()}%`);
      where.push("batchCode LIKE @bc");
    }

    applyDateFilter(req, request, where);

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

// 4) Distinct Shifts
router.get("/shifts", async (req, res) => {
  try {
    const request = getPool().request();
    const dateWhere = [];
    applyDateFilter(req, request, dateWhere, "mmc");

    let query;
    if (dateWhere.length) {
      query = `
          SELECT DISTINCT po.Shift
          FROM ProductionOrders po
          INNER JOIN MESMaterialConsumption mmc
            ON po.ProductionOrderNumber = mmc.productionOrderNumber
          WHERE po.Shift IS NOT NULL AND LTRIM(RTRIM(po.Shift)) <> ''
            AND ${dateWhere.join(" AND ")}
          ORDER BY po.Shift ASC
      `;
    } else {
      query = `
          SELECT DISTINCT Shift
          FROM ProductionOrders
          WHERE Shift IS NOT NULL AND LTRIM(RTRIM(Shift)) <> ''
          ORDER BY Shift ASC
      `;
    }

    const result = await request.query(query);

    res.json({
      success: true,
      message: "Success",
      data: result.recordset.map((r) => ({ shift: r.Shift })),
    });
  } catch (error) {
    console.error("❌ Lỗi lấy danh sách shifts:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

function normalizeQueryValues(q) {
  if (!q) return [];

  if (Array.isArray(q)) {
    return q.flatMap((v) =>
      String(v)
        .split(",")
        .map((s) => s.trim()),
    );
  }

  return String(q)
    .split(",")
    .map((s) => s.trim());
}

// Helper: build WHERE clause for search filters
function buildSearchWhere(req, request) {
  const where = [];

  // Production Orders (CSV)
  if (req.query.productionOrderNumber) {
    const values = normalizeQueryValues(req.query.productionOrderNumber);

    const hasNULL = values.includes("NULL");
    const realValues = values.filter((v) => v && v !== "NULL");

    const conditions = [];

    if (hasNULL) {
      conditions.push(`mmc.productionOrderNumber = ''`);
    }

    if (realValues.length) {
      const likeConds = realValues.map(
        (_, i) => `mmc.productionOrderNumber LIKE @po${i}`,
      );
      realValues.forEach((v, i) =>
        request.input(`po${i}`, sql.NVarChar, `%${v}%`),
      );
      conditions.push(`(${likeConds.join(" OR ")})`);
    }

    if (conditions.length) {
      where.push(`(${conditions.join(" OR ")})`);
    }
  }

  // Batch Codes (CSV)
  if (req.query.batchCode) {
    const values = normalizeQueryValues(req.query.batchCode);

    const hasNULL = values.includes("NULL");
    const realValues = values.filter((v) => v && v !== "NULL");

    const conditions = [];

    if (hasNULL) {
      conditions.push(
        `(mmc.batchCode IS NULL OR LTRIM(RTRIM(mmc.batchCode)) = '')`,
      );
    }

    if (realValues.length) {
      const eqConds = realValues.map((_, i) => `mmc.batchCode = @bc${i}`);

      realValues.forEach(
        (v, i) => request.input(`bc${i}`, sql.NVarChar, v), // ❗ KHÔNG thêm %
      );

      conditions.push(`(${eqConds.join(" OR ")})`);
    }

    if (conditions.length) {
      where.push(`(${conditions.join(" OR ")})`);
    }
  }

  // Ingredient Codes (CSV)
  if (req.query.ingredientCode) {
    const values = normalizeQueryValues(req.query.ingredientCode);

    const hasNULL = values.includes("NULL");
    const realValues = values.filter((v) => v && v !== "NULL");

    const conditions = [];

    if (hasNULL) {
      conditions.push(`ingredientCode IS NULL`);
    }

    if (realValues.length) {
      const likeConds = realValues.map(
        (_, i) => `ingredientCode LIKE @ing${i}`,
      );
      realValues.forEach((v, i) =>
        request.input(`ing${i}`, sql.NVarChar, `%${v}%`),
      );
      conditions.push(`(${likeConds.join(" OR ")})`);
    }

    if (conditions.length) {
      where.push(`(${conditions.join(" OR ")})`);
    }
  }

  // Result/Status (CSV) — column name: respone
  if (req.query.respone) {
    const values = normalizeQueryValues(req.query.respone);

    const hasSuccess = values.includes("Success");
    const hasFailed = values.includes("Failed");

    if (hasSuccess && !hasFailed) {
      request.input("rsSuccess", sql.NVarChar, "Success");
      where.push(`respone = @rsSuccess`);
    } else if (!hasSuccess && hasFailed) {
      where.push(`(respone <> 'Success' OR respone IS NULL)`);
    }
  }

  // Shift (CSV) — joined from ProductionOrders
  if (req.query.shift) {
    const values = normalizeQueryValues(req.query.shift);
    const realValues = values.filter((v) => v && v !== "NULL");
    if (realValues.length) {
      const placeholders = realValues.map((_, i) => `@shift${i}`);
      realValues.forEach((v, i) => request.input(`shift${i}`, sql.NVarChar, v));
      where.push(`po.Shift IN (${placeholders.join(",")})`);
    }
  }

  // Date range — column name: datetime
  const fromDateRaw = req.query.fromDate
    ? String(req.query.fromDate).trim()
    : "";
  const toDateRaw = req.query.toDate ? String(req.query.toDate).trim() : "";

  // Helper to normalize date-only input to start/end of day (local time)
  function normalizeDateBoundary(str, boundary) {
    if (!str) return null;
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(str);
    try {
      if (isDateOnly) {
        const base = new Date(
          str + (boundary === "start" ? "T00:00:00" : "T23:59:59.999"),
        );
        return base;
      }
      return new Date(str);
    } catch (_) {
      return null;
    }
  }

  const fromDate = normalizeDateBoundary(fromDateRaw, "start");
  const toDate = normalizeDateBoundary(toDateRaw, "end");

  if (fromDate && toDate) {
    request.input("fromDate", sql.DateTime, fromDate);
    request.input("toDate", sql.DateTime, toDate);
    where.push("datetime BETWEEN @fromDate AND @toDate");
  } else if (fromDate) {
    request.input("fromDate", sql.DateTime, fromDate);
    where.push("datetime >= @fromDate");
  } else if (toDate) {
    request.input("toDate", sql.DateTime, toDate);
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
      SELECT mmc.*, po.Shift AS shift
      FROM MESMaterialConsumption mmc
      LEFT JOIN ProductionOrders po
        ON mmc.productionOrderNumber = po.ProductionOrderNumber
      ${whereClause}
      ORDER BY mmc.datetime DESC
      OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY;
    `;

    const result = await request.query(query);
    res.json({ success: true, message: "Success", data: result.recordset });
  } catch (error) {
    console.error("❌ Lỗi tìm kiếm items:", error.message);
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
      FROM MESMaterialConsumption mmc
      LEFT JOIN ProductionOrders po
        ON mmc.productionOrderNumber = po.ProductionOrderNumber
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
