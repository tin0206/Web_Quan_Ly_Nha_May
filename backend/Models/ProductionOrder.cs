using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class ProductionOrder
{
    public int ProductionOrderId { get; set; }

    public string? ProductionLine { get; set; }

    public string? ProductCode { get; set; }

    public string ProductionOrderNumber { get; set; } = null!;

    public string RecipeCode { get; set; } = null!;

    public string RecipeVersion { get; set; } = null!;

    public string? Shift { get; set; }

    public DateTime? PlannedStart { get; set; }

    public DateTime? PlannedEnd { get; set; }

    public decimal? Quantity { get; set; }

    public string? UnitOfMeasurement { get; set; }

    public string? LotNumber { get; set; }

    public DateTime? Timestamp { get; set; }

    public string? Plant { get; set; }

    public string? Shopfloor { get; set; }

    public string? ProcessArea { get; set; }

    public int? Status { get; set; }

    public virtual ICollection<Batch> Batches { get; set; } = new List<Batch>();
}
