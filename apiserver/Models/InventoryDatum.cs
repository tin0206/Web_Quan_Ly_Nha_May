using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class InventoryDatum
{
    public int InventoryDataId { get; set; }

    public decimal BaseQty { get; set; }

    public string BaseUom { get; set; } = null!;

    public DateTime? ExpriredDate { get; set; }

    public string? Manufacture { get; set; }

    public string MaterialCode { get; set; } = null!;

    public string MaterialLotNumber { get; set; } = null!;

    public DateTime? Timestamp { get; set; }
}
