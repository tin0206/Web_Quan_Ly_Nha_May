import { ProductionOrder } from "./models/ProductionOrder.js";

const API_ROUTE = "http://localhost:3000/api";

let productionOrders = [];
let currentEditingOrder = null;
let currentDeleteRow = null;

document.addEventListener("DOMContentLoaded", async function () {
  await fetchProductionOrders();
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

  // Create button
  const createBtn = document.querySelector(".create-btn");
  if (createBtn) {
    createBtn.addEventListener("click", () => {
      openModal("createModal");
      // Reset form
      document.getElementById("createForm").reset();
      // Set default PlannedStart to current datetime
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const datetimeLocal = `${year}-${month}-${day}T${hours}:${minutes}`;
      document.getElementById("createPlannedStart").value = datetimeLocal;
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
        tableSection.innerHTML = `
          <table class="data-table">
            <thead>
              <tr>
                <th>Mã Lệnh SX</th>
                <th>Sản Phẩm</th>
                <th style="text-align: center">Dây chuyền</th>
                <th>Công thức</th>
                <th>Lô SX</th>
                <th style="text-align: center">Ngày Bắt Đầu</th>
                <th style="text-align: center">Số Lượng</th>
                <th style="text-align: center">Tiến độ</th>
                <th style="text-align: center">Trạng Thái</th>
                <th style="text-align: center">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              <!-- Rows will be rendered by JavaScript -->
            </tbody>
          </table>
        `;
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
      <path d="M12 1.67c.955 0 1.845 .467 2.39 1.247l.105 .16l8.114 13.548a2.914 2.914 0 0 1 -2.307 4.363l-.195 .008h-16.225a2.914 2.914 0 0 1 -2.582 -4.2l.099 -.185l8.11 -13.538a2.914 2.914 0 0 1 2.491 -1.403zm.01 13.33l-.127 .007a1 1 0 0 0 0 1.986l.117 .007l.127 -.007a1 1 0 0 0 0 -1.986l-.117 -.007zm-.01 -7a1 1 0 0 0 -.993 .883l-.007 .117v4l.007 .117a1 1 0 0 0 1.986 0l.007 -.117v-4l-.007 -.117a1 1 0 0 0 -.993 -.883z" />
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

// Get progress status text from ProgressStatus or Status
function getProgressStatusForEdit(order) {
  if (order.ProgressStatus) {
    return order.ProgressStatus; // Use ProgressStatus if available
  }
  // Fallback: map Status numeric to ProgressStatus text
  switch (order.Status) {
    case 0:
      return "cancelled"; // Error
    case 1:
      return "running"; // Đang chạy
    case 2:
      return "completing"; // Hoàn thành
    case -1:
      return "pending"; // Chờ xử lý
    default:
      return "pending";
  }
}

// Convert ProgressStatus text to Status numeric
function getStatusFromProgressStatus(progressStatus) {
  switch (progressStatus) {
    case "running":
      return 1;
    case "completing":
      return 2;
    case "cancelled":
      return 0;
    case "pending":
      return -1;
    default:
      return 1;
  }
}

// Render progress bar HTML
function renderProgressBar(progress, progressStatus) {
  const bgGradient =
    progressStatus === "running"
      ? "linear-gradient(90deg, #ffd89b 0%, #f9ab6e 100%)"
      : progressStatus === "stop"
      ? "linear-gradient(90deg, #e0e0e0 0%, #d0d0d0 100%)"
      : progressStatus === "cancelled"
      ? "linear-gradient(90deg, #f48080 0%, #e85555 100%)"
      : progressStatus === "completing"
      ? "linear-gradient(90deg, #6dd4b5 0%, #48a68a 100%)"
      : "linear-gradient(90deg, #e0e0e0 0%, #d0d0d0 100%)"; // pending

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
    </div>
  `;
}

// Render production grid view from data
function renderGridView() {
  const tableSection = document.querySelector(".table-section");

  tableSection.innerHTML = `
    <div class="grid-container">
      ${productionOrders
        .map(
          (order) => `
        <div class="grid-card">
          <div class="grid-card-top">
            <h3 title="${order.ProductionOrderNumber || ""}">${getTruncatedName(
            order.ProductionOrderNumber || "",
            30
          )}</h3>
            <span class="status-badge status-${getStatusType(
              order.Status
            )}">${getStatusIcon(getStatusType(order.Status))}${getStatusText(
            order.Status
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
                <div class="progress-bar" style="width: 0%"></div>
              </div>
              <div class="progress-text">0%</div>
            </div>
          </div>

          <div class="grid-card-footer">
            <button class="action-btn-grid-primary">Xem Chi tiết</button>
            <div class="grid-card-actions">
              <button class="action-edit-btn-grid" title="Chỉnh sửa">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
                  <path d="M13.5 6.5l4 4" />
                </svg>
              </button>
              <button class="action-delete-btn-grid" title="Xóa">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 6a1 1 0 0 1 .117 1.993l-.117 .007h-.081l-.919 11a3 3 0 0 1 -2.824 2.995l-.176 .005h-8c-1.598 0 -2.904 -1.249 -2.992 -2.75l-.005 -.167l-.923 -11.083h-.08a1 1 0 0 1 -.117 -1.993l.117 -.007h16z" />
                  <path d="M14 2a2 2 0 0 1 2 2a1 1 0 0 1 -1.993 .117l-.007 -.117h-4l-.007 .117a1 1 0 0 1 -1.993 -.117a2 2 0 0 1 1.85 -1.995l.15 -.005h4z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      `
        )
        .join("")}
    </div>
  `;

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

  const editBtns = document.querySelectorAll(".action-edit-btn-grid");
  editBtns.forEach((btn) => {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      const card = this.closest(".grid-card");
      const orderNum = card.querySelector("h3").textContent;
      editOrder(orderNum);
    });
  });

  const deleteBtns = document.querySelectorAll(".action-delete-btn-grid");
  deleteBtns.forEach((btn) => {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      const card = this.closest(".grid-card");
      const orderNum = card.querySelector("h3").textContent;
      currentDeleteRow = card;
      document.getElementById("deleteOrderName").textContent = orderNum;
      openModal("confirmDeleteModal");
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
        <div class="area-badge">
          <div>${order.ProductionOrderNumber}</div>
        </div>
      </td>
      <td>${getTruncatedName(order.ProductCode || "")}</td>
      <td style="text-align: center">
        <span class="badge-number">${order.ProductionLine}</span>
      </td>
      <td>${order.RecipeCode}</td>
      <td>${order.LotNumber || "N/A"}</td>
      <td style="text-align: center">
        <div style="display: flex; align-items: center; justify-content: center;">
            ${formatDate(order.PlannedStart) || "N/A"}
        </div>
      </td>
      <td style="text-align: center">${order.Quantity || 0} ${
        order.UnitOfMeasurement || ""
      }</td>
      <td>
        ${renderProgressBar(
          order.Progress || 0,
          getProgressStatus(order.Status)
        )}
      </td>
      <td style="text-align: center">
        <span class="status-badge status-${getStatusType(
          order.Status
        )}">${getStatusIcon(getStatusType(order.Status))}${getStatusText(
        order.Status
      )}</span>
      </td>
      <td style="text-align: center">
        <div style="display: flex; gap: 8px; align-items: center; justify-content: center;">
          <button class="action-view-btn" title="Xem chi tiết">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 4c4.29 0 7.863 2.429 10.665 7.154l.22 .379l.045 .1l.03 .083l.014 .055l.014 .082l.011 .1v.11l-.014 .111a.992 .992 0 0 1 -.026 .11l-.039 .108l-.036 .075l-.016 .03c-2.764 4.836 -6.3 7.38 -10.555 7.499l-.313 .004c-4.396 0 -8.037 -2.549 -10.868 -7.504a1 1 0 0 1 0 -.992c2.831 -4.955 6.472 -7.504 10.868 -7.504zm0 5a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z" />
            </svg>
          </button>
          <button class="action-edit-btn" title="Chỉnh sửa">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#007aff" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
              <path d="M13.5 6.5l4 4" />
            </svg>
          </button>
          <button class="action-delete-btn" title="Xóa">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 6a1 1 0 0 1 .117 1.993l-.117 .007h-.081l-.919 11a3 3 0 0 1 -2.824 2.995l-.176 .005h-8c-1.598 0 -2.904 -1.249 -2.992 -2.75l-.005 -.167l-.923 -11.083h-.08a1 1 0 0 1 -.117 -1.993l.117 -.007h16z" />
              <path d="M14 2a2 2 0 0 1 2 2a1 1 0 0 1 -1.993 .117l-.007 -.117h-4l-.007 .117a1 1 0 0 1 -1.993 -.117a2 2 0 0 1 1.85 -1.995l.15 -.005h4z" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `
    )
    .join("");

  // Re-attach event listeners after rendering
  setTimeout(() => {
    const viewBtns = document.querySelectorAll(".action-view-btn");
    const editBtns = document.querySelectorAll(".action-edit-btn");
    const deleteBtns = document.querySelectorAll(".action-delete-btn");

    viewBtns.forEach((btn) => {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        const row = this.closest("tr");
        const orderNumber =
          row.querySelector(".area-badge div")?.textContent || "Unknown";
        viewOrder(orderNumber);
      });
    });

    editBtns.forEach((btn) => {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        const row = this.closest("tr");
        const orderNumber =
          row.querySelector(".area-badge div")?.textContent || "Unknown";
        editOrder(orderNumber);
      });
    });

    deleteBtns.forEach((btn) => {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        const row = this.closest("tr");
        const orderNumber =
          row.querySelector(".area-badge div")?.textContent || "Unknown";
        currentDeleteRow = row;
        document.getElementById("deleteOrderName").textContent = orderNumber;
        openModal("confirmDeleteModal");
      });
    });
  }, 0);
}

