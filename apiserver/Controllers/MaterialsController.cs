using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Dapper;
using System.Data;
using System.Text;

[ApiController]
[Route("api/[controller]")]
public class MaterialsController : ControllerBase
{
    private readonly IConfiguration _config;

    public MaterialsController(IConfiguration config)
    {
        _config = config;
    }

    private IDbConnection Connection
        => new SqlConnection(_config.GetConnectionString("DefaultConnection"));

    // =========================
    // 1. GET api/materials
    // =========================
    [HttpGet]
    public async Task<IActionResult> GetAll(int page = 1, int pageSize = 100)
    {
        try
        {
            page = Math.Max(page, 1);
            pageSize = Math.Max(pageSize, 1);
            var offset = (page - 1) * pageSize;

            var sql = @"
            SELECT mmc.*, po.Shift AS shift
            FROM MESMaterialConsumption mmc
            LEFT JOIN ProductionOrders po
                ON mmc.productionOrderNumber = po.ProductionOrderNumber
            ORDER BY mmc.datetime DESC
            OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY";

            using var conn = Connection;
            var data = await conn.QueryAsync(sql, new { offset, pageSize });

            return Ok(new { success = true, message = "Success", data });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    // =========================
    // 2. Production Orders
    // =========================
    [HttpGet("production-orders")]
    public async Task<IActionResult> GetProductionOrders()
    {
        var sql = @"
        SELECT DISTINCT productionOrderNumber
        FROM MESMaterialConsumption
        ORDER BY productionOrderNumber ASC";

        using var conn = Connection;
        var data = await conn.QueryAsync<string>(sql);

        return Ok(new
        {
            success = true,
            message = "Success",
            data = data.Select(x => new { productionOrderNumber = x })
        });
    }

    // =========================
    // 3. Batch Codes
    // =========================
    [HttpGet("batch-codes")]
    public async Task<IActionResult> GetBatchCodes(string? productionOrderNumber)
    {
        var parameters = new DynamicParameters();
        var where = new List<string>
        {
            "batchCode IS NOT NULL",
            "LTRIM(RTRIM(batchCode)) <> ''"
        };

        if (!string.IsNullOrWhiteSpace(productionOrderNumber))
        {
            where.Add("productionOrderNumber = @po");
            parameters.Add("po", productionOrderNumber.Trim());
        }

        var sql = $@"
        SELECT DISTINCT batchCode
        FROM MESMaterialConsumption
        WHERE {string.Join(" AND ", where)}
        ORDER BY TRY_CAST(batchCode AS INT) ASC";

        using var conn = Connection;
        var data = await conn.QueryAsync<string>(sql, parameters);

        return Ok(new
        {
            success = true,
            message = "Success",
            data = data.Select(x => new { batchCode = x })
        });
    }

    // =========================
    // 4. Ingredients
    // =========================
    [HttpGet("ingredients")]
    public async Task<IActionResult> GetIngredients(string? productionOrderNumber, string? batchCode)
    {
        var parameters = new DynamicParameters();
        var where = new List<string>
        {
            "ingredientCode IS NOT NULL",
            "LTRIM(RTRIM(ingredientCode)) <> ''"
        };

        if (!string.IsNullOrWhiteSpace(productionOrderNumber))
        {
            where.Add("productionOrderNumber = @po");
            parameters.Add("po", productionOrderNumber.Trim());
        }

        if (!string.IsNullOrWhiteSpace(batchCode))
        {
            where.Add("batchCode = @bc");
            parameters.Add("bc", batchCode.Trim());
        }

        var sql = $@"
        SELECT DISTINCT ingredientCode
        FROM MESMaterialConsumption
        WHERE {string.Join(" AND ", where)}
        ORDER BY ingredientCode ASC";

        using var conn = Connection;
        var data = await conn.QueryAsync<string>(sql, parameters);

        return Ok(new
        {
            success = true,
            message = "Success",
            data = data.Select(x => new { ingredientCode = x })
        });
    }

    // =========================
    // 5. Shifts
    // =========================
    [HttpGet("shifts")]
    public async Task<IActionResult> GetShifts()
    {
        var sql = @"
        SELECT DISTINCT Shift
        FROM ProductionOrders
        WHERE Shift IS NOT NULL AND LTRIM(RTRIM(Shift)) <> ''
        ORDER BY Shift ASC";

        using var conn = Connection;
        var data = await conn.QueryAsync<string>(sql);

        return Ok(new
        {
            success = true,
            message = "Success",
            data = data.Select(x => new { shift = x })
        });
    }

    // =========================
    // HELPER
    // =========================
    private List<string> Normalize(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return new List<string>();
        return input.Split(',').Select(x => x.Trim()).ToList();
    }

    private string BuildWhere(IQueryCollection query, DynamicParameters p)
    {
        var where = new List<string>();

        // ProductionOrder
        var poList = Normalize(query["productionOrderNumber"]);
        if (poList.Any())
        {
            var parts = new List<string>();
            for (int i = 0; i < poList.Count; i++)
            {
                p.Add($"po{i}", $"%{poList[i]}%");
                parts.Add($"mmc.productionOrderNumber LIKE @po{i}");
            }
            where.Add($"({string.Join(" OR ", parts)})");
        }

        // Batch
        var batchList = Normalize(query["batchCode"]);
        if (batchList.Any())
        {
            var parts = new List<string>();
            for (int i = 0; i < batchList.Count; i++)
            {
                p.Add($"bc{i}", $"%{batchList[i]}%");
                parts.Add($"mmc.batchCode LIKE @bc{i}");
            }
            where.Add($"({string.Join(" OR ", parts)})");
        }

        // Ingredient
        var ingList = Normalize(query["ingredientCode"]);
        if (ingList.Any())
        {
            var parts = new List<string>();
            for (int i = 0; i < ingList.Count; i++)
            {
                p.Add($"ing{i}", $"%{ingList[i]}%");
                parts.Add($"mmc.ingredientCode LIKE @ing{i}");
            }
            where.Add($"({string.Join(" OR ", parts)})");
        }

        // Shift
        var shiftList = Normalize(query["shift"]);
        if (shiftList.Any())
        {
            where.Add("po.Shift IN @shiftList");
            p.Add("shiftList", shiftList);
        }

        // Date
        if (DateTime.TryParse(query["fromDate"], out var from))
        {
            p.Add("fromDate", from);
            where.Add("mmc.datetime >= @fromDate");
        }

        if (DateTime.TryParse(query["toDate"], out var to))
        {
            p.Add("toDate", to);
            where.Add("mmc.datetime <= @toDate");
        }

        return where.Any() ? "WHERE " + string.Join(" AND ", where) : "";
    }

    // =========================
    // 6. SEARCH
    // =========================
    [HttpGet("search")]
    public async Task<IActionResult> Search(int page = 1, int pageSize = 100)
    {
        try
        {
            var offset = (page - 1) * pageSize;

            var p = new DynamicParameters();
            var where = BuildWhere(Request.Query, p);

            p.Add("offset", offset);
            p.Add("pageSize", pageSize);

            var sql = $@"
            SELECT mmc.*, po.Shift AS shift
            FROM MESMaterialConsumption mmc
            LEFT JOIN ProductionOrders po
                ON mmc.productionOrderNumber = po.ProductionOrderNumber
            {where}
            ORDER BY mmc.datetime DESC
            OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY";

            using var conn = Connection;
            var data = await conn.QueryAsync(sql, p);

            return Ok(new { success = true, data });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    // =========================
    // 7. STATS
    // =========================
    [HttpGet("stats")]
    public async Task<IActionResult> Stats()
    {
        using var conn = Connection;
        var total = await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM MESMaterialConsumption");

        return Ok(new { success = true, data = new { total } });
    }

    // =========================
    // 8. STATS SEARCH
    // =========================
    [HttpGet("stats/search")]
    public async Task<IActionResult> StatsSearch()
    {
        var p = new DynamicParameters();
        var where = BuildWhere(Request.Query, p);

        var sql = $@"
        SELECT COUNT(*) 
        FROM MESMaterialConsumption mmc
        LEFT JOIN ProductionOrders po
            ON mmc.productionOrderNumber = po.ProductionOrderNumber
        {where}";

        using var conn = Connection;
        var total = await conn.ExecuteScalarAsync<int>(sql, p);

        return Ok(new { success = true, data = new { total } });
    }
}