import { Recipe } from "../js/models/Recipes.js";

// const API_ROUTE = window.location.origin;
const API_ROUTE = "http://localhost:8001";

// Pagination/filter/search state
let filterStatus = ""; // legacy single status (kept for backward compatibility)
let selectedStatuses = [];
let filterSearch = "";
let currentPage = 1;
let pageSize = 20;
let totalPages = 1;
let totalRecipes = 0;
let currentRecipes = [];
const STATE_KEY = "recipesListState";

function saveRecipesState() {
  try {
    const state = {
      filterStatus,
      selectedStatuses,
      filterSearch,
      currentPage,
      currentRecipes,
      totalRecipes,
      totalPages,
    };
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (_) {}
}

function restoreRecipesState() {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw);
    if (state && typeof state === "object") {
      filterStatus = state.filterStatus || "";
      selectedStatuses = Array.isArray(state.selectedStatuses)
        ? state.selectedStatuses
        : [];
      filterSearch = state.filterSearch || "";
      currentPage = Math.max(1, parseInt(state.currentPage) || 1);
      if (
        Array.isArray(state.currentRecipes) &&
        state.currentRecipes.length > 0
      ) {
        currentRecipes = state.currentRecipes.map((item) => new Recipe(item));
        totalRecipes = state.totalRecipes || 0;
        totalPages = state.totalPages || 1;
      }
      return true;
    }
  } catch (_) {}
  return false;
}

