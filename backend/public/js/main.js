import { ProductionOrder } from "./models/ProductionOrder.js";

const API_ROUTE = window.location.origin;

let productionOrders = [];
let currentPage = 1;
let totalRecords = 0;
let totalPages = 1;
let statsData = {};
const pageSize = 20;

const sourceCodeSpan = document.getElementById("material-source-code");
const destinationCodeSpan = document.getElementById(
  "material-destination-code",
);
sourceCodeSpan.textContent = window.PLANTCODE;
destinationCodeSpan.textContent = window.LINE;

document.addEventListener("DOMContentLoaded", async function () {
  // Set default date range: yesterday 0h to tomorrow end of day
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateFromInput = document.getElementById("dateFrom");
  const dateToInput = document.getElementById("dateTo");
  const sourceCodeSpan = document.getElementById("material-source-code");
  const destinationCodeSpan = document.getElementById(
    "material-destination-code",
  );
  sourceCodeSpan.textContent = PLANTCODE;
  destinationCodeSpan.textContent = LINE;

  // if (dateFromInput) {
  //   dateFromInput.value = yesterday.toISOString().split("T")[0];
  // }
  // if (dateToInput) {
  //   dateToInput.value = tomorrow.toISOString().split("T")[0];
  // }

  await fetchStats();
  await fetchProductionOrders(1);
  updateStats();
  renderProductionTable();
  initializeEventListeners();
  initializeSearch();
  initializeModalHandlers();
});

// Initialize all event listeners
function initializeEventListeners() {
  // Back button
  const backBtn = document.querySelector(".back-btn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      history.back();
    });
  }

  // View controls
  const viewBtns = document.querySelectorAll(".view-btn");
  const tableSection = document.querySelector(".table-section");

  viewBtns.forEach((btn, index) => {
    btn.addEventListener("click", function () {
      viewBtns.forEach((b) => b.classList.remove("active"));
      this.classList.add("active");

      // Toggle between list and grid view
      if (index === 0) {
        // List view
        tableSection.innerHTML =
          `
          <table class="data-table">
            <thead>
              <tr>
                <th>Mã Lệnh SX</th>
                <th>Sản Phẩm</th>
                <th style="text-align: center">Dây chuyền</th>
                <th>Công thức</th>
                <th>Lô SX</th>
                <th>Process Area</th>
                <th style="text-align: center">Ngày Bắt Đầu / Số Lượng</th>
                <th style="text-align: center">Batch hiện tại</th>
                <th style="text-align: center">Tiến độ</th>
                <th style="text-align: center">Trạng Thái</th>
                <th style="text-align: center">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              <!-- Rows will be rendered by JavaScript -->
            </tbody>
          </table>
        ` + getPaginationHTML();
        updatePaginationControls();
        renderProductionTable();
      } else {
        // Grid view
        renderGridView();
      }
    });
  });

  // Refresh button
  const refreshBtn = document.querySelector(".refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      location.reload();
    });
  }

  // Action buttons
  const actionBtns = document.querySelectorAll(".action-btn");
  actionBtns.forEach((btn) => {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      const row = this.closest("tr");
      const areaText =
        row.querySelector(".area-badge div")?.textContent || "Unknown";
      alert(`Xem chi tiết khu vực: ${areaText}`);
    });
  });
}

// Get status icon based on status type
function getStatusIcon(statusType) {
  const iconMap = {
    error: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white" style="flex-shrink: 0;">
      <path
        d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2z"
      />
    </svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white" style="flex-shrink: 0;">
      <path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z" />
    </svg>`,
    success: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white" style="flex-shrink: 0;">
      <path d="M12 1c6.075 0 11 4.925 11 11s-4.925 11 -11 11s-11 -4.925 -11 -11s4.925 -11 11 -11m0 -1c-6.627 0 -12 5.373 -12 12s5.373 12 12 12s12 -5.373 12 -12s-5.373 -12 -12 -12m4.707 8.293l-5.293 5.293l-2.293 -2.293a1 1 0 0 0 -1.414 1.414l3 3a1 1 0 0 0 1.414 0l6 -6a1 1 0 0 0 -1.414 -1.414z" />
    </svg>`,
  };
  return iconMap[statusType] || iconMap["warning"];
}

// Determine status type based on status code/text
function getStatusType(status) {
  if (!status && status !== 0) return "warning";

  // Handle numeric status codes
  if (typeof status === "number") {
    switch (status) {
      case 0:
        return "error"; // Failed/Error
      case 1:
        return "warning"; // Running/In Progress
      case 2:
        return "success"; // Completed
      default:
        return "warning";
    }
  }

  // Handle text status
  const text = String(status).toLowerCase();
  if (text.includes("completed") || text.includes("hoàn thành"))
    return "success";
  if (text.includes("failed") || text.includes("error") || text.includes("lỗi"))
    return "error";
  return "warning";
}

