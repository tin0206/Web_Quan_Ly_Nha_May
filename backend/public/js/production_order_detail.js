import { Batch } from "./models/Batch.js";
import { MESMaterialConsumption } from "./models/MESMaterialConsumption.js";

const API_ROUTE = window.location.origin;

const orderId = window.location.pathname.split("/").pop();
let batches = [];
let materials = [];
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
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
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
const ingredientsContent = document.getElementById("ingredientsContent");
const recipesContent = document.getElementById("recipesContent");
const tabBatches = document.getElementById("tab-batches");
const tabMaterials = document.getElementById("tab-materials");
const tabIngredients = document.getElementById("tab-recipes");
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
    fetchMaterialConsumptions();
  } else if (tabId === "tab-recipes") {
    batchesContent.style.display = "none";
    materialsContent.style.display = "none";
    ingredientsContent.style.display = "none";
    recipesContent.style.display = "block";
    document.getElementById("paginationControls").style.display = "none";
    document.getElementById("materialsPaginationControls").style.display =
      "none";
    document.getElementById("ingredientsPaginationControls").style.display =
      "none";
    fetchRecipeMaterials();
  }
}

// Add event listeners to tab buttons
tabBatches.addEventListener("click", function () {
  activateTab("tab-batches");
});

tabMaterials.addEventListener("click", function () {
  activateTab("tab-materials");
});

if (tabIngredients) {
  tabIngredients.addEventListener("click", function () {
    activateTab("tab-recipes");
  });
}

// Pagination variables
let currentPage = 1;
let materialsCurrentPage = 1;
let ingredientsCurrentPage = 1;
const batchesPerPage = 10;
const materialsPerPage = 10;
const ingredientsPerPage = 10;
let materialsTotalPages = 1;
let materialsTotalCount = 0;
let ingredientsTotalPages = 1;
let ingredientsTotalCount = 0;
let ingredients = [];
let allIngredients = []; // Store all ingredients for client-side filtering
let allMaterials = []; // Store all materials for client-side filtering
let selectedMaterialsBatchCode = ""; // Store selected batch for materials tab
let selectedIngredientsBatchCode = ""; // Store selected batch for ingredients tab
let ingredientsTotalsByUOM = {}; // Store totals grouped by UnitOfMeasurement

// Group materials by batch number, ingredient code, lot, and unit of measurement
function groupMaterials(materialsArray) {
  const groupMap = new Map();

  materialsArray.forEach((material) => {
    // Create a unique key based on batch, ingredient, lot, and unit
    const key = `${material.batchCode || ""}_${material.ingredientCode || ""}_${material.lot || ""}_${material.unitOfMeasurement || ""}`;

    if (groupMap.has(key)) {
      const group = groupMap.get(key);
      // Add quantity to total
      group.totalQuantity += parseFloat(material.quantity) || 0;
      // Add material to items array
      group.items.push(material);
      // Add ID to ids array
      group.ids.push(material.id);
      // Update latest datetime
      if (
        material.datetime &&
        (!group.latestDatetime ||
          new Date(material.datetime) > new Date(group.latestDatetime))
      ) {
        group.latestDatetime = material.datetime;
      }
    } else {
      // Create new group
      groupMap.set(key, {
        batchCode: material.batchCode,
        ingredientCode: material.ingredientCode,
        lot: material.lot,
        unitOfMeasurement: material.unitOfMeasurement,
        totalQuantity: parseFloat(material.quantity) || 0,
        items: [material],
        ids: [material.id],
        latestDatetime: material.datetime,
        key: key,
      });
    }
  });

  return Array.from(groupMap.values());
}

// Display batches table with rowspan for batch code
function displayMaterialsTable(materialsArray) {
  // Store original materials for filtering
  window.allMaterials = materialsArray;

  // Group materials before rendering
  const groupedMaterials = groupMaterials(materialsArray);
  renderMaterialsTable(groupedMaterials);
}

