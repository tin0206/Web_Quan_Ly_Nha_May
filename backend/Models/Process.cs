using System;
using System.Collections.Generic;

namespace apiserver.Models;

public partial class Process
{
    public int ProcessId { get; set; }

    public int RecipeDetailsId { get; set; }

    public string ProcessCode { get; set; } = null!;

    public string ProcessName { get; set; } = null!;

    public decimal? Duration { get; set; }

    public string? DurationUoM { get; set; }

    public virtual ICollection<ByProduct> ByProducts { get; set; } = new List<ByProduct>();

    public virtual ICollection<Ingredient> Ingredients { get; set; } = new List<Ingredient>();

    public virtual ICollection<Parameter> Parameters { get; set; } = new List<Parameter>();

    public virtual ICollection<Product> Products { get; set; } = new List<Product>();

    public virtual RecipeDetail RecipeDetails { get; set; } = null!;
}
