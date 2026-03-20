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
public async Task<IActionResult> GetMaterialConsumptions(
    [FromQuery] string productionOrderNumber,
    [FromQuery] int page = 1,
    [FromQuery] int limit = 20)
{
    try
    {
        if (string.IsNullOrWhiteSpace(productionOrderNumber))
        {
            return BadRequest(new
            {
                success = false,
                message = "productionOrderNumber là bắt buộc"
            });
        }

        page = Math.Max(1, page);
        limit = Math.Min(100, Math.Max(1, limit));

        var from = (page - 1) * limit + 1;
        var to = page * limit;

        using var conn = Connection;

        var sql = @"
        ;WITH BatchCTE AS (
            SELECT
                b.BatchNumber AS batchCode,
                ROW_NUMBER() OVER (ORDER BY b.BatchNumber) AS rn
            FROM Batches b
            JOIN ProductionOrders po
                ON po.ProductionOrderId = b.ProductionOrderId
            WHERE po.ProductionOrderNumber = @prodOrderNum
        ),
        PagedBatch AS (
            SELECT batchCode
            FROM BatchCTE
            WHERE rn BETWEEN @from AND @to
        ),
        RecipeIngredient AS (
            SELECT DISTINCT
                i.IngredientCode,
                pm.ItemName
            FROM ProductionOrders po
            JOIN RecipeDetails rd
                ON rd.ProductCode = po.ProductCode
               AND rd.Version = po.RecipeVersion
            JOIN Processes p ON p.RecipeDetailsId = rd.RecipeDetailsId
            JOIN Ingredients i ON i.ProcessId = p.ProcessId
            LEFT JOIN ProductMasters pm ON pm.ItemCode = i.IngredientCode
            WHERE po.ProductionOrderNumber = @prodOrderNum
        ),
        ExtraIngredient AS (
            SELECT DISTINCT
                mc.ingredientCode AS IngredientCode,
                pm.ItemName
            FROM MESMaterialConsumption mc
            JOIN PagedBatch pb
                ON pb.batchCode = mc.batchCode
            LEFT JOIN RecipeIngredient r
                ON r.IngredientCode = mc.ingredientCode
            LEFT JOIN ProductMasters pm
                ON pm.ItemCode = mc.ingredientCode
            WHERE mc.productionOrderNumber = @prodOrderNum
              AND r.IngredientCode IS NULL
        )

        SELECT
            pb.batchCode,
            r.IngredientCode,
            r.ItemName,
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
        FROM PagedBatch pb
        CROSS JOIN RecipeIngredient r
        LEFT JOIN MESMaterialConsumption mc
            ON mc.productionOrderNumber = @prodOrderNum
           AND mc.batchCode = pb.batchCode
           AND mc.ingredientCode = r.IngredientCode
        LEFT JOIN Ingredients ing
            ON ing.IngredientCode = r.IngredientCode

        UNION ALL

        SELECT
            mc.batchCode,
            e.IngredientCode,
            e.ItemName,
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
        JOIN PagedBatch pb
            ON pb.batchCode = mc.batchCode
        JOIN ExtraIngredient e
            ON e.IngredientCode = mc.ingredientCode
        WHERE mc.productionOrderNumber = @prodOrderNum

        ORDER BY batchCode, IngredientCode
        ";

        var rows = await conn.QueryAsync(sql, new
        {
            prodOrderNum = productionOrderNumber.Trim(),
            from,
            to
        });

        var data = rows.Select(row => new
        {
            id = row.id,
            batchCode = row.batchCode,
            ingredientCode = row.ItemName != null
                ? $"{row.IngredientCode} - {row.ItemName}"
                : row.IngredientCode,
            lot = row.lot ?? "",
            quantity = row.quantity,
            unitOfMeasurement = row.unitOfMeasurement ?? "",
            datetime = row.datetime,
            operator_ID = row.operator_ID,
            supplyMachine = row.supplyMachine,
            count = row.count ?? 0,
            request = row.request,
            respone = row.respone,
            status1 = row.status1,
            timestamp = row.timestamp
        });

        return Ok(new
        {
            success = true,
            message = "Lấy danh sách tiêu hao vật liệu thành công",
            page,
            limit,
            data
        });
    }
    catch (Exception ex)
    {
        Console.WriteLine("❌ material-consumptions error: " + ex.Message);

        return StatusCode(500, new
        {
            success = false,
            message = "Lỗi Server: " + ex.Message
        });
    }
}

    // =========================
    // 4. EXCLUDE BATCHES
    // =========================
    [HttpPost("material-consumptions-exclude-batches")]
