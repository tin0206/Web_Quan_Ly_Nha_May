using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class MaterialConsumption
{
    public int Id { get; set; }

    public string ProductionOrderNumber { get; set; } = null!;

    public string ProcessCode { get; set; } = null!;

    public string BatchCode { get; set; } = null!;

    public string IngredientCode { get; set; } = null!;

    public string? IngredientName { get; set; }

    public string? Lot { get; set; }

    public decimal Quantity { get; set; }

    public string UnitOfMeasurement { get; set; } = null!;

    public DateTime CreatedAt { get; set; }
}
