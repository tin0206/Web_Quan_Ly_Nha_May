import { Recipe } from "../js/models/Recipes.js";

const API_ROUTE = window.location.origin;

// Pagination/filter/search state
let filterStatus = "";
let filterSearch = "";
let currentPage = 1;
let pageSize = 20;
let totalPages = 1;
let totalRecipes = 0;
let currentRecipes = [];

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
  pagination.querySelectorAll(".page-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const page = parseInt(btn.getAttribute("data-page"));
      if (
        !isNaN(page) &&
        page >= 1 &&
        page <= totalPages &&
        page !== currentPage
      ) {
        currentPage = page;
        fetchAndDisplayRecipes();
      }
    });
  });
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
            <i class="fa-solid fa-code-branch"></i>
            Phiên bản:  ${recipe.Version ? recipe.Version : ""}
          </span>
        </div>
        <span class="status-badge status-${recipe.RecipeStatus === "Active" ? "success" : recipe.RecipeStatus === "Draft" ? "draft" : "inactive"}">
          <i class="fa-solid fa-circle-check"></i>
          ${recipe.RecipeStatus === "Active" ? "Hoạt động" : recipe.RecipeStatus === "Draft" ? "Bản nháp" : "Ngừng hoạt động"}
        </span>
      </div>
      <div class="recipe-product">
        <div class="product-label">SẢN PHẨM</div>
        <div class="product-info">
          <i class="fa-solid fa-box"></i>
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
                  <i class="fa-solid fa-layer-group"></i>
                  Phiên bản mới nhất:
              </div>
             <strong>${recipe.LatestVersion || recipe.Version || "N/A"}</strong>
          </div>
          <div class="meta-item">
              <div class="meta-label">
                  <i class="fa-regular fa-clock"></i>
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
  recipes.forEach((recipe, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${recipe.RecipeDetailsId || ""}</td>
      <td>${recipe.ProductCode || ""}</td>
      <td>${recipe.ProductName || ""}</td>
      <td style="max-width: 300px;">${recipe.RecipeCode || ""} - ${recipe.RecipeName || ""}</td>
      <td>${recipe.Version || ""}</td>
      <td style="text-align:center">
        <span class="status-badge status-${recipe.RecipeStatus === "Active" ? "success" : recipe.RecipeStatus === "Draft" ? "draft" : "inactive"}">
          ${recipe.RecipeStatus === "Active" ? "Hoạt động" : recipe.RecipeStatus === "Draft" ? "Bản nháp" : "Ngừng hoạt động"}
        </span>
      </td>
      <td>${recipe.timestamp ? formatDateTime(recipe.timestamp) : ""}</td>
      <td style="text-align:center">
        <button class="detail-btn" title="Xem chi tiết" style="background:none;border:none;padding:0;cursor:pointer;color:#6259ee;font-size:18px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4c4.29 0 7.863 2.429 10.665 7.154l.22 .379l.045 .1l.03 .083l.014 .055l.014 .082l.011 .1v.11l-.014 .111a.992 .992 0 0 1 -.026 .11l-.039 .108l-.036 .075l-.016 .03c-2.764 4.836 -6.3 7.38 -10.555 7.499l-.313 .004c-4.396 0 -8.037 -2.549 -10.868 -7.504a1 1 0 0 1 0 -.992c2.831 -4.955 6.472 -7.504 10.868 -7.504zm0 5a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z" />
          </svg>
        </button>
      </td>
    `;
    tr.querySelector(".detail-btn").addEventListener("click", function () {
      window.location.href = `/recipe-detail/${recipe.RecipeDetailsId}`;
    });
    tableBody.appendChild(tr);
  });
}

function formatDateTime(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
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

async function showRecipeModal(recipe) {
  const response = await fetch(
    `${API_ROUTE}/api/production-recipes/${recipe.RecipeDetailsId}`,
  );
  if (response.ok) {
    const data = await response.json();
    console.log("Recipe details fetched:", data);
  }

  ensureRecipeModal();
  const modal = document.getElementById("recipeDetailModal");
  const content = document.getElementById("modalRecipeContent");
  if (!modal || !content || !recipe) return;
  content.innerHTML = `
    <div class='modal-row'><span class='modal-label'>ID:</span><span class='modal-value'>${recipe.RecipeDetailsId || ""}</span></div>
    <div class='modal-row'><span class='modal-label'>Mã Công Thức:</span><span class='modal-value'>${recipe.RecipeCode || ""}</span></div>
    <div class='modal-row'><span class='modal-label'>Tên Công Thức:</span><span class='modal-value'>${recipe.RecipeName || ""}</span></div>
    <div class='modal-row'><span class='modal-label'>Phiên Bản:</span><span class='modal-value'>${recipe.Version || ""}</span></div>
    <div class='modal-row'><span class='modal-label'>Mã Sản Phẩm:</span><span class='modal-value'>${recipe.ProductCode || ""}</span></div>
    <div class='modal-row'><span class='modal-label'>Tên Sản Phẩm:</span><span class='modal-value'>${recipe.ProductName || ""}</span></div>
    <div class='modal-row'><span class='modal-label'>Trạng Thái:</span><span class='modal-value'>${recipe.RecipeStatus || ""}</span></div>
    <div class='modal-row'><span class='modal-label'>Ngày Cập Nhật:</span><span class='modal-value'>${formatDateTime(recipe.timestamp) || ""}</span></div>
  `;
  modal.style.display = "flex";
}
window.showRecipeModal = showRecipeModal;

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
  const statusFilter = document.getElementById("statusFilter");
  const refreshBtn = document.querySelector(".refresh-btn");
  if (searchInput) {
    searchInput.addEventListener("input", function (e) {
      filterSearch = e.target.value;
      currentPage = 1;
      fetchAndDisplayRecipes();
    });
  }
  if (statusFilter) {
    statusFilter.addEventListener("change", function (e) {
      filterStatus = e.target.value;
      currentPage = 1;
      fetchAndDisplayRecipes();
    });
  }
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      if (searchInput) searchInput.value = "";
      if (statusFilter) statusFilter.value = "";
      filterSearch = "";
      filterStatus = "";
      currentPage = 1;
      fetchAndDisplayRecipeStats();
      fetchAndDisplayRecipes();
    });
  }

  // Initial load
  fetchAndDisplayRecipeStats();
  fetchAndDisplayRecipes();
});

// Fetch stats and update stat cards
async function fetchAndDisplayRecipeStats() {
  try {
    const res = await fetch(`${API_ROUTE}/api/production-recipes/stats`);
    const data = await res.json();
    if (data.success && data.stats) {
      document.getElementById("totalRecipes").textContent = data.stats.total;
      document.getElementById("activeRecipes").textContent = data.stats.active;
      document.getElementById("totalVersions").textContent =
        data.stats.totalVersions;
      document.getElementById("draftRecipes").textContent = data.stats.draft;
    }
  } catch (err) {
    console.error("Lỗi khi lấy thống kê recipes:", err);
  }
}

// Fetch paginated/filtered recipes
async function fetchAndDisplayRecipes() {
  try {
    let url = `${API_ROUTE}/api/production-recipes/search?page=${currentPage}&limit=${pageSize}`;
    if (filterStatus) url += `&status=${encodeURIComponent(filterStatus)}`;
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

window.addEventListener("click", function (event) {
  if (event.target === document.getElementById("recipeDetailModal")) {
    document.getElementById("recipeDetailModal").style.display = "none";
  }
});

// Pagination button handlers for EJS
window.nextPage = function () {
  if (
    typeof totalPages !== "undefined" &&
    typeof currentPage !== "undefined" &&
    currentPage < totalPages
  ) {
    currentPage++;
    fetchAndDisplayRecipes();
  }
};
window.prevPage = function () {
  if (typeof currentPage !== "undefined" && currentPage > 1) {
    currentPage--;
    fetchAndDisplayRecipes();
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
