using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class LogRequest
{
    public int Id { get; set; }

    public string? ClientIp { get; set; }

    public string? ClientName { get; set; }

    public string? Endpoint { get; set; }

    public string? JsonData { get; set; }

    public DateTime? Timestamp { get; set; }
}
