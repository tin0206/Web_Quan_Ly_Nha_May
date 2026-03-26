using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class LineItem
{
    public int LineItemId { get; set; }

    public int MovementOrderId { get; set; }

    public string ItemCode { get; set; } = null!;

    public virtual MovementOrder MovementOrder { get; set; } = null!;

    public virtual ICollection<Requester> Requesters { get; set; } = new List<Requester>();
}