// Render materials table
function renderMaterialsTable(groupedMaterialsArray) {
  const tbody = document.getElementById("materialsTableBody");

  if (groupedMaterialsArray.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="9" style="padding: 20px; text-align: center; color: #999;">Không có dữ liệu vật liệu nào</td></tr>';
    return;
  }

  // Build table HTML for grouped materials
  let html = "";
  groupedMaterialsArray.forEach((group, index) => {
    const idsDisplay =
      group.ids.length >= 2
        ? `${group.ids.length} items`
        : group.ids.join(", ");
    html += `<tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 12px; text-align: center; font-weight: bold;">${idsDisplay}</td>
      <td style="padding: 12px; text-align: center;">${group.batchCode || "-"}</td>
      <td style="padding: 12px; text-align: center;">${group.ingredientCode || "-"}</td>
      <td style="padding: 12px; text-align: center;">${group.lot || "-"}</td>
      <td style="padding: 12px; text-align: center;">${group.unitOfMeasurement || "-"}</td>
      <td style="padding: 12px; text-align: center;">${group.totalQuantity.toFixed(2)} ${group.unitOfMeasurement || ""}</td>
      <td style="padding: 12px; text-align: center;">${formatDate(group.latestDatetime) || "-"}</td>
      <td style="padding: 12px; text-align: center;">
        <button class="viewMaterialGroupBtn" data-index="${index}" style="background: none; border: none; cursor: pointer; color: #007bff; padding: 6px; transition: color 0.2s;" title="Xem danh sách">
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4c4.29 0 7.863 2.429 10.665 7.154l.22 .379l.045 .1l.03 .083l.014 .055l.014 .082l.011 .1v.11l-.014 .111a.992 .992 0 0 1 -.026 .11l-.039 .108l-.036 .075l-.016 .03c-2.764 4.836 -6.3 7.38 -10.555 7.499l-.313 .004c-4.396 0 -8.037 -2.549 -10.868 -7.504a1 1 0 0 1 0 -.992c2.831 -4.955 6.472 -7.504 10.868 -7.504zm0 5a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z" />
          </svg>
        </button>
      </td>
    </tr>`;
  });

  tbody.innerHTML = html;

  // Add event listeners to View buttons
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

// Filter ingredients and fetch from server with pagination
async function filterIngredients() {
  ingredientsCurrentPage = 1; // Reset to first page when filtering
  await fetchIngredients();
}

// Fetch materials with client-side filtering and pagination
async function fetchMaterialsWithPagination() {
  try {
    // Get batch IDs
    if (batches.length === 0) {
      document.getElementById("materialsTableBody").innerHTML =
        '<tr><td colspan="7" style="padding: 20px; text-align: center; color: #999;">Không có batch nào để lấy dữ liệu vật liệu</td></tr>';
      document.getElementById("materialsPaginationControls").style.display =
        "none";
      return;
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
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        allMaterials = data.data.map(
          (item) => new MESMaterialConsumption(item),
        );
      } else {
        document.getElementById("materialsTableBody").innerHTML =
          '<tr><td colspan="7" style="padding: 20px; text-align: center; color: red;">Lỗi khi tải dữ liệu</td></tr>';
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

    // Calculate pagination for filtered data
    materialsTotalCount = filteredMaterials.length;
    materialsTotalPages = Math.ceil(materialsTotalCount / materialsPerPage);

    // Get current page data
    const startIndex = (materialsCurrentPage - 1) * materialsPerPage;
    const endIndex = startIndex + materialsPerPage;
    materials = filteredMaterials.slice(startIndex, endIndex);

    // Always render batch code radio buttons (even when no data)
    renderBatchCodeRadioButtons(batches);

    displayMaterialsTable(materials);
    updateMaterialsPaginationControls(
      materialsCurrentPage,
      materialsTotalPages,
      materialsTotalCount,
    );
  } catch (error) {
    console.error("Error loading materials:", error);
    document.getElementById("materialsTableBody").innerHTML =
      '<tr><td colspan="7" style="padding: 20px; text-align: center; color: red;">Lỗi khi tải dữ liệu</td></tr>';
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
    material.productionOrderNumber || "-";
  document.getElementById("modalBatchCode").textContent =
    material.batchCode || "-";
  document.getElementById("modalIngredientCode").textContent =
    material.ingredientCode || "-";
  document.getElementById("modalLot").textContent = material.lot || "-";
  document.getElementById("modalQuantity").textContent = material.quantity || 0;
  document.getElementById("modalUnitOfMeasurement").textContent =
    material.unitOfMeasurement || "-";
  document.getElementById("modalDateTime").textContent =
    formatDate(material.datetime) || "-";
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
  document.getElementById("modalStatus").textContent = material.status1 || "-";

  modal.style.display = "flex";

  // Add click event to close modal when clicking outside
  modal.onclick = function (event) {
    if (event.target === modal) {
      closeMaterialModal();
    }
  };
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

  // Update modal header with group info
  document.getElementById("listModalTitle").innerHTML = `
    <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">Danh sách Materials</div>
    <div style="font-size: 14px; color: #666;">
      <span style="margin-right: 20px;"><strong>Batch:</strong> ${group.batchCode || "-"}</span>
      <span style="margin-right: 20px;"><strong>Ingredient:</strong> ${group.ingredientCode || "-"}</span>
      <span style="margin-right: 20px;"><strong>Lot:</strong> ${group.lot || "-"}</span>
      <span><strong>Total Quantity:</strong> ${group.totalQuantity.toFixed(2)} ${group.unitOfMeasurement || ""}</span>
    </div>
  `;

  // Build table rows for individual items
  let html = "";
  group.items.forEach((material, index) => {
    html += `<tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 12px; text-align: center; font-weight: bold;">${material.id || "-"}</td>
      <td style="padding: 12px; text-align: center;">${material.batchCode || "-"}</td>
      <td style="padding: 12px; text-align: center;">${material.ingredientCode || "-"}</td>
      <td style="padding: 12px; text-align: center;">${material.lot || "-"}</td>
      <td style="padding: 12px; text-align: center;">${material.quantity || 0} ${material.unitOfMeasurement || ""}</td>
      <td style="padding: 12px; text-align: center;">${formatDate(material.datetime) || "-"}</td>
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

  // Add click event to close modal when clicking outside
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

// Fetch and display ingredients with summary calculation
async function fetchIngredients() {
  try {
    // Get batch IDs
    if (batches.length === 0) {
      document.getElementById("ingredientsTableBody").innerHTML =
        '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #999;">Không có batch nào để lấy dữ liệu nguyên liệu</td></tr>';
      document.getElementById("ingredientsPaginationControls").style.display =
        "none";
      return;
    }

    // Only fetch from API if we don't have data yet
    if (allIngredients.length === 0) {
      // Fetch ingredients by ProductCode
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

        // Store all ingredients
        allIngredients = data.data || [];

        // Calculate totals grouped by UnitOfMeasurement
        ingredientsTotalsByUOM = {};
        allIngredients.forEach((item) => {
          const uom = item.UnitOfMeasurement || "N/A";
          if (!ingredientsTotalsByUOM[uom]) {
            ingredientsTotalsByUOM[uom] = 0;
          }
          ingredientsTotalsByUOM[uom] += parseFloat(item.Quantity) || 0;
        });
      }
    }

    // Filter on client-side based on selected batch code
    const batchCode = selectedIngredientsBatchCode;
    let filteredIngredients = allIngredients;

    if (batchCode) {
      if (batchCode === "null") {
        // Filter items with NULL batch code
        filteredIngredients = allIngredients.filter(
          (item) =>
            !item.batchCode || item.batchCode === "" || item.batchCode === null,
        );
      } else {
        filteredIngredients = allIngredients.filter(
          (item) => item.batchCode === batchCode,
        );
      }
    }

    // Calculate pagination for filtered data
    ingredientsTotalCount = filteredIngredients.length;
    ingredientsTotalPages = Math.ceil(
      ingredientsTotalCount / ingredientsPerPage,
    );

    // Get current page data
    const startIndex = (ingredientsCurrentPage - 1) * ingredientsPerPage;
    const endIndex = startIndex + ingredientsPerPage;
    ingredients = filteredIngredients.slice(startIndex, endIndex);

    // Display table with current page data, all data for Actual Quantity, and filtered data for Batch quantity
    displayIngredientsTable(ingredients, allIngredients, filteredIngredients);

    updateIngredientsPageInfo(
      ingredientsCurrentPage,
      ingredientsTotalPages,
      ingredientsTotalCount,
    );
  } catch (error) {
    console.error("Error loading ingredients:", error);
    document.getElementById("ingredientsTableBody").innerHTML =
      '<tr><td colspan="5" style="padding: 20px; text-align: center; color: red;">Lỗi khi tải dữ liệu</td></tr>';
    document.getElementById("ingredientsPaginationControls").style.display =
      "none";
  }
}

// Fetch and display materials for recipe tab with plan quantity calculation
async function fetchRecipeMaterials() {
  try {
    // Check if we have batches
    if (batches.length === 0) {
      document.getElementById("recipesTableBody").innerHTML =
        '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #999;">Không có batch nào</td></tr>';
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

        // Calculate totals grouped by IngredientCode
        ingredientsData.forEach((item) => {
          const ingredientCode = item.IngredientCode;
          if (!ingredientsTotalsByUOM[ingredientCode]) {
            ingredientsTotalsByUOM[ingredientCode] = 0;
          }
          ingredientsTotalsByUOM[ingredientCode] +=
            parseFloat(item.Quantity) || 0;
        });
      }
    }

    // Fetch all materials
    if (allMaterials.length === 0) {
      const queryParams = new URLSearchParams({
        productionOrderNumber: order.ProductionOrderNumber,
        limit: 999999,
      });

      const response = await fetch(
        `${API_ROUTE}/api/production-order-detail/material-consumptions?${queryParams.toString()}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        allMaterials = data.data.map(
          (item) => new MESMaterialConsumption(item),
        );
      }
    }

    // Display materials with plan quantity calculation
    displayRecipeMaterialsTable(allMaterials);
  } catch (error) {
    console.error("Error loading recipe materials:", error);
    document.getElementById("recipesTableBody").innerHTML =
      '<tr><td colspan="5" style="padding: 20px; text-align: center; color: red;">Lỗi khi tải dữ liệu</td></tr>';
  }
}

// Display recipe materials table with plan quantity calculation
function displayRecipeMaterialsTable(materialsArray) {
  const tbody = document.getElementById("recipesTableBody");

  if (!tbody) return;

  if (materialsArray.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #999;">Không có dữ liệu vật liệu</td></tr>';
    return;
  }

  // Get PO Quantity for calculation
  const poQuantity = parseFloat(order.Quantity) || 1;

  // Build table HTML
  let html = "";
  materialsArray.forEach((material) => {
    const ingredientCode = material.ingredientCode;
    const batchCode = material.batchCode;

    // Find batch quantity
    const batch = batches.find((b) => b.BatchNumber === batchCode);
    const batchQuantity = batch ? parseFloat(batch.Quantity) || 0 : 0;

    // Get recipe quantity from ingredientsTotalsByUOM
    const recipeQuantity = ingredientsTotalsByUOM[ingredientCode] || 0;

    // Calculate plan quantity: (recipeQuantity / poQuantity) * batchQuantity
    const planQuantity = (recipeQuantity / poQuantity) * batchQuantity;

    // Actual quantity from material
    const actualQuantity = parseFloat(material.quantity) || 0;

    html += `<tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 12px; text-align: center; font-weight: bold;">${material.id || "-"}</td>
      <td style="padding: 12px; text-align: center;">${batchCode || "-"}</td>
      <td style="padding: 12px; text-align: center;">${ingredientCode || "-"}</td>
      <td style="padding: 12px; text-align: center;">${actualQuantity.toFixed(2)} ${material.unitOfMeasurement || ""}</td>
      <td style="padding: 12px; text-align: center;">${planQuantity.toFixed(2)} ${material.unitOfMeasurement || ""}</td>
    </tr>`;
  });

  tbody.innerHTML = html;
}

// Render batch code radio buttons for ingredients
function renderIngredientsBatchCodeRadioButtons(batchesArray) {
  const container = document.getElementById(
    "filterIngredientsBatchCodeOptions",
  );
  if (!container) return;

  const uniqueBatchCodes = [
    ...new Set(
      batchesArray.map((b) =>
        b.BatchNumber === null ? "null" : b.BatchNumber,
      ),
    ),
  ];

  // Start with "Tất cả" option
  let html = `
    <label style="
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
      cursor: pointer;
      background: #007bff;
      color: white;
      border: 1px solid #0056b3;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
    " onmouseover="this.style.background='#0056b3'" onmouseout="this.style.background='#007bff'">
      <input
        type="radio"
        name="filterIngredientsBatchCode"
        value=""
        ${selectedIngredientsBatchCode === "" ? "checked" : ""}
        style="margin-right: 8px; cursor: pointer; accent-color: white; width: 16px;"
      />
      <span>Tất cả</span>
    </label>
  `;

  // Add batch code options - display as numbered buttons
  html += uniqueBatchCodes
    .map(
      (code, index) => `
    <label style="
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px 10px;
      cursor: pointer;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      transition: all 0.2s;
      font-size: 13px;
      min-width: 50px;
    " onmouseover="this.style.borderColor='#007bff'; this.style.boxShadow='0 2px 4px rgba(0,123,255,0.2)'" onmouseout="var radio = this.querySelector('input[type=radio]'); if (!radio.checked) { this.style.background='white'; this.style.color='inherit'; this.style.borderColor='#ddd'; this.style.fontWeight='normal'; } else { this.style.borderColor='#0056b3'; } this.style.boxShadow='none'">
      <input
        type="radio"
        name="filterIngredientsBatchCode"
        value="${code}"
        ${selectedIngredientsBatchCode === code ? "checked" : ""}
        style="margin-right: 6px; cursor: pointer; width: 16px;"
      />
      <span>${code}</span>
    </label>
  `,
    )
    .join("");

  container.innerHTML = html;

  // Add event listeners to radio buttons
  const radios = document.querySelectorAll(
    'input[name="filterIngredientsBatchCode"]',
  );
  radios.forEach((radio) => {
    radio.addEventListener("change", function () {
      // Save selected batch code
      selectedIngredientsBatchCode = this.value;
      // Update styling for selected radio
      updateIngredientsBatchCodeRadioStyles();
      // Reset to page 1 and filter locally (no API call)
      ingredientsCurrentPage = 1;
      fetchIngredients();
    });
  });

  // Initial styling
  updateIngredientsBatchCodeRadioStyles();
}

// Update radio button styling to highlight selected for ingredients
function updateIngredientsBatchCodeRadioStyles() {
  const labels = document.querySelectorAll(
    "#filterIngredientsBatchCodeOptions label",
  );
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

// Calculate actual quantity summary grouped by UOM (grand total only)
function calculateActualQuantitySummary(ingredientsArray) {
  if (!ingredientsArray || ingredientsArray.length === 0) {
    return "No data";
  }

  // Calculate total of all batches by UOM
  const allBatchesTotals = {};
  ingredientsArray.forEach((item) => {
    const uom = item.unitOfMeasurement || "N/A";
    if (!allBatchesTotals[uom]) {
      allBatchesTotals[uom] = 0;
    }
    allBatchesTotals[uom] += parseFloat(item.quantity) || 0;
  });

  // Format total of all batches with 2 decimal places
  const allBatchesTotal = Object.keys(allBatchesTotals)
    .map((uom) => `${allBatchesTotals[uom].toFixed(2)} ${uom}`)
    .join(", ");

  return allBatchesTotal;
}

// Calculate batch-specific quantity summary
function calculateBatchQuantitySummary(ingredientsArray, batchCode) {
  if (!ingredientsArray || ingredientsArray.length === 0 || !batchCode) {
    return "";
  }

  const batchTotals = {};
  ingredientsArray.forEach((item) => {
    let matchesBatch = false;

    if (batchCode === "null") {
      // Match items with NULL batch code
      matchesBatch =
        !item.batchCode || item.batchCode === "" || item.batchCode === null;
    } else {
      matchesBatch = item.batchCode === batchCode;
    }

    if (matchesBatch) {
      const uom = item.unitOfMeasurement || "N/A";
      if (!batchTotals[uom]) {
        batchTotals[uom] = 0;
      }
      batchTotals[uom] += parseFloat(item.quantity) || 0;
    }
  });

  const batchTotal = Object.keys(batchTotals)
    .map((uom) => `${batchTotals[uom].toFixed(2)} ${uom}`)
    .join(", ");

  return batchTotal;
}

// Display ingredients table
function displayIngredientsTable(
  ingredientsArray,
  allIngredientsForActualQuantity = null,
  filteredIngredientsForBatchQuantity = null,
) {
  const tbody = document.getElementById("ingredientsTableBody");

  if (!tbody) return;

  // Use all data for actual quantity (grand total)
  const allIngredientsData =
    allIngredientsForActualQuantity || ingredientsArray;

  // Use filtered data for batch quantity (all filtered data, not just current page)
  const filteredIngredientsData =
    filteredIngredientsForBatchQuantity || ingredientsArray;

  // Display plan quantity info and actual quantity above the table
  const ingredientsSummary = document.getElementById("ingredientsSummary");
  if (ingredientsSummary) {
    // Calculate actual quantity summary from ALL ingredients (without batch filter)
    const actualQuantitySummary =
      calculateActualQuantitySummary(allIngredientsData);

    // Calculate batch-specific summary if a batch is selected (use all filtered data)
    const selectedBatchCode =
      document.querySelector('input[name="filterIngredientsBatchCode"]:checked')
        ?.value || "";
    const batchQuantitySummary = calculateBatchQuantitySummary(
      filteredIngredientsData,
      selectedBatchCode,
    );

    let summaryHTML = `
      <div style="
        background: white;
        padding: 15px 20px;
        border-radius: 8px;
        margin-bottom: 20px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      ">
        <p style="margin: 0 0 10px 0; font-size: 16px; color: #333;">
          <strong>Plan Quantity:</strong> <span style="color: #28a745; font-weight: bold;">${order.Quantity || 0} ${order.UnitOfMeasurement || ""}</span>
        </p>
        <p style="margin: 0; font-size: 16px; color: #333;">
          <strong>Actual Quantity:</strong> <span style="color: #007bff; font-weight: bold;">${actualQuantitySummary}</span>
        </p>
        <p style="margin: 0; font-size: 16px; color: #333;">  
          `;
    // Add batch-specific info if a batch is selected
    if (selectedBatchCode && batchQuantitySummary) {
      summaryHTML += `<strong>Batch ${selectedBatchCode}:</strong><span style="color: #007bff; font-weight: bold;"> ${batchQuantitySummary}</span>`;
    }

    summaryHTML += `</span>
        </p>
      </div>`;
    ingredientsSummary.innerHTML = summaryHTML;
  }

  if (ingredientsArray.length === 0) {
    // Render batch code radio buttons even when no data
    renderIngredientsBatchCodeRadioButtons(batches);

    // Still show plan and actual quantity even when no data
    const ingredientsSummary = document.getElementById("ingredientsSummary");
    if (ingredientsSummary) {
      // Calculate actual quantity from ALL data
      const actualQuantitySummary =
        calculateActualQuantitySummary(allIngredientsData);

      // Get selected batch code
      const selectedBatchCode =
        document.querySelector(
          'input[name="filterIngredientsBatchCode"]:checked',
        )?.value || "";

      let summaryHTML = `
        <div style="
          background: white;
          padding: 15px 20px;
          border-radius: 8px;
          margin-bottom: 20px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        ">
          <p style="margin: 0 0 10px 0; font-size: 16px; color: #333;">
            <strong>Plan Quantity:</strong> <span style="color: #28a745; font-weight: bold;">${order.Quantity || 0} ${order.UnitOfMeasurement || ""}</span>
          </p>
          <p style="margin: 0; font-size: 16px; color: #333;">
            <strong>Actual Quantity:</strong> <span style="color: #007bff; font-weight: bold;">${actualQuantitySummary}</span>
          </p>`;

      // Add batch info if a batch is selected
      if (selectedBatchCode) {
        summaryHTML += `
          <p style="margin: 0; font-size: 16px; color: #333;">
            <strong>Batch ${selectedBatchCode}:</strong> <span style="color: #999; font-weight: bold;">No data</span>
          </p>`;
      }

      summaryHTML += `
        </div>
      `;
      ingredientsSummary.innerHTML = summaryHTML;
    }
    tbody.innerHTML =
      '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #999;">Không có dữ liệu nguyên liệu nào</td></tr>';
    return;
  }

  // Render batch code radio buttons
  renderIngredientsBatchCodeRadioButtons(batches);

  // Build table HTML
  let html = "";
  ingredientsArray.forEach((ingredient, index) => {
    html += `<tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 12px; text-align: center; font-weight: bold;">${ingredient.id || "-"}</td>
      <td style="padding: 12px; text-align: center;">${ingredient.batchCode || "-"}</td>
      <td style="padding: 12px; text-align: center;">${ingredient.ingredientCode || "-"}</td>
      <td style="padding: 12px; text-align: center;">${ingredient.quantity || 0} ${ingredient.unitOfMeasurement || ""}</td>
      <td style="padding: 12px; text-align: center;">${formatDate(ingredient.datetime) || "-"}</td>
    </tr>`;
  });

  tbody.innerHTML = html;
}

// Update ingredients page info
function updateIngredientsPageInfo(currentPage, totalPages, totalCount) {
  const prevBtn = document.getElementById("ingredientsPrevBtn");
  const nextBtn = document.getElementById("ingredientsNextBtn");
  const pageInfo = document.getElementById("ingredientsPageInfo");

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
  document.getElementById("ingredientsPaginationControls").style.display =
    totalPages > 1 ? "flex" : "none";
}

// Display batches in table with pagination
async function displayBatchesTable(batchesArray) {
  if (batchesArray.length === 0) {
    document.getElementById("batchesTableBody").innerHTML =
      '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #999;">Không có batch nào</td></tr>';
    document.getElementById("paginationControls").style.display = "none";
    return;
  }

  // Render batch code radio buttons
  renderBatchCodeRadioButtons(batchesArray);

  // Calculate pagination
  const totalPages = Math.ceil(batchesArray.length / batchesPerPage);
  const startIndex = (currentPage - 1) * batchesPerPage;
  const endIndex = startIndex + batchesPerPage;
  const paginatedBatches = batchesArray.slice(startIndex, endIndex);

  // Display table rows
  const tbody = document.getElementById("batchesTableBody");
  tbody.innerHTML = paginatedBatches
    .map(
      (batch) => `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 12px; text-align: center;">${batch.BatchId}</td>
              <td style="padding: 12px; text-align: center;">${batch.BatchNumber}</td>
              <td style="padding: 12px; text-align: center;">${batch.Quantity} ${batch.UnitOfMeasurement}</td>
              <td style="padding: 12px; text-align: center; display: flex; gap: 10px; justify-content: center;">
                <button class="viewMaterialsBtn" data-batch-code="${batch.BatchNumber}" style="background: #007bff; color: white; border: none; cursor: pointer; padding: 8px 12px; border-radius: 4px; font-size: 14px; font-weight: 500; transition: background 0.2s;" title="View Materials">
                  View Materials
                </button>
                <button class="viewIngredientsBtn" data-batch-code="${batch.BatchNumber}" style="background: #28a745; color: white; border: none; cursor: pointer; padding: 8px 12px; border-radius: 4px; font-size: 14px; font-weight: 500; transition: background 0.2s;" title="View Ingredients">
                  View Ingredients
                </button>
              </td>
            </tr>
          `,
    )
    .join("");

  // Add event listeners to View Materials buttons
  const viewMaterialsButtons = document.querySelectorAll(".viewMaterialsBtn");
  viewMaterialsButtons.forEach((btn) => {
    btn.addEventListener("click", function () {
      const batchCode = this.getAttribute("data-batch-code");
      // Save selected batch code BEFORE switching tabs
      selectedMaterialsBatchCode = batchCode;
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

  // Add event listeners to View Ingredients buttons
  const viewIngredientsButtons = document.querySelectorAll(
    ".viewIngredientsBtn",
  );
  viewIngredientsButtons.forEach((btn) => {
    btn.addEventListener("click", async function () {
      const batchCode = this.getAttribute("data-batch-code");
      // Set selected batch code BEFORE switching tabs
      selectedIngredientsBatchCode = batchCode;
      // Switch to ingredients tab (this will call fetchIngredients and render radio buttons)
      activateTab("tab-recipes");
    });
    btn.addEventListener("mouseover", function () {
      this.style.background = "#218838";
    });
    btn.addEventListener("mouseout", function () {
      this.style.background = "#28a745";
    });
  });

  // Update pagination controls
  updatePaginationControls(currentPage, totalPages);
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

  // Start with "Tất cả" option
  let html = `
    <label style="
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
      cursor: pointer;
      background: #007bff;
      color: white;
      border: 1px solid #0056b3;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
    " onmouseover="this.style.background='#0056b3'" onmouseout="this.style.background='#007bff'">
      <input
        type="radio"
        name="filterBatchCode"
        value=""
        ${selectedMaterialsBatchCode === "" ? "checked" : ""}
        style="margin-right: 8px; cursor: pointer; accent-color: white; width: 16px;"
      />
      <span>Tất cả</span>
    </label>
  `;

  // Add batch code options - display as numbered buttons
  html += uniqueBatchCodes
    .map(
      (code) => `
    <label style="
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px 10px;
      cursor: pointer;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      transition: all 0.2s;
      font-size: 13px;
      min-width: 50px;
    " onmouseover="this.style.borderColor='#007bff'; this.style.boxShadow='0 2px 4px rgba(0,123,255,0.2)'" onmouseout="var radio = this.querySelector('input[type=radio]'); if (!radio.checked) { this.style.background='white'; this.style.color='inherit'; this.style.borderColor='#ddd'; this.style.fontWeight='normal'; } else { this.style.borderColor='#0056b3'; } this.style.boxShadow='none'">
      <input
        type="radio"
        name="filterBatchCode"
        value="${code}"
        ${selectedMaterialsBatchCode === code ? "checked" : ""}
        style="margin-right: 6px; cursor: pointer; width: 16px;"
      />
      <span>${code}</span>
    </label>
  `,
    )
    .join("");

  container.innerHTML = html;

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
    map.set(batch.BatchNumber, batch);
  });

  arr2.forEach((batch) => {
    if (!map.has(batch.BatchNumber)) {
      map.set(batch.BatchNumber, batch);
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
      const batchCodesWithMaterials = data2.data.map(
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
