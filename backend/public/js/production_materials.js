const API_ROUTE = window.location.origin;
const PAGE_SIZE = 20;

let productionOrders = [];
let batchCodes = [];
let ingredientCodes = [];
let results = ["Success", "Failed"];
let shifts = [];

const state = {
  pos: new Set(),
  batches: new Set(),
  ingredients: new Set(),
  results: new Set(),
  shifts: new Set(),
};

// Session storage keys
const STORAGE_FILTERS_KEY = "materialsFilters";
const STORAGE_PAGE_KEY = "materialsPage";

function saveSessionFilters() {
  try {
    const fromDate = $("materialsDateFrom")?.value || "";
    const toDate = $("materialsDateTo")?.value || "";
    const payload = {
      pos: Array.from(state.pos),
      batches: Array.from(state.batches),
      ingredients: Array.from(state.ingredients),
      results: Array.from(state.results),
      shifts: Array.from(state.shifts),
      fromDate,
      toDate,
    };
    sessionStorage.setItem(STORAGE_FILTERS_KEY, JSON.stringify(payload));
  } catch (_) {}
}

function saveSessionPageAndView() {
  try {
    const payload = { page: currentPage, view: currentView };
    sessionStorage.setItem(STORAGE_PAGE_KEY, JSON.stringify(payload));
  } catch (_) {}
}

function restoreSessionState() {
  try {
    const filtersRaw = sessionStorage.getItem(STORAGE_FILTERS_KEY);
    if (filtersRaw) {
      const f = JSON.parse(filtersRaw);
      if (Array.isArray(f.pos)) f.pos.forEach((v) => state.pos.add(v));
      if (Array.isArray(f.batches))
        f.batches.forEach((v) => state.batches.add(v));
      if (Array.isArray(f.ingredients))
        f.ingredients.forEach((v) => state.ingredients.add(v));
      if (Array.isArray(f.results))
        f.results.forEach((v) => state.results.add(v));
      if (Array.isArray(f.shifts)) f.shifts.forEach((v) => state.shifts.add(v));
      if (f.fromDate) {
        const el = $("materialsDateFrom");
        if (el) el.value = f.fromDate;
      }
      if (f.toDate) {
        const el = $("materialsDateTo");
        if (el) el.value = f.toDate;
      }
      // Reflect restored filters to visible inputs
      syncInputFromSet("poInput", state.pos);
      syncInputFromSet("batchInput", state.batches);
      syncInputFromSet("ingredientInput", state.ingredients);
      updateSelectedText(
        state.results,
        "resultSelectedText",
        "Select results...",
      );
      updateSelectedText(state.shifts, "shiftSelectedText", "Select shifts...");
    }
    const pageRaw = sessionStorage.getItem(STORAGE_PAGE_KEY);
    if (pageRaw) {
      const p = JSON.parse(pageRaw);
      if (typeof p.page === "number" && p.page > 0) currentPage = p.page;
      if (p.view === "grid" || p.view === "table") currentView = p.view;
      // Reflect view button state without triggering fetch
      document.querySelectorAll(".view-btn").forEach((b) => {
        const v = b.getAttribute("data-view");
        if (v === currentView) b.classList.add("active");
        else b.classList.remove("active");
      });
    }
  } catch (_) {}
}

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

function updateSelectedText(
  selectedSet,
  selectedTextId,
  emptyText,
  displayLimit,
) {
  const el = $(selectedTextId);
  if (!el) return;
  const values = Array.from(selectedSet);
  const fullText = values.join(", ");
  let text = values.length ? fullText : emptyText;
  if (
    values.length &&
    typeof displayLimit === "number" &&
    values.length > displayLimit
  ) {
    text = `${values.slice(0, displayLimit).join(", ")} ...`;
  }
  el.textContent = text;
  el.title = fullText || emptyText; // tooltip shows full list
  // Placeholder vs selected color hint
  el.style.color = values.length ? "#333" : "#999";
}

