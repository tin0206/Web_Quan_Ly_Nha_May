const API_ROUTE = window.location.origin;

const STATE_KEY = "products_filters_state_v1";
let productsCache = [];
let currentPage = 1;
let totalPages = 1;
const PAGE_SIZE = 20;
let filterSearch = "";
let selectedStatuses = [];
let selectedTypes = [];

function formatDateTime(dateString) {
  if (!dateString) return "";

  const [datePart, timePart] = dateString.split("T");
  if (!datePart || !timePart) return dateString;

  const [year, month, day] = datePart.split("-");
  const [hours, minutes, seconds] = timePart.replace("Z", "").split(":");

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}
async function fetchProducts() {
  const res = await fetch(`${API_ROUTE}/api/production-products/`);
  if (!res.ok) throw new Error("Không lấy được dữ liệu sản phẩm");
  const data = await res.json();
  productsCache = data;
}

async function fetchStats() {
  const res = await fetch(`${API_ROUTE}/api/production-products/stats`);
  if (!res.ok) throw new Error("Không lấy được thống kê sản phẩm");
  return await res.json();
}

async function fetchTypes() {
  const res = await fetch(`${API_ROUTE}/api/production-products/types`);
  if (!res.ok) throw new Error("Không lấy được danh sách loại");
  return await res.json();
}

async function fetchFilteredStats(params) {
  const query = new URLSearchParams(params);
  const res = await fetch(
    `${API_ROUTE}/api/production-products/stats/search?${query.toString()}`,
  );
  if (!res.ok) throw new Error("Không lấy được thống kê theo bộ lọc");
  return await res.json();
}

async function updateStats() {
  const stats = await fetchFilteredStats(buildSearchParams());
  document.getElementById("totalProducts").innerText = stats.totalProducts || 0;
  document.getElementById("activeProducts").innerText =
    stats.activeProducts || 0;
  document.getElementById("totalTypes&Categories").innerText =
    (stats.totalTypes || 0) + " / " + (stats.totalCategories || 0);
  document.getElementById("totalGroups").innerText = stats.totalGroups || 0;
}

function buildSearchParams() {
  const params = { page: currentPage, pageSize: PAGE_SIZE };
  if (filterSearch) params.q = filterSearch;
  if (selectedStatuses.length === 1) {
    // Map UI values (active/inactive) to backend values (ACTIVE/INACTIVE)
    params.status = selectedStatuses[0] === "active" ? "ACTIVE" : "INACTIVE";
  } else if (selectedStatuses.length > 1) {
    const mapped = selectedStatuses.map((s) =>
      s === "active" ? "ACTIVE" : "INACTIVE",
    );
    params.statuses = mapped.join(",");
  }
  if (selectedTypes.length === 1) {
    params.type = selectedTypes[0];
  } else if (selectedTypes.length > 1) {
    params.types = selectedTypes.join(",");
  }
  return params;
}

async function fetchSearchResults(params) {
  const query = new URLSearchParams(params);
  const res = await fetch(
    `${API_ROUTE}/api/production-products/search?${query.toString()}`,
  );
  if (!res.ok) throw new Error("Không lấy được kết quả tìm kiếm");
  return await res.json();
}

async function loadProducts(resetPage = false) {
  if (resetPage) currentPage = 1;
  const { items, total, page, pageSize } =
    await fetchSearchResults(buildSearchParams());
  productsCache = items;
  totalPages = Math.max(Math.ceil(total / pageSize), 1);
  currentPage = Math.min(Math.max(page, 1), totalPages);
  const pageInfo = document.getElementById("pageInfo");
  if (pageInfo) pageInfo.textContent = `Trang ${currentPage} / ${totalPages}`;
  const gridView = document.getElementById("gridView");
  if (gridView && gridView.style.display !== "none") {
    renderGridView();
  } else {
    renderTable();
  }
  const prevBtn = document.getElementById("prevPageBtn");
  const nextBtn = document.getElementById("nextPageBtn");
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}
// ===================== Session Storage =====================
function saveProductsState() {
  try {
    const state = {
      filterSearch,
      selectedStatuses,
      selectedTypes,
      currentPage,
    };
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (_) {}
}

function restoreProductsState() {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw);
    if (state && typeof state === "object") {
      filterSearch = state.filterSearch || "";
      selectedStatuses = Array.isArray(state.selectedStatuses)
        ? state.selectedStatuses
        : [];
      selectedTypes = Array.isArray(state.selectedTypes)
        ? state.selectedTypes
        : [];
      currentPage = Math.max(1, parseInt(state.currentPage) || 1);
      return true;
    }
  } catch (_) {}
  return false;
}

