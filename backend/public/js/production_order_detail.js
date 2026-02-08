import { Batch } from "./models/Batch.js";
import { MESMaterialConsumption } from "./models/MESMaterialConsumption.js";

const API_ROUTE = window.location.origin;

const orderId = window.location.pathname.split("/").pop();
let batches = [];
let running_batches = [];
let order = {};

async function fetchOrderDetail() {
  try {
    const response = await fetch(
      `${API_ROUTE}/api/production-order-detail/${orderId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (response.ok) {
      const data = await response.json();
      order = data.data;

      // Fill in all the fields
      document.getElementById("detailOrderNumber").textContent =
        order.ProductionOrderNumber || "-";
      document.getElementById("detailProductCode").textContent =
        order.ProductCode || "-";
      document.getElementById("detailProductionLine").textContent =
        order.ProductionLine || "-";
      document.getElementById("detailRecipeCode").textContent =
        order.RecipeCode || "-";
      document.getElementById("detailRecipeVersion").textContent =
        order.RecipeVersion || "-";
      document.getElementById("detailLotNumber").textContent =
        order.LotNumber || "-";
      document.getElementById("detailQuantity").textContent =
        (order.Quantity || 0) + " " + (order.UnitOfMeasurement || "");
      document.getElementById("detailCurrentBatch").textContent =
        `${order.CurrentBatch || 0}/${order.TotalBatches || 0}`;
      document.getElementById("detailPlannedStart").textContent =
        formatDate(order.PlannedStart) || "-";
      document.getElementById("detailPlannedEnd").textContent =
        formatDate(order.PlannedEnd) || "-";
      document.getElementById("detailShift").textContent = order.Shift || "-";
      // Calculate progress like modal view: (CurrentBatch / TotalBatches) * 100
      const progress = Math.round(
        ((parseInt(order.CurrentBatch) || 0) /
          (parseInt(order.TotalBatches) || 1)) *
          100,
      );
      document.getElementById("detailProgress").textContent = progress + "%";
      document.getElementById("detailStatus").textContent =
        getStatusText(order.Status) || "-";
      document.getElementById("detailPlant").textContent = order.Plant || "-";
      document.getElementById("detailShopfloor").textContent =
        order.Shopfloor || "-";
      document.getElementById("detailProcessArea").textContent =
        order.ProcessArea || "-";

      // Show the card and hide loading message
      document.getElementById("loadingMessage").style.display = "none";
      document.getElementById("orderDetails").style.display = "block";
    } else {
      document.getElementById("loadingMessage").innerHTML =
        "<p style='color: red;'>Không tìm thấy đơn hàng</p>";
    }
  } catch (error) {
    console.error("Error fetching order detail:", error);
    document.getElementById("loadingMessage").innerHTML =
      "<p style='color: red;'>Lỗi tải dữ liệu: " + error.message + "</p>";
  }
}

function formatDate(dateString) {
  if (!dateString) return "";

  // Chỉ lấy phần ngày
  const datePart = dateString.split("T")[0];
  const [year, month, day] = datePart.split("-");

  if (!year || !month || !day) return dateString;

  return `${day}/${month}/${year}`;
}

function formatDateTime(dateString) {
  if (!dateString) return "";
  const [datePart, timePart] = dateString.split("T");
  if (!datePart || !timePart) return dateString;

  const [year, month, day] = datePart.split("-");
  const [hours, minutes, seconds] = timePart.replace("Z", "").split(":");

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

function getStatusText(status) {
  if (typeof status === "number") {
    switch (status) {
      case 0:
        return "Đang chờ";
      case 1:
        return "Đang chạy";
      case 2:
        return "Hoàn thành";
      default:
        return "Không xác định";
    }
  }
  return String(status);
}

// Load order details when page loads
document.addEventListener("DOMContentLoaded", async function () {
  await fetchOrderDetail();
  await fetchBatches();
  // Initialize the first tab on page load
  activateTab("tab-batches");
});

const batchesContent = document.getElementById("batchesContent");
const materialsContent = document.getElementById("materialsContent");
const tabBatches = document.getElementById("tab-batches");
const tabMaterials = document.getElementById("tab-materials");
const allTabButtons = document.querySelectorAll(".tab-button");

async function activateTab(tabId) {
  // Remove active state from all tabs
  allTabButtons.forEach((btn) => {
    btn.style.borderBottom = "3px solid transparent";
    btn.style.color = "#666";
    btn.style.fontWeight = "normal";
  });

  // Add active state to clicked tab
  const activeTab = document.getElementById(tabId);
  activeTab.style.borderBottom = "3px solid #007bff";
  activeTab.style.color = "#007bff";
  activeTab.style.fontWeight = "bold";

  // Hide all content and show relevant content
  if (tabId === "tab-batches") {
    batchesContent.style.display = "block";
    materialsContent.style.display = "none";
    ingredientsContent.style.display = "none";
    document.getElementById("materialsPaginationControls").style.display =
      "none";
    document.getElementById("ingredientsPaginationControls").style.display =
      "none";
    document.getElementById("paginationControls").style.display = "flex";
    if (batches.length === 0) {
      await fetchBatches();
    } else {
      displayBatchesTable(batches);
    }
  } else if (tabId === "tab-materials") {
    batchesContent.style.display = "none";
    materialsContent.style.display = "block";
    ingredientsContent.style.display = "none";
    document.getElementById("paginationControls").style.display = "none";
    document.getElementById("ingredientsPaginationControls").style.display =
      "none";
    document.getElementById("materialsPaginationControls").style.display =
      "flex";
    // Render controls only when entering materials tab
    renderBatchCodeRadioButtons(batches);
    renderMaterialFilterTypeButtons();
    fetchMaterialConsumptions();
  }
}

// Add event listeners to tab buttons
tabBatches.addEventListener("click", function () {
  activateTab("tab-batches");
});

tabMaterials.addEventListener("click", function () {
  activateTab("tab-materials");
});

// Pagination variables
let currentPage = 1;
let materialsCurrentPage = 1;
const batchesPerPage = 10;
const materialsPerPage = 10;
let materialsTotalPages = 1;
let materialsTotalCount = 0;
let materials_planned_batch = [];
let materials_unplanned_batch = [];
let allMaterials = []; // Store all materials for client-side filtering
let selectedMaterialsBatchCode = ""; // Store selected batch for materials tab
let ingredientsTotalsByUOM = {}; // Store totals grouped by UnitOfMeasurement
let materialFilterType = "all"; // Filter type: "all", "consumed", "unconsumed"
let batchCodesWithMaterials = [];

// Group materials by ingredient code and unit of measurement (without lot)
function groupMaterials(materialsArray) {
  const groupMap = new Map();

  materialsArray.forEach((material) => {
    const key = `${material.ingredientCode || ""}`;
    if (groupMap.has(key)) {
      const group = groupMap.get(key);
      // Check if the material is already in the group
      const isDuplicate = group.items.some(
        (item) => JSON.stringify(item) === JSON.stringify(material),
      );
      if (!isDuplicate) {
        group.totalQuantity += parseFloat(material.quantity) || 0;
        group.items.push(material);
        group.ids.push(material.id);
      }
    } else {
      // Create new group
      groupMap.set(key, {
        ingredientCode: material.ingredientCode,
        lot: material.lot,
        unitOfMeasurement: material.unitOfMeasurement,
        totalQuantity: parseFloat(material.quantity) || 0,
        items: [material],
        ids: [material.id],
        latestDatetime: material.datetime,
        respone: material.respone,
      });
    }
  });

  return Array.from(groupMap.values());
}

// Display batches table with rowspan for batch code
function displayMaterialsTable(groupedMaterialsArray, selectedBatchCode = "") {
  // Data is already grouped, just render it
  renderMaterialsTable(groupedMaterialsArray, selectedBatchCode);
}

// Render materials table
function renderMaterialsTable(groupedMaterialsArray, selectedBatchCode = "") {
  const tbody = document.getElementById("materialsTableBody");

  if (groupedMaterialsArray.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="9" style="padding: 20px; text-align: center; color: #999;">Không có dữ liệu vật liệu nào</td></tr>';
    return;
  }

  // Build table HTML for grouped materials
  let html = "";

  const start = (currentPage - 1) * materialsPerPage;
  const end = start + materialsPerPage;

  const pagedConsumedMaterials = groupedMaterialsArray.slice(start, end);

  pagedConsumedMaterials.forEach((group, index) => {
    const realIndex = start + index;
    const idsDisplay =
      group.items.length >= 2
        ? `${group.items.length} items`
        : group.items.map((item) => item.id).join(", ");

    // Get unique batch codes from group items
    const uniqueBatchCodes = [
      ...new Set(
        group.items.map((item) => item.batchCode).filter((code) => code),
      ),
    ];
    let batchCodeDisplay;
    if (uniqueBatchCodes.length === 0) {
      batchCodeDisplay = "-";
    } else if (uniqueBatchCodes.length <= 3) {
      batchCodeDisplay = uniqueBatchCodes.join(", ");
    } else {
      batchCodeDisplay = uniqueBatchCodes.slice(0, 3).join(", ") + ", ...";
    }

    // Tính tổng planQuantity cho tất cả items trong group
    const ingredientCode = group.ingredientCode;
    const ingredientCodeOnly = ingredientCode
      ? ingredientCode.split(" - ")[0].trim()
      : "";
    let totalPlanQuantity = 0;
    let hasValidPlan = false;
    group.items.forEach((item) => {
      const batch = batches.find((b) => b.BatchNumber === item.batchCode);
      const batchQuantity = batch ? parseFloat(batch.Quantity) || 0 : 0;
      const recipeQuantity =
        ingredientsTotalsByUOM[ingredientCodeOnly]?.total || 0;
      const poQuantity = parseFloat(order.ProductQuantity) || 1;
      let planQ = recipeQuantity;
      if (batchQuantity !== 0) {
        planQ = (recipeQuantity / poQuantity) * batchQuantity;
        planQ = parseFloat(planQ.toFixed(2));
      }
      if (recipeQuantity === 0 || batchQuantity === 0) {
        // Nếu 1 item không đủ dữ liệu, bỏ qua
        return;
      }
      hasValidPlan = true;
      totalPlanQuantity += planQ;
    });
    let planQuantityDisplay = "N/A";
    if (hasValidPlan) {
      planQuantityDisplay = totalPlanQuantity.toFixed(2);
    }

    // Determine status display - show "-" if multiple items
    let statusDisplay = "-";
    if (group.items.length === 1) {
      statusDisplay = group.respone
        ? group.respone === "Success"
          ? "Success"
          : "Failed"
        : "-";
    }

    html += `<tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 12px; text-align: center; font-weight: bold;">${idsDisplay}</td>
      <td style="padding: 12px; text-align: center;">${batchCodeDisplay}</td>
      <td style="padding: 12px; text-align: center;">${group.ingredientCode || "-"}</td>
      <td style="padding: 12px; text-align: center;">${group.lot || "-"}</td>
      <td style="padding: 12px; text-align: center;">${planQuantityDisplay} ${group.unitOfMeasurement || ""}</td>
      <td style="padding: 12px; text-align: center;">${group.totalQuantity === 0 ? `N/A ${group.unitOfMeasurement || ""}` : `${group.totalQuantity.toFixed(2)} ${group.unitOfMeasurement || ""}`}</td>
      <td style="padding: 12px; text-align: center;">${formatDateTime(group.latestDatetime) || "-"}</td>
      <td style="padding: 12px; text-align: center;">${statusDisplay}</td>
      <td style="padding: 12px; text-align: center;">
        <button class="viewMaterialGroupBtn" data-index="${realIndex}" style="background: none; border: none; cursor: pointer; color: #007bff; padding: 6px; transition: color 0.2s;" title="Xem danh sách">
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4c4.29 0 7.863 2.429 10.665 7.154l.22 .379l.045 .1l.03 .083l.014 .055l.014 .082l.011 .1v.11l-.014 .111a.992 .992 0 0 1 -.026 .11l-.039 .108l-.036 .075l-.016 .03c-2.764 4.836 -6.3 7.38 -10.555 7.499l-.313 .004c-4.396 0 -8.037 -2.549 -10.868 -7.504a1 1 0 0 1 0 -.992c2.831 -4.955 6.472 -7.504 10.868 -7.504zm0 5a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z" />
          </svg>
        </button>
      </td>
    </tr>`;
  });

  tbody.innerHTML = html;

  // Add event listeners to View buttons for consumed materials
  const viewButtons = document.querySelectorAll(".viewMaterialGroupBtn");
  viewButtons.forEach((btn) => {
    btn.addEventListener("click", function () {
      const index = this.getAttribute("data-index");
      showMaterialListModal(groupedMaterialsArray[index]);
    });
    btn.addEventListener("mouseover", function () {
      this.style.color = "#0056b3";
    });
    btn.addEventListener("mouseout", function () {
      this.style.color = "#007bff";
    });
  });
}

// Filter materials and fetch from server with pagination
async function filterMaterials() {
  materialsCurrentPage = 1; // Reset to first page when filtering
  await fetchMaterialsWithPagination();
}

// Fetch materials with client-side filtering and pagination
async function fetchMaterialsWithPagination() {
  try {
    // Get batch IDs
    if (batches.length === 0) {
      document.getElementById("materialsTableBody").innerHTML =
        '<tr><td colspan="10" style="padding: 20px; text-align: center; color: #999;">Không có batch nào để lấy dữ liệu vật liệu</td></tr>';
      document.getElementById("materialsPaginationControls").style.display =
        "none";
      return;
    }

    // Fetch ingredients data for recipe totals if not already loaded
    if (Object.keys(ingredientsTotalsByUOM).length === 0) {
      const queryParams = new URLSearchParams({
        productionOrderNumber: order.ProductionOrderNumber,
      });

      const response = await fetch(
        `${API_ROUTE}/api/production-order-detail/ingredients-by-product?${queryParams.toString()}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        const ingredientsData = data.data || [];

        ingredientsTotalsByUOM = {};
        // Calculate totals grouped by IngredientCode
        ingredientsData.forEach((item) => {
          const ingredientCode = item.IngredientCode;
          if (!ingredientsTotalsByUOM[ingredientCode]) {
            ingredientsTotalsByUOM[ingredientCode] = {
              total: 0,
              unit: item.UnitOfMeasurement,
            };
          }
          ingredientsTotalsByUOM[ingredientCode].total +=
            parseFloat(item.Quantity) || 0;
        });
      }
    }

    // Only fetch from API if we don't have data yet
    if (allMaterials.length === 0) {
      // Fetch ALL data from server (no pagination, no filter)
      const queryParams = new URLSearchParams({
        productionOrderNumber: order.ProductionOrderNumber,
        limit: 999999, // Fetch all records
      });

      const response = await fetch(
        `${API_ROUTE}/api/production-order-detail/material-consumptions?${queryParams.toString()}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            batches: batches.map((b) => b.BatchNumber),
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        materials_planned_batch = data.data.map(
          (item) => new MESMaterialConsumption(item),
        );
      }

      const response2 = await fetch(
        `${API_ROUTE}/api/production-order-detail/material-consumptions-exclude-batches?${queryParams.toString()}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            batchCodesWithMaterials,
          }),
        },
      );

      if (response2.ok) {
        const data2 = await response2.json();
        materials_unplanned_batch = data2.data.map(
          (item) => new MESMaterialConsumption(item),
        );
      }

      materials_planned_batch.forEach((item) => {
        if (
          allMaterials.some(
            (m) =>
              m.id === item.id &&
              m.batchCode === item.batchCode &&
              m.ingredientCode === item.ingredientCode,
          )
        ) {
          return;
        }
        allMaterials.push(item);
      });

      materials_unplanned_batch.forEach((item) => {
        if (
          allMaterials.some(
            (m) =>
              m.id === item.id &&
              m.batchCode === item.batchCode &&
              m.ingredientCode === item.ingredientCode,
          )
        )
          return;
        allMaterials.push(item);
      });

      if (allMaterials.length === 0) {
        document.getElementById("materialsTableBody").innerHTML =
          '<tr><td colspan="10" style="padding: 20px; text-align: center; color: red;">Lỗi khi tải dữ liệu</td></tr>';
        document.getElementById("materialsPaginationControls").style.display =
          "none";
        return;
      }
    }

    // Filter on client-side based on filter inputs
    const ingredientCode =
      document.getElementById("filterIngredientCode")?.value.toLowerCase() ||
      "";
    // Use selectedMaterialsBatchCode if set, otherwise use radio button value
    const batchCode =
      selectedMaterialsBatchCode ||
      document.querySelector('input[name="filterBatchCode"]:checked')?.value ||
      "";
    const lot = document.getElementById("filterLot")?.value.toLowerCase() || "";
    const quantity = document.getElementById("filterQuantity")?.value || "";

    let filteredMaterials = allMaterials;

    // Apply filters
    if (ingredientCode) {
      filteredMaterials = filteredMaterials.filter((item) =>
        item.ingredientCode?.toLowerCase().includes(ingredientCode),
      );
    }
    if (batchCode) {
      if (batchCode === "null") {
        // Filter items with NULL batch code
        filteredMaterials = filteredMaterials.filter(
          (item) =>
            !item.batchCode || item.batchCode === "" || item.batchCode === null,
        );
      } else {
        filteredMaterials = filteredMaterials.filter(
          (item) => item.batchCode === batchCode,
        );
      }
    }
    if (lot) {
      filteredMaterials = filteredMaterials.filter((item) =>
        item.lot?.toLowerCase().includes(lot),
      );
    }
    if (quantity) {
      filteredMaterials = filteredMaterials.filter((item) =>
        item.quantity?.toString().includes(quantity),
      );
    }

    // Group materials BEFORE pagination
    const groupedMaterials = groupMaterials(filteredMaterials);

    // Calculate pagination for GROUPED data
    materialsTotalCount = groupedMaterials.length;
    materialsTotalPages = Math.ceil(materialsTotalCount / materialsPerPage);

    // Get current page data from GROUPED materials
    const startIndex = (materialsCurrentPage - 1) * materialsPerPage;
    const endIndex = startIndex + materialsPerPage;
    let finalGroupedMaterials = groupedMaterials;

    if (materialFilterType === "consumed") {
      finalGroupedMaterials = groupedMaterials
        .filter((group) => {
          if (group.ids.length == 0) return false;
          let hasValidId = false;
          for (let i = 0; i < group.ids.length; i++) {
            if (group.ids[i] !== null) {
              hasValidId = true;
              break;
            }
          }

          return hasValidId;
        })
        .map((group) => ({
          ...group,
          ids: group.ids.filter((id) => id !== null),
          items: group.items.filter((item) => item.id !== null),
        }));
    } else if (materialFilterType === "unconsumed") {
      finalGroupedMaterials = groupedMaterials
        .filter((group) => {
          if (group.ids.length == 0) return true;

          if (group.ids[0] === null) return true;
        })
        .map((group) => ({
          ...group,
          ids: group.ids.filter((id) => id === null),
          totalQuantity: 0,
          items: group.items.filter((item) => item.id === null),
        }));
    }
    const paginatedGroupedMaterials = finalGroupedMaterials.slice(
      startIndex,
      endIndex,
    );

    // Controls are rendered when entering materials tab

    displayMaterialsTable(paginatedGroupedMaterials, batchCode);
    updateMaterialsPaginationControls(
      materialsCurrentPage,
      materialsTotalPages,
      materialsTotalCount,
    );
  } catch (error) {
    console.error("Error loading materials:", error);
    document.getElementById("materialsTableBody").innerHTML =
      '<tr><td colspan="10" style="padding: 20px; text-align: center; color: red;">Lỗi khi tải dữ liệu</td></tr>';
    document.getElementById("materialsPaginationControls").style.display =
      "none";
  }
}

