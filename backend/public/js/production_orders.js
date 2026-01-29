import { ProductionOrder } from "./models/ProductionOrder.js";

const API_ROUTE = window.location.origin;

let productionOrders = [];
let currentPage = 1;
let totalRecords = 0;
let totalPages = 1;
let statsData = {};
const pageSize = 20;
let allProcessAreas = []; // Store all unique process areas for filter dropdown

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

  // if (dateFromInput && !dateFromInput.value) {
  //   dateFromInput.value = yesterday.toISOString().split("T")[0];
  // }
  // if (dateToInput && !dateToInput.value) {
  //   dateToInput.value = tomorrow.toISOString().split("T")[0];
  // }

  // Restore state if returning from detail page
  const savedState = sessionStorage.getItem("poListState");
  if (savedState) {
    try {
      const state = JSON.parse(savedState);
      // Restore filters
      if (state.searchQuery && document.getElementById("searchInput")) {
        document.getElementById("searchInput").value = state.searchQuery;
      }
      if (state.dateFrom && dateFromInput) {
        dateFromInput.value = state.dateFrom;
      }
      if (state.dateTo && dateToInput) {
        dateToInput.value = state.dateTo;
      }

      // Clear the saved state after restoring
      sessionStorage.removeItem("poListState");

      await fetchStats();
      await fetchProductionOrders(state.currentPage || 1);

      // Initialize dropdown first to create checkboxes
      initializeProcessAreaDropdown();
      initializeStatusDropdown();

      // Restore process area selections after dropdown is initialized
      if (state.selectedProcessAreas && state.selectedProcessAreas.length > 0) {
        setTimeout(() => {
          state.selectedProcessAreas.forEach((area) => {
            const checkbox = document.querySelector(
              `.process-area-checkbox[value="${area}"]`,
            );
            if (checkbox) checkbox.checked = true;
          });
          updateProcessAreaSelectedText();
          updateSelectAllState();
        }, 100);
      }

      // Render view after state is restored
      renderProductionTable();
    } catch (e) {
      console.error("Error restoring state:", e);
      sessionStorage.removeItem("poListState");
      await fetchStats();
      await fetchProductionOrders(1);
      renderProductionTable();
      initializeProcessAreaDropdown();
    }
  } else {
    await fetchStats();
    await fetchProductionOrders(1);
    renderProductionTable();
    initializeProcessAreaDropdown();
    initializeStatusDropdown();
  }

  initializeEventListeners();
  initializeSearch();
  initializeModalHandlers();
  populateStatusOptions();
});

// Populate status filter options
function populateStatusOptions() {
  const optionsContainer = document.getElementById("statusOptions");
  if (!optionsContainer) return;

  // Danh sách trạng thái cố định
  const statusList = [
    { value: "Đang chạy", label: "Đang chạy" },
    { value: "Đang chờ", label: "Đang chờ" },
    { value: "Hoàn thành", label: "Hoàn thành" },
  ];

  optionsContainer.innerHTML = "";
  statusList.forEach((status) => {
    const label = document.createElement("label");
    label.style.cssText =
      "display: flex; align-items: center; gap: 8px; padding: 6px 8px; cursor: pointer; border-radius: 4px;";
    label.onmouseover = function () {
      this.style.background = "#f5f5f5";
    };
    label.onmouseout = function () {
      this.style.background = "transparent";
    };

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "status-checkbox";
    checkbox.value = status.value;
    checkbox.style.cursor = "pointer";
    checkbox.onchange = handleStatusCheckboxChange;

    const span = document.createElement("span");
    span.textContent = status.label;

    label.appendChild(checkbox);
    label.appendChild(span);
    optionsContainer.appendChild(label);
  });

  // Initialize select all functionality for status after rendering options
  initializeStatusSelectAll();
  updateStatusSelectedText();
  updateStatusSelectAllState();
}
// Handle checkbox change for status
async function handleStatusCheckboxChange() {
  updateStatusSelectedText();
  updateStatusSelectAllState();

  // Reset to page 1 and fetch from API
  currentPage = 1;
  await fetchStats();
  await fetchProductionOrders(currentPage);

  // Check current view and render accordingly
  const activeViewBtn = document.querySelector(".view-btn.active");
  if (activeViewBtn && activeViewBtn.getAttribute("data-view") === "grid") {
    renderGridView();
  } else {
    renderProductionTable();
  }
  updatePaginationControls();
}