public async Task<IActionResult> GetExclude(
    [FromQuery] string productionOrderNumber,
    [FromQuery] int page = 1,
    [FromQuery] int limit = 20,
    [FromBody] List<dynamic>? batchCodesWithMaterials = null)
{
    try
    {
        if (string.IsNullOrWhiteSpace(productionOrderNumber))
        {
            return BadRequest(new
            {
                success = false,
                message = "productionOrderNumber là bắt buộc"
            });
        }

        page = Math.Max(1, page);
        limit = Math.Min(100, Math.Max(1, limit));
        var offset = (page - 1) * limit;

        using var conn = Connection;
        var p = new DynamicParameters();

        p.Add("prodOrderNum", productionOrderNumber.Trim());

        var batchNumbers = new List<string>();

        if (batchCodesWithMaterials != null && batchCodesWithMaterials.Any())
        {
            batchNumbers = batchCodesWithMaterials
                .Select(b => (string)b.BatchNumber)
                .ToList();
        }

        string batchFilterSql = "";

        if (batchNumbers.Any())
        {
            var ps = new List<string>();

            for (int i = 0; i < batchNumbers.Count; i++)
            {
                var key = $"batch{i}";
                ps.Add("@" + key);
                p.Add(key, batchNumbers[i]);
            }

            batchFilterSql = $" OR mc.batchCode IN ({string.Join(",", ps)})";
        }

        /* ===== COUNT ===== */
        var countSql = $@"
        SELECT COUNT(*) 
        FROM MESMaterialConsumption mc
        WHERE mc.ProductionOrderNumber = @prodOrderNum
          AND (
            mc.batchCode IS NULL
            {batchFilterSql}
          )";

        var totalCount = await conn.ExecuteScalarAsync<int>(countSql, p);

        if (totalCount == 0)
        {
            return Ok(new
            {
                success = true,
                message = "Không có dữ liệu",
                page,
                limit,
                totalCount = 0,
                totalPages = 0,
                data = new List<object>()
            });
        }

        /* ===== DATA ===== */
        p.Add("offset", offset);
        p.Add("limit", limit);

        var dataSql = $@"
        SELECT
            mc.id,
            mc.productionOrderNumber,
            mc.batchCode,
            mc.ingredientCode,
            pm.ItemName,
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
        WHERE mc.ProductionOrderNumber = @prodOrderNum
          AND (
            mc.batchCode IS NULL
            {batchFilterSql}
          )
        ORDER BY mc.id DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        ";

        var rows = await conn.QueryAsync(dataSql, p);

        var data = rows.Select(row => new
        {
            id = row.id,
            productionOrderNumber = row.productionOrderNumber,
            batchCode = row.batchCode,
            ingredientCode = row.ItemName != null
                ? $"{row.ingredientCode} - {row.ItemName}"
                : row.ingredientCode,
            lot = row.lot,
            quantity = row.quantity,
            unitOfMeasurement = row.unitOfMeasurement,
            datetime = row.datetime,
            operator_ID = row.operator_ID,
            supplyMachine = row.supplyMachine,
            count = row.count ?? 0,
            request = row.request,
            respone = row.respone,
            status1 = row.status1,
            timestamp = row.timestamp
        });

        return Ok(new
        {
            success = true,
            message = "Lấy danh sách tiêu hao vật liệu (không thuộc batch) thành công",
            page,
            limit,
            totalCount,
            totalPages = (int)Math.Ceiling((double)totalCount / limit),
            data
        });
    }
    catch (Exception ex)
    {
        Console.WriteLine("❌ exclude-batches error: " + ex.Message);

        return StatusCode(500, new
        {
            success = false,
            message = "Lỗi Server: " + ex.Message
        });
    }
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
    // 6. RECIPE
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
    // 7. GET BY ID
    // =========================
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        try
        {
            // ❗ Validate giống Node
            if (id <= 0)
            {
                return BadRequest(new
                {
                    success = false,
                    message = "ID đơn hàng không hợp lệ"
                });
            }

            using var conn = Connection;

            var sql = @"
                SELECT
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
                    ing.PlanQuantity AS ProductQuantity,

                    rd.RecipeName,
                    MAX(rd.RecipeDetailsId) AS RecipeDetailsId,

                    MAX(mc.BatchCode) AS CurrentBatch,
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
            ";

            var result = await conn.QueryAsync(sql, new
            {
                ProductionOrderId = id
            });

            var order = result.FirstOrDefault();

            if (order == null)
            {
                return NotFound(new
                {
                    success = false,
                    message = "Không tìm thấy đơn hàng"
                });
            }

            // ✅ Format giống Node
            var data = new
            {
                order.ProductionOrderId,
                order.ProductionLine,
                order.ProductionOrderNumber,

                ProductCode = order.ItemName != null
                    ? $"{order.ProductCode} - {order.ItemName}"
                    : order.ProductCode,

                RecipeCode = (order.RecipeName != null && order.RecipeCode != null)
                    ? $"{order.RecipeCode} - {order.RecipeName}"
                    : order.RecipeCode,

                order.RecipeVersion,
                order.Shift,
                order.PlannedStart,
                order.PlannedEnd,
                order.Quantity,
                order.UnitOfMeasurement,
                order.LotNumber,
                order.timestamp,
                order.Plant,
                order.Shopfloor,
                order.ProcessArea,
                order.Status,

                order.ItemName,
                order.RecipeName,

                RecipeDetailsId = order.RecipeDetailsId ?? null,
                CurrentBatch = order.CurrentBatch ?? null,
                TotalBatches = order.TotalBatches ?? 0,
                ProductQuantity = order.ProductQuantity ?? null
            };

            return Ok(new
            {
                success = true,
                message = "Lấy chi tiết đơn hàng thành công",
                data
            });
        }
        catch (Exception ex)
        {
            Console.WriteLine("❌ GetById error: " + ex.Message);

            return StatusCode(500, new
            {
                success = false,
                message = "Lỗi server"
            });
        }
    }
}