// Update pagination controls for materials
function updateMaterialsPaginationControls(
  currentPage,
  totalPages,
  totalCount,
) {
  const prevBtn = document.getElementById("materialsPrevBtn");
  const nextBtn = document.getElementById("materialsNextBtn");
  const pageInfo = document.getElementById("materialsPageInfo");

  if (!prevBtn || !nextBtn || !pageInfo) return;

  pageInfo.textContent = `Trang ${currentPage} / ${totalPages} (Tổng: ${totalCount} bản ghi)`;

  // Disable/Enable prev button
  if (currentPage <= 1) {
    prevBtn.disabled = true;
    prevBtn.style.opacity = "0.6";
    prevBtn.style.cursor = "not-allowed";
  } else {
    prevBtn.disabled = false;
    prevBtn.style.opacity = "1";
    prevBtn.style.cursor = "pointer";
    prevBtn.onmouseover = function () {
      if (!this.disabled) this.style.background = "#0056b3";
    };
    prevBtn.onmouseout = function () {
      if (!this.disabled) this.style.background = "#007aff";
    };
  }

  // Disable/Enable next button
  if (currentPage >= totalPages) {
    nextBtn.disabled = true;
    nextBtn.style.opacity = "0.6";
    nextBtn.style.cursor = "not-allowed";
  } else {
    nextBtn.disabled = false;
    nextBtn.style.opacity = "1";
    nextBtn.style.cursor = "pointer";
    nextBtn.onmouseover = function () {
      if (!this.disabled) this.style.background = "#0056b3";
    };
    nextBtn.onmouseout = function () {
      if (!this.disabled) this.style.background = "#007aff";
    };
  }

  // Show pagination controls only if there are multiple pages
  document.getElementById("materialsPaginationControls").style.display =
    totalPages > 1 ? "flex" : "none";
}

