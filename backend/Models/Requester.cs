using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class Requester
{
    public int RequesterId { get; set; }

    public int LineItemId { get; set; }

    public string RequestedLocation { get; set; } = null!;

    public decimal RequestQty { get; set; }

    public string RequestQtyUoM { get; set; } = null!;

    public virtual ICollection<Dispatcher> Dispatchers { get; set; } = new List<Dispatcher>();

    public virtual LineItem LineItem { get; set; } = null!;
}