function updatePaginationUI() {
  const pagination = document.getElementById("pagination");
  if (!pagination) return;
  if (totalPages <= 1) {
    pagination.innerHTML = "";
    return;
  }
  let html = "";
  html += `<button class="page-btn" ${currentPage === 1 ? "disabled" : ""} data-page="${currentPage - 1}">&laquo;</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 2) {
      html += `<button class="page-btn${i === currentPage ? " active" : ""}" data-page="${i}">${i}</button>`;
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += '<span class="page-ellipsis">...</span>';
    }
  }
  html += `<button class="page-btn" ${currentPage === totalPages ? "disabled" : ""} data-page="${currentPage + 1}">&raquo;</button>`;
  pagination.innerHTML = html;
  // Add event listeners
  const setPage = (page) => {
    currentPage = page;
    saveRecipesState();
    fetchAndDisplayRecipes();
    fetchAndDisplayRecipeStats();
  };
  pagination.querySelectorAll(".page-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const page = parseInt(btn.getAttribute("data-page"));
      if (
        !isNaN(page) &&
        page >= 1 &&
        page <= totalPages &&
        page !== currentPage
      ) {
        setPage(page);
      }
    });
  });
}

// ===================== Status Multiselect =====================
function populateStatusOptions() {
  const optionsContainer = document.getElementById("statusOptions");
  if (!optionsContainer) return;

  const statusList = [
    { value: "active", label: "Hoạt động" },
    { value: "inactive", label: "Ngừng hoạt động" },
  ];

  optionsContainer.innerHTML = "";
  statusList.forEach((status) => {
    const label = document.createElement("label");
    label.style.cssText =
      "display:flex; align-items:center; gap:8px; padding:6px 8px; cursor:pointer; border-radius:4px;";
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
    checkbox.checked = selectedStatuses.includes(status.value);

    const span = document.createElement("span");
    span.textContent = status.label;

    label.appendChild(checkbox);
    label.appendChild(span);
    optionsContainer.appendChild(label);
  });

  initializeStatusSelectAll();
  updateStatusSelectedText();
  updateStatusSelectAllState();
}

function initializeStatusDropdown() {
  const input = document.getElementById("statusInput");
  const dropdown = document.getElementById("statusDropdown");
  if (!input || !dropdown) return;
  input.addEventListener("click", (e) => {
    e.stopPropagation();
    const isVisible = dropdown.style.display === "block";
    dropdown.style.display = isVisible ? "none" : "block";
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".custom-multiselect")) {
      dropdown.style.display = "none";
    }
  });
  dropdown.addEventListener("click", (e) => e.stopPropagation());
}

function initializeStatusSelectAll() {
  const selectAllCheckbox = document.getElementById("statusSelectAll");
  if (!selectAllCheckbox) return;
  const statusCheckboxes = document.querySelectorAll(".status-checkbox");
  selectAllCheckbox.addEventListener("change", async function () {
    statusCheckboxes.forEach((cb) => (cb.checked = this.checked));
    selectedStatuses = this.checked
      ? Array.from(statusCheckboxes).map((cb) => cb.value)
      : [];
    updateStatusSelectedText();
    updateStatusSelectAllState();
    currentPage = 1;
    saveRecipesState();
    await fetchAndDisplayRecipeStats();
    await fetchAndDisplayRecipes();
  });
}

function updateStatusSelectedText() {
  const selectedText = document.getElementById("statusSelectedText");
  if (!selectedText) return;
  if (selectedStatuses.length === 0) {
    selectedText.textContent = "Select statuses...";
    selectedText.style.color = "#999";
  } else if (selectedStatuses.length <= 2) {
    const labelMap = {
      active: "Hoạt động",
      inactive: "Ngừng hoạt động",
    };
    selectedText.textContent = selectedStatuses
      .map((s) => labelMap[s] || s)
      .join(", ");
    selectedText.style.color = "#333";
  } else {
    selectedText.textContent = `${selectedStatuses.length} selected`;
    selectedText.style.color = "#333";
  }
}

function updateStatusSelectAllState() {
  const selectAll = document.getElementById("statusSelectAll");
  const statusCheckboxes = document.querySelectorAll(".status-checkbox");
  if (!selectAll || statusCheckboxes.length === 0) return;
  const allChecked = Array.from(statusCheckboxes).every((cb) => cb.checked);
  const someChecked = Array.from(statusCheckboxes).some((cb) => cb.checked);
  selectAll.checked = allChecked;
  selectAll.indeterminate = someChecked && !allChecked;
}

async function handleStatusCheckboxChange() {
  const statusCheckboxes = document.querySelectorAll(".status-checkbox");
  selectedStatuses = Array.from(statusCheckboxes)
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
  updateStatusSelectedText();
  updateStatusSelectAllState();
  currentPage = 1;
  saveRecipesState();
  await fetchAndDisplayRecipeStats();
  await fetchAndDisplayRecipes();
}

function getSelectedStatuses() {
  return selectedStatuses;
}

function renderRecipeGrid(recipes) {
  const gridView = document.getElementById("gridView");
  gridView.innerHTML = "";
  if (!recipes.length) {
    gridView.innerHTML =
      '<div></div><div style="padding:2rem;text-align:center;color:#888">Không có công thức nào</div><div></div>';
    return;
  }
  recipes.forEach((recipe, idx) => {
    const card = document.createElement("div");
    card.className = "recipe-card";
    card.innerHTML = `
      <div class="recipe-card-header">
        <div class="recipe-title-section">
          <h3 class="recipe-code">${recipe.RecipeCode || ""}</h3>
          <h4 class="recipe-name">${recipe.RecipeName || ""}</h4>
          <span class="version-badge">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="20" 
              height="20" 
              viewBox="0 0 640 640" 
              fill="#4e4ad4"
            >
              <path d="M176 168C189.3 168 200 157.3 200 144C200 130.7 189.3 120 176 120C162.7 120 152 130.7 152 144C152 157.3 162.7 168 176 168zM256 144C256 176.8 236.3 205 208 217.3L208 288L384 288C410.5 288 432 266.5 432 240L432 217.3C403.7 205 384 176.8 384 144C384 99.8 419.8 64 464 64C508.2 64 544 99.8 544 144C544 176.8 524.3 205 496 217.3L496 240C496 301.9 445.9 352 384 352L208 352L208 422.7C236.3 435 256 463.2 256 496C256 540.2 220.2 576 176 576C131.8 576 96 540.2 96 496C96 463.2 115.7 435 144 422.7L144 217.4C115.7 205 96 176.8 96 144C96 99.8 131.8 64 176 64C220.2 64 256 99.8 256 144zM488 144C488 130.7 477.3 120 464 120C450.7 120 440 130.7 440 144C440 157.3 450.7 168 464 168C477.3 168 488 157.3 488 144zM176 520C189.3 520 200 509.3 200 496C200 482.7 189.3 472 176 472C162.7 472 152 482.7 152 496C152 509.3 162.7 520 176 520z"/>
            </svg>
            Phiên bản:  ${recipe.Version ? recipe.Version : ""}
          </span>
        </div>
        <p class="status-badge status-${recipe.RecipeStatus === "Active" ? "success" : "inactive"}">
          ${
            recipe.RecipeStatus === "Active"
              ? `<svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="24" 
                  height="24" 
                  viewBox="0 0 640 640" 
                  fill="#47b54d"
                >
                  <path d="M320 576C178.6 576 64 461.4 64 320C64 178.6 178.6 64 320 64C461.4 64 576 178.6 576 320C576 461.4 461.4 576 320 576zM438 209.7C427.3 201.9 412.3 204.3 404.5 215L285.1 379.2L233 327.1C223.6 317.7 208.4 317.7 199.1 327.1C189.8 336.5 189.7 351.7 199.1 361L271.1 433C276.1 438 282.9 440.5 289.9 440C296.9 439.5 303.3 435.9 307.4 430.2L443.3 243.2C451.1 232.5 448.7 217.5 438 209.7z"/>
                </svg>`
              : `<svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="24" 
                  height="24" 
                  viewBox="0 0 640 640" 
                  fill="#d9534f"
                >
                  <path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM231 231C240.4 221.6 255.6 221.6 264.9 231L319.9 286L374.9 231C384.3 221.6 399.5 221.6 408.8 231C418.1 240.4 418.2 255.6 408.8 264.9L353.8 319.9L408.8 374.9C418.2 384.3 418.2 399.5 408.8 408.8C399.4 418.1 384.2 418.2 374.9 408.8L319.9 353.8L264.9 408.8C255.5 418.2 240.3 418.2 231 408.8C221.7 399.4 221.6 384.2 231 374.9L286 319.9L231 264.9C221.6 255.5 221.6 240.3 231 231z"/>
                </svg>`
          }
          ${recipe.RecipeStatus === "Active" ? "Active" : "Inactive"}
        </p>
      </div>
      <div class="recipe-product">
        <div class="product-label">SẢN PHẨM</div>
        <div class="product-info">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="26"
            height="26"
            viewBox="0 0 640 640"
            fill="#666666"
          >
            <path
              d="M465.4 192L431.1 144L209 144L174.7 192L465.4 192zM96 212.5C96 199.2 100.2 186.2 107.9 175.3L156.9 106.8C168.9 90 188.3 80 208.9 80L431 80C451.7 80 471.1 90 483.1 106.8L532 175.3C539.8 186.2 543.9 199.2 543.9 212.5L544 480C544 515.3 515.3 544 480 544L160 544C124.7 544 96 515.3 96 480L96 212.5z"
            />
          </svg>
          <div class="product-details">
            <div class="product-code">${recipe.ProductCode || ""}</div>
            <div class="product-name">${recipe.ProductName || ""}</div>
          </div>
        </div>
      </div>
      <div class="recipe-footer">
        <div class="recipe-meta">
          <div class="meta-item">
              <div class="meta-label">
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    width="20" 
                    height="20" 
                    viewBox="0 0 640 640" 
                    fill="#999999"
                  >
                    <path d="M296.5 69.2C311.4 62.3 328.6 62.3 343.5 69.2L562.1 170.2C570.6 174.1 576 182.6 576 192C576 201.4 570.6 209.9 562.1 213.8L343.5 314.8C328.6 321.7 311.4 321.7 296.5 314.8L77.9 213.8C69.4 209.8 64 201.3 64 192C64 182.7 69.4 174.1 77.9 170.2L296.5 69.2zM112.1 282.4L276.4 358.3C304.1 371.1 336 371.1 363.7 358.3L528 282.4L562.1 298.2C570.6 302.1 576 310.6 576 320C576 329.4 570.6 337.9 562.1 341.8L343.5 442.8C328.6 449.7 311.4 449.7 296.5 442.8L77.9 341.8C69.4 337.8 64 329.3 64 320C64 310.7 69.4 302.1 77.9 298.2L112 282.4zM77.9 426.2L112 410.4L276.3 486.3C304 499.1 335.9 499.1 363.6 486.3L527.9 410.4L562 426.2C570.5 430.1 575.9 438.6 575.9 448C575.9 457.4 570.5 465.9 562 469.8L343.4 570.8C328.5 577.7 311.3 577.7 296.4 570.8L77.9 469.8C69.4 465.8 64 457.3 64 448C64 438.7 69.4 430.1 77.9 426.2z"/>
                  </svg>
                  Phiên bản mới nhất:
              </div>
             <strong>${recipe.LatestVersion || recipe.Version || "N/A"}</strong>
          </div>
          <div class="meta-item">
              <div class="meta-label">
                  <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="22" 
                  height="22" 
                  viewBox="0 -25 640 640" 
                  fill="#a78893"
                >
                  <path d="M528 320C528 434.9 434.9 528 320 528C205.1 528 112 434.9 112 320C112 205.1 205.1 112 320 112C434.9 112 528 205.1 528 320zM64 320C64 461.4 178.6 576 320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320zM296 184L296 320C296 328 300 335.5 306.7 340L402.7 404C413.7 411.4 428.6 408.4 436 397.3C443.4 386.2 440.4 371.4 429.3 364L344 307.2L344 184C344 170.7 333.3 160 320 160C306.7 160 296 170.7 296 184z"/>
                </svg>
                  Cập nhật:
              </div>  
              <strong>${recipe.timestamp ? formatDateTime(recipe.timestamp) : ""}</strong>
          </div>
        </div>
        <div class="recipe-actions">
          <button class="detail-btn" data-idx="${idx}">Xem chi tiết</button>
        </div>
      </div>
    `;
    card.querySelector(".detail-btn").addEventListener("click", function () {
      window.location.href = `/recipe-detail/${recipe.RecipeDetailsId}`;
    });
    gridView.appendChild(card);
  });
}

function renderRecipeTable(recipes) {
  const tableBody = document.getElementById("recipeTableBody");
  tableBody.innerHTML = "";
  if (!recipes.length) {
    tableBody.innerHTML =
      '<tr><td colspan="8" style="text-align:center;color:#888">Không có công thức nào</td></tr>';
    return;
  }

  // Group recipes by RecipeCode
  const groupsMap = new Map();
  recipes.forEach((r) => {
    const code = r.RecipeCode || "";
    if (!groupsMap.has(code)) groupsMap.set(code, []);
    groupsMap.get(code).push(r);
  });

  const groups = Array.from(groupsMap.entries()).map(([code, items]) => {
    // Sort items by Version (numeric) or timestamp desc to find latest
    const toNum = (v) => {
      const n = parseFloat(v);
      return isNaN(n) ? -Infinity : n;
    };
    const sorted = items.slice().sort((a, b) => {
      const va = toNum(a.Version);
      const vb = toNum(b.Version);
      if (va !== vb) return vb - va;
      const ta = a.timestamp || "";
      const tb = b.timestamp || "";
      return String(tb).localeCompare(String(ta));
    });
    const latest = sorted[0] || items[0];
    const versionsCount = items.length;
    const productCode = latest.ProductCode || items[0].ProductCode || "";
    const productName = latest.ProductName || items[0].ProductName || "";
    const recipeName = latest.RecipeName || items[0].RecipeName || "";
    const latestVersion = latest.Version || "";
    const latestTimestamp = latest.timestamp || "";
    const status = latest.RecipeStatus || items[0].RecipeStatus || "";
    return {
      code,
      items,
      productCode,
      productName,
      recipeName,
      latestVersion,
      latestTimestamp,
      status,
      versionsCount,
    };
  });

  groups.forEach((g) => {
    // Single item groups: render as normal row
    if (g.items.length === 1) {
      const r = g.items[0];
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.RecipeDetailsId || ""}</td>
        <td>${r.ProductCode || ""}</td>
        <td>${r.ProductName || ""}</td>
        <td style="max-width: 300px;">${r.RecipeCode || ""}</td>
        <td style="max-width: 300px;">${r.RecipeName || ""}</td>
        <td>${r.Version || ""}</td>
        <td style="text-align:center">
          <span class="status-badge status-${r.RecipeStatus === "Active" ? "success" : "inactive"}">${r.RecipeStatus === "Active" ? "Active" : "Inactive"}</span>
        </td>
        <td>${r.timestamp ? formatDateTime(r.timestamp) : ""}</td>
        <td style="text-align:center">
          <button class="detail-btn" title="Xem chi tiết" style="background:none;border:none;padding:0;cursor:pointer;color:#6259ee;font-size:18px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 4c4.29 0 7.863 2.429 10.665 7.154l.22 .379l.045 .1l.03 .083l.014 .055l.014 .082l.011 .1v.11l-.014 .111a.992 .992 0 0 1 -.026 .11l-.039 .108l-.036 .075l-.016 .03c-2.764 4.836 -6.3 7.38 -10.555 7.499l-.313 .004c-4.396 0 -8.037 -2.549 -10.868 -7.504a1 1 0 0 1 0 -.992c2.831 -4.955 6.472 -7.504 10.868 -7.504zm0 5a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z" />
            </svg>
          </button>
        </td>
      `;
      tr.querySelector(".detail-btn").addEventListener("click", function () {
        window.location.href = `/recipe-detail/${r.RecipeDetailsId}`;
      });
      tableBody.appendChild(tr);
      return;
    }

    // Multi-item groups: render grouped row
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${g.versionsCount} items</td>
      <td>${g.productCode}</td>
      <td>${g.productName}</td>
      <td style="max-width: 300px;">${g.code}</td>
      <td style="max-width: 300px;">${g.recipeName}</td>
      <td>${g.versionsCount} versions</td>
      <td style="text-align:center">
        <span class="status-badge status-${g.status === "Active" ? "success" : "inactive"}">
          ${g.status === "Active" ? "Active" : "Inactive"}
        </span>
      </td>
      <td>${g.latestTimestamp ? formatDateTime(g.latestTimestamp) : ""}</td>
      <td style="text-align:center">
        <button class="group-view-btn" title="Xem danh sách trong nhóm" style="background:none;border:none;padding:0;cursor:pointer;color:#6259ee;font-size:18px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4c4.29 0 7.863 2.429 10.665 7.154l.22 .379l.045 .1l.03 .083l.014 .055l.014 .082l.011 .1v.11l-.014 .111a.992 .992 0 0 1 -.026 .11l-.039 .108l-.036 .075l-.016 .03c-2.764 4.836 -6.3 7.38 -10.555 7.499l-.313 .004c-4.396 0 -8.037 -2.549 -10.868 -7.504a1 1 0 0 1 0 -.992c2.831 -4.955 6.472 -7.504 10.868 -7.504zm0 5a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z" />
          </svg>
        </button>
      </td>
    `;
    tr.querySelector(".group-view-btn").addEventListener("click", function () {
      showRecipeGroupModal(g.code, g.items);
    });
    tableBody.appendChild(tr);
  });
}

function formatDateTime(dateString) {
  if (!dateString) return "";

  const [datePart, timePart] = dateString.split("T");
  if (!datePart || !timePart) return dateString;

  const [year, month, day] = datePart.split("-");
  const [hours, minutes, seconds] = timePart.replace("Z", "").split(":");

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

// Ensure modal HTML is present in DOM on page load
(function ensureRecipeModalHTML() {
  if (!document.getElementById("recipeDetailModal")) {
    const modalDiv = document.createElement("div");
    modalDiv.id = "recipeDetailModal";
    modalDiv.className = "modal";
    modalDiv.style.display = "none";
    modalDiv.innerHTML = `
      <div class="modal-content">
        <span class="close-modal" id="closeRecipeModal">&times;</span>
        <h2>Chi tiết Công Thức</h2>
        <div id="modalRecipeContent"></div>
      </div>
    `;
    document.body.appendChild(modalDiv);
    // Add modal CSS if not present
    if (!document.getElementById("modal-style")) {
      const style = document.createElement("style");
      style.id = "modal-style";
      style.innerHTML = `
        .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100vw; height: 100vh; overflow: auto; background-color: rgba(0,0,0,0.3); justify-content: center; align-items: center; }
        .modal-content { background: #fff; margin: 5% auto; padding: 30px 24px 24px 24px; border-radius: 10px; max-width: 480px; box-shadow: 0 4px 24px rgba(0,0,0,0.18); position: relative; animation: fadeInModal 0.2s; }
        @keyframes fadeInModal { from { opacity: 0; transform: translateY(-30px); } to { opacity: 1; transform: translateY(0); } }
        .close-modal { position: absolute; top: 12px; right: 18px; font-size: 28px; color: #888; cursor: pointer; font-weight: bold; transition: color 0.2s; }
        .close-modal:hover { color: #e74c3c; }
        #modalRecipeContent { margin-top: 18px; font-size: 15px; color: #222; }
        #modalRecipeContent .modal-row { margin-bottom: 10px; display: flex; gap: 10px; }
        #modalRecipeContent .modal-label { min-width: 120px; color: #666; font-weight: 500; }
        #modalRecipeContent .modal-value { flex: 1; color: #222; word-break: break-all; }
      `;
      document.head.appendChild(style);
    }
  }
})();

// Ensure modal close button works and modal always exists
function ensureRecipeModal() {
  let modal = document.getElementById("recipeDetailModal");
  if (!modal) {
    // If modal is missing, create and append to body
    const modalDiv = document.createElement("div");
    modalDiv.id = "recipeDetailModal";
    modalDiv.className = "modal";
    modalDiv.style.display = "none";
    modalDiv.innerHTML = `
      <div class="modal-content">
        <span class="close-modal" id="closeRecipeModal">&times;</span>
        <h2>Chi tiết Công Thức</h2>
        <div id="modalRecipeContent"></div>
      </div>
    `;
    document.body.appendChild(modalDiv);
    modal = modalDiv;
  }
  // Close logic
  const closeBtn = document.getElementById("closeRecipeModal");
  if (closeBtn && modal) {
    closeBtn.onclick = function () {
      modal.style.display = "none";
    };
  }
  window.addEventListener("click", function (event) {
    if (event.target === modal) {
      modal.style.display = "none";
    }
  });
}

// Group modal (list recipes within the same RecipeCode)
function ensureRecipeGroupModal() {
  if (!document.getElementById("recipeGroupModal")) {
    const modalDiv = document.createElement("div");
    modalDiv.id = "recipeGroupModal";
    modalDiv.className = "modal";
    modalDiv.style.display = "none";
    modalDiv.innerHTML = `
      <div class="modal-content" style="max-width: 900px;">
        <span class="close-modal" id="closeRecipeGroupModal">&times;</span>
        <h2>Danh sách phiên bản theo RecipeCode</h2>
        <div id="modalGroupSummary" style="margin-bottom:8px;color:#555"></div>
        <div id="modalGroupContent"></div>
      </div>
    `;
    document.body.appendChild(modalDiv);
    const closeBtn = document.getElementById("closeRecipeGroupModal");
    const modal = modalDiv;
    if (closeBtn)
      closeBtn.onclick = function () {
        modal.style.display = "none";
      };
    window.addEventListener("click", function (event) {
      if (event.target === modal) modal.style.display = "none";
    });
  }
}

function showRecipeGroupModal(recipeCode, items) {
  ensureRecipeGroupModal();
  const modal = document.getElementById("recipeGroupModal");
  const summary = document.getElementById("modalGroupSummary");
  const content = document.getElementById("modalGroupContent");
  if (!modal || !content) return;

  const sorted = items.slice().sort((a, b) => {
    const toNum = (v) => {
      const n = parseFloat(v);
      return isNaN(n) ? -Infinity : n;
    };
    const va = toNum(a.Version);
    const vb = toNum(b.Version);
    if (va !== vb) return vb - va;
    const ta = a.timestamp || "";
    const tb = b.timestamp || "";
    return String(tb).localeCompare(String(ta));
  });

  summary.textContent = `RecipeCode: ${recipeCode} • ${items.length} phiên bản`;

  if (sorted.length === 0) {
    content.innerHTML = `<div style="padding:12px;color:#999">Không có dữ liệu</div>`;
  } else {
    const rowsHtml = sorted
      .map(
        (r) => `
      <tr>
        <td style="border:1px solid #eee;padding:6px;text-align:center;">${r.RecipeDetailsId ?? ""}</td>
        <td style="border:1px solid #eee;padding:6px;text-align:center;">${r.ProductCode ?? ""}</td>
        <td style="border:1px solid #eee;padding:6px;text-align:left;max-width:280px;">${r.ProductName ?? ""}</td>
        <td style="border:1px solid #eee;padding:6px;text-align:left;max-width:320px;">${r.RecipeName ?? ""}</td>
        <td style="border:1px solid #eee;padding:6px;text-align:center;">${r.Version ?? ""}</td>
        <td style="border:1px solid #eee;padding:6px;text-align:center;">
          <span class="status-badge status-${r.RecipeStatus === "Active" ? "success" : "inactive"}">${r.RecipeStatus === "Active" ? "Active" : "Inactive"}</span>
        </td>
        <td style="border:1px solid #eee;padding:6px;text-align:center;">${r.timestamp ? formatDateTime(r.timestamp) : ""}</td>
        <td style="border:1px solid #eee;padding:6px;text-align:center;">
          <button class="go-detail" data-id="${r.RecipeDetailsId}" title="Xem chi tiết" style="background:none;border:none;padding:0;cursor:pointer;color:#6259ee;font-size:18px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 4c4.29 0 7.863 2.429 10.665 7.154l.22 .379l.045 .1l.03 .083l.014 .055l.014 .082l.011 .1v.11l-.014 .111a.992 .992 0 0 1 -.026 .11l-.039 .108l-.036 .075l-.016 .03c-2.764 4.836 -6.3 7.38 -10.555 7.499l-.313 .004c-4.396 0 -8.037 -2.549 -10.868 -7.504a1 1 0 0 1 0 -.992c2.831 -4.955 6.472 -7.504 10.868 -7.504zm0 5a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z" />
            </svg>
          </button>
        </td>
      </tr>
    `,
      )
      .join("");
    content.innerHTML = `
      <div style="overflow:auto">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f6f6ff">
              <th style="border:1px solid #eee;padding:8px;text-align:center;width:80px;">ID</th>
              <th style="border:1px solid #eee;padding:8px;text-align:center;width:120px;">ProductCode</th>
              <th style="border:1px solid #eee;padding:8px;text-align:left;">ProductName</th>
              <th style="border:1px solid #eee;padding:8px;text-align:left;">RecipeName</th>
              <th style="border:1px solid #eee;padding:8px;text-align:center;width:90px;">Version</th>
              <th style="border:1px solid #eee;padding:8px;text-align:center;width:110px;">Status</th>
              <th style="border:1px solid #eee;padding:8px;text-align:center;width:160px;">Cập nhật</th>
              <th style="border:1px solid #eee;padding:8px;text-align:center;width:80px;">Action</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;

    // Wire action buttons
    content.querySelectorAll(".go-detail").forEach((btn) => {
      btn.addEventListener("click", function () {
        const id = this.getAttribute("data-id");
        if (id) window.location.href = `/recipe-detail/${id}`;
      });
    });
  }

  modal.style.display = "flex";
}
window.showRecipeGroupModal = showRecipeGroupModal;

document.addEventListener("DOMContentLoaded", function () {
  const gridBtn = document.getElementById("gridViewBtn");
  const tableBtn = document.getElementById("tableViewBtn");
  const gridView = document.getElementById("gridView");
  const tableView = document.getElementById("tableView");
  const backBtn = document.querySelector(".back-btn");

  if (backBtn) {
    backBtn.addEventListener("click", function () {
      window.history.back();
    });
  }

  // Default: table view
  tableBtn.classList.add("active");
  gridBtn.classList.remove("active");
  tableView.style.display = "";
  gridView.style.display = "none";

  gridBtn.addEventListener("click", function () {
    gridBtn.classList.add("active");
    tableBtn.classList.remove("active");
    gridView.style.display = "";
    tableView.style.display = "none";
  });
  tableBtn.addEventListener("click", function () {
    tableBtn.classList.add("active");
    gridBtn.classList.remove("active");
    gridView.style.display = "none";
    tableView.style.display = "";
  });

  // Filter & refresh logic
  const searchInput = document.getElementById("searchInput");
  const statusFilter = null; // replaced by custom multiselect
  const refreshBtn = document.querySelector(".refresh-btn");

  // Restore state to inputs before wiring listeners
  if (restoreRecipesState()) {
    if (searchInput) searchInput.value = filterSearch;
    // selectedStatuses restored; checkboxes will reflect after populate
  }

  // Initialize status multiselect UI
  initializeStatusDropdown();
  populateStatusOptions();

  if (searchInput) {
    searchInput.addEventListener("input", function (e) {
      filterSearch = e.target.value;
      currentPage = 1;
      saveRecipesState();
      fetchAndDisplayRecipeStats();
      fetchAndDisplayRecipes();
    });
  }
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      if (searchInput) searchInput.value = "";
      filterSearch = "";
      filterStatus = "";
      selectedStatuses = [];
      currentPage = 1;
      try {
        sessionStorage.removeItem(STATE_KEY);
      } catch (_) {}
      updateStatusSelectedText();
      updateStatusSelectAllState();
      fetchAndDisplayRecipeStats();
      fetchAndDisplayRecipes();
    });
  }

  // Initial load
  if (currentRecipes.length > 0) {
    // Restored from session — render immediately without API call
    fetchAndDisplayRecipeStats();
    renderRecipeGrid(currentRecipes);
    renderRecipeTable(currentRecipes);
    updatePaginationUI();
  } else {
    fetchAndDisplayRecipeStats();
    fetchAndDisplayRecipes();
  }
});