function renderOptions({
  containerId,
  selectAllId,
  selectedSet,
  items,
  valueKey,
  selectedTextId,
  emptyText,
  displayLimit,
  onChange,
}) {
  const container = $(containerId);
  const selectAll = $(selectAllId);
  if (!container || !selectAll) return;

  // Clear
  container.innerHTML = "";

  // Build options
  items.forEach((item) => {
    const value =
      item && typeof item === "object" && valueKey ? item[valueKey] : item;
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
      updateSelectedText(selectedSet, selectedTextId, emptyText, displayLimit);
      // Persist filters after every change
      saveSessionFilters();
      if (typeof onChange === "function") {
        Promise.resolve(onChange()).catch(() => {});
      }
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
    updateSelectedText(selectedSet, selectedTextId, emptyText, displayLimit);
    // Persist filters after bulk change
    saveSessionFilters();
    if (typeof onChange === "function") {
      Promise.resolve(onChange()).catch(() => {});
    }
  };

  updateSelectedText(selectedSet, selectedTextId, emptyText, displayLimit);
}

function parseInputValues(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function syncInputFromSet(inputId, selectedSet) {
  const input = $(inputId);
  if (!input) return;
  input.value = Array.from(selectedSet).join(", ");
}

function renderDatalistOptions(datalistId, values, keyword = "") {
  const datalist = $(datalistId);
  if (!datalist) return;

  const search = String(keyword || "")
    .trim()
    .toLowerCase();
  const filtered = values
    .filter((v) => String(v).toLowerCase().includes(search))
    .slice(0, 120);

  datalist.innerHTML = filtered
    .map(
      (v) => `<option value="${String(v).replace(/"/g, "&quot;")}"></option>`,
    )
    .join("");
}

function bindSearchableInput({
  inputId,
  datalistId,
  selectedSet,
  getValues,
  onCommit,
}) {
  const input = $(inputId);
  if (!input) return;

  let debounceTimer = null;

  const commit = async () => {
    const values = parseInputValues(input.value);
    selectedSet.clear();
    values.forEach((v) => selectedSet.add(v));
    syncInputFromSet(inputId, selectedSet);
    saveSessionFilters();
    if (typeof onCommit === "function") await onCommit();
    renderDatalistOptions(datalistId, getValues(), input.value);
  };

  const debouncedCommit = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      Promise.resolve(commit()).catch(() => {});
    }, 350);
  };

  input.addEventListener("focus", () => {
    renderDatalistOptions(datalistId, getValues(), input.value);
  });

  input.addEventListener("input", () => {
    renderDatalistOptions(datalistId, getValues(), input.value);
    debouncedCommit();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(debounceTimer);
      Promise.resolve(commit()).catch(() => {});
      input.blur();
    }
  });
}

async function loadPOs() {
  const dateQS = getDateParams();
  const data = await fetchJSON(
    `${API_ROUTE}/api/production-materials/production-orders${dateQS ? `?${dateQS}` : ""}`,
  );
  const items = data.data || [];
  productionOrders = items.map((r) =>
    r.productionOrderNumber === ""
      ? "NULL"
      : (r.productionOrderNumber ?? "NULL"),
  );
  syncInputFromSet("poInput", state.pos);
  renderDatalistOptions(
    "poDatalist",
    productionOrders,
    $("poInput")?.value || "",
  );
}