// ===================== Multiselect UI Helpers =====================
function toggleDropdown(dropdownId) {
  const dd = document.getElementById(dropdownId);
  if (!dd) return;
  const isVisible = dd.style.display === "block";
  dd.style.display = isVisible ? "none" : "block";
}

function initDropdownToggle(inputId, dropdownId) {
  const input = document.getElementById(inputId);
  const dd = document.getElementById(dropdownId);
  if (!input || !dd) return;
  input.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown(dropdownId);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".custom-multiselect")) {
      dd.style.display = "none";
    }
  });
  dd.addEventListener("click", (e) => e.stopPropagation());
}

function updateStatusSelectedText() {
  const el = document.getElementById("statusSelectedText");
  if (!el) return;
  if (selectedStatuses.length === 0) {
    el.textContent = "Select statuses...";
    el.style.color = "#999";
  } else if (selectedStatuses.length <= 2) {
    const labelMap = { active: "Hoạt động", inactive: "Ngừng hoạt động" };
    el.textContent = selectedStatuses.map((s) => labelMap[s] || s).join(", ");
    el.style.color = "#333";
  } else {
    el.textContent = `${selectedStatuses.length} selected`;
    el.style.color = "#333";
  }
}

function updateTypeSelectedText() {
  const el = document.getElementById("typeSelectedText");
  if (!el) return;
  if (selectedTypes.length === 0) {
    el.textContent = "Select types...";
    el.style.color = "#999";
  } else if (selectedTypes.length <= 2) {
    el.textContent = selectedTypes.join(", ");
    el.style.color = "#333";
  } else {
    el.textContent = `${selectedTypes.length} selected`;
    el.style.color = "#333";
  }
}

function updateSelectAllState(containerSelector, selectAllId) {
  const selectAll = document.getElementById(selectAllId);
  const cbs = document.querySelectorAll(containerSelector);
  if (!selectAll) return;
  const allChecked = Array.from(cbs).every((cb) => cb.checked);
  const someChecked = Array.from(cbs).some((cb) => cb.checked);
  selectAll.checked = allChecked;
  selectAll.indeterminate = someChecked && !allChecked;
}

function attachSelectAll(selectAllId, checkboxesSelector, onChange) {
  const selectAll = document.getElementById(selectAllId);
  if (!selectAll) return;
  const cbs = document.querySelectorAll(checkboxesSelector);
  selectAll.addEventListener("change", async function () {
    cbs.forEach((cb) => (cb.checked = this.checked));
    await onChange();
  });
}

async function populateStatusOptions() {
  const container = document.getElementById("statusOptions");
  if (!container) return;
  container.innerHTML = "";
  const statuses = [
    { value: "active", label: "Hoạt động" },
    { value: "inactive", label: "Ngừng hoạt động" },
  ];
  statuses.forEach((s) => {
    const label = document.createElement("label");
    label.style.cssText =
      "display:flex; align-items:center; gap:8px; padding:6px 8px; cursor:pointer; border-radius:4px;";
    label.onmouseover = function () {
      this.style.background = "#f5f5f5";
    };
    label.onmouseout = function () {
      this.style.background = "transparent";
    };
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "status-checkbox";
    cb.value = s.value;
    cb.checked = selectedStatuses.includes(s.value);
    cb.addEventListener("change", async () => {
      selectedStatuses = Array.from(
        document.querySelectorAll(".status-checkbox"),
      )
        .filter((x) => x.checked)
        .map((x) => x.value);
      updateStatusSelectedText();
      updateSelectAllState(".status-checkbox", "statusSelectAll");
      currentPage = 1;
      saveProductsState();
      await updateStats();
      await loadProducts(true);
    });
    const span = document.createElement("span");
    span.textContent = s.label;
    label.appendChild(cb);
    label.appendChild(span);
    container.appendChild(label);
  });
  updateStatusSelectedText();
  updateSelectAllState(".status-checkbox", "statusSelectAll");
  attachSelectAll("statusSelectAll", ".status-checkbox", async () => {
    selectedStatuses = Array.from(document.querySelectorAll(".status-checkbox"))
      .filter((x) => x.checked)
      .map((x) => x.value);
    updateStatusSelectedText();
    updateSelectAllState(".status-checkbox", "statusSelectAll");
    currentPage = 1;
    saveProductsState();
    await updateStats();
    await loadProducts(true);
  });
}

