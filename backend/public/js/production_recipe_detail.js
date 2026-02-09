// Lấy id từ query string
const recipeId = window.location.pathname.split("/").pop();

const API_ROUTE = window.location.origin;
let recipeDetail = null;
let recipeProcesses = [];
let recipeIngredients = [];
let recipeProducts = [];
let recipeByProducts = [];
let recipeParameters = [];
let selectedProcessIds = [];

// ===== Product Detail Modal (for Ingredients) =====
function ensureProductModal() {
  if (!document.getElementById("productDetailModal")) {
    const modalDiv = document.createElement("div");
    modalDiv.id = "productDetailModal";
    modalDiv.className = "modal";
    modalDiv.style.display = "none";
    modalDiv.innerHTML = `
      <div class="modal-content" style="max-width:720px;">
        <span class="close-modal" id="closeProductModal" style="top:10px;right:14px">&times;</span>
        <h2 style="margin-top:0;margin-bottom:10px;">Chi tiết sản phẩm</h2>
        <div id="modalProductContent"></div>
      </div>
    `;
    document.body.appendChild(modalDiv);

    if (!document.getElementById("product-modal-style")) {
      const style = document.createElement("style");
      style.id = "product-modal-style";
      style.innerHTML = `
        .modal { display:none; position:fixed; z-index:1000; inset:0; background:rgba(0,0,0,.3); justify-content:center; align-items:center; }
        .modal-content { background:#fff; padding:24px; border-radius:10px; box-shadow:0 4px 24px rgba(0,0,0,.18); position:relative; }
        .close-modal { position:absolute; font-size:28px; color:#888; cursor:pointer; font-weight:bold; }
        .close-modal:hover { color:#e74c3c; }
        .kv { display:flex; gap:8px; margin-bottom:8px; }
        .kv .k { min-width:160px; color:#666; font-weight:500; }
        .kv .v { color:#222; }
        table.mhu { width:100%; border-collapse:collapse; margin-top:12px; }
        table.mhu th, table.mhu td { border:1px solid #e5e5f5; padding:8px; text-align:left; }
        table.mhu thead { background:#f6f6ff; }
      `;
      document.head.appendChild(style);
    }
  }

  const closeBtn = document.getElementById("closeProductModal");
  const modal = document.getElementById("productDetailModal");
  if (closeBtn && modal) {
    closeBtn.onclick = function () {
      modal.style.display = "none";
    };
  }
  window.addEventListener("click", function (e) {
    const m = document.getElementById("productDetailModal");
    if (e.target === m) m.style.display = "none";
  });
}