async function loadBatches() {
  const pos = Array.from(state.pos);
  const dateQS = getDateParams();
  let items = [];
  if (pos.length === 0) {
    const data = await fetchJSON(
      `${API_ROUTE}/api/production-materials/batch-codes${dateQS ? `?${dateQS}` : ""}`,
    );
    items = data.data || [];
  } else {
    // Union batches across selected POs
    const seen = new Set();
    for (const po of pos) {
      try {
        const qs = [`productionOrderNumber=${encodeURIComponent(po)}`];
        if (dateQS) qs.push(dateQS);
        const data = await fetchJSON(
          `${API_ROUTE}/api/production-materials/batch-codes?${qs.join("&")}`,
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

  batchCodes = items.map((r) => r.batchCode ?? "NULL");
  syncInputFromSet("batchInput", state.batches);
  renderDatalistOptions(
    "batchDatalist",
    batchCodes,
    $("batchInput")?.value || "",
  );
}

async function loadIngredients() {
  const pos = Array.from(state.pos);
  const batches = Array.from(state.batches);
  const dateQS = getDateParams();
  let items = [];

  if (pos.length === 0 && batches.length === 0) {
    const data = await fetchJSON(
      `${API_ROUTE}/api/production-materials/ingredients${dateQS ? `?${dateQS}` : ""}`,
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
        if (dateQS) qs.push(dateQS);
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

  ingredientCodes = items.map((r) => r.ingredientCode ?? "NULL");
  syncInputFromSet("ingredientInput", state.ingredients);
  renderDatalistOptions(
    "ingredientDatalist",
    ingredientCodes,
    $("ingredientInput")?.value || "",
  );
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
    onChange: async () => {
      await queryAndRender(1);
    },
  });
}

async function loadShifts() {
  try {
    const dateQS = getDateParams();
    const data = await fetchJSON(
      `${API_ROUTE}/api/production-materials/shifts${dateQS ? `?${dateQS}` : ""}`,
    );
    shifts = (data.data || []).map((r) => r.shift).filter(Boolean);
  } catch (_) {
    shifts = [];
  }
  renderOptions({
    containerId: "shiftOptions",
    selectAllId: "shiftSelectAll",
    selectedSet: state.shifts,
    items: shifts.map((s) => ({ shift: s })),
    valueKey: "shift",
    selectedTextId: "shiftSelectedText",
    emptyText: "Select shifts...",
    onChange: async () => {
      await queryAndRender(1);
    },
  });
}

function wireInteractions() {
  // Keep result and shift filters as multiselect dropdowns
  toggleDropdown("resultInput", "resultDropdown");
  toggleDropdown("shiftInput", "shiftDropdown");

  // Bind text-based contains search filters
  bindSearchableInput({
    inputId: "poInput",
    datalistId: "poDatalist",
    selectedSet: state.pos,
    getValues: () => productionOrders,
    onCommit: async () => {
      state.batches.clear();
      state.ingredients.clear();
      syncInputFromSet("batchInput", state.batches);
      syncInputFromSet("ingredientInput", state.ingredients);
      await loadBatches();
      await loadIngredients();
      await queryAndRender(1);
    },
  });

  bindSearchableInput({
    inputId: "batchInput",
    datalistId: "batchDatalist",
    selectedSet: state.batches,
    getValues: () => batchCodes,
    onCommit: async () => {
      state.ingredients.clear();
      syncInputFromSet("ingredientInput", state.ingredients);
      await loadIngredients();
      await queryAndRender(1);
    },
  });

  bindSearchableInput({
    inputId: "ingredientInput",
    datalistId: "ingredientDatalist",
    selectedSet: state.ingredients,
    getValues: () => ingredientCodes,
    onCommit: async () => {
      await queryAndRender(1);
    },
  });

  // Reload search when result/status changes
  const resultSelectedText = $("resultSelectedText");
  const observerResult = new MutationObserver(async () => {
    await queryAndRender(1);
  });
  if (resultSelectedText) {
    observerResult.observe(resultSelectedText, { childList: true });
  }

  // Reload search when shift changes
  const shiftSelectedText = $("shiftSelectedText");
  const observerShift = new MutationObserver(async () => {
    await queryAndRender(1);
  });
  if (shiftSelectedText) {
    observerShift.observe(shiftSelectedText, { childList: true });
  }

  // Date inputs trigger search
  const fromEl = $("materialsDateFrom");
  const toEl = $("materialsDateTo");
  // Set default dates to today only if no session saved
  const todayStr = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  })();
  const hasSession = !!sessionStorage.getItem(STORAGE_FILTERS_KEY);
  if (!hasSession) {
    if (fromEl && !fromEl.value) fromEl.value = todayStr;
    if (toEl && !toEl.value) toEl.value = todayStr;
  }
  [fromEl, toEl].forEach((el) => {
    if (el)
      el.addEventListener("change", async () => {
        // Reset dependent filters when date range changes
        state.pos.clear();
        state.batches.clear();
        state.ingredients.clear();
        syncInputFromSet("poInput", state.pos);
        syncInputFromSet("batchInput", state.batches);
        syncInputFromSet("ingredientInput", state.ingredients);

        saveSessionFilters();
        await loadPOs();
        await loadBatches();
        await loadIngredients();
        await loadShifts();
        queryAndRender(1);
      });
  });

  // Refresh button (supports id or class)
  const refreshBtn =
    document.getElementById("refreshButton") ||
    document.querySelector(".refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      // Reset all filters and selections
      state.pos.clear();
      state.batches.clear();
      state.ingredients.clear();
      state.results.clear();
      state.shifts.clear();
      const fromDate = $("materialsDateFrom");
      const toDate = $("materialsDateTo");
      // Reset to default: current day
      if (fromDate) fromDate.value = todayStr;
      if (toDate) toDate.value = todayStr;

      // Reset input filters
      const poInput = $("poInput");
      if (poInput) poInput.value = "";
      const batchInput = $("batchInput");
      if (batchInput) batchInput.value = "";
      const ingredientInput = $("ingredientInput");
      if (ingredientInput) ingredientInput.value = "";

      // Reset result selected text
      const resSelected = $("resultSelectedText");
      if (resSelected) {
        resSelected.textContent = "Chọn Trạng thái";
        resSelected.title = "";
      }

      // Uncheck all checkboxes in result dropdown
      document
        .querySelectorAll("#resultDropdown input[type=checkbox]")
        .forEach((cb) => (cb.checked = false));

      // Reset shift selected text
      const shiftSelected = $("shiftSelectedText");
      if (shiftSelected) {
        shiftSelected.textContent = "Select shifts...";
        shiftSelected.title = "";
      }

      // Uncheck all checkboxes in shift dropdown
      document
        .querySelectorAll("#shiftDropdown input[type=checkbox]")
        .forEach((cb) => (cb.checked = false));

      // Reload cascades so dependent options are repopulated
      loadPOs();
      loadBatches();
      loadIngredients();
      loadStatuses();
      loadShifts();
      // Preserve current view (grid or table) on refresh
      // Do not force table; keep whatever the user selected

      // Fetch page 1
      queryAndRender(1);

      // Reset pagination to page 1 and persist defaults
      currentPage = 1;
      saveSessionFilters();
      saveSessionPageAndView();
    });
  }

  // View toggle buttons
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = btn.getAttribute("data-view");
      setView(v);
    });
  });
}

