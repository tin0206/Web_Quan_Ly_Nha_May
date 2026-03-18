using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class RecipeDetail
{
    public int RecipeDetailsId { get; set; }

    public string? ProductCode { get; set; }

    public string? ProductionLine { get; set; }

    public string RecipeCode { get; set; } = null!;

    public string RecipeName { get; set; } = null!;

    public string? RecipeStatus { get; set; }

    public string Version { get; set; } = null!;

    public DateTime? Timestamp { get; set; }

    public string? Plant { get; set; }

    public string? Shopfloor { get; set; }

    public string? ProductName { get; set; }

    public virtual ICollection<Process> Processes { get; set; } = new List<Process>();
}
