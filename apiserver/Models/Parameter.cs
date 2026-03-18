using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class Parameter
{
    public int ParameterId { get; set; }

    public int ProcessId { get; set; }

    public string Code { get; set; } = null!;

    public string DataType { get; set; } = null!;

    public DateTime? StartTime { get; set; }

    public DateTime? EndTime { get; set; }

    public string UnitOfMeasurement { get; set; } = null!;

    public decimal SetpointValue { get; set; }

    public decimal Min { get; set; }

    public decimal Max { get; set; }

    public virtual Process Process { get; set; } = null!;
}
