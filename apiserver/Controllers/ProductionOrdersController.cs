using Microsoft.AspNetCore.Mvc;
using Dapper;
using System.Data;
using Microsoft.Data.SqlClient;

namespace YourProject.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ProductionOrdersController : ControllerBase
    {
        private readonly IConfiguration _config;

        public ProductionOrdersController(IConfiguration config)
        {
            _config = config;
        }

        private IDbConnection Connection => new SqlConnection(_config.GetConnectionString("DefaultConnection"));


        // =====================================================
        // 🔹 FILTERS
        // =====================================================
        [HttpGet("filters")]
        public async Task<IActionResult> Filters()
        {
            using var conn = Connection;
            var multi = await conn.QueryMultipleAsync(@"
                SELECT DISTINCT ProcessArea FROM ProductionOrders WHERE ProcessArea IS NOT NULL AND LTRIM(RTRIM(ProcessArea)) <> '';
                SELECT DISTINCT Shift FROM ProductionOrders WHERE Shift IS NOT NULL AND LTRIM(RTRIM(Shift)) <> '';
            ");

            return Ok(new
            {
                processAreas = await multi.ReadAsync<string>(),
                shifts = await multi.ReadAsync<string>()
            });
        }

        [HttpGet("filters-v2")]
        public async Task<IActionResult> FiltersV2()
        {
            using var conn = Connection;
            var multi = await conn.QueryMultipleAsync(@"
                SELECT DISTINCT ProcessArea FROM ProductionOrders WHERE ProcessArea IS NOT NULL AND LTRIM(RTRIM(ProcessArea)) <> '';
                SELECT DISTINCT Shift FROM ProductionOrders WHERE Shift IS NOT NULL AND LTRIM(RTRIM(Shift)) <> '';
                SELECT DISTINCT ProductionOrderNumber FROM ProductionOrders WHERE ProductionOrderNumber IS NOT NULL ORDER BY ProductionOrderNumber DESC;
            ");

            return Ok(new
            {
                processAreas = await multi.ReadAsync<string>(),
                shifts = await multi.ReadAsync<string>(),
                productionOrderNumbers = await multi.ReadAsync<string>()
            });
        }

        // =====================================================
        // 🔹 STATS
        // =====================================================
        [HttpGet("stats")]
        public async Task<IActionResult> Stats()
        {
            using var conn = Connection;
            var r = await conn.QueryFirstAsync(@"
                WITH RunningPO AS (
                    SELECT DISTINCT ProductionOrderNumber FROM MESMaterialConsumption
                )
                SELECT
                    COUNT(*) total,
                    SUM(CASE WHEN po.Status = 2 THEN 1 ELSE 0 END) completed,
                    SUM(CASE WHEN r.ProductionOrderNumber IS NOT NULL THEN 1 ELSE 0 END) inProgress
                FROM ProductionOrders po
                LEFT JOIN RunningPO r
                    ON r.ProductionOrderNumber = po.ProductionOrderNumber
            ");

            int stopped = r.total - (r.inProgress ?? 0);

            return Ok(new
            {
                success = true,
                stats = new
                {
                    r.total,
                    r.inProgress,
                    r.completed,
                    stopped
                }
            });
        }

        [HttpGet("stats-v2")]
        public async Task<IActionResult> StatsV2()
        {
            using var conn = Connection;
            var r = await conn.QueryFirstAsync(@"
                SELECT
                    COUNT(*) total,
                    SUM(CASE WHEN Status = 2 THEN 1 ELSE 0 END) completed,
                    SUM(CASE WHEN Status = 1 THEN 1 ELSE 0 END) inProgress,
                    SUM(CASE WHEN Status = -1 THEN 1 ELSE 0 END) stopped
                FROM ProductionOrders
            ");

            return Ok(new
            {
                success = true,
                stats = r
            });
        }

        // =====================================================
        // 🔹 STATS SEARCH
        // =====================================================
        [HttpGet("stats-v2/search")]
        public async Task<IActionResult> StatsSearchV2(
            string searchQuery = "",
            string dateFrom = "",
            string dateTo = "",
            string processAreas = "",
            string shifts = "",
            string statuses = "",
            string pos = "",
            string batchIds = ""
        )
        {
            using var conn = Connection;

            var where = new List<string>();
            var p = new DynamicParameters();

            if (!string.IsNullOrWhiteSpace(searchQuery))
            {
                where.Add("(po.ProductionOrderNumber LIKE @q OR po.ProductCode LIKE @q)");
                p.Add("q", $"%{searchQuery}%");
            }

            if (!string.IsNullOrEmpty(dateFrom))
            {
                where.Add("po.PlannedStart >= @dateFrom");
                p.Add("dateFrom", DateTime.Parse(dateFrom));
            }

            if (!string.IsNullOrEmpty(dateTo))
            {
                where.Add("po.PlannedStart < DATEADD(day,1,@dateTo)");
                p.Add("dateTo", DateTime.Parse(dateTo));
            }

            if (!string.IsNullOrWhiteSpace(processAreas))
            {
                var arr = processAreas.Split(',');
                where.Add("po.ProcessArea IN @pa");
                p.Add("pa", arr);
            }

            if (!string.IsNullOrWhiteSpace(shifts))
            {
                var arr = shifts.Split(',');
                where.Add("po.Shift IN @sh");
                p.Add("sh", arr);
            }

            string whereClause = where.Count > 0 ? "WHERE " + string.Join(" AND ", where) : "";

            var r = await conn.QueryFirstAsync($@"
                SELECT
                    COUNT(*) total,
                    SUM(CASE WHEN Status = 2 THEN 1 ELSE 0 END) completed,
                    SUM(CASE WHEN Status = 1 THEN 1 ELSE 0 END) inProgress,
                    SUM(CASE WHEN Status = -1 THEN 1 ELSE 0 END) stopped
                FROM ProductionOrders po
                {whereClause}
            ", p);

            return Ok(new { success = true, stats = r });
        }

        // =====================================================
        // 🔹 BASIC LIST
        // =====================================================
        [HttpGet]
        public async Task<IActionResult> Get(int page = 1, int limit = 20)
        {
            using var conn = Connection;
            int offset = (page - 1) * limit;

            int total = await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM ProductionOrders");

            var data = await conn.QueryAsync($@"
                SELECT * FROM ProductionOrders
                ORDER BY ProductionOrderId DESC
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
            ", new { offset, limit });

            return Ok(new
            {
                success = true,
                total,
                totalPages = Math.Ceiling((double)total / limit),
                page,
                limit,
                data
            });
        }

        // =====================================================
        // 🔹 V2 (JOIN BATCHES)
        // =====================================================
        [HttpGet("v2")]
        public async Task<IActionResult> V2(int page = 1, int limit = 20)
        {
            using var conn = Connection;

            int offset = (page - 1) * limit;

            var rows = (await conn.QueryAsync(@"
                SELECT * FROM ProductionOrders
                ORDER BY ProductionOrderId DESC
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
            ", new { offset, limit })).ToList();

            var ids = rows.Select(r => (int)r.ProductionOrderId);

            var batches = await conn.QueryAsync(@"
                SELECT * FROM Batches WHERE ProductionOrderId IN @ids
            ", new { ids });

            var lookup = batches.GroupBy(x => x.ProductionOrderId)
                                .ToDictionary(g => g.Key, g => g.ToList());

            var data = rows.Select(r => new
            {
                r,
                batches = lookup.ContainsKey((int)r.ProductionOrderId)
                    ? lookup[(int)r.ProductionOrderId]
                    : new List<object>()
            });

            return Ok(new { success = true, data });
        }

        // =====================================================
        // 🔹 SEARCH
        // =====================================================
        [HttpGet("search")]
        public async Task<IActionResult> Search(string searchQuery = "")
        {
            using var conn = Connection;
            var data = await conn.QueryAsync(@"
                SELECT * FROM ProductionOrders
                WHERE ProductionOrderNumber LIKE @q
            ", new { q = $"%{searchQuery}%" });

            return Ok(new { success = true, data });
        }

        // =====================================================
        // 🔹 SEARCH V2
        // =====================================================
        [HttpGet("search-v2")]
        public async Task<IActionResult> SearchV2(string searchQuery = "")
        {
            using var conn = Connection;
            var data = await conn.QueryAsync(@"
                SELECT * FROM ProductionOrders
                WHERE ProductionOrderNumber LIKE @q
            ", new { q = $"%{searchQuery}%" });

            return Ok(new { success = true, data });
        }
    }
}