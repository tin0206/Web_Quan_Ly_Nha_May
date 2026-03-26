using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class MaterialCompletion
{
    public int Id { get; set; }

    public string ProductionOrderNumber { get; set; } = null!;

    public string ProcessCode { get; set; } = null!;

    public string BatchCode { get; set; } = null!;

    public int Status { get; set; }

    public DateTime CreatedAt { get; set; }
}