// Initialize search functionality
function initializeSearch() {
  const searchInput = document.querySelector(".search-bar input");

  if (searchInput) {
    searchInput.addEventListener("keyup", function () {
      const searchTerm = this.value.toLowerCase();
      const viewBtns = document.querySelectorAll(".view-btn");
      const isListView = viewBtns[0].classList.contains("active");

      if (isListView) {
        // Search in table
        const tableRows = document.querySelectorAll(".data-table tbody tr");
        tableRows.forEach((row) => {
          const text = row.textContent.toLowerCase();
          if (text.includes(searchTerm)) {
            row.style.display = "";
          } else {
            row.style.display = "none";
          }
        });
      } else {
        // Search in grid
        const gridCards = document.querySelectorAll(".grid-card");
        gridCards.forEach((card) => {
          const text = card.textContent.toLowerCase();
          if (text.includes(searchTerm)) {
            card.style.display = "";
          } else {
            card.style.display = "none";
          }
        });
      }
    });
  }
}

// Update stats cards based on productionOrders
function updateStats() {
  const totalPO = productionOrders.length;
  const inProgress = productionOrders.filter((o) => o.Status === 1).length;
  const completed = productionOrders.filter((o) => o.Status === 2).length;
  const failed = productionOrders.filter((o) => o.Status === 0).length;

  document.getElementById("kvsx-stat").textContent = totalPO;
  document.getElementById("total-po-stat").textContent = inProgress;
  document.getElementById("in-progress-stat").textContent = completed;
  document.getElementById("completed-stat").textContent = failed;
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

// Initialize animations on page load
window.addEventListener("load", () => {
  // Uncomment to enable stats animation:
  // animateStats();
});

// Export functions for testing
window.searchFactory = {
  initializeEventListeners,
  initializeSearch,
  animateStats,
};

async function fetchProductionOrders() {
  try {
    const response = await fetch(`${API_ROUTE}/production-orders`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      productionOrders = data.data.map((po) => new ProductionOrder(po));
      console.log("Fetched production orders:", productionOrders);
    } else {
      console.error("Failed to fetch production orders:", response.status);
      productionOrders = [];
    }
  } catch (error) {
    console.error("Error fetching production orders:", error);
    productionOrders = [];
  }
}

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

  // Save Edit button
  const saveEditBtn = document.getElementById("saveEditBtn");
  if (saveEditBtn) {
    saveEditBtn.addEventListener("click", confirmEdit);
  }

  // Confirm Save button
  const confirmSaveBtn = document.getElementById("confirmSaveBtn");
  if (confirmSaveBtn) {
    confirmSaveBtn.addEventListener("click", saveEdit);
  }

  // Confirm Delete button
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", performDelete);
  }

  // Create Submit button
  const createSubmitBtn = document.getElementById("createSubmitBtn");
  if (createSubmitBtn) {
    createSubmitBtn.addEventListener("click", createNewOrder);
  }
}