// Get status text based on status code
function getStatusText(status) {
  if (typeof status === "number") {
    switch (status) {
      case 1:
        return "Đang chạy";
      default:
        return "Đang chờ";
    }
  }
  return String(status);
}

// Format date to DD/MM/YYYY format
function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Get truncated name with ellipsis if longer than 25 chars
function getTruncatedName(name, maxLength = 100) {
  return name.length > maxLength ? name.substring(0, maxLength) + "..." : name;
}

// Get progress status based on status code
function getProgressStatus(status) {
  switch (status) {
    case 0:
      return "cancelled"; // Error/Cancelled
    case 1:
      return "running"; // Running/In Progress
    case 2:
      return "completing"; // Completed
    case -1:
      return "pending"; // Pending
    default:
      return "stop";
  }
}

// Render progress bar HTML based on CurrentBatch and TotalBatches
function renderProgressBar(currentBatch, totalBatches, progressStatus) {
  // Convert to integers
  const current = parseInt(currentBatch) || 0;
  const total = parseInt(totalBatches) || 0;

  // Calculate progress percentage
  const progress = total === 0 ? 0 : Math.round((current / total) * 100);

  const progressGradient =
    progressStatus === "running"
      ? "linear-gradient(90deg, #ffa726 0%, #f57c00 100%)"
      : progressStatus === "stop"
        ? "linear-gradient(90deg, #bdbdbd 0%, #9e9e9e 100%)"
        : progressStatus === "cancelled"
          ? "linear-gradient(90deg, #ef5350 0%, #d32f2f 100%)"
          : progressStatus === "completing"
            ? "linear-gradient(90deg, #26a69a 0%, #009688 100%)"
            : "linear-gradient(90deg, #bdbdbd 0%, #9e9e9e 100%)"; // pending

  return `
    <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
      <span style="font-size: 12px; font-weight: 700; color: white; min-width: 32px; background: ${progressGradient}; padding: 2px 8px; border-radius: 12px; text-align: center;">${progress}%</span>
      <span style="font-size: 12px; color: #666;">${current}/${total}</span>
    </div>
  `;
}

// Render production grid view from data
function renderGridView() {
  const tableSection = document.querySelector(".table-section");

  tableSection.innerHTML =
    `
    <div class="grid-container">
      ${productionOrders
        .map(
          (order) => `
        <div class="grid-card">
          <div class="grid-card-top">
            <a href="/production-order/${order.ProductionOrderId}" class="area-badge-link" target="_blank" title="Xem chi tiết Batch">
              <h3 style="color: #5b4ce8;" title="${order.ProductionOrderNumber || ""}">${getTruncatedName(
                order.ProductionOrderNumber || "",
                30,
              )}</h3>
            </a>
            <span class="status-badge status-${getStatusType(
              order.Status,
            )}">${getStatusIcon(getStatusType(order.Status))}${getStatusText(
              order.Status,
            )}</span>
          </div>
          
          <div class="grid-card-body">
            <div class="grid-item">
              <div>Product Code: <span class="grid-label">${
                order.ProductCode || "N/A"
              }</span></div>
              <div class="grid-value">${order.Quantity || 0} ${
                order.UnitOfMeasurement || ""
              }</div>
            </div>
            
            <div class="grid-section">
              <div class="grid-section-label">CÔNG THỨC</div>
              <div class="grid-section-content">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="red"
                >
                    <path d="M15 2a1 1 0 0 1 0 2v4.826l3.932 10.814l.034 .077a1.7 1.7 0 0 1 -.002 1.193l-.07 .162a1.7 1.7 0 0 1 -1.213 .911l-.181 .017h-11l-.181 -.017a1.7 1.7 0 0 1 -1.285 -2.266l.039 -.09l3.927 -10.804v-4.823a1 1 0 1 1 0 -2h6zm-2 2h-2v4h2v-4z" />
                </svg>
                <span class="recipe-badge">${order.RecipeCode || "N/A"}</span>
                <span class="recipe-tag">${order.RecipeVersion || ""}</span>
              </div>
            </div>

            <div class="grid-section">
              <div class="grid-section-label">LÔ SX</div>
              <div class="grid-section-value">${
                order.LotNumber || "0 / 0"
              }</div>
            </div>

            <div class="grid-section">
              <div class="grid-section-label">Process Area</div>
              <div class="grid-section-value">${order.ProcessArea || "N/A"}</div>
            </div>

            <div class="grid-section">
              <div class="grid-section-label">Batch hiện tại</div>
              <div class="grid-section-value">${
                order.CurrentBatch !== null && order.CurrentBatch !== undefined
                  ? order.CurrentBatch
                  : "N/A"
              }</div>
            </div>

            <div class="grid-section">
              <div class="grid-section-label">LỊCH TRÌNH</div>
              <div class="grid-schedule">
                <span class="schedule-start">${
                  formatDate(order.PlannedStart) || "N/A"
                }</span>
                <span class="schedule-end">Hạn: ${
                  formatDate(order.PlannedEnd) || "N/A"
                }</span>
              </div>
            </div>

            <div class="grid-section">
              <div class="grid-section-label">TIẾN ĐỘ</div>
              <div class="grid-progress">
                <div class="progress-bar" style="width: ${Math.round(
                  ((parseInt(order.CurrentBatch) || 0) /
                    (parseInt(order.TotalBatches) || 1)) *
                    100,
                )}%"></div>
              </div>
              <div class="progress-text">${Math.round(
                ((parseInt(order.CurrentBatch) || 0) /
                  (parseInt(order.TotalBatches) || 1)) *
                  100,
              )}%</div>
            </div>
          </div>

          <div class="grid-card-footer">
            <button class="action-btn-grid-primary">Xem Chi tiết</button>
          </div>
        </div>
      `,
        )
        .join("")}
    </div>
  ` + getPaginationHTML();

  // Re-attach event listeners
  updatePaginationControls();

  // Attach event listeners for grid action buttons
  const gridActionBtns = document.querySelectorAll(".action-btn-grid-primary");
  gridActionBtns.forEach((btn) => {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      const card = this.closest(".grid-card");
      const orderNum = card.querySelector("h3").textContent;
      viewOrder(orderNum);
    });
  });
}