async function showProductModal(productCode) {
  try {
    ensureProductModal();
    const res = await fetch(
      `${API_ROUTE}/api/production-products/${productCode}`,
    );
    if (!res.ok) throw new Error("Không lấy được thông tin sản phẩm");
    const p = await res.json();
    const content = document.getElementById("modalProductContent");
    if (!content) return;
    content.innerHTML = `
      <div class="kv"><div class="k">ProductMasterId</div><div class="v">${p.ProductMasterId || "-"}</div></div>
      <div class="kv"><div class="k">Mã SP</div><div class="v">${p.ItemCode || "-"}</div></div>
      <div class="kv"><div class="k">Tên SP</div><div class="v">${p.ItemName || "-"}</div></div>
      <div class="kv"><div class="k">Loại</div><div class="v">${p.Item_Type || "-"}</div></div>
      <div class="kv"><div class="k">Nhóm</div><div class="v">${p.Group || "-"}</div></div>
      <div class="kv"><div class="k">Category</div><div class="v">${p.Category || "-"}</div></div>
      <div class="kv"><div class="k">Brand</div><div class="v">${p.Brand || "-"}</div></div>
      <div class="kv"><div class="k">Đơn vị cơ sở</div><div class="v">${p.BaseUnit || "-"}</div></div>
      <div class="kv"><div class="k">Đơn vị tồn kho</div><div class="v">${p.InventoryUnit || "-"}</div></div>
      <div class="kv"><div class="k">Trạng thái</div><div class="v">${p.Item_Status || "-"}</div></div>
      <div class="kv"><div class="k">Ngày cập nhật</div><div class="v">${p.timestamp ? formatDateTime(p.timestamp) : "-"}</div></div>

      <h3 style="margin-top:14px;">MHUTypes</h3>
      <table class="mhu">
        <thead>
          <tr><th style="text-align:center;">MHUTypeId</th><th style="text-align:center;">FromUnit</th><th style="text-align:center;">ToUnit</th><th style="text-align:center;">Conversion</th></tr>
        </thead>
        <tbody>
          ${(p.MhuTypes || [])
            .map(
              (m) =>
                `<tr><td style="text-align:center;">${m.MHUTypeId ?? ""}</td><td style="text-align:center;">${m.FromUnit ?? ""}</td><td style="text-align:center;">${m.ToUnit ?? ""}</td><td style="text-align:center;">${m.Conversion ?? ""}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
    `;
    const modal = document.getElementById("productDetailModal");
    if (modal) modal.style.display = "flex";
  } catch (e) {
    alert(e.message || "Lỗi khi mở chi tiết sản phẩm");
  }
}
function formatDateTime(dateString) {
  if (!dateString) return "";

  const [datePart, timePart] = dateString.split("T");
  if (!datePart || !timePart) return dateString;

  const [year, month, day] = datePart.split("-");
  const [hours, minutes, seconds] = timePart.replace("Z", "").split(":");

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

async function fetchRecipeDetail(recipeId) {
  const response = await fetch(
    `${API_ROUTE}/api/production-recipe-detail/${recipeId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
  if (!response.ok) throw new Error("Không tìm thấy công thức");
  const data = await response.json();
  recipeDetail = data.recipe;
  recipeProcesses = data.processes;
  recipeIngredients = data.ingredients;
  recipeProducts = data.products;
  recipeByProducts = data.byProducts;
  recipeParameters = data.parameters;
  return;
}

function renderRecipeDetail() {
  document.getElementById("detailRecipeCode").innerText =
    recipeDetail.RecipeCode || "-";
  document.getElementById("detailRecipeName").innerText =
    recipeDetail.RecipeName || "-";
  document.getElementById("detailRecipeVersion").innerText =
    recipeDetail.Version || "-";
  document.getElementById("detailRecipeStatus").innerText =
    recipeDetail.RecipeStatus || "-";
  document.getElementById("detailRecipeLastUpdated").innerText =
    recipeDetail.timestamp ? formatDateTime(recipeDetail.timestamp) : "";
  document.getElementById("detailRecipeProductCode").innerText =
    recipeDetail.ProductCode || "-";
  document.getElementById("detailRecipeProductName").innerText =
    recipeDetail.ProductName || "-";

  // Hiển thị danh sách process ngang
  const processListDiv = document.getElementById("processList");
  // Bỏ hàng filter process ở trên: ẩn và dùng filter chính bên dưới
  processListDiv.style.display = "none";
  processListDiv.innerHTML = "";

  // Hiển thị tổng quan và filter chính (multi-select)
  showAllProcessesFilter();
  showAllProcessesInfo();
}

function showAllProcessesInfo() {
  const processInfoDiv = document.getElementById("processInfo");

  // Hiển thị theo hàng ngang với thanh cuộn
  processInfoDiv.style.maxHeight = "unset";
  processInfoDiv.style.display = "flex";
  processInfoDiv.style.flexDirection = "row";
  processInfoDiv.style.flexWrap = "nowrap";
  processInfoDiv.style.gap = "12px";
  processInfoDiv.style.overflowX = "auto";
  processInfoDiv.style.overflowY = "hidden";
  processInfoDiv.style.paddingBottom = "8px";

  const filtered = recipeProcesses
    .map((p, idx) => ({ p, idx }))
    .filter(
      ({ p }) =>
        selectedProcessIds.length === 0 ||
        selectedProcessIds.includes(String(p.ProcessId)),
    );

  processInfoDiv.innerHTML = filtered
    .map(({ p: process, idx }) => {
      const product = recipeProducts[idx];
      return `
      <div style="
        flex:0 0 auto;
        min-width:320px;
        margin:0 0 8px 0;
        padding:16px 24px;
        background:#fff;
        border-radius:8px;
        box-shadow:0 2px 8px #0001;
        min-height:180px;
        display:flex;
        flex-direction:column;
        justify-content:center;
      ">
        <h3 style="margin-bottom:10px;">
          Process: <span style="color:#6259ee">${process.ProcessId}</span>
        </h3>
        <div><b>Process Code:</b> ${process.ProcessCode || "-"}</div>
        <div><b>Process Name:</b> ${process.ProcessName || "-"}</div>
        <div><b>Duration:</b> ${process.Duration ?? "-"}</div>
        <div><b>Duration UoM:</b> ${process.DurationUoM || "N/A"}</div>
        <div style="margin-top:12px;"><b>Product ID:</b> ${product?.ProductId || "-"}</div>
        <div><b>Product Code:</b> ${product?.ProductCode || "-"}</div>
        <div><b>Product Name:</b> ${product?.ItemName || "-"}</div>
        <div><b>Plan Quantity:</b> ${product?.PlanQuantity || "-"} ${product?.UnitOfMeasurement || ""}</div>
          <div style="margin-top:8px;">
            ${product?.ProductId ? `<button class="product-detail-btn" data-code="${product.ProductCode}" style="padding:6px 10px;border-radius:6px;border:1px solid #6259ee;background:#6259ee;color:#fff;cursor:pointer;">Xem chi tiết</button>` : ""}
          </div>
      </div>
    `;
    })
    .join("");

  // Wire detail buttons for process products
  processInfoDiv.querySelectorAll(".product-detail-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.getAttribute("data-code");
      if (code) showProductModal(code);
    });
  });
}

