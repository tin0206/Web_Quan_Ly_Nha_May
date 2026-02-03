const express = require("express");
const router = express.Router();
const { getPool, sql } = require("../db");

// In-memory cache for ingredients data
const ingredientsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Get from cache or return null if expired
function getCachedData(key) {
  const cached = ingredientsCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  ingredientsCache.delete(key);
  return null;
}

// Set cache with timestamp
function setCacheData(key, data) {
  ingredientsCache.set(key, {
    data: data,
    timestamp: Date.now(),
  });

  // Auto cleanup expired entries
  if (ingredientsCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of ingredientsCache.entries()) {
      if (now - v.timestamp >= CACHE_TTL) {
        ingredientsCache.delete(k);
      }
    }
  }
}

// Get batches for a production order
router.get("/batches", async (req, res) => {
  try {
    const { productionOrderId } = req.query;
    const parsedId = parseInt(productionOrderId, 10);

    if (isNaN(parsedId)) {
      return res.status(400).json({
        success: false,
        message: "ID đơn hàng không hợp lệ",
      });
    }

    // Get batches
    const batchesResult = await getPool()
      .request()
      .input("ProductionOrderId", sql.Int, parsedId)
      .query(
        "SELECT * FROM Batches WHERE ProductionOrderId = @ProductionOrderId",
      );

    res.json({
      success: true,
      message: "Lấy danh sách lô sản xuất thành công",
      data: batchesResult.recordset,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách lô sản xuất: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi: " + error.message,
    });
  }
});

// Get ingredients by ProductCode (IngredientCode == ProductCode of PO)
router.get("/ingredients-by-product", async (req, res) => {
  try {
    const { productionOrderNumber } = req.query;

    if (!productionOrderNumber?.trim()) {
      return res.status(400).json({
        success: false,
        message: "productionOrderNumber là bắt buộc",
      });
    }

    const cacheKey = `ingredients:${productionOrderNumber.trim()}`;

    // Check cache first
    const cachedResult = getCachedData(cacheKey);
    if (cachedResult) {
      return res.json(cachedResult);
    }

    const request = getPool().request();
    request.input("prodOrderNum", sql.NVarChar, productionOrderNumber.trim());

    const query = `
      SELECT
        i.IngredientCode,
        i.Quantity,
        i.UnitOfMeasurement,
        pm.ItemName,
        po.ProductCode,
        po.RecipeVersion
      FROM ProductionOrders po
      JOIN RecipeDetails rd 
        ON rd.ProductCode = po.ProductCode 
      AND rd.Version = po.RecipeVersion
      JOIN Processes p 
        ON p.RecipeDetailsId = rd.RecipeDetailsId
      JOIN Ingredients i 
        ON i.ProcessId = p.ProcessId
      LEFT JOIN ProductMasters pm 
        ON pm.ItemCode = i.IngredientCode
      WHERE po.ProductionOrderNumber = @prodOrderNum
    `;

    const result = await request.query(query);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy dữ liệu ingredients",
      });
    }

    const response = {
      success: true,
      message: "Lấy danh sách ingredients thành công",
      productCode: result.recordset[0].ProductCode,
      recipeVersion: result.recordset[0].RecipeVersion,
      total: result.recordset.length,
      data: result.recordset,
    };

    // Store in cache
    setCacheData(cacheKey, response);

    res.json(response);
  } catch (error) {
    console.error("Lỗi khi lấy ingredients:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
});

// Helper: Get ingredients for a production order
function getIngredientCountFromList(ingredientList) {
  return ingredientList.length;
}