// Render production table from data
function renderProductionTable() {
  const tbody = document.querySelector(".data-table tbody");
  if (!tbody) return;

  tbody.innerHTML = productionOrders
    .map(
      (order) => `
    <tr>
      <td>
        <a href="/production-order/${order.ProductionOrderId}" class="area-badge-link" target="_blank" title="Xem chi tiết Batch">
          <div class="area-badge">
            <div>${order.ProductionOrderNumber}</div>
          </div>
        </a>
      </td>
      <td>${getTruncatedName(order.ProductCode || "")}</td>
      <td style="text-align: center">
        <span class="badge-number">${order.ProductionLine}</span>
      </td>
      <td>${order.RecipeCode}</td>
      <td>${order.LotNumber || "N/A"}</td>
      <td style="text-align: center">${order.ProcessArea || "N/A"}</td>
      <td style="text-align: center">
        <div style="display: flex; align-items: center; justify-content: center;">
          ${formatDate(order.PlannedStart) || "N/A"}
        </div>
        ${order.Quantity || 0} ${order.UnitOfMeasurement || ""}
      </td>
      <td style="text-align: center">
        ${order.CurrentBatch !== null && order.CurrentBatch !== undefined ? order.CurrentBatch : "N/A"}
      </td>
      <td>
        ${renderProgressBar(
          order.CurrentBatch,
          order.TotalBatches,
          getProgressStatus(order.Status),
        )}
      </td>
      <td style="text-align: center">
        <span class="status-badge status-${getStatusType(
          order.Status,
        )}">${getStatusIcon(getStatusType(order.Status))}${getStatusText(
          order.Status,
        )}</span>
      </td>
      <td style="text-align: center">
        <div style="display: flex; gap: 8px; align-items: center; justify-content: center;">
          <button class="action-view-btn" title="Xem chi tiết">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 4c4.29 0 7.863 2.429 10.665 7.154l.22 .379l.045 .1l.03 .083l.014 .055l.014 .082l.011 .1v.11l-.014 .111a.992 .992 0 0 1 -.026 .11l-.039 .108l-.036 .075l-.016 .03c-2.764 4.836 -6.3 7.38 -10.555 7.499l-.313 .004c-4.396 0 -8.037 -2.549 -10.868 -7.504a1 1 0 0 1 0 -.992c2.831 -4.955 6.472 -7.504 10.868 -7.504zm0 5a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `,
    )
    .join("");

  // Re-attach event listeners after rendering
  setTimeout(() => {
    const viewBtns = document.querySelectorAll(".action-view-btn");

    viewBtns.forEach((btn) => {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        const row = this.closest("tr");
        const orderNumber =
          row.querySelector(".area-badge div")?.textContent || "Unknown";
        viewOrder(orderNumber);
      });
    });
  }, 0);
}