async function populateTypeOptions() {
  const container = document.getElementById("typeOptions");
  if (!container) return;
  container.innerHTML = "";
  let types = [];
  try {
    types = await fetchTypes();
  } catch (e) {
    console.warn("Failed to fetch types", e);
  }
  const uniqueTypes = [...new Set(types.filter((t) => t && t.trim()))].sort();
  uniqueTypes.forEach((t) => {
    const label = document.createElement("label");
    label.style.cssText =
      "display:flex; align-items:center; gap:8px; padding:6px 8px; cursor:pointer; border-radius:4px;";
    label.onmouseover = function () {
      this.style.background = "#f5f5f5";
    };
    label.onmouseout = function () {
      this.style.background = "transparent";
    };
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "type-checkbox";
    cb.value = t;
    cb.checked = selectedTypes.includes(t);
    cb.addEventListener("change", async () => {
      selectedTypes = Array.from(document.querySelectorAll(".type-checkbox"))
        .filter((x) => x.checked)
        .map((x) => x.value);
      updateTypeSelectedText();
      updateSelectAllState(".type-checkbox", "typeSelectAll");
      currentPage = 1;
      saveProductsState();
      await updateStats();
      await loadProducts(true);
    });
    const span = document.createElement("span");
    span.textContent = t;
    label.appendChild(cb);
    label.appendChild(span);
    container.appendChild(label);
  });
  updateTypeSelectedText();
  updateSelectAllState(".type-checkbox", "typeSelectAll");
  attachSelectAll("typeSelectAll", ".type-checkbox", async () => {
    selectedTypes = Array.from(document.querySelectorAll(".type-checkbox"))
      .filter((x) => x.checked)
      .map((x) => x.value);
    updateTypeSelectedText();
    updateSelectAllState(".type-checkbox", "typeSelectAll");
    currentPage = 1;
    saveProductsState();
    await updateStats();
    await loadProducts(true);
  });
}
function getFilteredProducts() {
  return productsCache;
}