// Show material detail modal
function showMaterialModal(material) {
  const modal = document.getElementById("materialModal");
  document.getElementById("modalId").textContent = material.id || "-";
  document.getElementById("modalProductionOrderNumber").textContent =
    order.ProductionOrderNumber || "-";
  document.getElementById("modalBatchCode").textContent =
    material.batchCode || "-";
  document.getElementById("modalIngredientCode").textContent =
    material.ingredientCode;
  document.getElementById("modalLot").textContent = material.lot || "-";

  // Calculate Plan Quantity
  const batch = batches.find((b) => b.BatchNumber === material.batchCode);
  const ingredientCode = material.ingredientCode;
  const ingredientCodeOnly = ingredientCode
    ? ingredientCode.split(" - ")[0].trim()
    : "";
  const poQuantity = parseFloat(order.ProductQuantity) || 1;
  const batchQuantity = batch ? parseFloat(batch.Quantity) || 0 : 0;
  const recipeQuantity = ingredientsTotalsByUOM[ingredientCodeOnly]
    ? ingredientsTotalsByUOM[ingredientCodeOnly].total
    : 0;
  let planQuantity = recipeQuantity;
  if (batchQuantity !== 0) {
    planQuantity = (recipeQuantity / poQuantity) * batchQuantity;
    planQuantity = planQuantity.toFixed(2);
  }
  if (recipeQuantity === 0 || batchQuantity === 0) {
    planQuantity = "N/A";
  }
  const planQuantityDisplay =
    planQuantity !== "N/A"
      ? `${planQuantity} ${material.unitOfMeasurement || ""}`
      : "N/A";
  document.getElementById("modalPlanQuantity").textContent =
    planQuantityDisplay;

  const actualQuantityDisplay =
    !material.quantity || material.quantity === 0
      ? `N/A ${material.unitOfMeasurement || ""}`
      : `${material.quantity} ${material.unitOfMeasurement || ""}`;
  document.getElementById("modalQuantity").textContent = actualQuantityDisplay;
  document.getElementById("modalDateTime").textContent =
    formatDate(material.datetime) || "-";

  // Display normalized status with color
  const statusDisplay = material.respone
    ? material.respone === "Success"
      ? "Success"
      : "Failed"
    : "-";
  const statusElement = document.getElementById("modalStatusDisplay");
  statusElement.textContent = statusDisplay;

  document.getElementById("modalCount").textContent = material.count || "-";
  document.getElementById("modalOperatorId").textContent =
    material.operator_ID || "-";
  document.getElementById("modalSupplyMachine").textContent =
    material.supplyMachine || "-";
  document.getElementById("modalTimestamp").textContent =
    formatDate(material.timestamp) || "-";

  // Display request, response, and status1 as raw data
  document.getElementById("modalRequest").textContent = material.request || "-";

  document.getElementById("modalResponse").textContent =
    material.respone || "-";

  // Normalize status display
  document.getElementById("modalStatus").textContent = material.status1 || "-";

  modal.style.display = "flex";
}

