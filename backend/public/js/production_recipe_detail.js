// Lấy id từ query string
const recipeId = window.location.pathname.split("/").pop();

const API_ROUTE = window.location.origin;
let recipeDetail = null;
let recipeProcesses = [];
let recipeIngredients = [];
let recipeProducts = [];
let recipeByProducts = [];
let recipeParameters = [];

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
  document.getElementById("detailRecipeId").innerText =
    recipeDetail.RecipeDetailsId || "-";
  document.getElementById("detailRecipeProductCode").innerText =
    recipeDetail.ProductCode || "-";
  document.getElementById("detailProductionName").innerText =
    recipeDetail.ProductName || "-";
  document.getElementById("detailRecipeCode").innerText =
    recipeDetail.RecipeCode + " - " + recipeDetail.RecipeName || "-";
  document.getElementById("detailRecipeVersion").innerText =
    recipeDetail.Version || "-";
  document.getElementById("detailRecipeStatus").innerText =
    recipeDetail.RecipeStatus || "-";
  document.getElementById("detailRecipeLastUpdated").innerText =
    recipeDetail.timestamp ? formatDateTime(recipeDetail.timestamp) : "";

  // Hiển thị danh sách process ngang
  const processListDiv = document.getElementById("processList");
  processListDiv.innerHTML = recipeProcesses
    .map(
      (p, idx) => `
    <button class="process-btn" data-idx="${idx}" style="margin:0 8px 8px 0;padding:8px 18px;border-radius:6px;border:1px solid #6259ee;background:#f6f6ff;color:#6259ee;cursor:pointer;">${p.ProcessId}</button>
  `,
    )
    .join("");

  // Xử lý sự kiện click process
  const processBtns = processListDiv.querySelectorAll(".process-btn");
  processBtns.forEach((btn) => {
    btn.onclick = function () {
      showProcessInfo(
        recipeProcesses[btn.dataset.idx],
        recipeProducts[btn.dataset.idx],
      );
      showProcessDetail(recipeProcesses[btn.dataset.idx]);
      processBtns.forEach((b) => (b.style.background = "#f6f6ff"));
      btn.style.background = "#d1d1ff";
    };
  });

  // Hiển thị mặc định process đầu tiên nếu có
  if (recipeProcesses.length > 0) {
    processBtns[0].click();
  }
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
    </div>
  `;
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
      <table style='width:100%;border-collapse:collapse;margin-top:8px;'>
        <thead>
          <tr style='background:#f6f6ff;'>
          <th style='padding:8px;border:2px solid black;'>IngredientId</th>
            <th style='padding:8px;border:2px solid black;'>IngredientCode</th>
            <th style='padding:8px;border:2px solid black;'>Name</th>
            <th style='padding:8px;border:2px solid black;'>Quantity</th>
            <th style='padding:8px;border:2px solid black;'>UnitOfMeasurement</th>
          </tr>
        </thead>
        <tbody>
          ${ingredients
            .map(
              (i) => `
            <tr>
            <td style='padding:8px;border:2px solid black;'>${i.IngredientId || ""}</td>
              <td style='padding:8px;border:2px solid black;'>${i.IngredientCode || ""}</td>
              <td style='padding:8px;border:2px solid black;'>${i.ItemName || ""}</td>
              <td style='padding:8px;border:2px solid black;'>${i.Quantity || ""}</td>
              <td style='padding:8px;border:2px solid black;'>${i.UnitOfMeasurement || ""}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    `;
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
        <div style='display:flex;gap:32px;'>
          <div style='flex:0 0 500px;'>
            <div id="processInfo"></div>
          </div>
          <div style='flex:1;'>
            <div id="processDetail"></div>
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