async function getIngredientList(request) {
  const result = await request.query(`
    SELECT DISTINCT IngredientCode, ItemName
    FROM (
      SELECT 
        i.IngredientCode,
        pm.ItemName
      FROM ProductionOrders po
      JOIN RecipeDetails rd 
        ON rd.ProductCode = po.ProductCode
       AND rd.Version = po.RecipeVersion
      JOIN Processes p 
        ON p.RecipeDetailsId = rd.RecipeDetailsId
      JOIN Ingredients i 
        ON i.ProcessId = p.ProcessId
      LEFT JOIN ProductMasters pm
        ON pm.ItemCode = i.IngredientCode
      WHERE po.ProductionOrderNumber = @prodOrderNum

      UNION

      SELECT 
        mc.ingredientCode,
        pm.ItemName
      FROM MESMaterialConsumption mc
      LEFT JOIN ProductMasters pm
        ON pm.ItemCode = mc.ingredientCode
      WHERE mc.productionOrderNumber = @prodOrderNum
    ) x
  `);

  return result.recordset;
}

async function getTotalBatchCount(request) {
  const result = await request.query(`
    SELECT COUNT(*) AS total
    FROM Batches b
    JOIN ProductionOrders po 
      ON po.ProductionOrderId = b.ProductionOrderId
    WHERE po.ProductionOrderNumber = @prodOrderNum
  `);
  return result.recordset[0].total;
}

async function getMaterialConsumptionsData(
  request,
  productionOrderNumber,
  batches,
  ingredientList,
) {
  if (!batches.length) return [];

  batches.forEach((b, i) => {
    request.input(`b${i}`, sql.NVarChar, b);
  });

  ingredientList.forEach((ing, i) => {
    request.input(`i${i}`, sql.NVarChar, ing.IngredientCode);
    request.input(`n${i}`, sql.NVarChar, ing.ItemName);
  });

  const batchValues = batches.map((_, i) => `(@b${i})`).join(",");
  const ingredientValues = ingredientList
    .map((_, i) => `(@i${i}, @n${i})`)
    .join(",");

  const query = `
    /* ===== Batch table variable ===== */
    DECLARE @BatchList TABLE (batchCode NVARCHAR(50));
    INSERT INTO @BatchList (batchCode)
    VALUES ${batchValues};

    /* ===== Ingredient table variable ===== */
    DECLARE @IngredientList TABLE (
      IngredientCode NVARCHAR(50),
      ItemName NVARCHAR(255)
    );
    INSERT INTO @IngredientList (IngredientCode, ItemName)
    VALUES ${ingredientValues};

    /* ===== MAIN QUERY (data + NULL batch) ===== */
    SELECT
      b.batchCode,
      i.IngredientCode,
      i.ItemName,
      mc.id,
      mc.lot,
      mc.quantity,
      COALESCE(mc.unitOfMeasurement, ing.UnitOfMeasurement) AS unitOfMeasurement,
      mc.datetime,
      mc.operator_ID,
      mc.supplyMachine,
      mc.count,
      mc.request,
      mc.respone,
      mc.status1,
      mc.timestamp
    FROM @BatchList b
    CROSS JOIN @IngredientList i
    LEFT JOIN MESMaterialConsumption mc
      ON mc.productionOrderNumber = @prodOrderNum
     AND mc.batchCode = b.batchCode
     AND mc.ingredientCode = i.IngredientCode
    LEFT JOIN Ingredients ing
      ON ing.IngredientCode = i.IngredientCode

    UNION ALL

    SELECT
      NULL AS batchCode,
      mc.ingredientCode AS IngredientCode,
      pm.ItemName,
      mc.id,
      mc.lot,
      mc.quantity,
      mc.unitOfMeasurement,
      mc.datetime,
      mc.operator_ID,
      mc.supplyMachine,
      mc.count,
      mc.request,
      mc.respone,
      mc.status1,
      mc.timestamp
    FROM MESMaterialConsumption mc
    LEFT JOIN ProductMasters pm
      ON pm.ItemCode = mc.ingredientCode
    WHERE mc.productionOrderNumber = @prodOrderNum
      AND mc.batchCode IS NULL

    ORDER BY batchCode, IngredientCode;
  `;

  const { recordset } = await request.query(query);

  /* ===============================
     4. Map result
     =============================== */
  return recordset.map((row) => ({
    id: row.id,
    batchCode: row.batchCode,
    ingredientCode: row.ItemName
      ? `${row.IngredientCode} - ${row.ItemName}`
      : row.IngredientCode,
    lot: row.lot || "",
    quantity: row.quantity,
    unitOfMeasurement: row.unitOfMeasurement || "",
    datetime: row.datetime,
    operator_ID: row.operator_ID,
    supplyMachine: row.supplyMachine,
    count: row.count || 0,
    request: row.request,
    respone: row.respone,
    status1: row.status1,
    timestamp: row.timestamp,
  }));
}