// Show material list modal for grouped materials
function showMaterialListModal(group) {
  // If only 1 item, show detail modal directly
  if (group.items.length === 1) {
    showMaterialModal(group.items[0]);
    return;
  }

  const modal = document.getElementById("materialListModal");
  const tbody = document.getElementById("materialListTableBody");
  let groupTotalQuantity = 0;
  group.items.forEach((item) => {
    groupTotalQuantity += parseFloat(item.quantity) || 0;
  });

  // Update modal header with group info
  document.getElementById("listModalTitle").innerHTML = `
    <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">Danh sách Materials</div>
    <div style="font-size: 14px; color: #666;">
      <span style="margin-right: 20px;"><strong>Ingredient:</strong> ${group.ingredientCode || "-"}</span>
      <span style="margin-right: 20px;"><strong>Lot:</strong> ${group.lot || "-"}</span>
      <span><strong>Total Quantity:</strong> ${groupTotalQuantity.toFixed(2)} ${group.unitOfMeasurement || ""}</span>
    </div>
  `;

  // Build table rows for individual items
  let html = "";

  const ingredientCode = group.ingredientCode;
  // Extract ingredient code only (remove item name if present)
  const ingredientCodeOnly = ingredientCode
    ? ingredientCode.split(" - ")[0].trim()
    : "";
  const poQuantity = parseFloat(order.ProductQuantity) || 1;
  function getPlanQuantityPerItem(batchCode) {
    const batch = batches.find((b) => b.BatchNumber === batchCode);
    const batchQuantity = batch ? parseFloat(batch.Quantity) || 0 : 0;
    if (ingredientsTotalsByUOM[ingredientCodeOnly] === undefined) {
      return "N/A";
    }
    const recipeQuantity =
      ingredientsTotalsByUOM[ingredientCodeOnly].total || 0;
    let planQuantity = recipeQuantity;
    if (batchQuantity !== 0) {
      planQuantity = (recipeQuantity / poQuantity) * batchQuantity;
      planQuantity = planQuantity.toFixed(2);
    }
    if (recipeQuantity === 0 || batchQuantity === 0) {
      planQuantity = "N/A";
    }
    return planQuantity;
  }

  group.items.forEach((material, index) => {
    // Determine status display with color
    const statusDisplay = material.respone
      ? material.respone === "Success"
        ? "Success"
        : "Failed"
      : "-";

    html += `<tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 12px; text-align: center; font-weight: bold;">${material.id || "-"}</td>
      <td style="padding: 12px; text-align: center;">${material.batchCode || "-"}</td>
      <td style="padding: 12px; text-align: center;">${material.ingredientCode || "-"}</td>
      <td style="padding: 12px; text-align: center;">${material.lot || "-"}</td>
      <td style="padding: 12px; text-align: center;">${getPlanQuantityPerItem(material.batchCode)} ${material.unitOfMeasurement || ""}</td>
      <td style="padding: 12px; text-align: center;">${!material.quantity || material.quantity === 0 ? `N/A ${material.unitOfMeasurement || ""}` : `${material.quantity} ${material.unitOfMeasurement || ""}`}</td>
      <td style="padding: 12px; text-align: center;">${formatDateTime(material.datetime) || "-"}</td>
      <td style="padding: 12px; text-align: center;">${statusDisplay}</td>
      <td style="padding: 12px; text-align: center;">
        <button class="viewMaterialDetailBtn" data-index="${index}" style="background: none; border: none; cursor: pointer; color: #007bff; padding: 6px; transition: color 0.2s;" title="Xem chi tiết">
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4c4.29 0 7.863 2.429 10.665 7.154l.22 .379l.045 .1l.03 .083l.014 .055l.014 .082l.011 .1v.11l-.014 .111a.992 .992 0 0 1 -.026 .11l-.039 .108l-.036 .075l-.016 .03c-2.764 4.836 -6.3 7.38 -10.555 7.499l-.313 .004c-4.396 0 -8.037 -2.549 -10.868 -7.504a1 1 0 0 1 0 -.992c2.831 -4.955 6.472 -7.504 10.868 -7.504zm0 5a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z" />
          </svg>
        </button>
      </td>
    </tr>`;
  });

  tbody.innerHTML = html;

  // Add event listeners to View buttons
  const viewButtons = document.querySelectorAll(".viewMaterialDetailBtn");
  viewButtons.forEach((btn) => {
    btn.addEventListener("click", function () {
      const index = this.getAttribute("data-index");
      // Close list modal and show detail modal
      closeMaterialListModal();
      showMaterialModal(group.items[index]);
    });
    btn.addEventListener("mouseover", function () {
      this.style.color = "#0056b3";
    });
    btn.addEventListener("mouseout", function () {
      this.style.color = "#007bff";
    });
  });

  modal.style.display = "flex";

  modal.onclick = function (event) {
    if (event.target === modal) {
      closeMaterialListModal();
    }
  };
}

