using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class ByProduct
{
    public int ByProductId { get; set; }

    public int ProcessId { get; set; }

    public string ByProductCode { get; set; } = null!;

    public decimal PlanQuantity { get; set; }

    public string UnitOfMeasurement { get; set; } = null!;

    public virtual Process Process { get; set; } = null!;
}
