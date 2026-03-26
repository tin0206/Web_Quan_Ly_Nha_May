using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class MachineMaster
{
    public int MachineId { get; set; }

    public string? LineCode { get; set; }

    public string? Line { get; set; }

    public string? MachineCode { get; set; }

    public string? MachineName { get; set; }
}
