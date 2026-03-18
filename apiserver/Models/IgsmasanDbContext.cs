using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace apiserver.Models;

public partial class IgsmasanDbContext : DbContext
{
    public IgsmasanDbContext()
    {
    }

    public IgsmasanDbContext(DbContextOptions<IgsmasanDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Batch> Batches { get; set; }

    public virtual DbSet<ByProduct> ByProducts { get; set; }

    public virtual DbSet<Dispatcher> Dispatchers { get; set; }

    public virtual DbSet<DowntimeReasonMaster> DowntimeReasonMasters { get; set; }

    public virtual DbSet<Ingredient> Ingredients { get; set; }

    public virtual DbSet<InventoryDatum> InventoryData { get; set; }

    public virtual DbSet<LineItem> LineItems { get; set; }

    public virtual DbSet<LogRequest> LogRequests { get; set; }

    public virtual DbSet<MachineMaster> MachineMasters { get; set; }

    public virtual DbSet<MaterialCompletion> MaterialCompletions { get; set; }

    public virtual DbSet<MaterialConsumption> MaterialConsumptions { get; set; }

    public virtual DbSet<MesendDownTime> MesendDownTimes { get; set; }

    public virtual DbSet<MesmaterialConsumption> MesmaterialConsumptions { get; set; }

    public virtual DbSet<MesmaterialConsumptionLog> MesmaterialConsumptionLogs { get; set; }

    public virtual DbSet<Mhutype> Mhutypes { get; set; }

    public virtual DbSet<MovementOrder> MovementOrders { get; set; }

    public virtual DbSet<Parameter> Parameters { get; set; }

    public virtual DbSet<Process> Processes { get; set; }

    public virtual DbSet<ProcessParameterMaster> ProcessParameterMasters { get; set; }

    public virtual DbSet<Product> Products { get; set; }

    public virtual DbSet<ProductMaster> ProductMasters { get; set; }

    public virtual DbSet<ProductionOrder> ProductionOrders { get; set; }

    public virtual DbSet<RecipeDetail> RecipeDetails { get; set; }

    public virtual DbSet<RejectionReasonMaster> RejectionReasonMasters { get; set; }

    public virtual DbSet<Requester> Requesters { get; set; }

    public virtual DbSet<VSendConsumption> VSendConsumptions { get; set; }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        => optionsBuilder.UseSqlServer("Name=ConnectionStrings:DefaultConnection");

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.UseCollation("SQL_Latin1_General_CP1_CI_AS");

        modelBuilder.Entity<Batch>(entity =>
        {
            entity.Property(e => e.BatchNumber).HasMaxLength(20);
            entity.Property(e => e.Quantity).HasColumnType("decimal(18, 3)");
            entity.Property(e => e.UnitOfMeasurement).HasMaxLength(20);

            entity.HasOne(d => d.ProductionOrder).WithMany(p => p.Batches).HasForeignKey(d => d.ProductionOrderId);
        });

        modelBuilder.Entity<ByProduct>(entity =>
        {
            entity.Property(e => e.ByProductCode).HasMaxLength(50);
            entity.Property(e => e.PlanQuantity).HasColumnType("decimal(18, 3)");
            entity.Property(e => e.UnitOfMeasurement).HasMaxLength(20);

            entity.HasOne(d => d.Process).WithMany(p => p.ByProducts).HasForeignKey(d => d.ProcessId);
        });

        modelBuilder.Entity<Dispatcher>(entity =>
        {
            entity.Property(e => e.DispatchLocation).HasMaxLength(50);
            entity.Property(e => e.DispatchWarehouse).HasMaxLength(50);
            entity.Property(e => e.LotNumber).HasMaxLength(100);
            entity.Property(e => e.LotStatus).HasMaxLength(20);
            entity.Property(e => e.Manufacture).HasMaxLength(50);
            entity.Property(e => e.QtyReceiptBaseQty)
                .HasColumnType("decimal(18, 2)")
                .HasColumnName("QtyReceipt_BaseQty");
            entity.Property(e => e.QtyReceiptBaseUnit)
                .HasMaxLength(20)
                .HasColumnName("QtyReceipt_BaseUnit");
            entity.Property(e => e.QtyReceiptInventoryQty)
                .HasColumnType("decimal(18, 2)")
                .HasColumnName("QtyReceipt_InventoryQty");
            entity.Property(e => e.QtyReceiptInventoryUnit)
                .HasMaxLength(20)
                .HasColumnName("QtyReceipt_InventoryUnit");
            entity.Property(e => e.QtyReceiptPalletQty)
                .HasColumnType("decimal(18, 2)")
                .HasColumnName("QtyReceipt_Pallet_qty");
            entity.Property(e => e.QtyTransferBaseQty)
                .HasColumnType("decimal(18, 2)")
                .HasColumnName("QtyTransfer_BaseQty");
            entity.Property(e => e.QtyTransferBaseUnit)
                .HasMaxLength(20)
                .HasColumnName("QtyTransfer_BaseUnit");
            entity.Property(e => e.QtyTransferInventoryQty)
                .HasColumnType("decimal(18, 2)")
                .HasColumnName("QtyTransfer_InventoryQty");
            entity.Property(e => e.QtyTransferInventoryUnit)
                .HasMaxLength(20)
                .HasColumnName("QtyTransfer_InventoryUnit");
            entity.Property(e => e.QtyTransferPalletQty)
                .HasColumnType("decimal(18, 2)")
                .HasColumnName("QtyTransfer_Pallet_qty");
            entity.Property(e => e.ReceiptDate).HasColumnName("Receipt_Date");
            entity.Property(e => e.SupplierCode).HasMaxLength(50);

            entity.HasOne(d => d.Requester).WithMany(p => p.Dispatchers).HasForeignKey(d => d.RequesterId);
        });

        modelBuilder.Entity<DowntimeReasonMaster>(entity =>
        {
            entity.Property(e => e.Code).HasMaxLength(50);
            entity.Property(e => e.Name).HasMaxLength(100);
            entity.Property(e => e.Status).HasMaxLength(20);
            entity.Property(e => e.Timestamp)
                .HasDefaultValueSql("(getdate())", "DF_DowntimeReasonMasters_timestamp")
                .HasColumnType("datetime")
                .HasColumnName("timestamp");
        });

        modelBuilder.Entity<Ingredient>(entity =>
        {
            entity.Property(e => e.IngredientCode).HasMaxLength(50);
            entity.Property(e => e.Quantity).HasColumnType("decimal(18, 3)");
            entity.Property(e => e.UnitOfMeasurement).HasMaxLength(20);

            entity.HasOne(d => d.Process).WithMany(p => p.Ingredients).HasForeignKey(d => d.ProcessId);
        });

        modelBuilder.Entity<InventoryDatum>(entity =>
        {
            entity.HasKey(e => e.InventoryDataId).HasName("PK__Inventor__3021922066E26821");

            entity.Property(e => e.BaseQty)
                .HasColumnType("decimal(18, 2)")
                .HasColumnName("Base_qty");
            entity.Property(e => e.BaseUom)
                .HasMaxLength(20)
                .HasColumnName("Base_uom");
            entity.Property(e => e.ExpriredDate)
                .HasColumnType("datetime")
                .HasColumnName("Exprired_Date");
            entity.Property(e => e.Manufacture).HasMaxLength(255);
            entity.Property(e => e.MaterialCode).HasMaxLength(100);
            entity.Property(e => e.MaterialLotNumber).HasMaxLength(100);
            entity.Property(e => e.Timestamp)
                .HasDefaultValueSql("(getdate())", "DF_InventoryData_timestamp")
                .HasColumnType("datetime")
                .HasColumnName("timestamp");
        });

        modelBuilder.Entity<LineItem>(entity =>
        {
            entity.Property(e => e.ItemCode).HasMaxLength(50);

            entity.HasOne(d => d.MovementOrder).WithMany(p => p.LineItems).HasForeignKey(d => d.MovementOrderId);
        });

        modelBuilder.Entity<LogRequest>(entity =>
        {
            entity.ToTable("LogRequest");

            entity.Property(e => e.ClientIp).HasMaxLength(50);
            entity.Property(e => e.ClientName).HasMaxLength(50);
            entity.Property(e => e.Endpoint).HasMaxLength(50);
            entity.Property(e => e.Timestamp)
                .HasDefaultValueSql("(getdate())", "DF_LogRequest_timestamp")
                .HasColumnType("datetime")
                .HasColumnName("timestamp");
        });

        modelBuilder.Entity<MachineMaster>(entity =>
        {
            entity.HasKey(e => e.MachineId);

            entity.ToTable("MachineMaster");

            entity.Property(e => e.Line).HasMaxLength(100);
            entity.Property(e => e.LineCode).HasMaxLength(50);
            entity.Property(e => e.MachineCode).HasMaxLength(50);
            entity.Property(e => e.MachineName).HasMaxLength(100);
        });

        modelBuilder.Entity<MaterialCompletion>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__Material__3214EC07B550B94B");

            entity.Property(e => e.BatchCode).HasMaxLength(50);
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("(getdate())", "DF__MaterialC__Creat__5AD97420")
                .HasColumnType("datetime");
            entity.Property(e => e.ProcessCode).HasMaxLength(50);
            entity.Property(e => e.ProductionOrderNumber).HasMaxLength(100);
        });

        modelBuilder.Entity<MaterialConsumption>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__Material__3214EC07AFD684DB");

            entity.Property(e => e.BatchCode).HasMaxLength(50);
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("(getdate())", "DF__MaterialC__Creat__5BCD9859")
                .HasColumnType("datetime");
            entity.Property(e => e.IngredientCode).HasMaxLength(50);
            entity.Property(e => e.IngredientName).HasMaxLength(200);
            entity.Property(e => e.Lot).HasMaxLength(100);
            entity.Property(e => e.ProcessCode).HasMaxLength(50);
            entity.Property(e => e.ProductionOrderNumber).HasMaxLength(100);
            entity.Property(e => e.Quantity).HasColumnType("decimal(18, 3)");
            entity.Property(e => e.UnitOfMeasurement).HasMaxLength(20);
        });

        modelBuilder.Entity<MesendDownTime>(entity =>
        {
            entity
                .HasNoKey()
                .ToTable("MESEndDownTime");

            entity.Property(e => e.CountEnd).HasColumnName("countEnd");
            entity.Property(e => e.CountStart).HasColumnName("countStart");
            entity.Property(e => e.DowntimeId)
                .HasMaxLength(100)
                .HasColumnName("downtimeId");
            entity.Property(e => e.EndTime)
                .HasColumnType("datetime")
                .HasColumnName("endTime");
            entity.Property(e => e.MachineCode)
                .HasMaxLength(100)
                .HasColumnName("machineCode");
            entity.Property(e => e.ReasonCode)
                .HasMaxLength(100)
                .HasColumnName("reasonCode");
            entity.Property(e => e.ReasonDesc).HasColumnName("reasonDesc");
            entity.Property(e => e.RequestEnd).HasColumnName("requestEnd");
            entity.Property(e => e.RequestStart).HasColumnName("requestStart");
            entity.Property(e => e.ResponeEnd).HasColumnName("responeEnd");
            entity.Property(e => e.ResponeStart).HasColumnName("responeStart");
            entity.Property(e => e.StartTime)
                .HasColumnType("datetime")
                .HasColumnName("startTime");
            entity.Property(e => e.Status)
                .HasMaxLength(50)
                .HasDefaultValue("Pending", "DF_MESEndDownTime_status")
                .HasColumnName("status");
            entity.Property(e => e.Status1)
                .HasMaxLength(50)
                .HasDefaultValue("Pending", "DF_MESEndDownTime_status1")
                .HasColumnName("status1");
            entity.Property(e => e.TimestampEnd)
                .HasColumnType("datetime")
                .HasColumnName("timestampEnd");
            entity.Property(e => e.TimestampStart)
                .HasDefaultValueSql("(getdate())", "DF_MESEndDownTime_timestampStart")
                .HasColumnType("datetime")
                .HasColumnName("timestampStart");
        });

        modelBuilder.Entity<MesmaterialConsumption>(entity =>
        {
            entity.ToTable("MESMaterialConsumption", tb => tb.HasTrigger("trg_MESMaterialConsumption_NormalizeValues"));

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.BatchCode)
                .HasMaxLength(50)
                .HasColumnName("batchCode");
            entity.Property(e => e.Count)
                .HasDefaultValue(0, "DF_MESMaterialConsumption_count")
                .HasColumnName("count");
            entity.Property(e => e.Datetime)
                .HasDefaultValueSql("(getdate())", "DF_MESMaterialConsumption_datetime")
                .HasColumnType("datetime")
                .HasColumnName("datetime");
            entity.Property(e => e.IngredientCode)
                .HasMaxLength(50)
                .HasColumnName("ingredientCode");
            entity.Property(e => e.Lot)
                .HasMaxLength(100)
                .HasColumnName("lot");
            entity.Property(e => e.OperatorId)
                .HasMaxLength(50)
                .HasColumnName("operator_ID");
            entity.Property(e => e.ProductionOrderNumber)
                .HasMaxLength(100)
                .HasColumnName("productionOrderNumber");
            entity.Property(e => e.Quantity)
                .HasMaxLength(50)
                .HasColumnName("quantity");
            entity.Property(e => e.Request).HasColumnName("request");
            entity.Property(e => e.Respone).HasColumnName("respone");
            entity.Property(e => e.Status)
                .HasMaxLength(50)
                .HasDefaultValue("Pending", "DF_MESMaterialConsumption_status")
                .HasColumnName("status");
            entity.Property(e => e.Status1)
                .HasMaxLength(50)
                .HasDefaultValue("Pending", "DF_MESMaterialConsumption_status1")
                .HasColumnName("status1");
            entity.Property(e => e.SupplyMachine)
                .HasMaxLength(50)
                .HasColumnName("supplyMachine");
            entity.Property(e => e.Timestamp)
                .HasDefaultValueSql("(getdate())", "DF_MESMaterialConsumption_timestamp_1")
                .HasColumnType("datetime")
                .HasColumnName("timestamp");
            entity.Property(e => e.UnitOfMeasurement)
                .HasMaxLength(20)
                .HasColumnName("unitOfMeasurement");
        });

        modelBuilder.Entity<MesmaterialConsumptionLog>(entity =>
        {
            entity.ToTable("MESMaterialConsumptionLog");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.BatchCode)
                .HasMaxLength(50)
                .HasColumnName("batchCode");
            entity.Property(e => e.Count)
                .HasDefaultValue(0, "DF_MESMaterialConsumptionLog_count")
                .HasColumnName("count");
            entity.Property(e => e.Datetime)
                .HasDefaultValueSql("(getdate())", "DF_MESMaterialConsumptionLog_datetime")
                .HasColumnType("datetime")
                .HasColumnName("datetime");
            entity.Property(e => e.IngredientCode)
                .HasMaxLength(50)
                .HasColumnName("ingredientCode");
            entity.Property(e => e.Lot)
                .HasMaxLength(100)
                .HasColumnName("lot");
            entity.Property(e => e.OperatorId)
                .HasMaxLength(50)
                .HasColumnName("operator_ID");
            entity.Property(e => e.ProductionOrderNumber)
                .HasMaxLength(100)
                .HasColumnName("productionOrderNumber");
            entity.Property(e => e.Quantity)
                .HasMaxLength(50)
                .HasColumnName("quantity");
            entity.Property(e => e.Request).HasColumnName("request");
            entity.Property(e => e.Respone).HasColumnName("respone");
            entity.Property(e => e.Status)
                .HasMaxLength(50)
                .HasDefaultValue("Pending", "DF_MESMaterialConsumptionLog_status")
                .HasColumnName("status");
            entity.Property(e => e.Status1)
                .HasMaxLength(50)
                .HasDefaultValue("Pending", "DF_MESMaterialConsumptionLog_status1")
                .HasColumnName("status1");
            entity.Property(e => e.SupplyMachine)
                .HasMaxLength(50)
                .HasColumnName("supplyMachine");
            entity.Property(e => e.Timestamp)
                .HasDefaultValueSql("(getdate())", "DF_MESMaterialConsumptionLog_timestamp_1")
                .HasColumnType("datetime")
                .HasColumnName("timestamp");
            entity.Property(e => e.UnitOfMeasurement)
                .HasMaxLength(20)
                .HasColumnName("unitOfMeasurement");
        });

        modelBuilder.Entity<Mhutype>(entity =>
        {
            entity.ToTable("MHUTypes");

            entity.Property(e => e.MhutypeId).HasColumnName("MHUTypeId");
            entity.Property(e => e.Conversion).HasColumnType("decimal(18, 2)");
            entity.Property(e => e.FromUnit).HasMaxLength(20);
            entity.Property(e => e.ToUnit).HasMaxLength(20);

            entity.HasOne(d => d.ProductMaster).WithMany(p => p.Mhutypes).HasForeignKey(d => d.ProductMasterId);
        });

        modelBuilder.Entity<MovementOrder>(entity =>
        {
            entity.Property(e => e.Timestamp)
                .HasDefaultValueSql("(getdate())", "DF_MovementOrders_timestamp")
                .HasColumnType("datetime")
                .HasColumnName("timestamp");
        });

        modelBuilder.Entity<Parameter>(entity =>
        {
            entity.Property(e => e.Code).HasMaxLength(50);
            entity.Property(e => e.DataType).HasMaxLength(20);
            entity.Property(e => e.Max).HasColumnType("decimal(18, 2)");
            entity.Property(e => e.Min).HasColumnType("decimal(18, 2)");
            entity.Property(e => e.SetpointValue).HasColumnType("decimal(18, 2)");
            entity.Property(e => e.UnitOfMeasurement).HasMaxLength(20);

            entity.HasOne(d => d.Process).WithMany(p => p.Parameters).HasForeignKey(d => d.ProcessId);
        });

        modelBuilder.Entity<Process>(entity =>
        {
            entity.Property(e => e.Duration)
                .HasDefaultValue(0m, "DF_Processes_Duration")
                .HasColumnType("decimal(18, 2)");
            entity.Property(e => e.DurationUoM)
                .HasMaxLength(20)
                .HasDefaultValue("Minutes", "DF_Processes_DurationUoM");
            entity.Property(e => e.ProcessCode).HasMaxLength(50);
            entity.Property(e => e.ProcessName).HasMaxLength(100);

            entity.HasOne(d => d.RecipeDetails).WithMany(p => p.Processes).HasForeignKey(d => d.RecipeDetailsId);
        });

        modelBuilder.Entity<ProcessParameterMaster>(entity =>
        {
            entity.Property(e => e.Code).HasMaxLength(50);
            entity.Property(e => e.Name).HasMaxLength(100);
            entity.Property(e => e.Status).HasMaxLength(20);
            entity.Property(e => e.Timestamp)
                .HasColumnType("datetime")
                .HasColumnName("timestamp");
        });

        modelBuilder.Entity<Product>(entity =>
        {
            entity.Property(e => e.PlanQuantity).HasColumnType("decimal(18, 3)");
            entity.Property(e => e.ProductCode).HasMaxLength(50);
            entity.Property(e => e.UnitOfMeasurement).HasMaxLength(20);

            entity.HasOne(d => d.Process).WithMany(p => p.Products).HasForeignKey(d => d.ProcessId);
        });

        modelBuilder.Entity<ProductMaster>(entity =>
        {
            entity.Property(e => e.BaseUnit).HasMaxLength(20);
            entity.Property(e => e.Brand).HasMaxLength(50);
            entity.Property(e => e.Category).HasMaxLength(50);
            entity.Property(e => e.Group).HasMaxLength(50);
            entity.Property(e => e.InventoryUnit).HasMaxLength(20);
            entity.Property(e => e.ItemCode).HasMaxLength(50);
            entity.Property(e => e.ItemName).HasMaxLength(100);
            entity.Property(e => e.ItemStatus)
                .HasMaxLength(20)
                .HasColumnName("Item_Status");
            entity.Property(e => e.ItemType)
                .HasMaxLength(50)
                .HasColumnName("Item_Type");
            entity.Property(e => e.Timestamp)
                .HasDefaultValueSql("(getdate())", "DF_ProductMasters_timestamp")
                .HasColumnType("datetime")
                .HasColumnName("timestamp");
        });

        modelBuilder.Entity<ProductionOrder>(entity =>
        {
            entity.Property(e => e.LotNumber).HasMaxLength(100);
            entity.Property(e => e.Plant).HasMaxLength(20);
            entity.Property(e => e.ProcessArea).HasMaxLength(20);
            entity.Property(e => e.ProductCode).HasMaxLength(50);
            entity.Property(e => e.ProductionLine).HasMaxLength(20);
            entity.Property(e => e.ProductionOrderNumber).HasMaxLength(100);
            entity.Property(e => e.Quantity).HasColumnType("decimal(18, 2)");
            entity.Property(e => e.RecipeCode).HasMaxLength(50);
            entity.Property(e => e.RecipeVersion).HasMaxLength(20);
            entity.Property(e => e.Shift).HasMaxLength(20);
            entity.Property(e => e.Shopfloor).HasMaxLength(20);
            entity.Property(e => e.Timestamp)
                .HasDefaultValueSql("(getdate())", "DF_ProductionOrders_timestamp")
                .HasColumnType("datetime")
                .HasColumnName("timestamp");
            entity.Property(e => e.UnitOfMeasurement).HasMaxLength(20);
        });

        modelBuilder.Entity<RecipeDetail>(entity =>
        {
            entity.HasKey(e => e.RecipeDetailsId);

            entity.Property(e => e.Plant).HasMaxLength(20);
            entity.Property(e => e.ProductCode).HasMaxLength(50);
            entity.Property(e => e.ProductName).HasMaxLength(100);
            entity.Property(e => e.ProductionLine).HasMaxLength(50);
            entity.Property(e => e.RecipeCode).HasMaxLength(50);
            entity.Property(e => e.RecipeName).HasMaxLength(100);
            entity.Property(e => e.RecipeStatus).HasMaxLength(20);
            entity.Property(e => e.Shopfloor).HasMaxLength(20);
            entity.Property(e => e.Timestamp)
                .HasDefaultValueSql("(getdate())", "DF_RecipeDetails_timestamp")
                .HasColumnType("datetime")
                .HasColumnName("timestamp");
            entity.Property(e => e.Version).HasMaxLength(20);
        });

        modelBuilder.Entity<RejectionReasonMaster>(entity =>
        {
            entity.Property(e => e.Code).HasMaxLength(50);
            entity.Property(e => e.Name).HasMaxLength(100);
            entity.Property(e => e.Status).HasMaxLength(20);
            entity.Property(e => e.Timestamp)
                .HasDefaultValueSql("(getdate())", "DF_RejectionReasonMasters_timestamp")
                .HasColumnType("datetime")
                .HasColumnName("timestamp");
        });

        modelBuilder.Entity<Requester>(entity =>
        {
            entity.Property(e => e.RequestQty).HasColumnType("decimal(18, 3)");
            entity.Property(e => e.RequestQtyUoM).HasMaxLength(20);
            entity.Property(e => e.RequestedLocation).HasMaxLength(50);

            entity.HasOne(d => d.LineItem).WithMany(p => p.Requesters).HasForeignKey(d => d.LineItemId);
        });

        modelBuilder.Entity<VSendConsumption>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_Send_Consumption");

            entity.Property(e => e.BatchCode)
                .HasMaxLength(50)
                .HasColumnName("batchCode");
            entity.Property(e => e.Id)
                .ValueGeneratedOnAdd()
                .HasColumnName("id");
            entity.Property(e => e.IngredientCode)
                .HasMaxLength(50)
                .HasColumnName("ingredientCode");
            entity.Property(e => e.Lot)
                .HasMaxLength(100)
                .HasColumnName("lot");
            entity.Property(e => e.ProductionOrderNumber)
                .HasMaxLength(100)
                .HasColumnName("productionOrderNumber");
            entity.Property(e => e.Quantity)
                .HasMaxLength(50)
                .HasColumnName("quantity");
            entity.Property(e => e.Respone).HasColumnName("respone");
            entity.Property(e => e.Status1)
                .HasMaxLength(50)
                .HasColumnName("status1");
            entity.Property(e => e.SupplyMachine)
                .HasMaxLength(50)
                .HasColumnName("supplyMachine");
            entity.Property(e => e.Timestamp)
                .HasColumnType("datetime")
                .HasColumnName("timestamp");
            entity.Property(e => e.UnitOfMeasurement)
                .HasMaxLength(50)
                .HasColumnName("unitOfMeasurement");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
