using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class VSendConsumption
{
    public int Id { get; set; }

    public string? ProductionOrderNumber { get; set; }

    public string? BatchCode { get; set; }

    public string? Quantity { get; set; }

    public string? IngredientCode { get; set; }

    public string? Lot { get; set; }

    public string? UnitOfMeasurement { get; set; }

    public string? SupplyMachine { get; set; }

    public DateTime? Timestamp { get; set; }

    public string? Status1 { get; set; }

    public string? Respone { get; set; }
}