// Route: Get material consumptions (refactored)
router.post("/material-consumptions", async (req, res) => {
  try {
    const { productionOrderNumber, page = 1, limit = 20 } = req.query;
    const { batches } = req.body;

    if (!productionOrderNumber?.trim()) {
      return res.status(400).json({
        success: false,
        message: "productionOrderNumber là bắt buộc",
      });
    }

    const pageNum = Math.max(1, Number(page));
    const pageLimit = Math.min(100, Math.max(1, Number(limit)));

    const pool = getPool();
    const request = pool.request();
    request.timeout = 120000;
    request.input("prodOrderNum", sql.NVarChar, productionOrderNumber.trim());

    const ingredientList = await getIngredientList(request);
    const ingredientCount = ingredientList.length;

    const [totalBatches] = await Promise.all([getTotalBatchCount(request)]);

    if (!totalBatches || !ingredientCount) {
      return res.json({
        success: true,
        page: pageNum,
        limit: pageLimit,
        totalCount: 0,
        totalPages: 0,
        data: [],
      });
    }

    const data = await getMaterialConsumptionsData(
      request,
      productionOrderNumber,
      batches,
      ingredientList,
    );

    res.json({
      success: true,
      message: "Lấy danh sách tiêu hao vật liệu thành công",
      page: pageNum,
      limit: pageLimit,
      totalCount: totalBatches * ingredientCount,
      totalPages: Math.ceil(totalBatches / pageLimit),
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Lỗi Server: " + error.message,
    });
  }
});