// Fetch stats and update stat cards
async function fetchAndDisplayRecipeStats() {
  try {
    const params = new URLSearchParams();
    const statuses = getSelectedStatuses();
    if (statuses.length > 0) params.append("statuses", statuses.join(","));
    if (filterSearch) params.append("search", filterSearch);
    // let endpoint = `${API_ROUTE}/api/production-recipes/stats/search?${params.toString()}`;
    let endpoint = `${API_ROUTE}/api/recipes/stats/search?${params.toString()}`;
    console.log("Fetching stats with endpoint:", endpoint);
    const res = await fetch(endpoint);
    const data = await res.json();
    if (data.success && data.stats) {
      document.getElementById("totalRecipes").textContent = data.stats.total;
      document.getElementById("activeRecipes").textContent = data.stats.active;
      document.getElementById("totalVersions").textContent =
        data.stats.totalVersions;
    }
  } catch (err) {
    console.error("Lỗi khi lấy thống kê recipes:", err);
  }
}

// Fetch paginated/filtered recipes
async function fetchAndDisplayRecipes() {
  try {
    // let url = `${API_ROUTE}/api/production-recipes/search?page=${currentPage}&limit=${pageSize}`;
    let url = `${API_ROUTE}/api/recipes/search?page=${currentPage}&limit=${pageSize}`;
    const statuses = getSelectedStatuses();
    if (statuses.length > 0)
      url += `&statuses=${encodeURIComponent(statuses.join(","))}`;
    if (filterSearch) url += `&search=${encodeURIComponent(filterSearch)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      currentRecipes = (data.data || []).map((item) => new Recipe(item));
      totalRecipes = data.total || 0;
      totalPages = Math.ceil(totalRecipes / pageSize) || 1;
      renderRecipeGrid(currentRecipes);
      renderRecipeTable(currentRecipes);
      updatePaginationUI();
      saveRecipesState();
    } else {
      currentRecipes = [];
      totalRecipes = 0;
      totalPages = 1;
      renderRecipeGrid([]);
      renderRecipeTable([]);
      updatePaginationUI();
    }
  } catch (err) {
    console.error("Lỗi khi lấy RecipeDetails:", err);
    currentRecipes = [];
    totalRecipes = 0;
    totalPages = 1;
    renderRecipeGrid([]);
    renderRecipeTable([]);
    updatePaginationUI();
  }
}
// Pagination button handlers for EJS
window.nextPage = function () {
  if (
    typeof totalPages !== "undefined" &&
    typeof currentPage !== "undefined" &&
    currentPage < totalPages
  ) {
    currentPage++;
    saveRecipesState();
    fetchAndDisplayRecipes();
    fetchAndDisplayRecipeStats();
  }
};
window.prevPage = function () {
  if (typeof currentPage !== "undefined" && currentPage > 1) {
    currentPage--;
    saveRecipesState();
    fetchAndDisplayRecipes();
    fetchAndDisplayRecipeStats();
  }
};

// Update pageInfo display after each fetch
function updatePageInfo() {
  const pageInfo = document.getElementById("pageInfo");
  if (pageInfo) {
    pageInfo.textContent = `Trang ${currentPage} / ${totalPages}`;
  }
}
// Patch fetchAndDisplayRecipes to call updatePageInfo
const _fetchAndDisplayRecipes = fetchAndDisplayRecipes;
fetchAndDisplayRecipes = async function () {
  await _fetchAndDisplayRecipes.apply(this, arguments);
  updatePageInfo();
};
// Initial page info update
if (
  document.readyState === "complete" ||
  document.readyState === "interactive"
) {
  updatePageInfo();
} else {
  document.addEventListener("DOMContentLoaded", updatePageInfo);
}
