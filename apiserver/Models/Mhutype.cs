using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class Mhutype
{
    public int MhutypeId { get; set; }

    public int ProductMasterId { get; set; }

    public string FromUnit { get; set; } = null!;

    public string ToUnit { get; set; } = null!;

    public decimal Conversion { get; set; }

    public virtual ProductMaster ProductMaster { get; set; } = null!;
}