// Initialize search functionality
function initializeSearch() {
  const searchInput = document.getElementById("searchInput");
  const dateFromInput = document.getElementById("dateFrom");
  const dateToInput = document.getElementById("dateTo");
  const resetFilterBtn = document.getElementById("resetFilterBtn");

  // Debounce timer
  let debounceTimer;

  const handleFilterChange = async () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      currentPage = 1; // Reset to first page when filter changes
      await fetchProductionOrders(currentPage);

      // Check current view and render accordingly
      const activeViewBtn = document.querySelector(".view-btn.active");
      if (activeViewBtn && activeViewBtn.getAttribute("data-view") === "grid") {
        renderGridView();
      } else {
        renderProductionTable();
      }
      updatePaginationControls();
    }, 300);
  };

  if (searchInput) {
    searchInput.addEventListener("input", handleFilterChange);
  }

  if (dateFromInput) {
    dateFromInput.addEventListener("change", handleFilterChange);
  }

  if (dateToInput) {
    dateToInput.addEventListener("change", handleFilterChange);
  }

  if (resetFilterBtn) {
    resetFilterBtn.addEventListener("click", async () => {
      // Clear all filter inputs
      if (searchInput) searchInput.value = "";
      if (dateFromInput) dateFromInput.value = "";
      if (dateToInput) dateToInput.value = "";

      // Reset to page 1 and fetch
      currentPage = 1;
      await fetchProductionOrders(currentPage);

      // Check current view and render accordingly
      const activeViewBtn = document.querySelector(".view-btn.active");
      if (activeViewBtn && activeViewBtn.getAttribute("data-view") === "grid") {
        renderGridView();
      } else {
        renderProductionTable();
      }
      updatePaginationControls();
    });
  }
}

// Fetch statistics from dedicated stats endpoint
async function fetchStats() {
  try {
    const response = await fetch(`${API_ROUTE}/api/production-orders/stats`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      statsData = data.stats || {};
      updateStats();
    } else {
      console.error("Failed to fetch stats:", response.status);
    }
  } catch (error) {
    console.error("Error fetching stats:", error);
  }
}

function updateStats() {
  // Use stats from API response (all production orders)
  const totalPO = statsData.total || totalRecords;
  const inProgress = statsData.inProgress || 0;
  const completed = statsData.completed || 0;
  const stopped = statsData.stopped || 0;

  document.getElementById("kvsx-stat").textContent = totalPO;
  document.getElementById("total-po-stat").textContent = inProgress;
  document.getElementById("in-progress-stat").textContent = completed;
  document.getElementById("stopped-stat").textContent = stopped;
}

// Optional: Add animation for stats numbers
function animateStats() {
  const statNumbers = document.querySelectorAll(".stat-number");
  statNumbers.forEach((stat) => {
    const target = parseInt(stat.textContent);
    let current = 0;
    const increment = target / 20;

    const counter = setInterval(() => {
      current += increment;
      if (current >= target) {
        stat.textContent = target;
        clearInterval(counter);
      } else {
        stat.textContent = Math.floor(current);
      }
    }, 50);
  });
}

window.searchFactory = {
  initializeEventListeners,
  initializeSearch,
  animateStats,
};

