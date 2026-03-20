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
        public async Task<IActionResult> Filters([FromQuery] string dateFrom = "", [FromQuery] string dateTo = "")
        {
            using var conn = Connection;
            var where = new List<string>();
            var p = new DynamicParameters();

            if (!string.IsNullOrEmpty(dateFrom) && DateTime.TryParse(dateFrom, out DateTime df))
            {
                where.Add("PlannedStart >= @dateFrom");
                // .Date đảm bảo giá trị là 00:00:00 của ngày đó, không bị lệch múi giờ
                p.Add("dateFrom", df.Date); 
            }

            if (!string.IsNullOrEmpty(dateTo) && DateTime.TryParse(dateTo, out DateTime dt))
            {
                where.Add("PlannedStart < DATEADD(day, 1, @dateTo)");
                p.Add("dateTo", dt.Date);
            }

            string whereClause = where.Count > 0 ? "AND " + string.Join(" AND ", where) : "";

            var multi = await conn.QueryMultipleAsync($@"
                SELECT DISTINCT ProcessArea FROM ProductionOrders 
                WHERE ProcessArea IS NOT NULL AND LTRIM(RTRIM(ProcessArea)) <> '' {whereClause};

                SELECT DISTINCT Shift FROM ProductionOrders 
                WHERE Shift IS NOT NULL AND LTRIM(RTRIM(Shift)) <> '' {whereClause};
            ", p);

            return Ok(new
            {
                processAreas = await multi.ReadAsync<string>(),
                shifts = await multi.ReadAsync<string>()
            });
        }

        // =====================================================
        // 🔹 FILTERS V2
        // =====================================================
        [HttpGet("filtersV2")]
        public async Task<IActionResult> FiltersV2([FromQuery] string dateFrom = "", [FromQuery] string dateTo = "")
        {
            try 
            {
                using var conn = Connection;
                var where = new List<string>();
                var p = new DynamicParameters();

                // 1. Xử lý dateFrom: Lấy từ 00:00:00 của ngày được chọn
                if (!string.IsNullOrEmpty(dateFrom) && DateTime.TryParse(dateFrom, out DateTime df))
                {
                    where.Add("PlannedStart >= @dateFrom");
                    p.Add("dateFrom", df.Date); 
                }

                // 2. Xử lý dateTo: Kết hợp với DATEADD(day, 1, ...) để lấy hết ngày cuối
                if (!string.IsNullOrEmpty(dateTo) && DateTime.TryParse(dateTo, out DateTime dt))
                {
                    where.Add("PlannedStart < DATEADD(day, 1, @dateTo)");
                    p.Add("dateTo", dt.Date);
                }

                // Tạo chuỗi WHERE động
                string whereClause = where.Count > 0 
                    ? " AND " + string.Join(" AND ", where) 
                    : "";

                // 3. Truy vấn đa kết quả (QueryMultiple)
                // Lưu ý: Thêm ORDER BY cho ProductionOrderNumber để danh sách trả về dễ nhìn hơn
                var sql = $@"
                    SELECT DISTINCT ProcessArea 
                    FROM ProductionOrders 
                    WHERE ProcessArea IS NOT NULL AND LTRIM(RTRIM(ProcessArea)) <> '' {whereClause};

                    SELECT DISTINCT Shift 
                    FROM ProductionOrders 
                    WHERE Shift IS NOT NULL AND LTRIM(RTRIM(Shift)) <> '' {whereClause};

                    SELECT DISTINCT ProductionOrderNumber
                    FROM ProductionOrders
                    WHERE ProductionOrderNumber IS NOT NULL AND LTRIM(RTRIM(ProductionOrderNumber)) <> '' {whereClause}
                    ORDER BY ProductionOrderNumber DESC;";

                using var multi = await conn.QueryMultipleAsync(sql, p);

                // 4. Đọc dữ liệu theo đúng thứ tự SELECT ở trên
                return Ok(new
                {
                    processAreas = await multi.ReadAsync<string>(),
                    shifts = await multi.ReadAsync<string>(),
                    productionOrderNumbers = await multi.ReadAsync<string>()
                });
            }
            catch (Exception ex)
            {
                // In lỗi ra Console để bạn dễ debug
                Console.WriteLine($"❌ Lỗi trong FiltersV2: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Lỗi hệ thống: " + ex.Message });
            }
        }

        // =====================================================
        // 🔹 STATS (MATCH NODE)
        // =====================================================
        [HttpGet("stats")]
        public async Task<IActionResult> Stats()
        {
            using var conn = Connection;

            var stats = await conn.QueryFirstAsync(@"
                WITH RunningPO AS (
                    SELECT DISTINCT ProductionOrderNumber 
                    FROM MESMaterialConsumption
                )
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN po.Status = 2 THEN 1 ELSE 0 END) AS completed,
                    SUM(CASE WHEN r.ProductionOrderNumber IS NOT NULL THEN 1 ELSE 0 END) AS inProgress
                FROM ProductionOrders po
                LEFT JOIN RunningPO r
                    ON r.ProductionOrderNumber = po.ProductionOrderNumber
            ");

            int stopped = stats.total - (stats.inProgress ?? 0);

            return Ok(new
            {
                success = true,
                stats = new
                {
                    total = stats.total,
                    inProgress = stats.inProgress ?? 0,
                    completed = stats.completed ?? 0,
                    stopped
                }
            });
        }

        // =====================================================
        // 🔹 STATS V2
        // =====================================================
        [HttpGet("stats-v2")]
        public async Task<IActionResult> StatsV2()
        {
            using var conn = Connection;

            var stats = await conn.QueryFirstAsync(@"
                SELECT
                    COUNT(*) total,
                    SUM(CASE WHEN Status = 2 THEN 1 ELSE 0 END) completed,
                    SUM(CASE WHEN Status = 1 THEN 1 ELSE 0 END) inProgress,
                    SUM(CASE WHEN Status = -1 THEN 1 ELSE 0 END) stopped
                FROM ProductionOrders
            ");

            return Ok(new { success = true, stats });
        }

        // =====================================================
        // 🔹 STATS SEARCH (MATCH NODE)
        // =====================================================
        [HttpGet("stats/search")]
        public async Task<IActionResult> StatsSearch(
            [FromQuery] string searchQuery = "",
            [FromQuery] string dateFrom = "",
            [FromQuery] string dateTo = "",
            [FromQuery] string processAreas = "",
            [FromQuery] string shifts = "",
            [FromQuery] string statuses = ""
        )
        {
            try 
            {
                using var conn = Connection;
                var where = new List<string>();
                var p = new DynamicParameters();

                // 1. Search (Đã đồng bộ param @q)
                if (!string.IsNullOrWhiteSpace(searchQuery))
                {
                    where.Add(@"(
                        po.ProductionOrderNumber LIKE @q OR
                        po.ProductCode LIKE @q OR
                        po.ProductionLine LIKE @q OR
                        po.RecipeCode LIKE @q
                    )");
                    p.Add("q", $"%{searchQuery.Trim()}%");
                }

                // 2. Date (SỬA LẠI: Dùng .Date để giống Node.js)
                if (!string.IsNullOrEmpty(dateFrom) && DateTime.TryParse(dateFrom, out DateTime df))
                {
                    where.Add("po.PlannedStart >= @dateFrom");
                    p.Add("dateFrom", df.Date); // Lấy 00:00:00
                }

                if (!string.IsNullOrEmpty(dateTo) && DateTime.TryParse(dateTo, out DateTime dt))
                {
                    where.Add("po.PlannedStart < DATEADD(DAY, 1, @dateTo)");
                    p.Add("dateTo", dt.Date); // Lấy 00:00:00
                }

                // 3. Area & Shift
                if (!string.IsNullOrWhiteSpace(processAreas))
                {
                    var arr = processAreas.Split(',').Select(x => x.Trim()).Where(x => !string.IsNullOrEmpty(x)).ToArray();
                    where.Add("po.ProcessArea IN @pa");
                    p.Add("pa", arr);
                }

                if (!string.IsNullOrWhiteSpace(shifts))
                {
                    var arr = shifts.Split(',').Select(x => x.Trim()).Where(x => !string.IsNullOrEmpty(x)).ToArray();
                    where.Add("po.Shift IN @sh");
                    p.Add("sh", arr);
                }

                // 4. Status logic (Đồng bộ mmc logic)
                string statusCondition = "";
                if (!string.IsNullOrWhiteSpace(statuses))
                {
                    var arr = statuses.Split(',').Select(s => s.Trim()).ToList();
                    var conds = new List<string>();

                    // Chú ý: Ở đây dùng alias 'r' như trong câu SQL bên dưới
                    if (arr.Contains("Đang chạy"))
                        conds.Add("r.ProductionOrderNumber IS NOT NULL");

                    if (arr.Contains("Đang chờ"))
                        conds.Add("r.ProductionOrderNumber IS NULL");

                    if (conds.Count == 1) statusCondition = conds[0];
                    else if (conds.Count == 2) statusCondition = $"({string.Join(" OR ", conds)})";
                }

                // 5. Build WHERE Clause
                var allConditions = where.ToList();
                if (!string.IsNullOrEmpty(statusCondition)) allConditions.Add(statusCondition);

                string whereClause = allConditions.Count > 0 ? "WHERE " + string.Join(" AND ", allConditions) : "";

                // 6. Query (Sửa kiểu dynamic để tránh lỗi runtime)
                var result = await conn.QueryFirstAsync<dynamic>($@"
                    SELECT
                        COUNT(*) as total,
                        SUM(CASE WHEN po.Status = 2 THEN 1 ELSE 0 END) as completed,
                        SUM(CASE WHEN r.ProductionOrderNumber IS NOT NULL THEN 1 ELSE 0 END) as inProgress
                    FROM ProductionOrders po
                    LEFT JOIN (
                        SELECT DISTINCT ProductionOrderNumber 
                        FROM MESMaterialConsumption
                    ) r ON r.ProductionOrderNumber = po.ProductionOrderNumber
                    {whereClause}
                ", p);

                // Chuyển đổi an toàn từ dynamic
                int total = result.total ?? 0;
                int inProgress = result.inProgress ?? 0;
                int completed = result.completed ?? 0;

                return Ok(new
                {
                    success = true,
                    stats = new
                    {
                        total,
                        inProgress,
                        completed,
                        stopped = total - inProgress
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        // =====================================================
        // 🔥 STATS V2 SEARCH (FULL MATCH NODE)
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
                where.Add("po.ProcessArea IN @pa");
                p.Add("pa", processAreas.Split(','));
            }

            if (!string.IsNullOrWhiteSpace(shifts))
            {
                where.Add("po.Shift IN @sh");
                p.Add("sh", shifts.Split(','));
            }

            if (!string.IsNullOrWhiteSpace(pos))
            {
                where.Add("po.ProductionOrderNumber LIKE @poSearch");
                p.Add("poSearch", $"%{pos}%");
            }

            string statusCondition = "";

            if (!string.IsNullOrWhiteSpace(statuses))
            {
                var arr = statuses.Split(',').Select(x => x.Trim());

                var conds = new List<string>();

                if (arr.Contains("Bình thường")) conds.Add("po.Status = 1");
                if (arr.Contains("Đã hủy")) conds.Add("po.Status = -1");

                if (conds.Count == 1) statusCondition = conds[0];
                else if (conds.Count > 1) statusCondition = $"({string.Join(" OR ", conds)})";
            }

            string whereClause = (where.Count > 0 || !string.IsNullOrEmpty(statusCondition))
                ? "WHERE " + string.Join(" AND ", where.Concat(new[] { statusCondition }).Where(x => !string.IsNullOrEmpty(x)))
                : "";

            var stats = await conn.QueryFirstAsync($@"
                WITH FilteredPO AS (
                    SELECT DISTINCT po.ProductionOrderNumber, po.Status
                    FROM ProductionOrders po
                    {whereClause}
                )
                SELECT
                    COUNT(*) total,
                    SUM(CASE WHEN Status = 2 THEN 1 ELSE 0 END) completed,
                    SUM(CASE WHEN Status = 1 THEN 1 ELSE 0 END) inProgress,
                    SUM(CASE WHEN Status = -1 THEN 1 ELSE 0 END) stopped
                FROM FilteredPO
            ", p);

            return Ok(new
            {
                success = true,
                stats = stats
            });
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
        public async Task<IActionResult> Search(
            string? searchQuery = "",
            string? dateFrom = "",
            string? dateTo = "",
            string? processAreas = "",
            string? shifts = "",
            string? statuses = "",
            int page = 1,
            int limit = 20,
            int total = 0
        )
        {
            using var conn = Connection;

            page = Math.Max(1, page);
            limit = Math.Min(100, Math.Max(1, limit));
            int offset = (page - 1) * limit;

            var where = new List<string>();
            var p = new DynamicParameters();

            /* ================= SEARCH ================= */
            if (!string.IsNullOrWhiteSpace(searchQuery))
            {
                where.Add(@"(
                    po.ProductionOrderNumber LIKE @q OR
                    po.ProductCode LIKE @q OR
                    po.ProductionLine LIKE @q OR
                    po.RecipeCode LIKE @q
                )");
                p.Add("q", $"%{searchQuery.Trim()}%");
            }

            /* ================= DATE (INDEX SAFE) ================= */
            if (!string.IsNullOrEmpty(dateFrom) && DateTime.TryParse(dateFrom, out var df))
            {
                where.Add("po.PlannedStart >= @dateFrom");
                p.Add("dateFrom", df.Date);
            }

            if (!string.IsNullOrEmpty(dateTo) && DateTime.TryParse(dateTo, out var dt))
            {
                where.Add("po.PlannedStart < DATEADD(DAY, 1, @dateTo)");
                p.Add("dateTo", dt.Date);
            }

            /* ================= PROCESS AREA ================= */
            if (!string.IsNullOrWhiteSpace(processAreas))
            {
                var arr = processAreas.Split(',')
                    .Select(x => x.Trim())
                    .Where(x => !string.IsNullOrEmpty(x))
                    .ToArray();

                if (arr.Any())
                {
                    where.Add("po.ProcessArea IN @pa");
                    p.Add("pa", arr);
                }
            }

            /* ================= SHIFT ================= */
            if (!string.IsNullOrWhiteSpace(shifts))
            {
                var arr = shifts.Split(',')
                    .Select(x => x.Trim())
                    .Where(x => !string.IsNullOrEmpty(x))
                    .ToArray();

                if (arr.Any())
                {
                    where.Add("po.Shift IN @sh");
                    p.Add("sh", arr);
                }
            }

            /* ================= STATUS ================= */
            string statusCondition = "";

            if (!string.IsNullOrWhiteSpace(statuses))
            {
                var arr = statuses.Split(',')
                    .Select(s => s.Trim())
                    .ToList();

                var conds = new List<string>();

                if (arr.Contains("Đang chạy"))
                    conds.Add("mmc.ProductionOrderNumber IS NOT NULL");

                if (arr.Contains("Đang chờ"))
                    conds.Add("mmc.ProductionOrderNumber IS NULL");

                if (conds.Count == 1)
                    statusCondition = conds[0];
                else if (conds.Count == 2)
                    statusCondition = "(" + string.Join(" OR ", conds) + ")";
            }

            if (!string.IsNullOrEmpty(statusCondition))
                where.Add(statusCondition);

            string whereClause = where.Count > 0
                ? "WHERE " + string.Join(" AND ", where)
                : "";

            /* ================= COUNT ================= */
            if (page == 1 || total == 0)
            {
                total = await conn.ExecuteScalarAsync<int>($@"
                    SELECT COUNT(*)
                    FROM ProductionOrders po
                    LEFT JOIN (
                        SELECT DISTINCT ProductionOrderNumber
                        FROM MESMaterialConsumption
                    ) mmc
                    ON po.ProductionOrderNumber = mmc.ProductionOrderNumber
                    {whereClause}
                ", p, commandTimeout: 60);
            }

            /* ================= MAIN QUERY ================= */
            p.Add("offset", offset);
            p.Add("limit", limit);

            var data = await conn.QueryAsync($@"
                SELECT
                    po.ProductionOrderId,
                    po.ProductionOrderNumber,
                    po.ProductionLine,
                    po.ProductCode,
                    po.RecipeCode,
                    po.RecipeVersion,
                    po.LotNumber,
                    po.ProcessArea,
                    po.PlannedStart,
                    po.PlannedEnd,
                    po.Quantity,
                    po.UnitOfMeasurement,
                    po.Plant,
                    po.Shopfloor,
                    po.Shift,

                    pm.ItemName,
                    rd.RecipeName,

                    CASE 
                        WHEN mmc.ProductionOrderNumber IS NOT NULL THEN 1 
                        ELSE 0 
                    END AS Status,

                    ISNULL(mmc.MaxBatch, 0) AS CurrentBatch,
                    ISNULL(b.TotalBatches, 0) AS TotalBatches

                FROM ProductionOrders po

                LEFT JOIN ProductMasters pm
                    ON po.ProductCode = pm.ItemCode

                LEFT JOIN RecipeDetails rd
                    ON po.RecipeCode = rd.RecipeCode
                    AND po.RecipeVersion = rd.Version

                LEFT JOIN (
                    SELECT ProductionOrderNumber, MAX(BatchCode) AS MaxBatch
                    FROM MESMaterialConsumption
                    GROUP BY ProductionOrderNumber
                ) mmc
                    ON po.ProductionOrderNumber = mmc.ProductionOrderNumber

                LEFT JOIN (
                    SELECT ProductionOrderId, COUNT(*) AS TotalBatches
                    FROM Batches
                    GROUP BY ProductionOrderId
                ) b
                    ON po.ProductionOrderId = b.ProductionOrderId

                {whereClause}
                ORDER BY po.ProductionOrderId DESC
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
            ", p, commandTimeout: 60);

            /* ================= FORMAT ================= */
            var result = data.Select(o => new
            {
                o.ProductionOrderId,
                o.ProductionOrderNumber,
                o.ProductionLine,

                ProductCode = o.ItemName != null
                    ? $"{o.ProductCode} - {o.ItemName}"
                    : o.ProductCode,

                RecipeCode = (o.RecipeName != null && o.RecipeCode != null)
                    ? $"{o.RecipeCode} - {o.RecipeName}"
                    : o.RecipeCode,

                o.RecipeVersion,
                o.LotNumber,
                o.ProcessArea,
                o.PlannedStart,
                o.PlannedEnd,
                o.Quantity,
                o.UnitOfMeasurement,
                o.Plant,
                o.Shopfloor,
                o.Shift,

                o.ItemName,
                o.RecipeName,

                o.Status,
                o.CurrentBatch,
                o.TotalBatches
            });

            return Ok(new
            {
                success = true,
                message = "Success",
                total,
                totalPages = (int)Math.Ceiling((double)total / limit),
                page,
                limit,
                data = result
            });
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