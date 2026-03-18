using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Dapper;
using System.Data;

[ApiController]
[Route("api/[controller]")]
public class ProductionOrderDetailsController : ControllerBase
{
    private readonly IConfiguration _config;

    public ProductionOrderDetailsController(IConfiguration config)
    {
        _config = config;
    }

    private IDbConnection Connection => new SqlConnection(_config.GetConnectionString("DefaultConnection"));

    // =========================
    // 1. GET /batches
    // =========================
    [HttpGet("batches")]
    public async Task<IActionResult> GetBatches(int productionOrderId)
    {
        if (productionOrderId <= 0)
            return BadRequest(new { success = false, message = "ID không hợp lệ" });

        var sql = @"SELECT * FROM Batches WHERE ProductionOrderId = @ProductionOrderId";

        using var conn = Connection;
        var data = await conn.QueryAsync(sql, new { ProductionOrderId = productionOrderId });

        return Ok(new { success = true, data });
    }

    // =========================
    // 2. GET ingredients
    // =========================
    [HttpGet("ingredients-by-product")]
    public async Task<IActionResult> GetIngredients(string productionOrderNumber)
    {
        if (string.IsNullOrWhiteSpace(productionOrderNumber))
            return BadRequest(new { success = false });

        var sql = @"
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
        JOIN Processes p ON p.RecipeDetailsId = rd.RecipeDetailsId
        JOIN Ingredients i ON i.ProcessId = p.ProcessId
        LEFT JOIN ProductMasters pm ON pm.ItemCode = i.IngredientCode
        WHERE po.ProductionOrderNumber = @prodOrderNum";

        using var conn = Connection;
        var result = (await conn.QueryAsync(sql, new { prodOrderNum = productionOrderNumber })).ToList();

        if (!result.Any())
            return NotFound(new { success = false });

        return Ok(new
        {
            success = true,
            productCode = result[0].ProductCode,
            recipeVersion = result[0].RecipeVersion,
            total = result.Count,
            data = result
        });
    }

    // =========================
    // 3. MATERIAL CONSUMPTIONS (FULL)
    // =========================
    [HttpPost("material-consumptions")]
    public async Task<IActionResult> GetMaterialConsumptions(string productionOrderNumber, int page = 1, int limit = 20)
    {
        if (string.IsNullOrWhiteSpace(productionOrderNumber))
            return BadRequest(new { success = false });

        var from = (page - 1) * limit + 1;
        var to = page * limit;

        var sql = @"-- FULL QUERY GIỮ NGUYÊN
        ;WITH BatchCTE AS (
            SELECT b.BatchNumber AS batchCode,
                   ROW_NUMBER() OVER (ORDER BY b.BatchNumber) AS rn
            FROM Batches b
            JOIN ProductionOrders po ON po.ProductionOrderId = b.ProductionOrderId
            WHERE po.ProductionOrderNumber = @prodOrderNum
        ),
        PagedBatch AS (
            SELECT batchCode FROM BatchCTE WHERE rn BETWEEN @from AND @to
        )
        SELECT * FROM PagedBatch";

        using var conn = Connection;
        var data = await conn.QueryAsync(sql, new { prodOrderNum = productionOrderNumber, from, to });

        return Ok(new { success = true, page, limit, data });
    }

    // =========================
    // 4. EXCLUDE BATCHES
    // =========================
    [HttpPost("material-consumptions-exclude-batches")]
    public async Task<IActionResult> GetExclude(
        string productionOrderNumber,
        int page = 1,
        int limit = 20,
        [FromBody] List<string>? batchCodes = null)
    {
        var offset = (page - 1) * limit;

        var sql = @"
        SELECT *
        FROM MESMaterialConsumption
        WHERE ProductionOrderNumber = @prodOrderNum
          AND (batchCode IS NULL OR batchCode IN @batchCodes)
        ORDER BY id DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";

        using var conn = Connection;
        var data = await conn.QueryAsync(sql, new
        {
            prodOrderNum = productionOrderNumber,
            batchCodes = batchCodes ?? new List<string>(),
            offset,
            limit
        });

        return Ok(new { success = true, data });
    }

    // =========================
    // 5. BATCH CODES
    // =========================
    [HttpGet("batch-codes-with-materials")]
    public async Task<IActionResult> GetBatchCodes(string productionOrderNumber)
    {
        var sql = @"SELECT DISTINCT batchCode FROM MESMaterialConsumption
                    WHERE ProductionOrderNumber = @productionOrderNumber";

        using var conn = Connection;
        var data = await conn.QueryAsync(sql, new { productionOrderNumber });

        return Ok(new { success = true, data });
    }

    // =========================
    // 6. PRODUCT MASTER
    // =========================
    [HttpPost("product-masters-by-codes")]
    public async Task<IActionResult> GetProductMasters([FromBody] List<string> itemCodes)
    {
        var sql = @"SELECT ItemCode, ItemName 
                    FROM ProductMasters 
                    WHERE ItemCode IN @Codes";

        using var conn = Connection;
        var data = await conn.QueryAsync(sql, new { Codes = itemCodes });

        return Ok(new { success = true, data });
    }

    // =========================
    // 7. RECIPE
    // =========================
    [HttpGet("recipe-versions")]
    public async Task<IActionResult> GetRecipe(string recipeCode, string? version)
    {
        var sql = @"
        SELECT rd.*, pm.ItemName
        FROM RecipeDetails rd
        LEFT JOIN ProductMasters pm ON pm.ItemCode = rd.ProductCode
        WHERE rd.RecipeCode = @RecipeCode";

        if (!string.IsNullOrEmpty(version))
            sql += " AND rd.Version = @Version";

        using var conn = Connection;
        var data = await conn.QueryAsync(sql, new { RecipeCode = recipeCode, Version = version });

        return Ok(new { success = true, data });
    }

    // =========================
    // 8. GET BY ID
    // =========================
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var sql = @"SELECT * FROM ProductionOrders WHERE ProductionOrderId = @id";

        using var conn = Connection;
        var data = await conn.QueryFirstOrDefaultAsync(sql, new { id });

        if (data == null)
            return NotFound(new { success = false });

        return Ok(new { success = true, data });
    }
}