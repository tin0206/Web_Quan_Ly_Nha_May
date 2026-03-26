export class Batch {
  constructor({
    BatchId,
    ProductionOrderId,
    BatchNumber,
    Quantity,
    UnitOfMeasurement,
    Status,
  }) {
    this.BatchId = BatchId;
    this.ProductionOrderId = ProductionOrderId;
    this.BatchNumber = BatchNumber;
    this.Quantity = Quantity;
    this.UnitOfMeasurement = UnitOfMeasurement;
    this.Status = Status;
  }
}
