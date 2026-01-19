import { Batch } from "./models/Batch.js";
import { MESMaterialConsumption } from "./models/MESMaterialConsumption.js";

const API_ROUTE = "http://localhost:3000/api";

const orderId = window.location.pathname.split("/").pop();
let batches = [];
let materials = [];
let order = {};

async function fetchOrderDetail() {
  try {
    const response = await fetch(`${API_ROUTE}/production-order/${orderId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

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
      document.getElementById("detailUnitOfMeasurement").textContent =
        order.UnitOfMeasurement || "-";
      document.getElementById("detailPlannedStart").textContent =
        formatDate(order.PlannedStart) || "-";
      document.getElementById("detailPlannedEnd").textContent =
        formatDate(order.PlannedEnd) || "-";
      document.getElementById("detailShift").textContent = order.Shift || "-";
      document.getElementById("detailProgress").textContent =
        (order.Progress || 0) + "%";
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
        return "Lỗi";
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
document.addEventListener("DOMContentLoaded", fetchOrderDetail);

const batchesContent = document.getElementById("batchesContent");
const materialsContent = document.getElementById("materialsContent");
const tabBatches = document.getElementById("tab-batches");
const tabMaterials = document.getElementById("tab-materials");
const allTabButtons = document.querySelectorAll(".tab-button");

function activateTab(tabId) {
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
    document.getElementById("materialsPaginationControls").style.display =
      "none";
    document.getElementById("paginationControls").style.display = "flex";
    fetchBatches();
  } else if (tabId === "tab-materials") {
    batchesContent.style.display = "none";
    materialsContent.style.display = "block";
    document.getElementById("paginationControls").style.display = "none";
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

// Display batches table with rowspan for batch code
function displayMaterialsTable(materialsArray) {
  // Store original materials for filtering
  window.allMaterials = materialsArray;

  renderMaterialsTable(materialsArray);
}

// Render materials table
function renderMaterialsTable(materialsArray) {
  const tbody = document.getElementById("materialsTableBody");

  if (materialsArray.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="9" style="padding: 20px; text-align: center; color: #999;">Không có dữ liệu vật liệu nào</td></tr>';
    return;
  }

  // Build table HTML
  let html = "";
  materialsArray.forEach((material, index) => {
    html += `<tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 12px; text-align: center; font-weight: bold;">${material.id || "-"}</td>
      <td style="padding: 12px; text-align: center;">${material.batchCode || "-"}</td>
      <td style="padding: 12px; text-align: center;">${material.ingredientCode || "-"}</td>
      <td style="padding: 12px; text-align: left;">${material.lot || "-"}</td>
      <td style="padding: 12px; text-align: center;">${material.quantity || 0} ${material.unitOfMeasurement || ""}</td>
      <td style="padding: 12px; text-align: center;">${formatDate(material.datetime) || "-"}</td>
      <td style="padding: 12px; text-align: center;">
        <button class="viewMaterialBtn" data-index="${index}" style="background: none; border: none; cursor: pointer; color: #007bff; padding: 6px; transition: color 0.2s;" title="Xem chi tiết">
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4c4.29 0 7.863 2.429 10.665 7.154l.22 .379l.045 .1l.03 .083l.014 .055l.014 .082l.011 .1v.11l-.014 .111a.992 .992 0 0 1 -.026 .11l-.039 .108l-.036 .075l-.016 .03c-2.764 4.836 -6.3 7.38 -10.555 7.499l-.313 .004c-4.396 0 -8.037 -2.549 -10.868 -7.504a1 1 0 0 1 0 -.992c2.831 -4.955 6.472 -7.504 10.868 -7.504zm0 5a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z" />
          </svg>
        </button>
      </td>
    </tr>`;
  });

  tbody.innerHTML = html;

  // Add event listeners to View buttons
  const viewButtons = document.querySelectorAll(".viewMaterialBtn");
  viewButtons.forEach((btn) => {
    btn.addEventListener("click", function () {
      const index = this.getAttribute("data-index");
      showMaterialModal(materialsArray[index]);
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

// Fetch materials with server-side pagination
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

    const batchIds = batches.map((batch) => batch.BatchId).join(",");

    // Get search query from filter inputs
    const filters = {
      ingredientCode:
        document.getElementById("filterIngredientCode")?.value || "",
      batchCode: document.getElementById("filterBatchCode")?.value || "",
      lot: document.getElementById("filterLot")?.value || "",
      quantity: document.getElementById("filterQuantity")?.value || "",
    };

    // Combine all filters into a search query
    const searchQuery = Object.values(filters)
      .filter((v) => v.trim())
      .join(" ");

    // Fetch from server with pagination
    const response = await fetch(
      `/api/material-consumptions?batchCodes=${batchIds}&productionOrderNumber=${order.ProductionOrderNumber}&page=${materialsCurrentPage}&limit=${materialsPerPage}&searchQuery=${encodeURIComponent(searchQuery)}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (response.ok) {
      const data = await response.json();
      materials = data.data.map((item) => new MESMaterialConsumption(item));
      materialsTotalPages = data.totalPages;
      materialsTotalCount = data.totalCount;

      displayMaterialsTable(materials);
      updateMaterialsPaginationControls(
        materialsCurrentPage,
        materialsTotalPages,
        materialsTotalCount,
      );
    } else {
      document.getElementById("materialsTableBody").innerHTML =
        '<tr><td colspan="7" style="padding: 20px; text-align: center; color: red;">Lỗi khi tải dữ liệu</td></tr>';
      document.getElementById("materialsPaginationControls").style.display =
        "none";
    }
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
}

// Close modal function
function closeMaterialModal() {
  const modal = document.getElementById("materialModal");
  modal.style.display = "none";
}

// Fetch materials for production order - initial load
async function fetchMaterialConsumptions() {
  materialsCurrentPage = 1; // Reset to first page
  await fetchMaterialsWithPagination();
}

// Display batches in table with pagination
function displayBatchesTable(batchesArray) {
  if (batchesArray.length === 0) {
    document.getElementById("batchesTableBody").innerHTML =
      '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #999;">Không có batch nào</td></tr>';
    document.getElementById("paginationControls").style.display = "none";
    return;
  }

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
              <td style="padding: 12px; text-align: center;">${batch.Quantity}</td>
              <td style="padding: 12px; text-align: center;">${batch.UnitOfMeasurement}</td>
            </tr>
          `,
    )
    .join("");

  // Update pagination controls
  updatePaginationControls(currentPage, totalPages);
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

// Fetch and display batches
async function fetchBatches() {
  try {
    const response = await fetch(`/api/batches?productionOrderId=${orderId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      batches = data.data.map((batch) => new Batch(batch));
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

// Load batches on page load
fetchBatches();

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
  const filterBatchCodeInput = document.getElementById("filterBatchCode");
  const filterLotInput = document.getElementById("filterLot");
  const filterQuantityInput = document.getElementById("filterQuantity");
  const resetFilterBtn = document.getElementById("resetFilterBtn");

  if (filterIngredientCodeInput) {
    filterIngredientCodeInput.addEventListener("input", filterMaterials);
  }
  if (filterBatchCodeInput) {
    filterBatchCodeInput.addEventListener("input", filterMaterials);
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
      if (filterBatchCodeInput) filterBatchCodeInput.value = "";
      if (filterLotInput) filterLotInput.value = "";
      if (filterQuantityInput) filterQuantityInput.value = "";
      materialsCurrentPage = 1; // Reset to first page
      fetchMaterialsWithPagination();
    });
  }
});
