export class MESMaterialConsumption {
  constructor({
    id,
    productionOrderNumber,
    batchCode,
    quantity,
    ingredientCode,
    lot,
    unitOfMeasurement,
    datetime,
    operator_ID,
    supplyMachine,
    timestamp,
    count,
    request,
    respone,
    status,
    status1,
  }) {
    this.id = id;
    this.productionOrderNumber = productionOrderNumber;
    this.batchCode = batchCode;
    this.quantity = quantity;
    this.ingredientCode = ingredientCode;
    this.lot = lot;
    this.unitOfMeasurement = unitOfMeasurement;
    this.datetime = datetime;
    this.operator_ID = operator_ID;
    this.supplyMachine = supplyMachine;
    this.timestamp = timestamp;
    this.count = count;
    this.request = request;
    this.respone = respone;
    this.status = status;
    this.status1 = status1;
  }
}