async function init() {
  try {
    // Restore previous filters + pagination/view from session before wiring
    restoreSessionState();
    wireInteractions();
    loadStatuses();
    loadShifts();
    await loadPOs();
    await loadBatches();
    await loadIngredients();
    await queryAndRender(currentPage);
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

function getDateParams() {
  const fromDate = $("materialsDateFrom")?.value || "";
  const toDate = $("materialsDateTo")?.value || "";
  const qs = [];
  if (fromDate) qs.push(`fromDate=${encodeURIComponent(fromDate)}`);
  if (toDate) qs.push(`toDate=${encodeURIComponent(toDate)}`);
  return qs.join("&");
}

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
  if (state.shifts.size) params.set("shift", getCSV(state.shifts));
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  return params;
}

let currentPage = 1;
let currentView = "table"; // 'table' | 'grid'

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
    params.has("shift") ||
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
  return `<span class="${cls}">
    ${
      text === "Success"
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
    ${text}
  </span>`;
}

function openViewModal(material) {
  const modal = document.getElementById("materialModal");
  document.getElementById("modalId").textContent = material.id || "-";
  document.getElementById("modalProductionOrderNumber").textContent =
    material.ProductionOrderNumber || material.productionOrderNumber || "-";
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
  const grid = $("materialsGrid");
  if (!tbody) return;
  // Toggle visibility per view
  const tableEl = tbody.closest("table");
  if (tableEl)
    tableEl.style.display = currentView === "table" ? "table" : "none";
  if (grid) grid.style.display = currentView === "grid" ? "grid" : "none";

  if (currentView === "grid") {
    renderGrid(items);
    return;
  }
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
          <td style="text-align:center">${r.ingredientCode ?? "-"}</td>
          <td style="text-align:center">${r.lot || "-"}</td>
          <td style="text-align:center">${r.shift || "-"}</td>
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

function renderGrid(items) {
  const grid = $("materialsGrid");
  if (!grid) return;
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(280px, 1fr))";
  grid.style.gap = "12px";
  if (!items?.length) {
    grid.innerHTML = "";
    return;
  }

  const cards = items
    .map((r, idx) => {
      const statusHtml = renderStatus(r.respone);
      const qty = `${r.quantity ?? "-"} ${r.unitOfMeasurement ?? ""}`;
      return `
        <div class="card" style="border:1px solid #e8e7f0; border-radius:10px; padding:12px; background:#fff; box-shadow:0 4px 12px rgba(0,0,0,0.04)">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-weight:600; color:#333">ID: ${r.id ?? "-"}</div>
            <div>${statusHtml}</div>
          </div>
          <div style="font-size:13px; color:#666; display:grid; grid-template-columns: 1fr; gap:6px;">
            <div><b>PO:</b> ${r.productionOrderNumber ?? "-"}</div>
            <div><b>Batch:</b> ${r.batchCode ?? "-"}</div>
            <div><b>Ingredient Code:</b> ${r.ingredientCode ?? "-"}</div>
            <div><b>Lot:</b> ${r.lot || "-"}</div>
            <div><b>Shift:</b> ${r.shift || "-"}</div>
            <div><b>Qty:</b> ${qty}</div>
            <div><b>Operator:</b> ${r.operator_ID ?? "-"}</div>
            <div><b>Time:</b> ${formatDateTime(r.timestamp) ?? "-"}</div>
          </div>
          <div class="recipe-actions">
            <button class="detail-btn" data-idx="${idx}">Xem chi tiết</button>
          </div>
        </div>`;
    })
    .join("");
  grid.innerHTML = cards;

  // Attach view handlers
  grid.querySelectorAll(".action-view-btn").forEach((btn) => {
    const idx = Number(btn.getAttribute("data-idx"));
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      // items are last rendered from queryAndRender; re-fetch visible list from DOM binding
      // Simpler: click handlers are rebound after render; we close over items in scope of renderGrid()
      // eslint-disable-next-line no-undef
      openViewModal(window.__materials_last_items[idx]);
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

  // Persist current page
  saveSessionPageAndView();

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
    // stash for grid view click handlers
    window.__materials_last_items = items;
    renderTable(items);
    updatePagination(page, total);
    const statEl = $("materials-total-stat");
    if (statEl) statEl.textContent = String(total);
  } catch (err) {
    console.error("Query render error:", err);
  }
}

function setView(view) {
  currentView = view === "grid" ? "grid" : "table";
  // Update active styles
  document.querySelectorAll(".view-btn").forEach((b) => {
    const v = b.getAttribute("data-view");
    if (v === currentView) b.classList.add("active");
    else b.classList.remove("active");
  });
  // Persist view selection
  saveSessionPageAndView();
  // Re-render current page
  queryAndRender(currentPage);
}
