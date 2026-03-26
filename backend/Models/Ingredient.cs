using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class Ingredient
{
    public int IngredientId { get; set; }

    public int ProcessId { get; set; }

    public string IngredientCode { get; set; } = null!;

    public decimal Quantity { get; set; }

    public string UnitOfMeasurement { get; set; } = null!;

    public virtual Process Process { get; set; } = null!;
}
