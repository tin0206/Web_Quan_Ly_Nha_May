using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class Dispatcher
{
    public int DispatcherId { get; set; }

    public int RequesterId { get; set; }

    public string DispatchWarehouse { get; set; } = null!;

    public string DispatchLocation { get; set; } = null!;

    public string LotNumber { get; set; } = null!;

    public string SupplierCode { get; set; } = null!;

    public DateTime ReceiptDate { get; set; }

    public decimal QtyTransferPalletQty { get; set; }

    public string? Manufacture { get; set; }

    public DateTime? ProductionDate { get; set; }

    public DateTime? ExpiryDate { get; set; }

    public string? QtyTransferBaseUnit { get; set; }

    public decimal? QtyTransferBaseQty { get; set; }

    public string? QtyTransferInventoryUnit { get; set; }

    public decimal? QtyTransferInventoryQty { get; set; }

    public string? LotStatus { get; set; }

    public decimal? QtyReceiptBaseQty { get; set; }

    public string? QtyReceiptBaseUnit { get; set; }

    public decimal? QtyReceiptInventoryQty { get; set; }

    public string? QtyReceiptInventoryUnit { get; set; }

    public decimal QtyReceiptPalletQty { get; set; }

    public virtual Requester Requester { get; set; } = null!;
}