// Update selected text display for status
function updateStatusSelectedText() {
  const checkboxes = document.querySelectorAll(".status-checkbox");
  const selectedText = document.getElementById("statusSelectedText");
  if (!selectedText) return;

  const selected = Array.from(checkboxes)
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);

  if (selected.length === 0) {
    selectedText.textContent = "Select statuses...";
    selectedText.style.color = "#999";
  } else if (selected.length <= 2) {
    selectedText.textContent = selected.join(", ");
    selectedText.style.color = "#333";
  } else {
    selectedText.textContent = `${selected.length} selected`;
    selectedText.style.color = "#333";
  }
}

// Initialize select all functionality for status
function initializeStatusSelectAll() {
  const selectAllCheckbox = document.getElementById("statusSelectAll");
  if (!selectAllCheckbox) return;

  selectAllCheckbox.addEventListener("change", async function () {
    const checkboxes = document.querySelectorAll(".status-checkbox");
    checkboxes.forEach((cb) => {
      cb.checked = this.checked;
    });
    updateStatusSelectedText();
    updateStatusSelectAllState();

    // Reset to page 1 and fetch from API
    currentPage = 1;
    await fetchStats();
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

// Update select all state for both process area and status
function updateStatusSelectAllState() {
  const selectAllStatusCheckbox = document.getElementById("statusSelectAll");
  const statusCheckboxes = document.querySelectorAll(".status-checkbox");
  if (!selectAllStatusCheckbox || statusCheckboxes.length === 0) return;
  const allChecked = Array.from(statusCheckboxes).every((cb) => cb.checked);
  const someChecked = Array.from(statusCheckboxes).some((cb) => cb.checked);
  selectAllStatusCheckbox.checked = allChecked;
  selectAllStatusCheckbox.indeterminate = someChecked && !allChecked;
}

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
    pending: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white" style="flex-shrink: 0;">
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
        return "pending"; // Failed/Error
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
  if (
    text.includes("failed") ||
    text.includes("pending") ||
    text.includes("lỗi")
  )
    return "pending";
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
          ? "linear-gradient(90deg, #389cf7 0%, #389cf9 100%)"
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
            <a href="/production-order/${order.ProductionOrderId}" class="area-badge-link" title="Xem chi tiết Batch" onclick="saveCurrentState()">
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

// Save current state before navigating to detail page
function saveCurrentState() {
  const state = {
    currentPage: currentPage,
    searchQuery: document.getElementById("searchInput")?.value || "",
    dateFrom: document.getElementById("dateFrom")?.value || "",
    dateTo: document.getElementById("dateTo")?.value || "",
    selectedProcessAreas: getSelectedProcessAreas(),
  };
  sessionStorage.setItem("poListState", JSON.stringify(state));
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
        <a href="/production-order/${order.ProductionOrderId}" class="area-badge-link" title="Xem chi tiết Batch" onclick="saveCurrentState()">
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
      await fetchStats();
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

      // Clear process area checkboxes
      const checkboxes = document.querySelectorAll(".process-area-checkbox");
      checkboxes.forEach((cb) => (cb.checked = false));
      const selectAll = document.getElementById("processAreaSelectAll");
      if (selectAll) selectAll.checked = false;
      updateProcessAreaSelectedText();

      // Reset to page 1 and fetch
      currentPage = 1;
      await fetchStats();
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

// Fetch statistics from dedicated stats endpoint, now supports filters
async function fetchStats() {
  const searchQuery = document.getElementById("searchInput")?.value || "";
  const dateFrom = document.getElementById("dateFrom")?.value || "";
  const dateTo = document.getElementById("dateTo")?.value || "";
  const selectedProcessAreas = getSelectedProcessAreas();
  const selectedStatuses = getSelectedStatuses();

  const hasFilters =
    searchQuery ||
    dateFrom ||
    dateTo ||
    selectedProcessAreas.length > 0 ||
    selectedStatuses.length > 0;
  const endpoint = hasFilters
    ? "/api/production-orders/stats/search"
    : "/api/production-orders/stats";

  try {
    // Build query params from filters
    const params = new URLSearchParams();
    if (hasFilters) {
      if (searchQuery) params.append("searchQuery", searchQuery);
      if (dateFrom) params.append("dateFrom", dateFrom);
      if (dateTo) params.append("dateTo", dateTo);
      if (selectedProcessAreas.length > 0) {
        params.append("processAreas", selectedProcessAreas.join(","));
      }
      if (selectedStatuses.length > 0) {
        params.append("statuses", selectedStatuses.join(","));
      }
    }
    const url = `${API_ROUTE}${endpoint}?${params.toString()}`;
    const response = await fetch(url, {
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

// Populate process areas dropdown from stored list
function populateProcessAreas() {
  const optionsContainer = document.getElementById("processAreaOptions");
  if (!optionsContainer) return;

  // Use stored allProcessAreas instead of current productionOrders
  // This ensures dropdown options don't change when filtering
  const sortedAreas = [...allProcessAreas].sort();

  // Clear existing options
  optionsContainer.innerHTML = "";

  // Add checkbox options
  sortedAreas.forEach((area) => {
    const label = document.createElement("label");
    label.style.cssText =
      "display: flex; align-items: center; gap: 8px; padding: 6px 8px; cursor: pointer; border-radius: 4px;";
    label.onmouseover = function () {
      this.style.background = "#f5f5f5";
    };
    label.onmouseout = function () {
      this.style.background = "transparent";
    };

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "process-area-checkbox";
    checkbox.value = area;
    checkbox.style.cursor = "pointer";
    checkbox.onchange = handleProcessAreaCheckboxChange;

    const span = document.createElement("span");
    span.textContent = area;

    label.appendChild(checkbox);
    label.appendChild(span);
    optionsContainer.appendChild(label);
  });

  // Initialize select all functionality
  initializeProcessAreaSelectAll();
}

// Initialize custom multi-select dropdown
function initializeProcessAreaDropdown() {
  const input = document.getElementById("processAreaInput");
  const dropdown = document.getElementById("processAreaDropdown");

  if (!input || !dropdown) return;

  // Toggle dropdown on click
  input.addEventListener("click", (e) => {
    e.stopPropagation();
    const isVisible = dropdown.style.display === "block";
    dropdown.style.display = isVisible ? "none" : "block";
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".custom-multiselect")) {
      dropdown.style.display = "none";
    }
  });

  // Prevent dropdown from closing when clicking inside
  dropdown.addEventListener("click", (e) => {
    e.stopPropagation();
  });
}

// Initialize status dropdown
function initializeStatusDropdown() {
  const input = document.getElementById("statusInput");
  const dropdown = document.getElementById("statusDropdown");

  if (!input || !dropdown) return;

  // Toggle dropdown on click
  input.addEventListener("click", (e) => {
    e.stopPropagation();
    const isVisible = dropdown.style.display === "block";
    dropdown.style.display = isVisible ? "none" : "block";
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".custom-multiselect")) {
      dropdown.style.display = "none";
    }
  });

  // Prevent dropdown from closing when clicking inside
  dropdown.addEventListener("click", (e) => {
    e.stopPropagation();
  });
}

// Handle checkbox change for process areas
async function handleProcessAreaCheckboxChange() {
  updateProcessAreaSelectedText();
  updateSelectAllState();

  // Reset to page 1 and fetch from API
  currentPage = 1;
  await fetchStats();
  await fetchProductionOrders(currentPage);

  // Check current view and render accordingly
  const activeViewBtn = document.querySelector(".view-btn.active");
  if (activeViewBtn && activeViewBtn.getAttribute("data-view") === "grid") {
    renderGridView();
  } else {
    renderProductionTable();
  }
  updatePaginationControls();
}

// Update selected text display
function updateProcessAreaSelectedText() {
  const checkboxes = document.querySelectorAll(".process-area-checkbox");
  const selectedText = document.getElementById("processAreaSelectedText");
  if (!selectedText) return;

  const selected = Array.from(checkboxes)
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);

  if (selected.length === 0) {
    selectedText.textContent = "Select process areas...";
    selectedText.style.color = "#999";
  } else if (selected.length <= 2) {
    selectedText.textContent = selected.join(", ");
    selectedText.style.color = "#333";
  } else {
    selectedText.textContent = `${selected.length} selected`;
    selectedText.style.color = "#333";
  }
}

// Initialize select all functionality
function initializeProcessAreaSelectAll() {
  const selectAllCheckbox = document.getElementById("processAreaSelectAll");
  if (!selectAllCheckbox) return;

  selectAllCheckbox.addEventListener("change", async function () {
    const checkboxes = document.querySelectorAll(".process-area-checkbox");
    checkboxes.forEach((cb) => {
      cb.checked = this.checked;
    });
    updateProcessAreaSelectedText();

    // Reset to page 1 and fetch from API
    currentPage = 1;
    await fetchStats();
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

// Update select all state based on individual checkboxes
function updateSelectAllState() {
  const selectAllProcessAreaCheckbox = document.getElementById(
    "processAreaSelectAll",
  );
  const processAreaCheckboxes = document.querySelectorAll(
    ".process-area-checkbox",
  );
  const selectAllStatusCheckbox = document.getElementById("statusSelectAll");
  const statusCheckboxes = document.querySelectorAll(".status-checkbox");

  if (selectAllProcessAreaCheckbox || processAreaCcheckboxes.length !== 0) {
    const allChecked = Array.from(processAreaCheckboxes).every(
      (cb) => cb.checked,
    );
    const someChecked = Array.from(processAreaCheckboxes).some(
      (cb) => cb.checked,
    );

    selectAllProcessAreaCheckbox.checked = allChecked;
    selectAllProcessAreaCheckbox.indeterminate = someChecked && !allChecked;
  }
  if (selectAllStatusCheckbox || statusCheckboxes.length !== 0) {
    const allChecked = Array.from(statusCheckboxes).every((cb) => cb.checked);
    const someChecked = Array.from(statusCheckboxes).some((cb) => cb.checked);

    selectAllStatusCheckbox.checked = allChecked;
    selectAllStatusCheckbox.indeterminate = someChecked && !allChecked;
  }
}

// Get selected process areas
function getSelectedProcessAreas() {
  const checkboxes = document.querySelectorAll(
    ".process-area-checkbox:checked",
  );
  return Array.from(checkboxes).map((cb) => cb.value);
}

// Lấy danh sách status đã chọn
function getSelectedStatuses() {
  const checkboxes = document.querySelectorAll(".status-checkbox:checked");
  return Array.from(checkboxes).map((cb) => cb.value);
}

async function fetchProductionOrders(page = 1) {
  try {
    // Get filter values
    const searchQuery = document.getElementById("searchInput")?.value || "";
    const dateFrom = document.getElementById("dateFrom")?.value || "";
    const dateTo = document.getElementById("dateTo")?.value || "";
    const selectedProcessAreas = getSelectedProcessAreas();
    const selectedStatuses = getSelectedStatuses();

    // Determine which endpoint to use based on filters
    const hasFilters =
      searchQuery ||
      dateFrom ||
      dateTo ||
      selectedProcessAreas.length > 0 ||
      selectedStatuses.length > 0;
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
      if (selectedProcessAreas.length > 0) {
        params.append("processAreas", selectedProcessAreas.join(","));
      }
      if (selectedStatuses.length > 0) {
        params.append("statuses", selectedStatuses.join(","));
      }
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

      // Store all unique process areas on first load (no filters)
      if (page === 1 && !hasFilters && allProcessAreas.length === 0) {
        const processAreasSet = new Set();
        productionOrders.forEach((order) => {
          if (order.ProcessArea && order.ProcessArea.trim() !== "") {
            processAreasSet.add(order.ProcessArea);
          }
        });
        allProcessAreas = Array.from(processAreasSet);
        populateProcessAreas();
      }

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
window.saveCurrentState = saveCurrentState;

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