// Get material consumptions excluding batches that already have materials recorded
router.get("/material-consumptions-exclude-batches", async (req, res) => {
  try {
    const { productionOrderNumber, page = 1, limit = 20 } = req.query;

    if (!productionOrderNumber || productionOrderNumber.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "productionOrderNumber là bắt buộc",
      });
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageLimit = Math.max(1, Math.min(100, parseInt(limit) || 20));
    const offset = (pageNum - 1) * pageLimit;

    const request = getPool().request();
    request.input("prodOrderNum", sql.NVarChar, productionOrderNumber.trim());

    // Query to get all batch codes for the production order
    const batchCodesQuery = `
      SELECT b.BatchNumber AS batchCode
      FROM Batches b
      JOIN ProductionOrders po 
        ON po.ProductionOrderId = b.ProductionOrderId
      WHERE po.ProductionOrderNumber = @prodOrderNum
    `;

    const batchCodesResult = await request.query(batchCodesQuery);
    const batchCodes = batchCodesResult.recordset.map((b) => b.batchCode);

    // If there are no batch codes, return an empty result
    if (!batchCodes.length) {
      return res.json({
        success: true,
        message: "Không có dữ liệu",
        page: pageNum,
        limit: pageLimit,
        totalCount: 0,
        totalPages: 0,
        data: [],
      });
    }

    // Query to count total materials excluding those with batch codes in the Batches table
    const countQuery = `
      SELECT COUNT(*) as totalCount
      FROM MESMaterialConsumption mc
      WHERE mc.ProductionOrderNumber = @prodOrderNum
        AND mc.batchCode NOT IN (${batchCodes.map((_, i) => `@batchCode${i}`).join(", ")})
    `;

    // Add batch codes as parameters
    batchCodes.forEach((code, index) => {
      request.input(`batchCode${index}`, sql.NVarChar, code);
    });

    const countResult = await request.query(countQuery);
    const totalCount = countResult.recordset[0].totalCount;

    // Query to fetch materials excluding those with batch codes in the Batches table
    const dataQuery = `
      SELECT 
        mc.id,
        mc.productionOrderNumber,
        mc.batchCode,
        mc.ingredientCode,
        COALESCE(pm.ItemName, '') as itemName,
        mc.lot,
        mc.quantity,
        mc.unitOfMeasurement,
        mc.datetime,
        mc.operator_ID,
        mc.supplyMachine,
        mc.count,
        mc.request,
        mc.respone,
        mc.status1,
        mc.timestamp
      FROM MESMaterialConsumption mc WITH (NOLOCK)
      LEFT JOIN ProductMasters pm WITH (NOLOCK) ON mc.ingredientCode = pm.ItemCode
      WHERE mc.ProductionOrderNumber = @prodOrderNum
        AND mc.batchCode NOT IN (${batchCodes.map((_, i) => `@batchCode${i}`).join(", ")})
      ORDER BY mc.batchCode ASC, mc.id DESC
      OFFSET ${offset} ROWS
      FETCH NEXT ${pageLimit} ROWS ONLY
    `;

    const result = await request.query(dataQuery);

    if (result.recordset.length === 0) {
      return res.json({
        success: true,
        message: "Không có dữ liệu",
        page: pageNum,
        limit: pageLimit,
        totalCount: 0,
        totalPages: 0,
        data: [],
      });
    }

    const totalPages = Math.ceil(totalCount / pageLimit);

    const data = result.recordset.map((row) => ({
      id: row.id,
      productionOrderNumber: row.productionOrderNumber,
      batchCode: row.batchCode,
      ingredientCode:
        row.itemName && row.itemName !== ""
          ? `${row.ingredientCode} - ${row.itemName}`
          : row.ingredientCode,
      lot: row.lot,
      quantity: row.quantity,
      unitOfMeasurement: row.unitOfMeasurement,
      datetime: row.datetime,
      operator_ID: row.operator_ID,
      supplyMachine: row.supplyMachine,
      count: row.count,
      request: row.request,
      respone: row.respone,
      status1: row.status1,
      timestamp: row.timestamp,
    }));

    res.json({
      success: true,
      message: "Lấy danh sách tiêu hao vật liệu thành công",
      page: pageNum,
      limit: pageLimit,
      totalCount: totalCount,
      totalPages: totalPages,
      data: data,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách tiêu hao vật liệu: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi Server: " + error.message,
    });
  }
});

// Get batch codes that have materials in MESMaterialConsumption for a production order
router.get("/batch-codes-with-materials", async (req, res) => {
  try {
    const { productionOrderNumber } = req.query;

    if (!productionOrderNumber) {
      return res.status(400).json({
        success: false,
        message: "productionOrderNumber là bắt buộc",
      });
    }

    if (!getPool()) {
      return res.status(500).json({
        success: false,
        message: "Database chưa kết nối",
      });
    }

    // Get distinct batch codes from MESMaterialConsumption for this production order
    const result = await getPool()
      .request()
      .input("productionOrderNumber", sql.NVarChar, productionOrderNumber)
      .query(
        "SELECT DISTINCT batchCode FROM MESMaterialConsumption WHERE ProductionOrderNumber = @productionOrderNumber ORDER BY batchCode ASC",
      );

    res.json({
      success: true,
      message: "Lấy danh sách batch codes có dữ liệu thành công",
      data: result.recordset.map((row) => ({
        batchCode: row.batchCode,
      })),
    });
  } catch (error) {
    console.error("Lỗi khi lấy batch codes: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi: " + error.message,
    });
  }
});

