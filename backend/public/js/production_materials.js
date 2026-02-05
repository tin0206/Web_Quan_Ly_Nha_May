const API_ROUTE = window.location.origin;
const PAGE_SIZE = 20;

let productionOrders = [];
let batchCodes = [];
let ingredientCodes = [];
let results = ["Success", "Failed"];

const state = {
  pos: new Set(),
  batches: new Set(),
  ingredients: new Set(),
  results: new Set(),
};

function $(id) {
  return document.getElementById(id);
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

function toggleDropdown(inputId, dropdownId) {
  const input = $(inputId);
  const dropdown = $(dropdownId);
  if (!input || !dropdown) return;
  input.addEventListener("click", () => {
    const shown = dropdown.style.display === "block";
    dropdown.style.display = shown ? "none" : "block";
  });
}

function updateSelectedText(selectedSet, selectedTextId, emptyText) {
  const el = $(selectedTextId);
  if (!el) return;
  const count = selectedSet.size;
  el.textContent = count > 0 ? `${count} selected` : emptyText;
}

function renderOptions({
  containerId,
  selectAllId,
  selectedSet,
  items,
  valueKey,
  selectedTextId,
  emptyText,
}) {
  const container = $(containerId);
  const selectAll = $(selectAllId);
  if (!container || !selectAll) return;

  // Clear
  container.innerHTML = "";

  // Build options
  items.forEach((item) => {
    const value = item[valueKey];
    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "8px";
    label.style.cursor = "pointer";
    label.style.padding = "6px 8px";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.value = value;
    cb.checked = selectedSet.has(value);
    cb.addEventListener("change", () => {
      if (cb.checked) selectedSet.add(value);
      else selectedSet.delete(value);
      updateSelectedText(selectedSet, selectedTextId, emptyText);
    });

    const span = document.createElement("span");
    span.textContent = value;

    label.appendChild(cb);
    label.appendChild(span);
    container.appendChild(label);
  });

  // Select all behavior
  selectAll.checked = false;
  selectAll.onchange = () => {
    const allCbs = container.querySelectorAll("input[type='checkbox']");
    allCbs.forEach((cb) => {
      cb.checked = selectAll.checked;
      const value = cb.dataset.value;
      if (selectAll.checked) selectedSet.add(value);
      else selectedSet.delete(value);
    });
    updateSelectedText(selectedSet, selectedTextId, emptyText);
  };

  updateSelectedText(selectedSet, selectedTextId, emptyText);
}

async function loadPOs() {
  const data = await fetchJSON(
    `${API_ROUTE}/api/production-materials/production-orders`,
  );
  const items = data.data || [];
  productionOrders = items.map((r) => r.productionOrderNumber);
  renderOptions({
    containerId: "poOptions",
    selectAllId: "poSelectAll",
    selectedSet: state.pos,
    items,
    valueKey: "productionOrderNumber",
    selectedTextId: "poSelectedText",
    emptyText: "Select production orders...",
  });
}

async function loadBatches() {
  const pos = Array.from(state.pos);
  let items = [];
  if (pos.length === 0) {
    const data = await fetchJSON(
      `${API_ROUTE}/api/production-materials/batch-codes`,
    );
    items = data.data || [];
  } else {
    // Union batches across selected POs
    const seen = new Set();
    for (const po of pos) {
      try {
        const data = await fetchJSON(
          `${API_ROUTE}/api/production-materials/batch-codes?productionOrderNumber=${encodeURIComponent(
            po,
          )}`,
        );
        for (const r of data.data || []) {
          if (!seen.has(r.batchCode)) {
            seen.add(r.batchCode);
            items.push(r);
          }
        }
      } catch (_) {}
    }
    // Sort ascending
    items.sort((a, b) =>
      String(a.batchCode).localeCompare(String(b.batchCode)),
    );
  }

  batchCodes = items.map((r) => r.batchCode);

  renderOptions({
    containerId: "batchOptions",
    selectAllId: "batchSelectAll",
    selectedSet: state.batches,
    items,
    valueKey: "batchCode",
    selectedTextId: "batchSelectedText",
    emptyText: "Select batches...",
  });
}

async function loadIngredients() {
  const pos = Array.from(state.pos);
  const batches = Array.from(state.batches);
  let items = [];

  if (pos.length === 0 && batches.length === 0) {
    const data = await fetchJSON(
      `${API_ROUTE}/api/production-materials/ingredients`,
    );
    items = data.data || [];
  } else {
    const seen = new Set();
    const targets = pos.length > 0 ? pos : [undefined];
    const batchTargets = batches.length > 0 ? batches : [undefined];
    for (const po of targets) {
      for (const bc of batchTargets) {
        const qs = [];
        if (po) qs.push(`productionOrderNumber=${encodeURIComponent(po)}`);
        if (bc) qs.push(`batchCode=${encodeURIComponent(bc)}`);
        const url = `${API_ROUTE}/api/production-materials/ingredients${qs.length ? `?${qs.join("&")}` : ""}`;
        try {
          const data = await fetchJSON(url);
          for (const r of data.data || []) {
            if (!seen.has(r.ingredientCode)) {
              seen.add(r.ingredientCode);
              items.push(r);
            }
          }
        } catch (_) {}
      }
    }
    // Sort ascending
    items.sort((a, b) =>
      String(a.ingredientCode).localeCompare(String(b.ingredientCode)),
    );
  }

  ingredientCodes = items.map((r) => r.ingredientCode);

  renderOptions({
    containerId: "ingredientOptions",
    selectAllId: "ingredientSelectAll",
    selectedSet: state.ingredients,
    items,
    valueKey: "ingredientCode",
    selectedTextId: "ingredientSelectedText",
    emptyText: "Select ingredients...",
  });
}

function loadStatuses() {
  const items = results.map((s) => ({ result: s }));
  renderOptions({
    containerId: "resultOptions",
    selectAllId: "resultSelectAll",
    selectedSet: state.results,
    items,
    valueKey: "result",
    selectedTextId: "resultSelectedText",
    emptyText: "Select results...",
  });
}

function wireInteractions() {
  // Toggle dropdowns
  toggleDropdown("poInput", "poDropdown");
  toggleDropdown("batchInput", "batchDropdown");
  toggleDropdown("ingredientInput", "ingredientDropdown");
  toggleDropdown("resultInput", "resultDropdown");

  // React to selection changes by reloading dependent lists
  // We observe changes via select-all handler and per checkbox change inside renderOptions
  // To keep things simple, reload batches/ingredients when PO selection text changes
  const poSelectedText = $("poSelectedText");
  const batchSelectedText = $("batchSelectedText");
  const observer = new MutationObserver(async () => {
    await loadBatches();
    await loadIngredients();
  });
  if (poSelectedText) {
    observer.observe(poSelectedText, { childList: true });
  }

  // Also reload ingredients when batch changes
  const observerBatch = new MutationObserver(async () => {
    await loadIngredients();
  });
  if (batchSelectedText) {
    observerBatch.observe(batchSelectedText, { childList: true });
  }

  // Reload search when result/status changes
  const resultSelectedText = $("resultSelectedText");
  const observerResult = new MutationObserver(async () => {
    await queryAndRender(1);
  });
  if (resultSelectedText) {
    observerResult.observe(resultSelectedText, { childList: true });
  }

  // Date inputs trigger search
  const fromEl = $("materialsDateFrom");
  const toEl = $("materialsDateTo");
  [fromEl, toEl].forEach((el) => {
    if (el) el.addEventListener("change", () => queryAndRender(1));
  });

  // Refresh button
  const refreshBtn = document.querySelector(".refresh-btn");
  if (refreshBtn) refreshBtn.addEventListener("click", () => queryAndRender(1));
}

async function init() {
  try {
    wireInteractions();
    loadStatuses();
    await loadPOs();
    await loadBatches();
    await loadIngredients();
    await queryAndRender(1);
  } catch (err) {
    console.error("Materials init error:", err);
  }
}

document.addEventListener("DOMContentLoaded", init);

function formatDateTime(dateString) {
  if (!dateString) return "";
  const [datePart, timePart] = dateString.split("T");
  if (!datePart || !timePart) return dateString;

  const [year, month, day] = datePart.split("-");
  const [hours, minutes, seconds] = timePart.replace("Z", "").split(":");

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

function formatDate(dateString) {
  if (!dateString) return "";

  // Chỉ lấy phần ngày
  const datePart = dateString.split("T")[0];
  const [year, month, day] = datePart.split("-");

  if (!year || !month || !day) return dateString;

  return `${day}/${month}/${year}`;
}

// ------- Search + Table + Stats -------

function getCSV(set) {
  return Array.from(set).join(",");
}

function getFilters() {
  const fromDate = $("materialsDateFrom")?.value || "";
  const toDate = $("materialsDateTo")?.value || "";
  const params = new URLSearchParams();
  if (state.pos.size) params.set("productionOrderNumber", getCSV(state.pos));
  if (state.batches.size) params.set("batchCode", getCSV(state.batches));
  if (state.ingredients.size)
    params.set("ingredientCode", getCSV(state.ingredients));
  if (state.results.size) params.set("respone", getCSV(state.results));
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  return params;
}

let currentPage = 1;

async function fetchItems(page) {
  const params = getFilters();
  params.set("page", String(page));
  params.set("pageSize", String(PAGE_SIZE));
  const url = `${API_ROUTE}/api/production-materials/search?${params.toString()}`;
  const data = await fetchJSON(url);
  return data.data || [];
}

async function fetchTotal() {
  const params = getFilters();
  const hasFilters =
    params.has("productionOrderNumber") ||
    params.has("batchCode") ||
    params.has("ingredientCode") ||
    params.has("respone") ||
    params.has("fromDate") ||
    params.has("toDate");
  const base = hasFilters
    ? `${API_ROUTE}/api/production-materials/stats/search`
    : `${API_ROUTE}/api/production-materials/stats`;
  const url = hasFilters ? `${base}?${params.toString()}` : base;
  const data = await fetchJSON(url);
  return Number(data?.data?.total || 0);
}

function normalizeStatus(respone) {
  return String(respone).toLowerCase() === "success" ? "Success" : "Failed";
}

function renderStatus(respone) {
  const ok = String(respone).toLowerCase() === "success";
  const cls = ok
    ? "status-badge status-success"
    : "status-badge status-inactive";
  const text = normalizeStatus(respone);
  return `<span class="${cls}">${text}</span>`;
}

function openViewModal(material) {
  const modal = document.getElementById("materialModal");
  document.getElementById("modalId").textContent = material.id || "-";
  document.getElementById("modalProductionOrderNumber").textContent =
    material.ProductionOrderNumber || "-";
  document.getElementById("modalBatchCode").textContent =
    material.batchCode || "-";
  document.getElementById("modalIngredientCode").textContent =
    material.ingredientCode;
  document.getElementById("modalLot").textContent = material.lot || "-";

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

  modal.style.display = "block";
}

// Close modal handlers
// Close when clicking the dedicated close button
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "closeModalBtn") {
    const modal = $("materialModal");
    if (modal) modal.style.display = "none";
  }
});

