using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Dapper;
using System.Data;
using System.Text;

[ApiController]
[Route("api/[controller]")]
public class RecipesController : ControllerBase
{
    private readonly IConfiguration _config;

    public RecipesController(IConfiguration config)
    {
        _config = config;
    }

    private IDbConnection Connection
        => new SqlConnection(_config.GetConnectionString("DefaultConnection"));

    // =========================
    // 1. GET /stats
    // =========================
    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        try
        {
            var sql = @"
            SELECT
                (SELECT COUNT(*) FROM RecipeDetails) as total,
                (SELECT COUNT(*) FROM RecipeDetails WHERE RecipeStatus = 'Active') as active,
                (SELECT COUNT(DISTINCT Version) FROM RecipeDetails) as totalVersions
            ";

            using var conn = Connection;
            var stats = await conn.QueryFirstOrDefaultAsync(sql);

            return Ok(new
            {
                success = true,
                message = "Success",
                stats = new
                {
                    total = stats?.total ?? 0,
                    active = stats?.active ?? 0,
                    totalVersions = stats?.totalVersions ?? 0,
                    draft = 0
                }
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    // =========================
    // 2. GET /stats/search
    // =========================
    [HttpGet("stats/search")]
    public async Task<IActionResult> GetStatsSearch(
        string? search,
        string? status,
        string? statuses)
    {
        try
        {
            var whereCommon = new StringBuilder("1=1");
            var parameters = new DynamicParameters();

            if (!string.IsNullOrWhiteSpace(search))
            {
                parameters.Add("search", $"%{search.Trim()}%");
                whereCommon.Append(@" AND (
                    RecipeCode LIKE @search 
                    OR ProductCode LIKE @search 
                    OR ProductName LIKE @search
                )");
            }

            string statusClause = "";

            if (!string.IsNullOrWhiteSpace(statuses))
            {
                var list = statuses.Split(',')
                    .Select(s => s.Trim().ToLower())
                    .Where(s => !string.IsNullOrEmpty(s))
                    .ToList();

                var parts = new List<string>();

                if (list.Contains("active"))
                    parts.Add("RecipeStatus = 'Active'");

                if (list.Contains("inactive"))
                    parts.Add("(RecipeStatus NOT IN ('Active') OR RecipeStatus IS NULL)");

                if (parts.Any())
                    statusClause = $" AND ({string.Join(" OR ", parts)})";
            }
            else if (!string.IsNullOrWhiteSpace(status))
            {
                if (status == "active")
                    statusClause = " AND RecipeStatus = 'Active'";
                else if (status == "inactive")
                    statusClause = " AND (RecipeStatus NOT IN ('Active') OR RecipeStatus IS NULL)";
            }

            var whereTotal = whereCommon + statusClause;

            var sql = $@"
            SELECT
                (SELECT COUNT(*) FROM RecipeDetails WHERE {whereTotal}) as total,
                (SELECT COUNT(*) FROM RecipeDetails WHERE {whereCommon} AND RecipeStatus = 'Active'{statusClause}) as active,
                (SELECT COUNT(DISTINCT Version) FROM RecipeDetails WHERE {whereTotal}) as totalVersions
            ";

            using var conn = Connection;
            var stats = await conn.QueryFirstOrDefaultAsync(sql, parameters);

            return Ok(new
            {
                success = true,
                message = "Success",
                stats = new
                {
                    total = stats?.total ?? 0,
                    active = stats?.active ?? 0,
                    totalVersions = stats?.totalVersions ?? 0,
                    draft = 0
                }
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    // =========================
    // 3. GET /
    // =========================
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            var sql = @"SELECT * FROM RecipeDetails ORDER BY RecipeDetailsId DESC";

            using var conn = Connection;
            var data = (await conn.QueryAsync(sql)).ToList();

            return Ok(new
            {
                success = true,
                data,
                count = data.Count
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    // =========================
    // 4. GET /search
    // =========================
    [HttpGet("search")]
    public async Task<IActionResult> Search(
        int page = 1,
        int limit = 20,
        string? search = null,
        string? status = null,
        string? statuses = null)
    {
        try
        {
            page = Math.Max(1, page);
            limit = Math.Max(1, Math.Min(100, limit));
            var skip = (page - 1) * limit;

            var where = new StringBuilder("1=1");
            var parameters = new DynamicParameters();

            if (!string.IsNullOrWhiteSpace(search))
            {
                parameters.Add("search", $"%{search.Trim()}%");
                where.Append(@" AND (
                    RecipeCode LIKE @search
                    OR ProductCode LIKE @search
                    OR ProductName LIKE @search
                )");
            }

            if (!string.IsNullOrWhiteSpace(statuses))
            {
                var list = statuses.Split(',')
                    .Select(s => s.Trim().ToLower())
                    .Where(s => !string.IsNullOrEmpty(s))
                    .ToList();

                var parts = new List<string>();

                if (list.Contains("active"))
                    parts.Add("RecipeStatus = 'Active'");

                if (list.Contains("inactive"))
                    parts.Add("(RecipeStatus NOT IN ('Active') OR RecipeStatus IS NULL)");

                if (parts.Any())
                    where.Append($" AND ({string.Join(" OR ", parts)})");
            }
            else if (!string.IsNullOrWhiteSpace(status))
            {
                if (status == "active")
                    where.Append(" AND RecipeStatus = 'Active'");
                else if (status == "inactive")
                    where.Append(" AND (RecipeStatus NOT IN ('Active') OR RecipeStatus IS NULL)");
            }

            using var conn = Connection;

            // COUNT
            var countSql = $"SELECT COUNT(*) FROM RecipeDetails WHERE {where}";
            var total = await conn.ExecuteScalarAsync<int>(countSql, parameters);

            var totalPages = total > 0 ? (int)Math.Ceiling(total / (double)limit) : 1;

            // DATA
            var dataSql = $@"
            SELECT * FROM RecipeDetails
            WHERE {where}
            ORDER BY RecipeDetailsId DESC
            OFFSET @skip ROWS FETCH NEXT @limit ROWS ONLY";

            parameters.Add("skip", skip);
            parameters.Add("limit", limit);

            var data = await conn.QueryAsync(dataSql, parameters);

            return Ok(new
            {
                success = true,
                data,
                total,
                totalPages,
                page,
                limit
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }
}