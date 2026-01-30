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

// Get material consumptions - Simple endpoint (basic query only)
router.get("/material-consumptions", async (req, res) => {
  try {
    const { productionOrderNumber, page = 1, limit = 20 } = req.query;

    if (!productionOrderNumber?.trim()) {
      return res.status(400).json({
        success: false,
        message: "productionOrderNumber là bắt buộc",
      });
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * pageLimit;

    const pool = getPool();
    const request = pool.request();
    request.input("prodOrderNum", sql.NVarChar, productionOrderNumber.trim());

    const ingredientQuery = `
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
    `;

    const ingredientResult = await request.query(ingredientQuery);
    const ingredients = ingredientResult.recordset;

    if (!ingredients.length) {
      return res.json({
        success: true,
        page: pageNum,
        limit: pageLimit,
        totalCount: 0,
        totalPages: 0,
        data: [],
      });
    }

    const batchQuery = `
      SELECT b.BatchNumber AS batchCode
      FROM Batches b
      JOIN ProductionOrders po 
        ON po.ProductionOrderId = b.ProductionOrderId
      WHERE po.ProductionOrderNumber = @prodOrderNum
      ORDER BY b.BatchNumber
      OFFSET ${offset} ROWS
      FETCH NEXT ${pageLimit} ROWS ONLY
    `;

    const batchResult = await request.query(batchQuery);
    const batches = batchResult.recordset.map((b) => b.batchCode);

    if (!batches.length) {
      return res.json({
        success: true,
        page: pageNum,
        limit: pageLimit,
        totalCount: 0,
        totalPages: 0,
        data: [],
      });
    }

    const dataQuery = `
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
      FROM (
          SELECT b.BatchNumber AS batchCode
          FROM Batches b
          JOIN ProductionOrders po 
            ON po.ProductionOrderId = b.ProductionOrderId
          WHERE po.ProductionOrderNumber = @prodOrderNum
            AND b.BatchNumber IN (${batches.join(",")})
      ) b
      CROSS JOIN (
          SELECT IngredientCode, ItemName
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
          ) t
      ) i
      LEFT JOIN MESMaterialConsumption mc
        ON mc.productionOrderNumber = @prodOrderNum
      AND mc.batchCode = b.batchCode
      AND mc.ingredientCode = i.IngredientCode

      LEFT JOIN Ingredients ing
        ON ing.IngredientCode = i.IngredientCode

      ORDER BY b.batchCode, i.IngredientCode
    `;

    const dataResult = await request.query(dataQuery);

    const data = [];
    const seen = new Set();

    dataResult.recordset.forEach((row) => {
      // Tạo key duy nhất cho mỗi bản ghi, ví dụ: id + batchCode + ingredientCode + lot
      const key = `${row.id || ""}|${row.batchCode || ""}|${row.ingredientCode || ""}|${row.lot || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        data.push({
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
        });
      }
    });

    const totalCount = batches.length * ingredients.length;
    const totalPages = Math.ceil(totalCount / pageLimit);

    res.json({
      success: true,
      message: "Lấy danh sách tiêu hao vật liệu thành công",
      page: pageNum,
      limit: pageLimit,
      totalCount,
      totalPages,
      data,
    });
  } catch (error) {
    console.error("Lỗi material-consumptions:", error);
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
    const { id } = req.params;
    const productionOrderId = parseInt(id, 10);

    if (isNaN(productionOrderId)) {
      return res.status(400).json({
        success: false,
        message: "ID đơn hàng không hợp lệ",
      });
    }

    const result = await getPool()
      .request()
      .input("ProductionOrderId", sql.Int, productionOrderId)
      .query(
        `SELECT 
          po.*,
          pm.ItemName,
          ing.PlanQuantity as ProductQuantity,
          rd.RecipeName
        FROM ProductionOrders po
        LEFT JOIN ProductMasters pm ON po.ProductCode = pm.ItemCode
        LEFT JOIN Products ing ON po.ProductCode = ing.ProductCode
        LEFT JOIN RecipeDetails rd ON po.RecipeCode = rd.RecipeCode AND po.RecipeVersion = rd.Version
        WHERE po.ProductionOrderId = @ProductionOrderId`,
      );

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    const order = result.recordset[0];

    // Check if this order has any MESMaterialConsumption data
    const mesDataResult = await getPool()
      .request()
      .input("ProductionOrderNumber", sql.NVarChar, order.ProductionOrderNumber)
      .query(
        "SELECT COUNT(*) as count FROM MESMaterialConsumption WHERE ProductionOrderNumber = @ProductionOrderNumber",
      );

    const hasMESData = mesDataResult.recordset[0].count > 0;

    // Get CurrentBatch from MESMaterialConsumption (MAX BatchCode)
    const currentBatchResult = await getPool()
      .request()
      .input("ProductionOrderNumber", sql.NVarChar, order.ProductionOrderNumber)
      .query(`
        SELECT 
          MAX(BatchCode) as maxBatchCode
        FROM MESMaterialConsumption
        WHERE ProductionOrderNumber = @ProductionOrderNumber
      `);

    const currentBatch = currentBatchResult.recordset[0]?.maxBatchCode || 0;

    // Get TotalBatches from Batches table
    const totalBatchResult = await getPool()
      .request()
      .input("ProductionOrderId", sql.Int, productionOrderId).query(`
        SELECT 
          COUNT(*) as totalBatches
        FROM Batches
        WHERE ProductionOrderId = @ProductionOrderId
      `);

    const totalBatches = totalBatchResult.recordset[0]?.totalBatches || 0;

    // Update status dynamically and calculate progress like in modal view

    const dataWithUpdatedStatus = {
      ...order,
      ProductCode: order.ItemName
        ? `${order.ProductCode} - ${order.ItemName}`
        : order.ProductCode,
      // RecipeCode: RecipeCode - RecipeName if RecipeName exists
      RecipeCode:
        order.RecipeName && order.RecipeCode
          ? `${order.RecipeCode} - ${order.RecipeName}`
          : order.RecipeCode,
      Status: hasMESData ? 1 : 0,
      CurrentBatch: currentBatch,
      TotalBatches: totalBatches,
      ProductQuantity: order.ProductQuantity || null,
    };

    res.json({
      success: true,
      message: "Lấy chi tiết đơn hàng thành công",
      data: dataWithUpdatedStatus,
    });
  } catch (error) {
    console.error("Lỗi khi lấy chi tiết đơn hàng: ", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi: " + error.message,
    });
  }
});

module.exports = router;