// Close material list modal function
window.closeMaterialListModal = function () {
  const modal = document.getElementById("materialListModal");
  modal.style.display = "none";
  // Remove click event listener
  modal.onclick = null;
};

// Close modal function
window.closeMaterialModal = function () {
  const modal = document.getElementById("materialModal");
  modal.style.display = "none";
  // Remove click event listener
  modal.onclick = null;
};

// Fetch materials for production order - initial load
async function fetchMaterialConsumptions() {
  materialsCurrentPage = 1; // Reset to first page
  await fetchMaterialsWithPagination();
}

// Display batches in table with pagination
async function displayBatchesTable(batchesArray) {
  if (batchesArray.length === 0) {
    document.getElementById("batchesTableBody").innerHTML =
      '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #999;">Không có batch nào</td></tr>';
    document.getElementById("paginationControls").style.display = "none";
    return;
  }

  const result = await fetch(
    `${API_ROUTE}/api/production-order-detail/batch-codes-with-materials?productionOrderNumber=${order.ProductionOrderNumber}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  const data = await result.json();
  running_batches = data.data || [];

  // Calculate pagination
  const totalPages = Math.ceil(batchesArray.length / batchesPerPage);
  const startIndex = (currentPage - 1) * batchesPerPage;
  const endIndex = startIndex + batchesPerPage;
  const paginatedBatches = batchesArray.slice(startIndex, endIndex);

  // Display table rows
  let bgColor;
  const tbody = document.getElementById("batchesTableBody");
  tbody.innerHTML = paginatedBatches
    .map((batch) => {
      let status = "";
      const isRunning = running_batches.some(
        (b) => b.batchCode === batch.BatchNumber,
      );
      if (isRunning) {
        status = "Đang chạy";
        bgColor = "#d4edda";
      } else {
        status = "Đang chờ";
        bgColor = "#fff3cd";
      }
      return `
        <tr style="border-bottom: 1px solid #eee; background-color: ${bgColor};">
          <td style="padding: 12px; text-align: center;">${batch.BatchId}</td>
          <td style="padding: 12px; text-align: center;">${batch.BatchNumber}</td>
          <td style="padding: 12px; text-align: center;">${batch.Quantity} ${batch.UnitOfMeasurement}</td>
          <td style="padding: 12px; text-align: center;">${status}</td>
          <td style="padding: 12px; text-align: center;">
            <button class="viewMaterialsBtn" data-batch-code="${batch.BatchNumber}" style="background: #007bff; color: white; border: none; cursor: pointer; padding: 8px 12px; border-radius: 4px; font-size: 14px; font-weight: 500; transition: background 0.2s;" title="View Materials">
              View Materials
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  // Add event listeners to View Materials buttons
  const viewMaterialsButtons = document.querySelectorAll(".viewMaterialsBtn");
  viewMaterialsButtons.forEach((btn) => {
    btn.addEventListener("click", function () {
      let batchCode = this.getAttribute("data-batch-code");
      if (batchCode === null || batchCode === "null") {
        selectedMaterialsBatchCode = "null";
      } else {
        selectedMaterialsBatchCode = batchCode;
      }
      // Switch to materials tab (this will call fetchMaterialConsumptions)
      activateTab("tab-materials");
    });
    btn.addEventListener("mouseover", function () {
      this.style.background = "#0056b3";
    });
    btn.addEventListener("mouseout", function () {
      this.style.background = "#007bff";
    });
  });

  // Update pagination controls
  updatePaginationControls(currentPage, totalPages);
}

// Render material filter type radio buttons
function renderMaterialFilterTypeButtons() {
  const container = document.getElementById("filterMaterialTypeOptions");
  if (!container) return;

  const filterOptions = [
    { value: "all", label: "Tất cả" },
    { value: "consumed", label: "Đã tiêu thụ" },
    { value: "unconsumed", label: "Chưa tiêu thụ" },
  ];

  let html = filterOptions
    .map(
      (option) => `
    <label style="
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px 12px;
      cursor: pointer;
      background: ${materialFilterType === option.value ? "#007bff" : "white"};
      color: ${materialFilterType === option.value ? "white" : "inherit"};
      border: 1px solid ${materialFilterType === option.value ? "#0056b3" : "#ddd"};
      border-radius: 4px;
      font-size: 14px;
      font-weight: ${materialFilterType === option.value ? "500" : "normal"};
      transition: all 0.2s;
    " onmouseover="if (this.querySelector('input[type=radio]').checked) { this.style.background='#0056b3'; } else { this.style.borderColor='#007bff'; this.style.boxShadow='0 2px 4px rgba(0,123,255,0.2)'; }" onmouseout="var radio = this.querySelector('input[type=radio]'); if (!radio.checked) { this.style.background='white'; this.style.color='inherit'; this.style.borderColor='#ddd'; this.style.fontWeight='normal'; } else { this.style.background='#007bff'; this.style.borderColor='#0056b3'; } this.style.boxShadow='none';">
      <input
        type="radio"
        name="filterMaterialType"
        value="${option.value}"
        ${materialFilterType === option.value ? "checked" : ""}
        style="margin-right: 8px; cursor: pointer; width: 16px;"
      />
      <span>${option.label}</span>
    </label>
  `,
    )
    .join("");

  container.innerHTML = html;

  // Add event listeners
  const radios = document.querySelectorAll('input[name="filterMaterialType"]');
  radios.forEach((radio) => {
    radio.addEventListener("change", function () {
      materialFilterType = this.value;
      updateMaterialFilterTypeStyles();
      filterMaterials();
    });
  });

  updateMaterialFilterTypeStyles();
}

// Update material filter type radio button styles
function updateMaterialFilterTypeStyles() {
  const labels = document.querySelectorAll("#filterMaterialTypeOptions label");
  labels.forEach((label) => {
    const radio = label.querySelector('input[type="radio"]');
    if (radio && radio.checked) {
      label.style.background = "#007bff";
      label.style.color = "white";
      label.style.borderColor = "#0056b3";
      label.style.fontWeight = "500";
    } else {
      label.style.background = "white";
      label.style.color = "inherit";
      label.style.borderColor = "#ddd";
      label.style.fontWeight = "normal";
    }
  });
}

// Render batch code radio buttons
function renderBatchCodeRadioButtons(batchesArray) {
  const container = document.getElementById("filterBatchCodeOptions");
  if (!container) return;

  const uniqueBatchCodes = [
    ...new Set(
      batchesArray.map((b) =>
        b.BatchNumber === null ? "null" : b.BatchNumber,
      ),
    ),
  ];

  // Add legend
  let html = `
    <div style="display: flex; gap: 15px; margin-bottom: 10px; font-size: 13px; color: #666;">
      <div style="display: flex; align-items: center; gap: 5px;">
        <span style="width: 20px; height: 20px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 3px; display: inline-block;"></span>
        <span>Có material</span>
      </div>
      <div style="display: flex; align-items: center; gap: 5px;">
        <span style="width: 20px; height: 20px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 3px; display: inline-block;"></span>
        <span>Chưa có material</span>
      </div>
    </div>
  `;

  // Start with "Tất cả" option
  const isAllSelected = selectedMaterialsBatchCode === "";
  html += `
    <label style="
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
      cursor: pointer;
      background: white;
      color: inherit;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      font-weight: normal;
    " onmouseover="var radio = this.querySelector('input[type=radio]'); if (!radio.checked) { this.style.borderColor='#007bff'; this.style.boxShadow='0 2px 4px rgba(0,123,255,0.2)'; } else { this.style.background='#0056b3'; }" onmouseout="var radio = this.querySelector('input[type=radio]'); if (!radio.checked) { this.style.background='white'; this.style.color='inherit'; this.style.borderColor='#ddd'; this.style.fontWeight='normal'; this.style.boxShadow='none'; } else { this.style.background='#007bff'; this.style.borderColor='#0056b3'; } this.style.boxShadow='none'">
      <input
        type="radio"
        name="filterBatchCode"
        value=""
        ${selectedMaterialsBatchCode === "" ? "checked" : ""}
        style="margin-right: 8px; cursor: pointer; width: 16px;"
      />
      <span>Tất cả</span>
    </label>
  `;

  // Add batch code options - display as numbered buttons
  html += uniqueBatchCodes
    .map((code) => {
      const isSelected = selectedMaterialsBatchCode === code;
      const isRunning = running_batches.some((b) => b.batchCode === code);
      let bgColor, borderColor;
      if (isRunning) {
        bgColor = "#d4edda";
        borderColor = "#c3e6cb";
      } else {
        bgColor = "#fff3cd";
        borderColor = "#ffeaa7";
      }
      if (code === "null") {
        bgColor = "#d4edda";
        borderColor = "#c3e6cb";
      }

      return `
        <label class="${isSelected ? "selected" : ""} 
          " onmouseover="this.style.borderColor='#007bff'; this.style.boxShadow='0 2px 4px rgba(0,123,255,0.2)'" onmouseout="var radio = this.querySelector('input[type=radio]'); if (!radio.checked) { this.style.background='${bgColor}'; this.style.color='inherit'; this.style.borderColor='${borderColor}'; this.style.fontWeight='normal'; } else { this.style.borderColor='#0056b3'; } this.style.boxShadow='none'">
          <input
            type="radio"
            name="filterBatchCode"
            value="${code}"
            ${isSelected ? "checked" : ""}
            style="margin-right: 6px; cursor: pointer; width: 16px;"
          />
          <span>${code}</span>
        </label>
      `;
    })
    .join("");

  container.innerHTML = html;

  // Explicitly sync the checked radio to avoid initial flash
  try {
    let targetValue = selectedMaterialsBatchCode;
    if (typeof targetValue !== "string") {
      targetValue = targetValue == null ? "" : String(targetValue);
    }
    let targetRadio = document.querySelector(
      `input[name="filterBatchCode"][value="${CSS.escape(targetValue)}"]`,
    );
    if (!targetRadio) {
      targetRadio = document.querySelector(
        'input[name="filterBatchCode"][value=""]',
      );
    }
    if (targetRadio) {
      targetRadio.checked = true;
    }
  } catch (_) {
    // Fallback silently if CSS.escape is unavailable
    const radios = document.querySelectorAll('input[name="filterBatchCode"]');
    radios.forEach((r) => {
      if (r.value === selectedMaterialsBatchCode) r.checked = true;
    });
  }

  // Add event listeners to radio buttons
  const radios = document.querySelectorAll('input[name="filterBatchCode"]');
  radios.forEach((radio) => {
    radio.addEventListener("change", function () {
      // Update selected batch code
      selectedMaterialsBatchCode = this.value;
      // Update styling for selected radio
      updateBatchCodeRadioStyles();
      filterMaterials();
    });
  });

  // Initial styling
  updateBatchCodeRadioStyles();
}

// Update radio button styling to highlight selected
function updateBatchCodeRadioStyles() {
  const labels = document.querySelectorAll("#filterBatchCodeOptions label");

  // Check which batches have materials
  const batchesWithMaterials = new Set(
    allMaterials.filter((m) => m.batchCode && m.id).map((m) => m.batchCode),
  );

  labels.forEach((label, index) => {
    const radio = label.querySelector('input[type="radio"]');
    if (radio && radio.checked) {
      label.style.background = "#007bff";
      label.style.color = "white";
      label.style.borderColor = "#0056b3";
      label.style.fontWeight = "500";
    } else {
      // Skip legend divs (elements without radio buttons)
      if (!radio) {
        return;
      }

      // Handle "Tất cả" option (first radio button)
      if (radio.value === "") {
        label.style.background = "white";
        label.style.color = "inherit";
        label.style.borderColor = "#ddd";
        label.style.fontWeight = "normal";
        return;
      }

      const batchCode = radio.value;
      // Sửa đoạn này:
      let isRunning = false;
      if (batchCode === "null") {
        isRunning = running_batches.some((b) => b.batchCode === null);
      } else {
        isRunning = running_batches.some((b) => b.batchCode === batchCode);
      }

      const hasMaterial = batchesWithMaterials.has(batchCode);

      if (isRunning) {
        label.style.background = "#d4edda";
        label.style.borderColor = "#c3e6cb";
      } else {
        label.style.background = hasMaterial ? "#d4edda" : "#fff3cd";
        label.style.borderColor = hasMaterial ? "#c3e6cb" : "#ffeaa7";
      }
      label.style.color = "inherit";
      label.style.fontWeight = "normal";
    }
  });
}

// Update pagination buttons and info
function updatePaginationControls(currentPage, totalPages) {
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const pageInfo = document.getElementById("pageInfo");

  pageInfo.textContent = `Trang ${currentPage} / ${totalPages}`;

  // Disable/Enable prev button
  if (currentPage <= 1) {
    prevBtn.disabled = true;
    prevBtn.style.background = "#ccc";
    prevBtn.style.cursor = "not-allowed";
    prevBtn.style.opacity = "0.6";
  } else {
    prevBtn.disabled = false;
    prevBtn.style.background = "#007aff";
    prevBtn.style.cursor = "pointer";
    prevBtn.style.opacity = "1";
    prevBtn.onmouseover = function () {
      if (!this.disabled) this.style.background = "#0056b3";
    };
    prevBtn.onmouseout = function () {
      if (!this.disabled) this.style.background = "#007aff";
    };
  }

  // Disable/Enable next button
  if (currentPage >= totalPages) {
    nextBtn.disabled = true;
    nextBtn.style.background = "#ccc";
    nextBtn.style.cursor = "not-allowed";
    nextBtn.style.opacity = "0.6";
  } else {
    nextBtn.disabled = false;
    nextBtn.style.background = "#007aff";
    nextBtn.style.cursor = "pointer";
    nextBtn.style.opacity = "1";
    nextBtn.onmouseover = function () {
      if (!this.disabled) this.style.background = "#0056b3";
    };
    nextBtn.onmouseout = function () {
      if (!this.disabled) this.style.background = "#007aff";
    };
  }

  // Show pagination controls only if there are multiple pages
  document.getElementById("paginationControls").style.display =
    totalPages > 1 ? "flex" : "none";
}

// Handle pagination button clicks
document.addEventListener("DOMContentLoaded", function () {
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  prevBtn.addEventListener("click", function () {
    if (currentPage > 1) {
      currentPage--;
      displayBatchesTable(batches);
    }
  });

  nextBtn.addEventListener("click", function () {
    const totalPages = Math.ceil(batches.length / batchesPerPage);
    if (currentPage < totalPages) {
      currentPage++;
      displayBatchesTable(batches);
    }
  });

  // Materials pagination handlers
  const materialsPrevBtn = document.getElementById("materialsPrevBtn");
  const materialsNextBtn = document.getElementById("materialsNextBtn");

  if (materialsPrevBtn) {
    materialsPrevBtn.addEventListener("click", async function () {
      if (materialsCurrentPage > 1) {
        materialsCurrentPage--;
        await fetchMaterialsWithPagination();
      }
    });
  }

  if (materialsNextBtn) {
    materialsNextBtn.addEventListener("click", async function () {
      if (materialsCurrentPage < materialsTotalPages) {
        materialsCurrentPage++;
        await fetchMaterialsWithPagination();
      }
    });
  }
});

function mergeBatchesRemoveDuplicate(arr1, arr2) {
  const map = new Map();

  arr1.forEach((batch) => {
    if (batch.BatchNumber) {
      map.set(batch.BatchNumber, batch);
    }
  });

  let foundNull = false;

  arr2.forEach((batch) => {
    if (batch.BatchNumber && !map.has(batch.BatchNumber)) {
      map.set(batch.BatchNumber, batch);
    } else if (batch.BatchNumber === null) {
      if (!foundNull) {
        foundNull = true;
        map.set(batch.BatchNumber, batch);
      }
    }
  });

  return Array.from(map.values());
}

// Fetch and display batches
async function fetchBatches() {
  try {
    const response = await fetch(
      `${API_ROUTE}/api/production-order-detail/batches?productionOrderId=${orderId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (response.ok) {
      const data = await response.json();
      batches = data.data.map((batch) => new Batch(batch));
    }

    const response2 = await fetch(
      `${API_ROUTE}/api/production-order-detail/batch-codes-with-materials?productionOrderNumber=${order.ProductionOrderNumber}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (response2.ok) {
      const data2 = await response2.json();
      batchCodesWithMaterials = data2.data.map(
        (batch) =>
          new Batch({
            BatchId: "",
            ProductionOrderId: orderId,
            BatchNumber: batch.batchCode,
            Quantity: "",
            UnitOfMeasurement: "",
          }),
      );

      batches = mergeBatchesRemoveDuplicate(batches, batchCodesWithMaterials);
    }

    currentPage = 1;
    displayBatchesTable(batches);
  } catch (error) {
    console.error("Error loading batches:", error);
    document.getElementById("batchesTableBody").innerHTML =
      '<tr><td colspan="4" style="padding: 20px; text-align: center; color: red;">Lỗi khi tải dữ liệu</td></tr>';
  }
}

// Add event listeners to tab buttons
tabBatches.addEventListener("click", function () {
  activateTab("tab-batches");
});

tabMaterials.addEventListener("click", function () {
  activateTab("tab-materials");
});

// Modal event listeners
document.addEventListener("DOMContentLoaded", function () {
  const closeModalBtn = document.getElementById("closeModalBtn");
  const materialModal = document.getElementById("materialModal");

  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", closeMaterialModal);
  }

  // Close modal when clicking outside
  if (materialModal) {
    materialModal.addEventListener("click", function (e) {
      if (e.target === materialModal) {
        closeMaterialModal();
      }
    });
  }

  // Filter event listeners
  const filterIngredientCodeInput = document.getElementById(
    "filterIngredientCode",
  );
  const filterLotInput = document.getElementById("filterLot");
  const filterQuantityInput = document.getElementById("filterQuantity");
  const resetFilterBtn = document.getElementById("resetFilterBtn");

  if (filterIngredientCodeInput) {
    filterIngredientCodeInput.addEventListener("input", filterMaterials);
  }
  if (filterLotInput) {
    filterLotInput.addEventListener("input", filterMaterials);
  }
  if (filterQuantityInput) {
    filterQuantityInput.addEventListener("input", filterMaterials);
  }
  if (resetFilterBtn) {
    resetFilterBtn.addEventListener("click", function () {
      if (filterIngredientCodeInput) filterIngredientCodeInput.value = "";
      // Reset batch code radio to "Tất cả" and clear selected batch
      selectedMaterialsBatchCode = "";
      const batchCodeRadios = document.querySelectorAll(
        'input[name="filterBatchCode"]',
      );
      if (batchCodeRadios.length > 0) {
        batchCodeRadios[0].checked = true; // Select first radio (Tất cả)
      }
      if (filterLotInput) filterLotInput.value = "";
      if (filterQuantityInput) filterQuantityInput.value = "";

      // Reset material filter type
      materialFilterType = "all";
      const allMaterialRadio = document.querySelector(
        'input[name="filterMaterialType"][value="all"]',
      );
      if (allMaterialRadio) allMaterialRadio.checked = true;
      updateMaterialFilterTypeStyles();

      materialsCurrentPage = 1; // Reset to first page
      fetchMaterialsWithPagination();
    });
  }

  // Ingredients pagination handlers
  const ingredientsPrevBtn = document.getElementById("ingredientsPrevBtn");
  const ingredientsNextBtn = document.getElementById("ingredientsNextBtn");

  if (ingredientsPrevBtn) {
    ingredientsPrevBtn.addEventListener("click", async function () {
      if (ingredientsCurrentPage > 1) {
        ingredientsCurrentPage--;
        await fetchIngredients();
      }
    });
  }

  if (ingredientsNextBtn) {
    ingredientsNextBtn.addEventListener("click", async function () {
      if (ingredientsCurrentPage < ingredientsTotalPages) {
        ingredientsCurrentPage++;
        await fetchIngredients();
      }
    });
  }
});