// Get ProductMasters by ItemCodes
router.post("/product-masters-by-codes", async (req, res) => {
  try {
    const { itemCodes } = req.body;

    if (!itemCodes || !Array.isArray(itemCodes) || itemCodes.length === 0) {
      return res.status(400).json({
        success: false,
        message: "itemCodes phải là một mảng không rỗng",
      });
    }

    const pool = getPool();
    const request = pool.request();

    // Build parameterized query with IN clause
    const placeholders = itemCodes
      .map((_, index) => `@ItemCode${index}`)
      .join(", ");

    // Add each itemCode as a parameter
    itemCodes.forEach((code, index) => {
      request.input(`ItemCode${index}`, sql.NVarChar(255), code);
    });

    const result = await request.query(`
      SELECT 
        ItemCode,
        ItemName
      FROM ProductMasters
      WHERE ItemCode IN (${placeholders})
        AND ItemName IS NOT NULL
    `);

    res.json({
      success: true,
      message: "Lấy thông tin ProductMasters thành công",
      data: result.recordset,
    });
  } catch (error) {
    console.error("Lỗi khi lấy ProductMasters: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi: " + error.message,
    });
  }
});

// Get production order detail by ID (MUST be last - catch-all route)
router.get("/:id", async (req, res) => {
  try {
    const productionOrderId = parseInt(req.params.id, 10);

    if (isNaN(productionOrderId)) {
      return res.status(400).json({
        success: false,
        message: "ID đơn hàng không hợp lệ",
      });
    }

    const pool = getPool();
    const request = pool.request();
    request.input("ProductionOrderId", sql.Int, productionOrderId);

    const query = `
      SELECT
        po.*,
        pm.ItemName,
        ing.PlanQuantity AS ProductQuantity,
        rd.RecipeName,

        -- MES info
        CASE 
          WHEN COUNT(mc.Id) > 0 THEN 1 ELSE 0 
        END AS HasMESData,
        MAX(mc.BatchCode) AS CurrentBatch,

        -- Batch info
        COUNT(DISTINCT b.BatchNumber) AS TotalBatches
      FROM ProductionOrders po
      LEFT JOIN ProductMasters pm 
        ON po.ProductCode = pm.ItemCode
      LEFT JOIN Products ing 
        ON po.ProductCode = ing.ProductCode
      LEFT JOIN RecipeDetails rd 
        ON po.RecipeCode = rd.RecipeCode 
       AND po.RecipeVersion = rd.Version
      LEFT JOIN MESMaterialConsumption mc
        ON mc.ProductionOrderNumber = po.ProductionOrderNumber
      LEFT JOIN Batches b
        ON b.ProductionOrderId = po.ProductionOrderId
      WHERE po.ProductionOrderId = @ProductionOrderId
      GROUP BY
        po.ProductionOrderId,
        po.ProductionLine,
        po.ProductCode,
        po.ProductionOrderNumber,
        po.RecipeCode,
        po.RecipeVersion,
        po.Shift,
        po.PlannedStart,
        po.PlannedEnd,
        po.Quantity,
        po.UnitOfMeasurement,
        po.LotNumber,
        po.timestamp,
        po.Plant,
        po.Shopfloor,
        po.ProcessArea,
        po.Status,
        pm.ItemName,
        ing.PlanQuantity,
        rd.RecipeName
    `;

    const result = await request.query(query);

    if (!result.recordset.length) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    const order = result.recordset[0];

    const data = {
      ...order,
      ProductCode: order.ItemName
        ? `${order.ProductCode} - ${order.ItemName}`
        : order.ProductCode,
      RecipeCode:
        order.RecipeName && order.RecipeCode
          ? `${order.RecipeCode} - ${order.RecipeName}`
          : order.RecipeCode,
      Status: order.HasMESData,
      CurrentBatch: order.CurrentBatch || 0,
      TotalBatches: order.TotalBatches || 0,
      ProductQuantity: order.ProductQuantity || null,
    };

    res.json({
      success: true,
      message: "Lấy chi tiết đơn hàng thành công",
      data,
    });
  } catch (error) {
    console.error("Lỗi khi lấy chi tiết đơn hàng:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
});

module.exports = router;
