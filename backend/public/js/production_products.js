const API_ROUTE = window.location.origin;

let productsCache = [];

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

function renderTable() {
  console.log(productsCache);
  const tbody = document.getElementById("productTableBody");
  tbody.innerHTML = productsCache
    .map(
      (p, idx) => `
        <tr>
          <td>${p.ItemCode || "-"}</td>
          <td>${p.ItemName || "-"}</td>
          <td>${p.Item_Type || "-"}</td>
          <td>${p.Group || "-"}</td>
          <td>${p.BaseUnit || "-"}</td>
          <td style="text-align:center">
            ${p.Conversion ? `<div id="product-conversion">${p.Conversion}</div>` : "-"}
          </td>
          <td style="text-align:center" id="product-status">
            ${
              p.Item_Status === "ACTIVE"
                ? `<div id="product-status-active">${p.Item_Status}</div>`
                : `<div id="product-status-inactive">INACTIVE</div>`
            }
          </td>
          <td>${p.timestamp ? formatDateTime(p.timestamp) : ""}</td>
          <td style="text-align:center">
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
  if (!productsCache.length) {
    gridView.innerHTML =
      '<div style="padding:2rem;text-align:center;color:#888">Không có sản phẩm nào</div>';
    return;
  }
  gridView.style.display = "grid";
  gridView.style.gridTemplateColumns = "repeat(auto-fit, minmax(370px, 1fr))";
  gridView.style.gap = "24px";
  productsCache.forEach((p, idx) => {
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
        <div style="color:#888;font-size:13px;margin-bottom:8px;min-height:18px;">${p.Description || ""}</div>
        <div style="color:#6259ee;font-size:14px;font-weight:600;margin-bottom:8px;">
            <i class="fa-solid fa-code-branch"></i> Phiên bản: ${p.Version || "-"}
        </div>
        <div style="background:#f6f6ff;border-radius:8px;padding:10px 12px 8px 12px;margin-bottom:10px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:2px;color:#888;">SẢN PHẨM</div>
            <div style="display:flex;align-items:center;gap:8px;font-size:15px;">
            <i class="fa-solid fa-box" style="color:#bdbdbd;"></i>
            <span style="font-weight:600;">${p.ItemCode || "-"}</span>
            <span style="color:#888;">${p.ItemName || "-"}</span>
            </div>
        </div>
        <div style="display:flex;align-items:center;gap:16px;font-size:13px;color:#888;margin-bottom:8px;">
            <div><i class="fa-solid fa-code-branch"></i> Phiên bản mới nhất: <b>${p.Version || "-"}</b></div>
            <div><i class="fa-regular fa-clock"></i> Cập nhật: <b>${p.timestamp ? formatDateTime(p.timestamp) : "-"}</b></div>
        </div>
        <button class="detail-btn" style="margin-top:10px;background:#6259ee;color:#fff;border:none;padding:10px 0;border-radius:8px;cursor:pointer;font-weight:600;font-size:15px;">Xem chi tiết</button>
        `;
    card.querySelector(".detail-btn").onclick = () => showProductModal(p);
    gridView.appendChild(card);
  });
}

function showProductModal(product) {
  ensureProductModal();
  const modal = document.getElementById("productDetailModal");
  const body = document.getElementById("productDetailBody");
  console.log(product);
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
  if (gridBtn && tableBtn) {
    gridBtn.onclick = () => {
      document.getElementById("gridView").style.display = "";
      document.getElementById("tableView").style.display = "none";
    };
    tableBtn.onclick = () => {
      document.getElementById("gridView").style.display = "none";
      document.getElementById("tableView").style.display = "";
    };
  }

  modal.onclick = (e) => {
    if (e.target === modal) modal.style.display = "none";
  };

  ensureProductModal();
  try {
    await fetchProducts();
    renderGridView();
    renderTable();
    // Hiển thị thống kê
    const stats = await fetchStats();
    document.getElementById("totalProducts").innerText =
      stats.totalProducts || 0;
    document.getElementById("activeProducts").innerText =
      stats.activeProducts || 0;
    document.getElementById("totalTypes&Categories").innerText =
      (stats.totalTypes || 0) + " / " + (stats.totalCategories || 0);
    document.getElementById("totalGroups").innerText = stats.totalGroups || 0;
  } catch (e) {
    document.getElementById("productTableBody").innerHTML =
      `<tr><td colspan='9' style='color:red'>${e.message}</td></tr>`;
  }
});