function showProcessInfo(process, product) {
  const processInfoDiv = document.getElementById("processInfo");
  processInfoDiv.innerHTML = `
    <div id="processInfoCard" style="margin:18px 0 8px 0;padding:16px 24px;background:#fff;border-radius:8px;box-shadow:0 2px 8px #0001;min-height:180px;display:flex;flex-direction:column;justify-content:center;">
      <h3 style="margin-bottom:10px;">Process: <span style='color:#6259ee'>${process.ProcessId}</span></h3>
      <div><b>Process Code:</b> ${process.ProcessCode || "-"}</div>
      <div><b>Process Name:</b> ${process.ProcessName || "-"}</div>
      <div><b>Duration:</b> ${process.Duration === null ? "-" : process.Duration}</div>
      <div><b>Duration UoM:</b> ${process.DurationUoM === "" ? "N/A" : process.DurationUoM}</div>
    </div>
    <div id="processInfoCard" style="margin:18px 0 8px 0;padding:16px 24px;background:#fff;border-radius:8px;box-shadow:0 2px 8px #0001;min-height:100px;display:flex;flex-direction:column;">
      <div><b>Product ID:</b> ${product ? product.ProductId : "-"}</div>
      <div><b>Product Code:</b> ${product ? product.ProductCode : "-"}</div>
      <div><b>Product Name:</b> ${product ? product.ItemName : "-"}</div>
      <div><b>Plan Quantity:</b> ${product ? product.PlanQuantity : "-"} ${product ? product.UnitOfMeasurement : ""}</div>
      ${product && product.ProductId ? `<div style='margin-top:8px;'><button class='product-detail-btn' data-code='${product.ProductCode}' style='padding:6px 10px;border-radius:6px;border:1px solid #6259ee;background:#6259ee;color:#fff;cursor:pointer;'>Xem chi tiết</button></div>` : ""}
    </div>
  `;

  // Wire detail button
  processInfoDiv.querySelectorAll(".product-detail-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.getAttribute("data-code");
      if (code) showProductModal(code);
    });
  });
}

