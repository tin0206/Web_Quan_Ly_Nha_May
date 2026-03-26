using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class Product
{
    public int ProductId { get; set; }

    public int ProcessId { get; set; }

    public string ProductCode { get; set; } = null!;

    public decimal PlanQuantity { get; set; }

    public string UnitOfMeasurement { get; set; } = null!;

    public virtual Process Process { get; set; } = null!;
}
