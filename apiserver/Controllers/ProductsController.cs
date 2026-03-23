using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Dapper;
using System.Data;
using System.Text;

[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    private readonly IConfiguration _config;

    public ProductsController(IConfiguration config)
    {
        _config = config;
    }

    private IDbConnection Connection
        => new SqlConnection(_config.GetConnectionString("DefaultConnection"));

    // =========================
    // 1. GET api/products/types
    // =========================
    [HttpGet("types")]
    public async Task<IActionResult> GetTypes()
    {
        try
        {
            var sql = @"SELECT DISTINCT Item_Type FROM ProductMasters";

            using var conn = Connection;
            var types = await conn.QueryAsync<string>(sql);

            return Ok(types);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // =========================
    // 2. GET api/products/search
    // =========================
    [HttpGet("search")]
    public async Task<IActionResult> Search(
        string? q = "",
        string? status = "",
        string? statuses = "",
        string? type = "",
        string? types = "",
        int page = 1,
        int pageSize = 20)
    {
        try
        {
            page = Math.Max(1, page);
            pageSize = Math.Min(Math.Max(pageSize, 1), 100);
            var offset = (page - 1) * pageSize;

            var where = new List<string>();
            var parameters = new DynamicParameters();

            var statusesList = (statuses ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => s.Trim().ToUpper()).ToList();

            var typesList = (types ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => s.Trim()).ToList();

            if (!string.IsNullOrWhiteSpace(q))
            {
                where.Add("(p.ItemCode LIKE @q OR p.ItemName LIKE @q OR p.[Group] LIKE @q)");
                parameters.Add("q", $"%{q}%");
            }

            if (statusesList.Any())
            {
                var parts = new List<string>();
                for (int i = 0; i < statusesList.Count; i++)
                {
                    parameters.Add($"status{i}", statusesList[i]);
                    if (statusesList[i] == "ACTIVE")
                        parts.Add($"p.Item_Status = @status{i}");
                    else
                        parts.Add($"(p.Item_Status = @status{i} OR p.Item_Status IS NULL)");
                }
                where.Add($"({string.Join(" OR ", parts)})");
            }
            else if (!string.IsNullOrWhiteSpace(status))
            {
                if (status.ToUpper() == "ACTIVE")
                {
                    where.Add("p.Item_Status = @status");
                    parameters.Add("status", "ACTIVE");
                }
                else if (status.ToUpper() == "INACTIVE")
                {
                    where.Add("(p.Item_Status = @inactive OR p.Item_Status IS NULL)");
                    parameters.Add("inactive", "INACTIVE");
                }
            }

            if (typesList.Any())
            {
                where.Add("p.Item_Type IN @typesList");
                parameters.Add("typesList", typesList);
            }
            else if (!string.IsNullOrWhiteSpace(type))
            {
                where.Add("p.Item_Type = @type");
                parameters.Add("type", type);
            }

            var whereSql = where.Any() ? $"WHERE {string.Join(" AND ", where)}" : "";

            using var conn = Connection;

            // COUNT
            var total = await conn.ExecuteScalarAsync<int>(
                $"SELECT COUNT(*) FROM ProductMasters p {whereSql}",
                parameters);

            // DATA
            var dataSql = $@"
            SELECT 
                p.ProductMasterId,
                p.ItemCode,
                p.ItemName,
                p.Item_Type,
                p.[Group],
                p.Category,
                p.Brand,
                p.BaseUnit,
                p.InventoryUnit,
                p.Item_Status,
                p.[timestamp],
                JSON_QUERY(
                    (
                        SELECT m.MHUTypeId, m.FromUnit, m.ToUnit, m.Conversion
                        FROM MHUTypes m
                        WHERE m.ProductMasterId = p.ProductMasterId
                        FOR JSON PATH
                    )
                ) AS MhuTypes
            FROM ProductMasters p
            {whereSql}
            ORDER BY p.[timestamp] DESC
            OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
            ";

            parameters.Add("offset", offset);
            parameters.Add("pageSize", pageSize);

            var rows = await conn.QueryAsync(dataSql, parameters);

            var items = rows.Select(r =>
            {
                var dict = (IDictionary<string, object>)r;
                var json = dict["MhuTypes"]?.ToString();

                var parsed = string.IsNullOrEmpty(json)
                    ? new List<object>()
                    : System.Text.Json.JsonSerializer.Deserialize<List<object>>(json) ?? new List<object>();

                dict["MhuTypes"] = parsed;
                return dict;
            });

            return Ok(new
            {
                items,
                total,
                page,
                pageSize
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // =========================
    // 3. GET api/products/stats/search
    // =========================
    [HttpGet("stats/search")]
    public async Task<IActionResult> StatsSearch(
        string? q = "",
        string? status = "",
        string? statuses = "",
        string? type = "",
        string? types = "")
    {
        try
        {
            var where = new List<string>();
            var parameters = new DynamicParameters();

            var statusesList = (statuses ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => s.Trim().ToUpper()).ToList();

            var typesList = (types ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => s.Trim()).ToList();

            if (!string.IsNullOrWhiteSpace(q))
            {
                where.Add("(p.ItemCode LIKE @q OR p.ItemName LIKE @q OR p.[Group] LIKE @q)");
                parameters.Add("q", $"%{q}%");
            }

            if (statusesList.Any())
            {
                var parts = new List<string>();
                for (int i = 0; i < statusesList.Count; i++)
                {
                    parameters.Add($"status{i}", statusesList[i]);
                    if (statusesList[i] == "ACTIVE")
                        parts.Add($"p.Item_Status = @status{i}");
                    else
                        parts.Add($"(p.Item_Status = @status{i} OR p.Item_Status IS NULL)");
                }
                where.Add($"({string.Join(" OR ", parts)})");
            }
            else if (!string.IsNullOrWhiteSpace(status))
            {
                if (status.ToUpper() == "ACTIVE")
                {
                    where.Add("p.Item_Status = @status");
                    parameters.Add("status", "ACTIVE");
                }
                else if (status.ToUpper() == "INACTIVE")
                {
                    where.Add("(p.Item_Status = @inactive OR p.Item_Status IS NULL)");
                    parameters.Add("inactive", "INACTIVE");
                }
            }

            if (typesList.Any())
            {
                where.Add("p.Item_Type IN @typesList");
                parameters.Add("typesList", typesList);
            }
            else if (!string.IsNullOrWhiteSpace(type))
            {
                where.Add("p.Item_Type = @type");
                parameters.Add("type", type);
            }

            var whereSql = where.Any() ? $"WHERE {string.Join(" AND ", where)}" : "";

            var sql = $@"
            SELECT
                COUNT(*) AS totalProducts,
                SUM(CASE WHEN p.Item_Status = 'ACTIVE' THEN 1 ELSE 0 END) AS activeProducts,
                COUNT(DISTINCT p.Item_Type) AS totalTypes,
                COUNT(DISTINCT p.Category) AS totalCategories,
                COUNT(DISTINCT p.[Group]) AS totalGroups
            FROM ProductMasters p
            {whereSql}
            ";

            using var conn = Connection;
            var result = await conn.QueryFirstOrDefaultAsync(sql, parameters);

            return Ok(result ?? new
            {
                totalProducts = 0,
                activeProducts = 0,
                totalTypes = 0,
                totalCategories = 0,
                totalGroups = 0
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // =========================
    // 4. GET api/products/{id}
    // =========================
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        try
        {
            var sql = @"
            SELECT 
                p.ProductMasterId,
                p.ItemCode,
                p.ItemName,
                p.Item_Type,
                p.[Group],
                p.Category,
                p.Brand,
                p.BaseUnit,
                p.InventoryUnit,
                p.Item_Status,
                p.timestamp,
                JSON_QUERY(
                    (
                        SELECT m.MHUTypeId, m.FromUnit, m.ToUnit, m.Conversion
                        FROM MHUTypes m
                        WHERE m.ProductMasterId = p.ProductMasterId
                        FOR JSON PATH
                    )
                ) AS MhuTypes
            FROM ProductMasters p
            WHERE p.ItemCode = @id
            ";

            using var conn = Connection;
            var row = await conn.QueryFirstOrDefaultAsync(sql, new { id });

            if (row == null)
                return NotFound(new { error = "Not found" });

            var dict = (IDictionary<string, object>)row;

            var json = dict["MhuTypes"]?.ToString();
            var parsed = string.IsNullOrEmpty(json)
                ? new List<object>()
                : System.Text.Json.JsonSerializer.Deserialize<List<object>>(json) ?? new List<object>();

            dict["MhuTypes"] = parsed;

            return Ok(dict);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }
}