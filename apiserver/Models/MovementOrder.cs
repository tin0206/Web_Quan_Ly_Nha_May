using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class MovementOrder
{
    public int MovementOrderId { get; set; }

    public string RequestNumber { get; set; } = null!;

    public string MoveOrderNumber { get; set; } = null!;

    public DateTime CreationDate { get; set; }

    public string CreationBy { get; set; } = null!;

    public string Plant { get; set; } = null!;

    public string Factory { get; set; } = null!;

    public string ShiftCode { get; set; } = null!;

    public DateTime? Timestamp { get; set; }

    public virtual ICollection<LineItem> LineItems { get; set; } = new List<LineItem>();
}
