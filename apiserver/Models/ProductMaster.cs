using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class ProductMaster
{
    public int ProductMasterId { get; set; }

    public string ItemCode { get; set; } = null!;

    public string ItemName { get; set; } = null!;

    public string? ItemType { get; set; }

    public string? Group { get; set; }

    public string? Category { get; set; }

    public string? Brand { get; set; }

    public string? BaseUnit { get; set; }

    public string? InventoryUnit { get; set; }

    public string? ItemStatus { get; set; }

    public DateTime? Timestamp { get; set; }

    public virtual ICollection<Mhutype> Mhutypes { get; set; } = new List<Mhutype>();
}