function showAllProcessesFilter() {
  const processFilterDiv = document.getElementById("processFilter");
  if (!processFilterDiv) return;

  processFilterDiv.innerHTML = `
    <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:16px;">
      <div class="custom-multiselect" style="position:relative;max-width:320px;">
        <div id="processInput" style="width:200px;height:33px;padding:8px 12px;border-radius:6px;border:1px solid #6259ee;background:#f6f6ff;color:#6259ee;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <span id="processSelectedText" style="color:#333;">Select processes...</span>
          <span style="font-size:12px;color:#6259ee;">▼</span>
        </div>
        <div id="processDropdown" style="display:none;position:absolute;top:44px;left:0;right:0;background:#fff;border:1px solid #ddd;border-radius:6px;box-shadow:0 2px 8px #0001;z-index:10;padding:8px;max-height:240px;overflow:auto;">
          <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:4px;">
            <input type="checkbox" id="processSelectAll" style="cursor:pointer;" />
            <span>Chọn tất cả</span>
          </label>
          <div id="processOptions"></div>
        </div>
      </div>
      <div style="display:flex;gap:12px;">
        <button id="tabAllIngredients" class="tab-btn"
          style="padding:8px 18px;border-radius:6px;border:1px solid #6259ee;
          background:#f6f6ff;color:#6259ee;cursor:pointer;font-weight:500;">
          Ingredients
        </button>
        <button id="tabAllByProducts" class="tab-btn"
          style="padding:8px 18px;border-radius:6px;border:1px solid #6259ee;
          background:#f6f6ff;color:#6259ee;cursor:pointer;font-weight:500;">
          ByProducts
        </button>
        <button id="tabAllParameters" class="tab-btn"
          style="padding:8px 18px;border-radius:6px;border:1px solid #6259ee;
          background:#f6f6ff;color:#6259ee;cursor:pointer;font-weight:500;">
          Parameters
        </button>
      </div>
    </div>
  `;

  const tabContent = document.getElementById("tabAllContent");
  const tabIngredients = document.getElementById("tabAllIngredients");
  const tabByProducts = document.getElementById("tabAllByProducts");
  const tabParameters = document.getElementById("tabAllParameters");
  const processInput = document.getElementById("processInput");
  const processDropdown = document.getElementById("processDropdown");
  const processOptions = document.getElementById("processOptions");
  const processSelectedText = document.getElementById("processSelectedText");
  const processSelectAll = document.getElementById("processSelectAll");
  let currentAllTab = "ingredients";

  // Removed button highlight on filter changes to prevent perceived tab switch

  // ================= Process Multiselect (giống các page khác) =================
  function initializeProcessDropdown() {
    if (!processInput || !processDropdown) return;
    processInput.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = processDropdown.style.display === "block";
      processDropdown.style.display = isVisible ? "none" : "block";
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".custom-multiselect")) {
        processDropdown.style.display = "none";
      }
    });
    processDropdown.addEventListener("click", (e) => e.stopPropagation());
  }

  function updateProcessSelectedText() {
    if (!processSelectedText) return;
    if (selectedProcessIds.length === 0) {
      processSelectedText.textContent = "Select processes...";
      processSelectedText.style.color = "#999";
    } else if (selectedProcessIds.length <= 2) {
      processSelectedText.textContent = selectedProcessIds.join(", ");
      processSelectedText.style.color = "#333";
    } else {
      processSelectedText.textContent = `${selectedProcessIds.length} selected`;
      processSelectedText.style.color = "#333";
    }
  }

  function updateProcessSelectAllState() {
    if (!processSelectAll) return;
    const total = recipeProcesses.length;
    const count = selectedProcessIds.length;
    if (count === 0) {
      processSelectAll.checked = false;
      processSelectAll.indeterminate = false;
    } else if (count === total) {
      processSelectAll.checked = true;
      processSelectAll.indeterminate = false;
    } else {
      processSelectAll.checked = false;
      processSelectAll.indeterminate = true;
    }
  }

  function populateProcessOptions() {
    if (!processOptions) return;
    processOptions.innerHTML = "";
    recipeProcesses.forEach((proc) => {
      const label = document.createElement("label");
      label.style.cssText =
        "display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:4px;";
      label.onmouseover = function () {
        this.style.background = "#f5f5f5";
      };
      label.onmouseout = function () {
        this.style.background = "transparent";
      };

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "process-checkbox";
      checkbox.value = proc.ProcessId;
      checkbox.style.cursor = "pointer";
      checkbox.checked = selectedProcessIds.includes(String(proc.ProcessId));
      checkbox.onchange = handleProcessCheckboxChange;

      const span = document.createElement("span");
      span.textContent = proc.ProcessId;

      label.appendChild(checkbox);
      label.appendChild(span);
      processOptions.appendChild(label);
    });
    updateProcessSelectedText();
    updateProcessSelectAllState();
  }

  processSelectAll?.addEventListener("change", function () {
    const cbs = processOptions.querySelectorAll(".process-checkbox");
    if (this.checked) {
      // Chọn tất cả
      cbs.forEach((cb) => (cb.checked = true));
      selectedProcessIds = recipeProcesses.map((p) => String(p.ProcessId));
    } else {
      // Bỏ chọn tất cả
      cbs.forEach((cb) => (cb.checked = false));
      selectedProcessIds = [];
    }
    updateProcessSelectedText();
    updateProcessSelectAllState();
    showAllProcessesInfo();
    if (currentAllTab === "ingredients") renderIngredients();
    if (currentAllTab === "byproducts") renderByProducts();
    if (currentAllTab === "parameters") renderParameters();
  });

  function handleProcessCheckboxChange(e) {
    const value = String(e.target.value);
    if (e.target.checked) {
      if (!selectedProcessIds.includes(value)) selectedProcessIds.push(value);
    } else {
      selectedProcessIds = selectedProcessIds.filter((v) => v !== value);
    }
    updateProcessSelectedText();
    updateProcessSelectAllState();
    showAllProcessesInfo();
    if (currentAllTab === "ingredients") renderIngredients();
    if (currentAllTab === "byproducts") renderByProducts();
    if (currentAllTab === "parameters") renderParameters();
  }

  /* ================= INGREDIENTS ================= */
  function renderIngredients() {
    if (!recipeIngredients.length) {
      tabContent.innerHTML = `<div style="margin-top:12px;">Không có dữ liệu</div>`;
      return;
    }

    // Nhóm theo ProcessId và hiển thị dạng bảng, mỗi process là 1 bảng
    const processGroups = {};
    recipeIngredients.forEach((i) => {
      const pid = i.ProcessId;
      if (!processGroups[pid]) processGroups[pid] = [];
      processGroups[pid].push(i);
    });

    const groupsHTML = Object.entries(processGroups)
      .filter(
        ([processId]) =>
          selectedProcessIds.length === 0 ||
          selectedProcessIds.includes(String(processId)),
      )
      .map(([processId, items]) => {
        const rows = items
          .map(
            (i) => `
              <tr>
                <td style="text-align:center; padding:10px 8px;">${i.IngredientId || ""}</td>
                <td style="text-align:center; padding:10px 8px;">${i.IngredientCode || ""}</td>
                <td style="text-align:center; padding:10px 8px;">${i.ItemName || ""}</td>
                <td style="text-align:right; padding:10px 8px;">${i.Quantity || ""}</td>
                <td style="text-align:center; padding:10px 8px;">${i.UnitOfMeasurement || ""}</td>
                <td style="text-align:center; padding:10px 8px;">
                  <button class="product-detail-btn" data-code="${i.IngredientCode || ""}" style="padding:6px 10px;border-radius:6px;border:1px solid #6259ee;background:#6259ee;color:#fff;cursor:pointer;">Xem chi tiết</button>
                </td>
              </tr>
            `,
          )
          .join("");

        return `
          <div style="background:#fff;border-radius:8px;box-shadow:0 2px 8px #0001;padding:16px 20px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <h3 style="margin:0;color:#6259ee;">Process: ${processId}</h3>
              <span style="font-size:13px;color:#777;">${items.length} ingredient(s)</span>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:#f6f6ff;">
                  <th style="border:1px solid #e5e5f5;padding:8px;text-align:center;width:120px;">ID</th>
                  <th style="border:1px solid #e5e5f5;padding:8px;text-align:center;width:160px;">Code</th>
                  <th style="border:1px solid #e5e5f5;padding:8px;text-align:center;">Tên</th>
                  <th style="border:1px solid #e5e5f5;padding:8px;text-align:right;width:120px;">Số lượng</th>
                  <th style="border:1px solid #e5e5f5;padding:8px;text-align:center;width:120px;">Đơn vị</th>
                  <th style="border:1px solid #e5e5f5;padding:8px;text-align:center;width:140px;">Action</th>
                </tr>
              </thead>
              <tbody style="gap:4px;">
                ${rows || ""}
              </tbody>
            </table>
          </div>
        `;
      })
      .join("");

    tabContent.innerHTML = `<div style="display:flex;flex-direction:column;gap:16px;margin-top:8px;">${groupsHTML}</div>`;

    // Wire detail buttons
    tabContent.querySelectorAll(".product-detail-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const code = btn.getAttribute("data-code");
        if (code) showProductModal(code);
      });
    });
  }

  /* ================= BY PRODUCTS ================= */
  function renderByProducts() {
    if (!recipeByProducts.length) {
      tabContent.innerHTML = `<div style="margin-top:12px;">Không có dữ liệu</div>`;
      return;
    }
    const filtered = recipeByProducts.filter(
      (bp) =>
        selectedProcessIds.length === 0 ||
        selectedProcessIds.includes(String(bp.ProcessId)),
    );
    tabContent.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:8px;">
        ${
          filtered
            .map(
              (bp) => `
            <div style="border:1px solid #e5e5ff;border-radius:6px;padding:10px 12px;background:#fdfdff;display:flex;justify-content:space-between;">
              <div><b>Process:</b> ${bp.ProcessId}</div>
              <div><b>ByProduct:</b> ${bp.ByProductName || bp.ByProductCode}</div>
            </div>
          `,
            )
            .join("") || `<div style="margin-top:12px;">Không có dữ liệu</div>`
        }
      </div>
    `;
  }

  /* ================= PARAMETERS ================= */
  function renderParameters() {
    if (!recipeParameters.length) {
      tabContent.innerHTML = `<div style="margin-top:12px;">Không có dữ liệu</div>`;
      return;
    }
    const filtered = recipeParameters.filter(
      (pm) =>
        selectedProcessIds.length === 0 ||
        selectedProcessIds.includes(String(pm.ProcessId)),
    );
    tabContent.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:8px;">
        ${
          filtered
            .map(
              (pm) => `
            <div style="border:1px solid #e5e5ff;border-radius:6px;padding:10px 12px;background:#fdfdff;">
              <div style="font-weight:600;margin-bottom:6px;">Process: ${pm.ProcessId}</div>
              <div style="font-size:13px;"><b>Parameter:</b> ${pm.ParameterName || pm.Code}</div>
              <div style="font-size:13px;"><b>Value:</b> ${pm.Value || ""}</div>
            </div>
          `,
            )
            .join("") || `<div style="margin-top:12px;">Không có dữ liệu</div>`
        }
      </div>
    `;
  }

  /* ================= TAB SWITCH ================= */
  tabIngredients.onclick = () => {
    tabIngredients.style.background = "#d1d1ff";
    tabByProducts.style.background = "#f6f6ff";
    tabParameters.style.background = "#f6f6ff";
    currentAllTab = "ingredients";
    renderIngredients();
  };

  tabByProducts.onclick = () => {
    tabIngredients.style.background = "#f6f6ff";
    tabByProducts.style.background = "#d1d1ff";
    tabParameters.style.background = "#f6f6ff";
    currentAllTab = "byproducts";
    renderByProducts();
  };

  tabParameters.onclick = () => {
    tabIngredients.style.background = "#f6f6ff";
    tabByProducts.style.background = "#f6f6ff";
    tabParameters.style.background = "#d1d1ff";
    currentAllTab = "parameters";
    renderParameters();
  };

  // Khởi tạo filter
  initializeProcessDropdown();
  populateProcessOptions();

  // Default tab
  tabIngredients.click();
}

