using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Dapper;
using System.Data;

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
    // HELPER: DATE FILTER (GIỐNG NODE)
    // =========================
    private void ApplyDateFilter(IQueryCollection query, DynamicParameters p, List<string> where, string alias = "mmc")
    {
        string col = $"{alias}.datetime";

        DateTime? ParseDate(string input, bool endOfDay = false)
        {
            if (string.IsNullOrWhiteSpace(input)) return null;

            if (DateTime.TryParse(input, out var dt))
            {
                if (input.Length == 10) // yyyy-MM-dd
                {
                    return endOfDay
                        ? dt.Date.AddDays(1).AddMilliseconds(-1)
                        : dt.Date;
                }
                return dt;
            }
            return null;
        }

        var fromStr = query["fromDate"].ToString();
        var toStr = query["toDate"].ToString();

        var from = ParseDate(fromStr);
        var to = ParseDate(toStr, true);

        if (from.HasValue && to.HasValue)
        {
            p.Add("fromDate", from);
            p.Add("toDate", to);
            where.Add($"{col} BETWEEN @fromDate AND @toDate");
        }
        else if (from.HasValue)
        {
            p.Add("fromDate", from);
            where.Add($"{col} >= @fromDate");
        }
        else if (to.HasValue)
        {
            p.Add("toDate", to);
            where.Add($"{col} <= @toDate");
        }
    }

    // =========================
    // HELPER: CSV normalize
    // =========================
    private List<string> NormalizeQuery(object input)
    {
        if (input?.ToString() is not string rawInput)
            return new();

        return rawInput.Split(',')
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();
    }

    // =========================
    // 1. GET ALL
    // =========================
    [HttpGet]
    public async Task<IActionResult> GetAll(int page = 1, int pageSize = 100)
    {
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

    // =========================
    // 2. PRODUCTION ORDERS (CÓ DATE FILTER)
    // =========================
    [HttpGet("production-orders")]
    public async Task<IActionResult> GetProductionOrders()
    {
        var p = new DynamicParameters();
        var where = new List<string>();

        ApplyDateFilter(Request.Query, p, where);

        var whereClause = where.Any() ? "WHERE " + string.Join(" AND ", where) : "";

        var sql = $@"
        SELECT DISTINCT productionOrderNumber
        FROM MESMaterialConsumption
        {whereClause}
        ORDER BY productionOrderNumber ASC";

        using var conn = Connection;
        var data = await conn.QueryAsync<string>(sql, p);

        return Ok(new
        {
            success = true,
            data = data.Select(x => new { productionOrderNumber = x })
        });
    }

    // =========================
    // 3. BATCH CODES (FIX SORT + DATE)
    // =========================
    [HttpGet("batch-codes")]
    public async Task<IActionResult> GetBatchCodes(string? productionOrderNumber)
    {
        var p = new DynamicParameters();
        var where = new List<string>
        {
            "batchCode IS NOT NULL",
            "LTRIM(RTRIM(batchCode)) <> ''"
        };

        if (!string.IsNullOrWhiteSpace(productionOrderNumber))
        {
            p.Add("po", productionOrderNumber.Trim());
            where.Add("productionOrderNumber = @po");
        }

        ApplyDateFilter(Request.Query, p, where);

        var sql = $@"
        SELECT batchCode FROM (
            SELECT DISTINCT batchCode
            FROM MESMaterialConsumption
            WHERE {string.Join(" AND ", where)}
        ) t
        ORDER BY TRY_CAST(batchCode AS INT) ASC";

        using var conn = Connection;
        var data = await conn.QueryAsync<string>(sql, p);

        return Ok(new
        {
            success = true,
            data = data.Select(x => new { batchCode = x })
        });
    }

    // =========================
    // 4. INGREDIENTS (FIX DATE)
    // =========================
    [HttpGet("ingredients")]
    public async Task<IActionResult> GetIngredients(string? productionOrderNumber, string? batchCode)
    {
        var p = new DynamicParameters();
        var where = new List<string>
        {
            "ingredientCode IS NOT NULL",
            "LTRIM(RTRIM(ingredientCode)) <> ''"
        };

        if (!string.IsNullOrWhiteSpace(productionOrderNumber))
        {
            p.Add("po", productionOrderNumber.Trim());
            where.Add("productionOrderNumber = @po");
        }

        if (!string.IsNullOrWhiteSpace(batchCode))
        {
            p.Add("bc", batchCode.Trim());
            where.Add("batchCode = @bc");
        }

        ApplyDateFilter(Request.Query, p, where);

        var sql = $@"
        SELECT DISTINCT ingredientCode
        FROM MESMaterialConsumption
        WHERE {string.Join(" AND ", where)}
        ORDER BY ingredientCode ASC";

        using var conn = Connection;
        var data = await conn.QueryAsync<string>(sql, p);

        return Ok(new
        {
            success = true,
            data = data.Select(x => new { ingredientCode = x })
        });
    }

    // =========================
    // 5. SHIFTS (FIX JOIN LOGIC)
    // =========================
    [HttpGet("shifts")]
    public async Task<IActionResult> GetShifts()
    {
        var p = new DynamicParameters();
        var where = new List<string>();

        ApplyDateFilter(Request.Query, p, where, "mmc");

        string sql;

        if (where.Any())
        {
            sql = $@"
            SELECT DISTINCT po.Shift
            FROM ProductionOrders po
            INNER JOIN MESMaterialConsumption mmc
                ON po.ProductionOrderNumber = mmc.productionOrderNumber
            WHERE po.Shift IS NOT NULL AND LTRIM(RTRIM(po.Shift)) <> ''
            AND {string.Join(" AND ", where)}
            ORDER BY po.Shift ASC";
        }
        else
        {
            sql = @"
            SELECT DISTINCT Shift
            FROM ProductionOrders
            WHERE Shift IS NOT NULL AND LTRIM(RTRIM(Shift)) <> ''
            ORDER BY Shift ASC";
        }

        using var conn = Connection;
        var data = await conn.QueryAsync<string>(sql, p);

        return Ok(new
        {
            success = true,
            data = data.Select(x => new { shift = x })
        });
    }

    // =========================
    // 6. SEARCH (FULL LOGIC NODE)
    // =========================
    [HttpGet("search")]
    public async Task<IActionResult> Search(int page = 1, int pageSize = 100)
    {
        var offset = (page - 1) * pageSize;

        var p = new DynamicParameters();
        var where = new List<string>();

        // ProductionOrderNumber
        var poList = NormalizeQuery(Request.Query["productionOrderNumber"]);
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
        var batchList = NormalizeQuery(Request.Query["batchCode"]);
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
        var ingList = NormalizeQuery(Request.Query["ingredientCode"]);
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
        var shiftList = NormalizeQuery(Request.Query["shift"]);
        if (shiftList.Any())
        {
            where.Add("po.Shift IN @shiftList");
            p.Add("shiftList", shiftList);
        }

        // Date
        ApplyDateFilter(Request.Query, p, where);

        var whereClause = where.Any() ? "WHERE " + string.Join(" AND ", where) : "";

        var sql = $@"
        SELECT mmc.*, po.Shift AS shift
        FROM MESMaterialConsumption mmc
        LEFT JOIN ProductionOrders po
            ON mmc.productionOrderNumber = po.ProductionOrderNumber
        {whereClause}
        ORDER BY mmc.datetime DESC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY";

        p.Add("offset", offset);
        p.Add("pageSize", pageSize);

        using var conn = Connection;
        var data = await conn.QueryAsync(sql, p);

        return Ok(new { success = true, data });
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
        var where = new List<string>();

        ApplyDateFilter(Request.Query, p, where);

        var whereClause = where.Any() ? "WHERE " + string.Join(" AND ", where) : "";

        var sql = $@"
        SELECT COUNT(*)
        FROM MESMaterialConsumption mmc
        LEFT JOIN ProductionOrders po
            ON mmc.productionOrderNumber = po.ProductionOrderNumber
        {whereClause}";

        using var conn = Connection;
        var total = await conn.ExecuteScalarAsync<int>(sql, p);

        return Ok(new { success = true, data = new { total } });
    }
}