function renderTable() {
  const tbody = document.getElementById("productTableBody");
  const products = getFilteredProducts();
  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan='9' style='text-align:center;color:#888;padding:16px'>Không có dữ liệu phù hợp</td></tr>`;
    return;
  }
  tbody.innerHTML = products
    .map(
      (p, idx) => `
        <tr>
          <td>${p.ItemCode || "-"}</td>
          <td>${p.ItemName || "-"}</td>
          <td style="text-align:center;">${p.Item_Type || "-"}</td>
          <td style="text-align:center;">${p.Group || "-"}</td>
          <td style="text-align:center;">${p.BaseUnit || "-"}</td>
          <td class="td-center">
            ${
              p.Conversion
                ? `<span class="product-conversion">${p.Conversion}</span>`
                : "-"
            }
          </td>
          <td class="td-center">
            ${
              p.Item_Status === "ACTIVE"
                ? `<span class="product-status active">ACTIVE</span>`
                : `<span class="product-status inactive">INACTIVE</span>`
            }
          </td>
          <td>${p.timestamp ? formatDateTime(p.timestamp) : ""}</td>
          <td style="text-align:center; vertical-align: middle;">
            <button class="detail-btn" title="Xem chi tiết" style="background:none;border:none;padding:0;cursor:pointer;color:#6259ee;font-size:18px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4c4.29 0 7.863 2.429 10.665 7.154l.22 .379l.045 .1l.03 .083l.014 .055l.014 .082l.011 .1v.11l-.014 .111a.992.992 0 0 1 -.026 .11l-.039 .108l-.036 .075l-.016 .03c-2.764 4.836 -6.3 7.38 -10.555 7.499l-.313 .004c-4.396 0 -8.037 -2.549 -10.868 -7.504a1 1 0 0 1 0 -.992c2.831 -4.955 6.472 -7.504 10.868 -7.504zm0 5a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z" />
              </svg>
            </button>
          </td>
        </tr>
      `,
    )
    .join("");

  // Gán sự kiện click cho nút xem chi tiết
  Array.from(tbody.querySelectorAll(".detail-btn")).forEach((btn, idx) => {
    btn.addEventListener("click", function () {
      const p = productsCache[idx];
      showProductModal(p);
    });
  });
}

function renderGridView() {
  const gridView = document.getElementById("gridView");
  gridView.innerHTML = "";
  gridView.style.display = "";
  document.getElementById("tableView").style.display = "none";
  const products = getFilteredProducts();
  if (!products.length) {
    gridView.innerHTML =
      '<div style="padding:2rem;text-align:center;color:#888">Không có sản phẩm nào</div>';
    return;
  }
  gridView.style.display = "grid";
  gridView.style.gridTemplateColumns = "repeat(auto-fit, minmax(370px, 1fr))";
  gridView.style.gap = "24px";
  products.forEach((p, idx) => {
    const card = document.createElement("div");
    card.className = "product-card";
    card.style.background = "#fff";
    card.style.borderRadius = "12px";
    card.style.boxShadow = "0 2px 12px #0001";
    card.style.padding = "20px 18px 18px 18px";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.justifyContent = "space-between";
    card.style.border = "1px solid #eee";
    card.innerHTML = `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div style="font-size:18px;font-weight:700;color:#222;">${p.ItemCode || "-"}</div>
            <span style="background:#eafbe7;color:#47b54d;font-size:13px;font-weight:600;padding:4px 16px;border-radius:16px;white-space:nowrap;align-self:flex-start;${p.Item_Status !== "ACTIVE" ? "background:#fbeaea;color:#d9534f" : ""}">
            ${p.Item_Status === "ACTIVE" ? "Hoạt động" : "Ngừng hoạt động"}
            </span>
        </div>
        <div style="font-size:15px;font-weight:500;margin:6px 0 2px 0;line-height:1.4;">${p.ItemName || "-"}</div>
        <div style="background:#f6f6ff;border-radius:8px;padding:10px 12px 8px 12px;margin-bottom:10px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:2px;color:#888;">SẢN PHẨM</div>
            <div style="display:flex;align-items:center;gap:8px;font-size:15px;">
            <i class="fa-solid fa-box" style="color:#bdbdbd;"></i>
            <span style="font-weight:600;">${p.ItemCode || "-"}</span>
            <span style="color:#888;">${p.ItemName || "-"}</span>
            </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px;font-size:13px;color:#888;margin-bottom:8px;">
            <div>Group: <b>${p.Group || "-"}</b></div>
            <div>Category: <b>${p.Category || "-"}</b></div>
            <div>Brand: <b>${p.Brand || "-"}</b></div>
            <div>Base Unit: <b>${p.BaseUnit || "-"}</b></div>
            <div><i class="fa-regular fa-clock"></i> Cập nhật: <b>${p.timestamp ? formatDateTime(p.timestamp) : "-"}</b></div>
        </div>
        <button class="detail-btn" style="margin-top:10px;background:#6259ee;color:#fff;border:none;padding:10px 0;border-radius:8px;cursor:pointer;font-weight:600;font-size:15px;">Xem chi tiết</button>
        `;
    card.querySelector(".detail-btn").onclick = () => showProductModal(p);
    gridView.appendChild(card);
  });
}

function showProductModal(product) {
  const modal = document.getElementById("productDetailModal");
  const body = document.getElementById("productDetailBody");
  body.innerHTML = `
    <h2 style=\"margin-bottom:16px;color:#6259ee\">Chi tiết sản phẩm</h2>
    <table style=\"width:100%;border-collapse:collapse;\">
      <tr><td style='font-weight:600;padding:6px 0; padding-right:12px; width:160px;'>ProductMasterId</td><td>${product.ProductMasterId || "-"}</td></tr>
      <tr><td style='font-weight:600;padding:6px 0; width:160px;'>Mã SP</td><td>${product.ItemCode || "-"}</td></tr>
      <tr><td style='font-weight:600;padding:6px 0; width:160px;'>Tên SP</td><td>${product.ItemName || "-"}</td></tr>
      <tr><td style='font-weight:600;padding:6px 0; width:160px;'>Loại</td><td>${product.Item_Type || "-"}</td></tr>
      <tr><td style='font-weight:600;padding:6px 0; width:160px;'>Nhóm</td><td>${product.Group || "-"}</td></tr>
      <tr><td style='font-weight:600;padding:6px 0; width:160px;'>Category</td><td>${product.Category || "-"}</td></tr>
      <tr><td style='font-weight:600;padding:6px 0; width:160px;'>Brand</td><td>${product.Brand || "-"}</td></tr>
      <tr><td style='font-weight:600;padding:6px 0; width:160px;'>Đơn vị cơ sở</td><td>${product.BaseUnit || "-"}</td></tr>
      <tr><td style='font-weight:600;padding:6px 0; width:160px;'>Đơn vị tồn kho</td><td>${product.InventoryUnit || "-"}</td></tr>
      <tr><td style='font-weight:600;padding:6px 0; width:160px;'>Trạng thái</td><td>${product.Item_Status || "-"}</td></tr>
      <tr><td style='font-weight:600;padding:6px 0; width:160px;'>Ngày cập nhật</td><td>${product.timestamp ? formatDateTime(product.timestamp) : "-"}</td></tr>
    </table>
    <h3 style=\"margin:18px 0 8px 0;color:#1c96ff\">MHUTypes</h3>
    <table style=\"width:100%;border-collapse:collapse;\">
      <tr><td style='font-weight:600;padding:6px 0; width:160px;'>MHUTypeId</td><td>${product.MHUTypeId || "-"}</td></tr>
      <tr><td style='font-weight:600;padding:6px 0; width:160px;'>FromUnit</td><td>${product.FromUnit || "-"}</td></tr>
      <tr><td style='font-weight:600;padding:6px 0; width:160px;'>ToUnit</td><td>${product.ToUnit || "-"}</td></tr>
      <tr><td style='font-weight:600;padding:6px 0; width:160px;'>Conversion</td><td>${product.Conversion || "-"}</td></tr>
    </table>
  `;
  modal.style.display = "block";
}

window.addEventListener("DOMContentLoaded", async () => {
  const gridBtn = document.getElementById("gridViewBtn");
  const tableBtn = document.getElementById("tableViewBtn");
  const modal = document.getElementById("productDetailModal");
  const gridViewEl = document.getElementById("gridView");
  const tableViewEl = document.getElementById("tableView");

  // Default view: table
  if (tableViewEl && gridViewEl) {
    tableViewEl.style.display = "";
    gridViewEl.style.display = "none";
    if (tableBtn) tableBtn.classList.add("active");
    if (gridBtn) gridBtn.classList.remove("active");
  }
  if (gridBtn && tableBtn) {
    gridBtn.onclick = () => {
      gridViewEl.style.display = "";
      tableViewEl.style.display = "none";
      gridBtn.classList.add("active");
      tableBtn.classList.remove("active");
      renderGridView();
    };
    tableBtn.onclick = () => {
      gridViewEl.style.display = "none";
      tableViewEl.style.display = "";
      tableBtn.classList.add("active");
      gridBtn.classList.remove("active");
      renderTable();
    };
  }

  modal.onclick = (e) => {
    if (e.target === modal) modal.style.display = "none";
  };

  try {
    // Restore state first
    const searchInput = document.getElementById("searchInput");
    if (restoreProductsState()) {
      if (searchInput) searchInput.value = filterSearch;
    }
    // Initialize custom dropdowns
    initDropdownToggle("statusInput", "statusDropdown");
    initDropdownToggle("typeInput", "typeDropdown");
    await populateStatusOptions();
    await populateTypeOptions();
    await loadProducts(true);
    await updateStats();
  } catch (e) {
    document.getElementById("productTableBody").innerHTML =
      `<tr><td colspan='9' style='color:red'>${e.message}</td></tr>`;
  }

  // Thêm sự kiện cho nút Làm mới
  const refreshBtn = document.querySelector(".refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      try {
        // Reset filters
        const searchInput = document.getElementById("searchInput");
        if (searchInput) searchInput.value = "";
        filterSearch = "";
        selectedStatuses = [];
        selectedTypes = [];
        currentPage = 1;
        try {
          sessionStorage.removeItem(STATE_KEY);
        } catch (_) {}
        updateStatusSelectedText();
        updateTypeSelectedText();
        updateSelectAllState(".status-checkbox", "statusSelectAll");
        updateSelectAllState(".type-checkbox", "typeSelectAll");
        currentPage = 1;
        await loadProducts(true);
        await updateStats();
      } catch (e) {
        document.getElementById("productTableBody").innerHTML =
          `<tr><td colspan='9' style='color:red'>${e.message}</td></tr>`;
      }
    });
  }

  // Lắng nghe thay đổi filter loại để render lại view hiện tại
  // Custom filters handled via checkbox change events in populate* functions

  // Search input with debounce
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    let t;
    searchInput.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        filterSearch = (searchInput.value || "").trim();
        currentPage = 1;
        saveProductsState();
        loadProducts(true);
        updateStats();
      }, 300);
    });
  }

  // Pagination functions on window for inline handlers
  window.prevPage = async function () {
    if (currentPage > 1) {
      currentPage -= 1;
      saveProductsState();
      await loadProducts(false);
    }
  };
  window.nextPage = async function () {
    if (currentPage < totalPages) {
      currentPage += 1;
      saveProductsState();
      await loadProducts(false);
    }
  };
});
