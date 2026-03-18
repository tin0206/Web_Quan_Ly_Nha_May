using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class Batch
{
    public int BatchId { get; set; }

    public int ProductionOrderId { get; set; }

    public string BatchNumber { get; set; } = null!;

    public decimal? Quantity { get; set; }

    public string? UnitOfMeasurement { get; set; }

    public int? Status { get; set; }

    public virtual ProductionOrder ProductionOrder { get; set; } = null!;
}
