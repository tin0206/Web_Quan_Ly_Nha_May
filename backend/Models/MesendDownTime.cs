using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class MesendDownTime
{
    public string? DowntimeId { get; set; }

    public string? MachineCode { get; set; }

    public DateTime? StartTime { get; set; }

    public DateTime? EndTime { get; set; }

    public string? ReasonCode { get; set; }

    public string? ReasonDesc { get; set; }

    public DateTime? TimestampStart { get; set; }

    public int? CountStart { get; set; }

    public string? RequestStart { get; set; }

    public string? ResponeStart { get; set; }

    public DateTime? TimestampEnd { get; set; }

    public int? CountEnd { get; set; }

    public string? RequestEnd { get; set; }

    public string? ResponeEnd { get; set; }

    public string? Status { get; set; }

    public string? Status1 { get; set; }
}
