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
      window.location.href = `/product-detail/${p.ItemCode}`;
    });
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await fetchProducts();
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
