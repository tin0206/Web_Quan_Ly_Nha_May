using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Dapper;
using System.Data;

[ApiController]
[Route("api/[controller]")]
public class MaterialsController(IConfiguration config) : ControllerBase
{
    private IDbConnection Connection
        => new SqlConnection(config.GetConnectionString("DefaultConnection"));

    // =========================
    // HELPER: DATE FILTER (GIỐNG NODE)
    // =========================
    static void ApplyDateFilter(IQueryCollection query, DynamicParameters p, List<string> where, string alias = "mmc")
    {
        string col = string.IsNullOrWhiteSpace(alias)
            ? "datetime"
            : $"{alias}.datetime";

        static DateTime? ParseDate(string input, bool endOfDay = false)
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
    static List<string> NormalizeQuery(object input)
    {
        if (input?.ToString() is not string rawInput)
            return [];

        return [..rawInput.Split(',')
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))];
    }

    // =========================
    // 1. PRODUCTION ORDERS (CÓ DATE FILTER)
    // =========================
    [HttpGet("production-orders")]
    public async Task<IActionResult> GetProductionOrders()
    {
        using var conn = Connection;

        var where = new List<string>();
        var p = new DynamicParameters();

        // ✅ dùng helper giống Node
        ApplyDateFilter(Request.Query, p, where, ""); // no alias

        var whereClause = where.Count > 0
            ? "WHERE " + string.Join(" AND ", where)
            : "";

        var sql = $@"
            SELECT DISTINCT productionOrderNumber
            FROM MESMaterialConsumption
            {whereClause}
            ORDER BY productionOrderNumber ASC
        ";

        var rows = await conn.QueryAsync<string>(sql, p);

        return Ok(new
        {
            success = true,
            message = "Success",
            data = rows.Select(r => new { productionOrderNumber = r })
        });
    }

    // =========================
    // 2. BATCH CODES (FIX SORT + DATE)
    // =========================
    [HttpGet("batch-codes")]
    public async Task<IActionResult> GetBatchCodes(string? productionOrderNumber = "")
    {
        using var conn = Connection;

        var extraWhere = new List<string>();
        var p = new DynamicParameters();

        /* ================= PO FILTER (LIKE) ================= */
        if (!string.IsNullOrWhiteSpace(productionOrderNumber))
        {
            p.Add("po", $"%{productionOrderNumber.Trim()}%");
            extraWhere.Add("productionOrderNumber LIKE @po");
        }

        /* ================= DATE FILTER (KHÔNG alias) ================= */
        ApplyDateFilter(Request.Query, p, extraWhere, ""); // ✅ QUAN TRỌNG

        var extraStr = extraWhere.Count > 0
            ? "AND " + string.Join(" AND ", extraWhere)
            : "";

        var sql = $@"
            SELECT batchCode FROM (
                SELECT DISTINCT
                    CASE 
                        WHEN batchCode IS NULL OR LTRIM(RTRIM(batchCode)) = '' 
                            THEN NULL 
                        ELSE batchCode 
                    END AS batchCode,
                    CASE 
                        WHEN batchCode IS NULL OR LTRIM(RTRIM(batchCode)) = '' 
                            THEN 0 
                        ELSE 1 
                    END AS sort_grp
                FROM MESMaterialConsumption
                WHERE 1=1
                {extraStr}
            ) combined
            ORDER BY sort_grp ASC, TRY_CAST(batchCode AS INT) ASC
        ";

        var rows = await conn.QueryAsync<string>(sql, p);

        return Ok(new
        {
            success = true,
            message = "Success",
            data = rows.Select(r => new { batchCode = r })
        });
    }

    // =========================
    // 3. INGREDIENTS (FIX DATE)
    // =========================
    [HttpGet("ingredients")]
    public async Task<IActionResult> GetIngredients(
        string? productionOrderNumber,
        string? batchCode)
    {
        using var conn = Connection;

        var p = new DynamicParameters();
        var where = new List<string>
        {
            "ingredientCode IS NOT NULL",
            "LTRIM(RTRIM(ingredientCode)) <> ''"
        };

        if (!string.IsNullOrWhiteSpace(productionOrderNumber))
        {
            where.Add("productionOrderNumber LIKE @po");
            p.Add("po", $"%{productionOrderNumber.Trim()}%");
        }

        if (!string.IsNullOrWhiteSpace(batchCode))
        {
            where.Add("batchCode LIKE @bc");
            p.Add("bc", $"%{batchCode.Trim()}%");
        }

        /* 🔥 FIX Ở ĐÂY */
        ApplyDateFilter(Request.Query, p, where, ""); 

        var sql = $@"
            SELECT DISTINCT ingredientCode
            FROM MESMaterialConsumption
            WHERE {string.Join(" AND ", where)}
            ORDER BY ingredientCode ASC
        ";

        var data = await conn.QueryAsync<string>(sql, p);

        return Ok(new
        {
            success = true,
            message = "Success",
            data = data.Select(x => new { ingredientCode = x })
        });
    }

    // =========================
    // 4. SHIFTS (FIX JOIN LOGIC)
    // =========================
    [HttpGet("shifts")]
    public async Task<IActionResult> GetShifts()
    {
        var p = new DynamicParameters();
        var where = new List<string>();

        ApplyDateFilter(Request.Query, p, where, "mmc");

        string sql;

        if (where.Count > 0)
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
    // 5. SEARCH (FULL LOGIC NODE)
    // =========================
    [HttpGet("search")]
    public async Task<IActionResult> Search(int page = 1, int pageSize = 100)
    {
        var offset = (page - 1) * pageSize;

        var p = new DynamicParameters();
        var where = new List<string>();

        /* ================= PRODUCTION ORDER ================= */
        var poList = NormalizeQuery(Request.Query["productionOrderNumber"]);
        if (poList.Count > 0)
        {
            var conditions = new List<string>();

            if (poList.Contains("NULL"))
                conditions.Add("mmc.productionOrderNumber = ''");

            var real = poList.Where(x => x != "NULL").ToList();

            for (int i = 0; i < real.Count; i++)
            {
                p.Add($"po{i}", $"%{real[i]}%");
                conditions.Add($"mmc.productionOrderNumber LIKE @po{i}");
            }

            where.Add($"({string.Join(" OR ", conditions)})");
        }

        /* ================= BATCH ================= */
        var batchList = NormalizeQuery(Request.Query["batchCode"]);
        if (batchList.Count > 0)
        {
            var conditions = new List<string>();

            if (batchList.Contains("NULL"))
                conditions.Add("(mmc.batchCode IS NULL OR LTRIM(RTRIM(mmc.batchCode)) = '')");

            var real = batchList.Where(x => x != "NULL").ToList();

            for (int i = 0; i < real.Count; i++)
            {
                p.Add($"bc{i}", real[i]); // ❗ không có %
                conditions.Add($"mmc.batchCode = @bc{i}");
            }

            where.Add($"({string.Join(" OR ", conditions)})");
        }

        /* ================= INGREDIENT ================= */
        var ingList = NormalizeQuery(Request.Query["ingredientCode"]);
        if (ingList.Count > 0)
        {
            var conditions = new List<string>();

            if (ingList.Contains("NULL"))
                conditions.Add("mmc.ingredientCode IS NULL");

            var real = ingList.Where(x => x != "NULL").ToList();

            for (int i = 0; i < real.Count; i++)
            {
                p.Add($"ing{i}", $"%{real[i]}%");
                conditions.Add($"mmc.ingredientCode LIKE @ing{i}");
            }

            where.Add($"({string.Join(" OR ", conditions)})");
        }

        /* ================= SHIFT ================= */
        var shiftList = NormalizeQuery(Request.Query["shift"]);
        if (shiftList.Count > 0)
        {
            where.Add("po.Shift IN @shiftList");
            p.Add("shiftList", shiftList);
        }

        /* ================= RESPONE ================= */
        var responeList = NormalizeQuery(Request.Query["respone"]);
        if (responeList.Contains("Success") && !responeList.Contains("Failed"))
        {
            where.Add("mmc.respone = 'Success'");
        }
        else if (!responeList.Contains("Success") && responeList.Contains("Failed"))
        {
            where.Add("(mmc.respone <> 'Success' OR mmc.respone IS NULL)");
        }

        /* ================= DATE ================= */
        ApplyDateFilter(Request.Query, p, where);

        var whereClause = where.Count > 0
            ? "WHERE " + string.Join(" AND ", where)
            : "";

        var sql = $@"
            SELECT mmc.*, po.Shift AS shift
            FROM MESMaterialConsumption mmc
            LEFT JOIN ProductionOrders po
                ON mmc.productionOrderNumber = po.ProductionOrderNumber
            {whereClause}
            ORDER BY mmc.datetime DESC
            OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
        ";

        p.Add("offset", offset);
        p.Add("pageSize", pageSize);

        using var conn = Connection;
        var data = await conn.QueryAsync(sql, p);

        return Ok(new { success = true, data });
    }

    // =========================
    // 6. STATS SEARCH
    // =========================
    [HttpGet("stats/search")]
    public async Task<IActionResult> StatsSearch()
    {
        var p = new DynamicParameters();
        var where = new List<string>();

        /* ================= PRODUCTION ORDER ================= */
        var poList = NormalizeQuery(Request.Query["productionOrderNumber"]);
        if (poList.Count > 0)
        {
            var conditions = new List<string>();

            if (poList.Contains("NULL"))
                conditions.Add("mmc.productionOrderNumber = ''");

            var real = poList.Where(x => x != "NULL").ToList();

            for (int i = 0; i < real.Count; i++)
            {
                p.Add($"po{i}", $"%{real[i]}%");
                conditions.Add($"mmc.productionOrderNumber LIKE @po{i}");
            }

            where.Add($"({string.Join(" OR ", conditions)})");
        }

        /* ================= BATCH (FIX =) ================= */
        var batchList = NormalizeQuery(Request.Query["batchCode"]);
        if (batchList.Count > 0)
        {
            var conditions = new List<string>();

            if (batchList.Contains("NULL"))
                conditions.Add("(mmc.batchCode IS NULL OR LTRIM(RTRIM(mmc.batchCode)) = '')");

            var real = batchList.Where(x => x != "NULL").ToList();

            for (int i = 0; i < real.Count; i++)
            {
                p.Add($"bc{i}", real[i]);
                conditions.Add($"mmc.batchCode = @bc{i}");
            }

            where.Add($"({string.Join(" OR ", conditions)})");
        }

        /* ================= INGREDIENT ================= */
        var ingList = NormalizeQuery(Request.Query["ingredientCode"]);
        if (ingList.Count > 0)
        {
            var conditions = new List<string>();

            if (ingList.Contains("NULL"))
                conditions.Add("mmc.ingredientCode IS NULL");

            var real = ingList.Where(x => x != "NULL").ToList();

            for (int i = 0; i < real.Count; i++)
            {
                p.Add($"ing{i}", $"%{real[i]}%");
                conditions.Add($"mmc.ingredientCode LIKE @ing{i}");
            }

            where.Add($"({string.Join(" OR ", conditions)})");
        }

        /* ================= SHIFT ================= */
        var shiftList = NormalizeQuery(Request.Query["shift"]);
        if (shiftList.Count > 0)
        {
            where.Add("po.Shift IN @shiftList");
            p.Add("shiftList", shiftList);
        }

        /* ================= RESPONE ================= */
        var responeList = NormalizeQuery(Request.Query["respone"]);
        if (responeList.Contains("Success") && !responeList.Contains("Failed"))
        {
            where.Add("mmc.respone = 'Success'");
        }
        else if (!responeList.Contains("Success") && responeList.Contains("Failed"))
        {
            where.Add("(mmc.respone <> 'Success' OR mmc.respone IS NULL)");
        }

        /* ================= DATE ================= */
        ApplyDateFilter(Request.Query, p, where);

        var whereClause = where.Count > 0
            ? "WHERE " + string.Join(" AND ", where)
            : "";

        var sql = $@"
            SELECT COUNT(*) AS total
            FROM MESMaterialConsumption mmc
            LEFT JOIN ProductionOrders po
                ON mmc.productionOrderNumber = po.ProductionOrderNumber
            {whereClause}
        ";

        using var conn = Connection;
        var total = await conn.ExecuteScalarAsync<int>(sql, p);

        return Ok(new
        {
            success = true,
            message = "Success",
            data = new { total }
        });
    }
}