using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Dapper;
using System.Data;

[ApiController]
[Route("api/[controller]")]
public class RecipeDetailsController(IConfiguration config) : ControllerBase
{
    private IDbConnection Connection
        => new SqlConnection(config.GetConnectionString("DefaultConnection"));

    // =========================
    // GET api/RecipeDetails/{id}
    // =========================
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        try
        {
            using var conn = Connection;

            // 1. RecipeDetails
            var recipe = await conn.QueryFirstOrDefaultAsync(
                "SELECT * FROM RecipeDetails WHERE RecipeDetailsId = @id",
                new { id });

            if (recipe == null)
            {
                return NotFound(new
                {
                    success = false,
                    message = "Recipe not found"
                });
            }

            // 2. Processes
            var processes = (await conn.QueryAsync(
                "SELECT * FROM Processes WHERE RecipeDetailsId = @id",
                new { id })).ToList();

            var processIds = processes.Select(p => (int)p.ProcessId).ToList();

            // 3. Ingredients
            IEnumerable<dynamic> ingredients = [];

            if (processIds.Count > 0)
            {
                ingredients = await conn.QueryAsync(@"
                    SELECT i.*, pm.ItemName
                    FROM Ingredients i
                    LEFT JOIN ProductMasters pm 
                        ON i.IngredientCode = pm.ItemCode
                    WHERE i.ProcessId IN @processIds
                ", new { processIds });
            }

            // 4. Products
            IEnumerable<dynamic> products = [];

            if (recipe.ProductCode != null)
            {
                products = await conn.QueryAsync(@"
                    SELECT p.*, pm.ItemName
                    FROM Products p
                    LEFT JOIN ProductMasters pm 
                        ON p.ProductCode = pm.ItemCode
                    WHERE p.ProductCode = @productCode
                ", new { productCode = (string)recipe.ProductCode });
            }

            // 5. ByProducts
            IEnumerable<dynamic> byProducts = [];

            if (recipe.ProductCode != null)
            {
                byProducts = await conn.QueryAsync(@"
                    SELECT * FROM ByProducts 
                    WHERE ByProductCode = @productCode
                ", new { productCode = (string)recipe.ProductCode });
            }

            // 6. Parameters
            IEnumerable<dynamic> parameters = [];

            if (processIds.Count > 0)
            {
                parameters = await conn.QueryAsync(@"
                    SELECT p.*, ppm.Name as ParameterName
                    FROM Parameters p
                    LEFT JOIN ProcessParameterMasters ppm 
                        ON p.Code = ppm.Code
                    WHERE p.ProcessId IN @processIds
                ", new { processIds });
            }

            return Ok(new
            {
                success = true,
                recipe,
                processes,
                ingredients,
                products,
                byProducts,
                parameters
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new
            {
                success = false,
                error = ex.Message
            });
        }
    }
}