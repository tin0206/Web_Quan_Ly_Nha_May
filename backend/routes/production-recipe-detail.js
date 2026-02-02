const express = require("express");
const router = express.Router();
const { getPool, sql } = require("../db");

// API lấy RecipeDetails theo ID, kèm processes, ingredients, product
router.get("/:id", async (req, res) => {
  try {
    const recipeId = parseInt(req.params.id, 10);
    const pool = getPool();

    // Lấy RecipeDetails
    const recipeResult = await pool.request().query(`
      SELECT * FROM RecipeDetails WHERE RecipeDetailsId = ${recipeId}
    `);
    if (!recipeResult.recordset.length) {
      return res
        .status(404)
        .json({ success: false, message: "Recipe not found" });
    }
    const recipe = recipeResult.recordset[0];

    // Lấy tất cả Processes có RecipeDetailsId trùng
    const processesResult = await pool.request().query(`
      SELECT * FROM Processes WHERE RecipeDetailsId = ${recipeId}
    `);
    const processes = processesResult.recordset;
    const processIds = processes.map((p) => p.ProcessId);

    // Lấy tất cả Ingredients thuộc các ProcessId trên
    let ingredients = [];
    if (processIds.length > 0) {
      const idsStr = processIds.join(",");
      const ingredientsResult = await pool.request().query(`
        SELECT i.*, pm.ItemName
        FROM Ingredients i
        LEFT JOIN ProductMasters pm ON i.IngredientCode = pm.ItemCode
        WHERE i.ProcessId IN (${idsStr})
      `);
      ingredients = ingredientsResult.recordset;
    }

    // Lấy thông tin Product từ ProductCode
    let products = [];
    if (recipe.ProductCode) {
      const productResult = await pool.request().query(`
        SELECT p.*, pm.ItemName
        FROM Products p
        LEFT JOIN ProductMasters pm ON p.ProductCode = pm.ItemCode
        WHERE p.ProductCode = N'${recipe.ProductCode.replace(/'/g, "''")}'
      `);
      if (productResult.recordset.length) {
        products = productResult.recordset;
      }
    }

    // Lấy thông tin Product từ ByProducts
    let byProducts = [];
    if (recipe.ProductCode) {
      const byProductsResult = await pool.request().query(`
        SELECT * FROM ByProducts WHERE ByProductCode = N'${recipe.ProductCode.replace(/'/g, "''")}'
      `);
      byProducts = byProductsResult.recordset;
    }

    // Lấy thông tin Parameters từ Product
    let parameters = [];
    if (processIds.length > 0) {
      const parameterResult = await pool.request().query(`
        SELECT p.*, ppm.Name as ParameterName
        FROM Parameters p
        LEFT JOIN ProcessParameterMasters ppm ON p.Code = ppm.Code
        WHERE p.ProcessId IN (${processIds.join(",")})
      `);
      parameters = parameterResult.recordset;
    }

    res.json({
      success: true,
      recipe,
      processes,
      ingredients,
      products, // return as a list
      byProducts,
      parameters,
    });
  } catch (error) {
    console.error("Error fetching recipe details by id:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