// View Production Order
function viewOrder(orderNumber) {
  const order = productionOrders.find(
    (o) => o.ProductionOrderNumber === orderNumber
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
  document.getElementById("viewProgress").textContent =
    (order.Progress || 0) + "%";
  document.getElementById("viewStatus").textContent =
    getStatusText(order.Status) || "-";
  document.getElementById("viewPlant").textContent = order.Plant || "-";
  document.getElementById("viewShopfloor").textContent = order.Shopfloor || "-";

  openModal("viewModal");
}

// Edit Production Order
function editOrder(orderNumber) {
  const order = productionOrders.find(
    (o) => o.ProductionOrderNumber === orderNumber
  );
  if (!order) return;

  currentEditingOrder = order;

  document.getElementById("editOrderNumber").value =
    order.ProductionOrderNumber || "";
  document.getElementById("editProductCode").value = order.ProductCode || "";
  document.getElementById("editProductionLine").value =
    order.ProductionLine || "";
  document.getElementById("editRecipeCode").value = order.RecipeCode || "";
  document.getElementById("editRecipeVersion").value =
    order.RecipeVersion || "";
  document.getElementById("editLotNumber").value = order.LotNumber || "";
  document.getElementById("editQuantity").value = order.Quantity || "";
  document.getElementById("editUnitOfMeasurement").value =
    order.UnitOfMeasurement || "";
  // Format datetime for datetime-local input (YYYY-MM-DDTHH:mm)
  document.getElementById("editPlannedStart").value = formatDatetimeForInput(
    order.PlannedStart
  );
  document.getElementById("editPlannedEnd").value = formatDatetimeForInput(
    order.PlannedEnd
  );
  document.getElementById("editShift").value = order.Shift || "";
  document.getElementById("editProgress").value = order.Progress || 0;
  document.getElementById("editStatus").value = getProgressStatusForEdit(order);

  openModal("editModal");
}

// Format datetime for datetime-local input
function formatDatetimeForInput(datetimeString) {
  if (!datetimeString) return "";
  const date = new Date(datetimeString);
  if (isNaN(date.getTime())) return "";
  // Format: YYYY-MM-DDTHH:mm
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Confirm Edit
function confirmEdit() {
  if (!currentEditingOrder) return;
  openModal("confirmEditModal");
}

// Save Edit with API call
async function saveEdit() {
  if (!currentEditingOrder) return;

  // Get ProgressStatus value and convert to Status numeric
  const progressStatusValue =
    document.getElementById("editStatus").value || "pending";
  const statusNumeric = getStatusFromProgressStatus(progressStatusValue);

  const updateData = {
    ProductCode: document.getElementById("editProductCode").value,
    ProductionLine: document.getElementById("editProductionLine").value,
    RecipeCode: document.getElementById("editRecipeCode").value,
    RecipeVersion: document.getElementById("editRecipeVersion").value,
    LotNumber: document.getElementById("editLotNumber").value,
    Quantity: parseInt(document.getElementById("editQuantity").value) || 0,
    UnitOfMeasurement: document.getElementById("editUnitOfMeasurement").value,
    PlannedStart: document.getElementById("editPlannedStart").value,
    PlannedEnd: document.getElementById("editPlannedEnd").value,
    Shift: `Ca ${document.getElementById("editShift").value}`,
    Progress: parseInt(document.getElementById("editProgress").value) || 0,
    Status: statusNumeric,
  };

  try {
    const response = await fetch(
      `${API_ROUTE}/production-orders/${currentEditingOrder.ProductionOrderId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      }
    );

    if (response.ok) {
      // Update the order object with form values
      currentEditingOrder.ProductCode = updateData.ProductCode;
      currentEditingOrder.ProductionLine = updateData.ProductionLine;
      currentEditingOrder.RecipeCode = updateData.RecipeCode;
      currentEditingOrder.RecipeVersion = updateData.RecipeVersion;
      currentEditingOrder.LotNumber = updateData.LotNumber;
      currentEditingOrder.Quantity = updateData.Quantity;
      currentEditingOrder.UnitOfMeasurement = updateData.UnitOfMeasurement;
      currentEditingOrder.PlannedStart = updateData.PlannedStart;
      currentEditingOrder.PlannedEnd = updateData.PlannedEnd;
      currentEditingOrder.Shift = updateData.Shift;
      currentEditingOrder.Progress = updateData.Progress;
      // ProgressStatus is only for local display, don't update backend

      // Close modals
      closeModal("confirmEditModal");
      closeModal("editModal");

      // Refresh table
      renderProductionTable();

      // Optional: Show success message
      alert(
        `Cập nhật thành công lệnh sản xuất: ${currentEditingOrder.ProductionOrderNumber}`
      );
    } else {
      const error = await response.json();
      alert("Lỗi khi cập nhật lệnh sản xuất: " + error.message);
    }
  } catch (error) {
    console.error("Error updating order:", error);
    alert("Lỗi khi cập nhật lệnh sản xuất: " + error.message);
  }
}

// Perform Delete with API call
async function performDelete() {
  if (!currentDeleteRow) return;

  const orderNumber =
    currentDeleteRow.querySelector(".area-badge div")?.textContent ||
    currentDeleteRow.querySelector("h3")?.textContent ||
    "Unknown";

  // Get the order to find its ID
  const order = productionOrders.find(
    (o) => o.ProductionOrderNumber === orderNumber
  );

  if (!order) return;

  try {
    const response = await fetch(
      `${API_ROUTE}/production-orders/${order.ProductionOrderId}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.ok) {
      // Close modals
      closeModal("confirmDeleteModal");

      // Remove row/card
      currentDeleteRow.remove();
      currentDeleteRow = null;

      // Remove from productionOrders array
      productionOrders = productionOrders.filter(
        (o) => o.ProductionOrderId !== order.ProductionOrderId
      );

      // Refresh table
      renderProductionTable();

      // Update stats
      updateStats();

      // Show success message
      alert(`Đã xóa lệnh sản xuất: ${orderNumber}`);
    } else {
      alert("Lỗi khi xóa lệnh sản xuất");
    }
  } catch (error) {
    console.error("Error deleting order:", error);
    alert("Lỗi khi xóa lệnh sản xuất: " + error.message);
  }
}

// Create New Production Order with API call
async function createNewOrder() {
  const form = document.getElementById("createForm");
  if (!form) return;

  // Get form values
  const createData = {
    ProductionOrderNumber:
      document.getElementById("createOrderNumber").value || `PO-${Date.now()}`,
    ProductCode: document.getElementById("createProductCode").value,
    ProductionLine: document.getElementById("createProductionLine").value,
    RecipeCode: document.getElementById("createRecipeCode").value,
    RecipeVersion: document.getElementById("createRecipeVersion").value,
    LotNumber: document.getElementById("createLotNumber").value,
    Quantity: parseInt(document.getElementById("createQuantity").value) || 0,
    UnitOfMeasurement: document.getElementById("createUnitOfMeasurement").value,
    PlannedStart: document.getElementById("createPlannedStart").value,
    PlannedEnd: document.getElementById("createPlannedEnd").value,
    Shift: `Ca ${document.getElementById("createShift").value}`,
    Plant: document.getElementById("createPlant").value,
    Shopfloor: document.getElementById("createShopfloor").value,
    Status: 1, // Đang chạy
    Progress: 0,
  };

  try {
    const response = await fetch(`${API_ROUTE}/production-orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createData),
    });

    if (response.ok) {
      // Close modal
      closeModal("createModal");

      // Fetch latest data from API
      await fetchProductionOrders();

      // Update stats
      updateStats();

      // Refresh table
      renderProductionTable();

      // Show success message
      alert(
        `Tạo lệnh sản xuất mới thành công: ${createData.ProductionOrderNumber}`
      );
    } else {
      const error = await response.json();
      alert("Lỗi khi tạo lệnh sản xuất: " + error.message);
    }
  } catch (error) {
    console.error("Error creating order:", error);
    alert("Lỗi khi tạo lệnh sản xuất: " + error.message);
  }
}