// Close when clicking on the overlay
document.addEventListener("click", (e) => {
  const modal = $("materialModal");
  if (modal && e.target && e.target.id === "materialModal") {
    modal.style.display = "none";
  }
});

// ESC key closes modal
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const modal = $("materialModal");
    if (modal) modal.style.display = "none";
  }
});

function renderTable(items) {
  const tbody = $("materialsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!items.length) return;

  const rowsHtml = items
    .map((r) => {
      return `
        <tr>
          <td>${r.id ?? "-"}</td>
          <td>${r.productionOrderNumber ?? "-"}</td>
          <td style="text-align:center">${r.batchCode ?? "-"}</td>
          <td>${r.quantity ?? "-"} ${r.unitOfMeasurement ?? ""}</td>
          <td>${r.ingredientCode ?? "-"}</td>
          <td>${r.lot ?? "-"}</td>
          <td style="text-align:center">${r.operator_ID ?? "-"}</td>
          <td style="text-align:center">${renderStatus(r.respone)}</td>
          <td>${formatDateTime(r.timestamp) ?? "-"}</td>
          <td style="text-align:center">
            <div style="display: flex; align-items: center; justify-content: center;">
              <button class="action-view-btn" title="Xem chi tiết">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 4c4.29 0 7.863 2.429 10.665 7.154l.22 .379l.045 .1l.03 .083l.014 .055l.014 .082l.011 .1v.11l-.014 .111a.992 .992 0 0 1 -.026 .11l-.039 .108l-.036 .075l-.016 .03c-2.764 4.836 -6.3 7.38 -10.555 7.499l-.313 .004c-4.396 0 -8.037 -2.549 -10.868 -7.504a1 1 0 0 1 0 -.992c2.831 -4.955 6.472 -7.504 10.868 -7.504zm0 5a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z" />
                </svg>
              </button>
            </div>
          </td>
        </tr>`;
    })
    .join("");
  tbody.innerHTML = rowsHtml;

  // Wire view buttons
  tbody.querySelectorAll(".action-view-btn").forEach((btn, idx) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openViewModal(items[idx]);
    });
  });
}

function updatePagination(page, total) {
  currentPage = page;
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const info = $("materialsPageInfo");
  if (info) info.textContent = `Trang ${page} / ${totalPages}`;
  const prevBtn = $("materialsPrevPageBtn");
  const nextBtn = $("materialsNextPageBtn");
  if (prevBtn) prevBtn.disabled = page <= 1;
  if (nextBtn) nextBtn.disabled = page >= totalPages;

  // Expose handlers globally for inline onclick
  window.materialsPrevPage = async function () {
    if (currentPage > 1) await queryAndRender(currentPage - 1);
  };
  window.materialsNextPage = async function () {
    const tp = Math.max(Math.ceil(total / PAGE_SIZE), 1);
    if (currentPage < tp) await queryAndRender(currentPage + 1);
  };
}

async function queryAndRender(page) {
  try {
    const [total, items] = await Promise.all([fetchTotal(), fetchItems(page)]);
    renderTable(items);
    updatePagination(page, total);
    const statEl = $("materials-total-stat");
    if (statEl) statEl.textContent = String(total);
  } catch (err) {
    console.error("Query render error:", err);
  }
}