async function fetchProductionOrders(page = 1) {
  try {
    // Get filter values
    const searchQuery = document.getElementById("searchInput")?.value || "";
    const dateFrom = document.getElementById("dateFrom")?.value || "";
    const dateTo = document.getElementById("dateTo")?.value || "";

    // Determine which endpoint to use based on filters
    const hasFilters = searchQuery || dateFrom || dateTo;
    const endpoint = hasFilters
      ? "/api/production-orders/search"
      : "/api/production-orders";

    // Build query parameters
    const params = new URLSearchParams({
      page: page,
      limit: pageSize,
    });

    // Add cached total for pages > 1 to avoid expensive COUNT query
    if (page > 1 && totalRecords > 0) {
      params.append("total", totalRecords);
    }

    // Add filters only if using search endpoint
    if (hasFilters) {
      if (searchQuery) params.append("searchQuery", searchQuery);
      if (dateFrom) params.append("dateFrom", dateFrom);
      if (dateTo) params.append("dateTo", dateTo);
    }

    const response = await fetch(
      `${API_ROUTE}${endpoint}?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (response.ok) {
      const data = await response.json();
      productionOrders = data.data.map((po) => new ProductionOrder(po));
      totalRecords = data.total;
      totalPages = data.totalPages || Math.ceil(totalRecords / pageSize);
      currentPage = data.page;
      updatePaginationControls();
    } else {
      console.error("Failed to fetch production orders:", response.status);
      productionOrders = [];
    }
  } catch (error) {
    console.error("Error fetching production orders:", error);
    productionOrders = [];
  }
}

// Update pagination controls
// Get pagination HTML
function getPaginationHTML() {
  return `
    <!-- Pagination Controls -->
    <div class="pagination-controls">
      <button id="prevPageBtn" class="pagination-btn" onclick="prevPage()">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      <span id="pageInfo" class="page-info">Trang 1 / 1</span>
      <button id="nextPageBtn" class="pagination-btn" onclick="nextPage()">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>
  `;
}

function updatePaginationControls() {
  const prevBtn = document.getElementById("prevPageBtn");
  const nextBtn = document.getElementById("nextPageBtn");
  const pageInfo = document.getElementById("pageInfo");

  if (prevBtn) {
    prevBtn.disabled = currentPage === 1;
  }
  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages;
  }
  if (pageInfo) {
    pageInfo.textContent = `Trang ${currentPage} / ${totalPages} (Tổng: ${totalRecords} bản ghi)`;
  }
}

// Go to previous page
async function prevPage() {
  if (currentPage > 1) {
    await fetchProductionOrders(currentPage - 1);

    // Check current view mode and render accordingly
    const activeViewBtn = document.querySelector(".view-btn.active");
    if (activeViewBtn && activeViewBtn.getAttribute("data-view") === "grid") {
      renderGridView();
    } else {
      renderProductionTable();
    }
  }
}

// Go to next page
async function nextPage() {
  const pageSize = 20;
  const totalPages = Math.ceil(totalRecords / pageSize);
  if (currentPage < totalPages) {
    await fetchProductionOrders(currentPage + 1);

    // Check current view mode and render accordingly
    const activeViewBtn = document.querySelector(".view-btn.active");
    if (activeViewBtn && activeViewBtn.getAttribute("data-view") === "grid") {
      renderGridView();
    } else {
      renderProductionTable();
    }
  }
}

// Expose to global scope for onclick handlers
window.prevPage = prevPage;
window.nextPage = nextPage;

// Modal functions
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("show");
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("show");
  }
}

// Initialize modal event handlers
function initializeModalHandlers() {
  // Close buttons with data-close attribute
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      const modalId = this.getAttribute("data-close");
      closeModal(modalId);
    });
  });

  // Close modal when clicking outside
  window.addEventListener("click", function (event) {
    if (event.target.classList.contains("modal")) {
      event.target.classList.remove("show");
    }
  });
}

// View Production Order
function viewOrder(orderNumber) {
  const order = productionOrders.find(
    (o) => o.ProductionOrderNumber === orderNumber,
  );
  if (!order) return;

  document.getElementById("viewOrderNumber").textContent =
    order.ProductionOrderNumber || "-";
  document.getElementById("viewProductCode").textContent =
    order.ProductCode || "-";
  document.getElementById("viewProductionLine").textContent =
    order.ProductionLine || "-";
  document.getElementById("viewRecipeCode").textContent =
    order.RecipeCode || "-";
  document.getElementById("viewRecipeVersion").textContent =
    order.RecipeVersion || "-";
  document.getElementById("viewLotNumber").textContent = order.LotNumber || "-";
  document.getElementById("viewQuantity").textContent = order.Quantity || "-";
  document.getElementById("viewUnitOfMeasurement").textContent =
    order.UnitOfMeasurement || "-";
  document.getElementById("viewPlannedStart").textContent =
    formatDate(order.PlannedStart) || "-";
  document.getElementById("viewPlannedEnd").textContent =
    formatDate(order.PlannedEnd) || "-";
  document.getElementById("viewShift").textContent = order.Shift || "-";
  document.getElementById("viewCurrentBatch").textContent =
    `${order.CurrentBatch || 0}/${order.TotalBatches || 0}`;
  const progress = Math.round(
    ((parseInt(order.CurrentBatch) || 0) /
      (parseInt(order.TotalBatches) || 1)) *
      100,
  );
  document.getElementById("viewProgress").textContent = progress + "%";
  document.getElementById("viewStatus").textContent =
    getStatusText(order.Status) || "-";
  document.getElementById("viewPlant").textContent = order.Plant || "-";
  document.getElementById("viewShopfloor").textContent = order.Shopfloor || "-";

  openModal("viewModal");
}
