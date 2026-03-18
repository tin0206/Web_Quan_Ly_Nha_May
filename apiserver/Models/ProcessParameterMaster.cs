using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class ProcessParameterMaster
{
    public int Id { get; set; }

    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public string Status { get; set; } = null!;

    public DateTime? Timestamp { get; set; }
}