function showProcessDetail(process) {
  const processDetailDiv = document.getElementById("processDetail");
  const infoCard = document.getElementById("processInfoCard");
  let minHeight = infoCard ? infoCard.offsetHeight : 180;

  // Tab buttons
  processDetailDiv.innerHTML = `
    <div style="min-height:${minHeight}px;display:flex;flex-direction:column;justify-content:flex-start;">
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <button id="tabIngredients" class="tab-btn" style="padding:8px 18px;border-radius:6px;border:1px solid #6259ee;background:#f6f6ff;color:#6259ee;cursor:pointer;font-weight:500;">Ingredients</button>
        <button id="tabByProducts" class="tab-btn" style="padding:8px 18px;border-radius:6px;border:1px solid #6259ee;background:#f6f6ff;color:#6259ee;cursor:pointer;font-weight:500;">ByProducts</button>
        <button id="tabParameters" class="tab-btn" style="padding:8px 18px;border-radius:6px;border:1px solid #6259ee;background:#f6f6ff;color:#6259ee;cursor:pointer;font-weight:500;">Parameters</button>
      </div>
      <div id="tabContent"></div>
    </div>
  `;

  // Tab logic
  const tabContent = document.getElementById("tabContent");
  const tabIngredients = document.getElementById("tabIngredients");
  const tabByProducts = document.getElementById("tabByProducts");
  const tabParameters = document.getElementById("tabParameters");

  function renderIngredients() {
    const ingredients = recipeIngredients.filter(
      (i) => i.ProcessId === process.ProcessId,
    );
    if (!ingredients.length) {
      tabContent.innerHTML = `<div style='margin-top:12px;'>Không có dữ liệu</div>`;
      return;
    }
    tabContent.innerHTML = `
      <div style='display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-top:8px;'>
        ${ingredients
          .map(
            (i) => `
          <div style="border:1px solid #e5e5ff;border-radius:6px;padding:10px 12px;background:#fdfdff;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;flex-direction:column;gap:4px;height:120px;">
              <div style="font-weight:600;">${i.ItemName || ""}</div>
              <div style="font-size:13px;"><b>ID:</b> ${i.IngredientId || ""}</div>
              <div style="font-size:13px;"><b>Code:</b> ${i.IngredientCode || ""}</div>
              <div style="font-size:13px;"><b>Quantity:</b> ${i.Quantity || ""} ${i.UnitOfMeasurement || ""}</div>
            </div>
            <div style="margin-top:4px;">
              <button class="product-detail-btn" data-code="${i.IngredientCode || ""}"
                style="padding:6px 10px;border-radius:6px;border:1px solid #6259ee;background:#6259ee;color:#fff;cursor:pointer;">
                Xem chi tiết
              </button>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    `;
    // Wire detail buttons
    tabContent.querySelectorAll(".product-detail-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const code = btn.getAttribute("data-code");
        if (code) showProductModal(code);
      });
    });
  }

  function renderByProducts() {
    const byProducts = recipeByProducts.filter(
      (bp) => bp.ProcessId === process.ProcessId,
    );
    tabContent.innerHTML = `<ul style='margin-top:12px;'>${byProducts.map((bp) => `<li>${bp.ByProductName || bp.ByProductCode}</li>`).join("") || "<li>Không có dữ liệu</li>"}</ul>`;
  }

  function renderParameters() {
    const parameters = recipeParameters.filter(
      (pm) => pm.ProcessId === process.ProcessId,
    );
    tabContent.innerHTML = `<ul style='margin-top:12px;'>${parameters.map((pm) => `<li>${pm.ParameterName || pm.Code}: ${pm.Value || ""}</li>`).join("") || "<li>Không có dữ liệu</li>"}</ul>`;
  }

  // Tab switching
  tabIngredients.onclick = function () {
    tabIngredients.style.background = "#d1d1ff";
    tabByProducts.style.background = "#f6f6ff";
    tabParameters.style.background = "#f6f6ff";
    renderIngredients();
  };
  tabByProducts.onclick = function () {
    tabIngredients.style.background = "#f6f6ff";
    tabByProducts.style.background = "#d1d1ff";
    tabParameters.style.background = "#f6f6ff";
    renderByProducts();
  };
  tabParameters.onclick = function () {
    tabIngredients.style.background = "#f6f6ff";
    tabByProducts.style.background = "#f6f6ff";
    tabParameters.style.background = "#d1d1ff";
    renderParameters();
  };

  // Default tab
  tabIngredients.click();
}

window.addEventListener("DOMContentLoaded", async () => {
  if (!recipeId) {
    document.body.innerHTML =
      '<div style="color:red">Thiếu recipeId trên URL!</div>';
    return;
  }
  try {
    await fetchRecipeDetail(recipeId);
    const mainDiv = document.getElementById("RecipeProcesses");
    mainDiv.innerHTML = `
      <div style='width: 100%;'>
        <h2 style='margin-bottom:16px;'>Processes:</h2>
        <div id="processList" style="display:flex;flex-wrap:wrap;margin-bottom:12px;"></div>
        <div style='display:flex;flex-direction:column;gap:20px;'>
          <div id="processFilter"></div>
          <div style='flex:0 0 auto; min-height:220px;'>
            <div id="processInfo"></div>
          </div>
          <div style='flex:1;'>
            <div id="processDetail">
              <div id="tabAllContent"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(mainDiv);
    renderRecipeDetail();
  } catch (e) {
    document.body.innerHTML = `<div style='color:red'>${e.message}</div>`;
  }
});
