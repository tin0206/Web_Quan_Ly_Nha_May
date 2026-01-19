export class ProductionOrder {
  constructor({
    ProductionOrderId,
    ProductionLine,
    ProductCode,
    ProductionOrderNumber,
    RecipeCode,
    RecipeVersion,
    Shift,
    PlannedStart,
    PlannedEnd,
    Quantity,
    UnitOfMeasurement,
    LotNumber,
    timestamp,
    Plant,
    Shopfloor,
    ProcessArea,
    Status,
    Progress = 0,
    ProgressStatus = "running",
  }) {
    this.ProductionOrderId = ProductionOrderId;
    this.ProductionLine = ProductionLine;
    this.ProductCode = ProductCode;
    this.ProductionOrderNumber = ProductionOrderNumber;
    this.RecipeCode = RecipeCode;
    this.RecipeVersion = RecipeVersion;
    this.Shift = Shift;
    this.PlannedStart = PlannedStart;
    this.PlannedEnd = PlannedEnd;
    this.Quantity = Quantity;
    this.UnitOfMeasurement = UnitOfMeasurement;
    this.LotNumber = LotNumber;
    this.timestamp = timestamp;
    this.Plant = Plant;
    this.Shopfloor = Shopfloor;
    this.ProcessArea = ProcessArea;
    this.Status = Status;
    this.Progress = Progress;
    this.ProgressStatus = ProgressStatus;
  }
}
