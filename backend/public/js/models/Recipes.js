export class Recipe {
  constructor({
    RecipeDetailsId,
    ProductCode,
    ProductLine,
    RecipeCode,
    RecipeName,
    RecipeStatus,
    Version,
    timestamp,
    PLant,
    Shopfloor,
    ProductName,
  }) {
    this.RecipeDetailsId = RecipeDetailsId;
    this.ProductCode = ProductCode;
    this.ProductLine = ProductLine;
    this.RecipeCode = RecipeCode;
    this.RecipeName = RecipeName;
    this.RecipeStatus = RecipeStatus;
    this.Version = Version;
    this.timestamp = timestamp;
    this.PLant = PLant;
    this.Shopfloor = Shopfloor;
    this.ProductName = ProductName;
  }
}
