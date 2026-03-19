const express = require("express");
const productionOrdersRoutes = require("./routes/production-orders");
const productionOrderDetailRoutes = require("./routes/production-order-detail");
const productionRecipesRoutes = require("./routes/production-recipes");
const productionRecipeDetailRoutes = require("./routes/production-recipe-detail");
const productionProductsRoutes = require("./routes/production-products");
const productionMaterialsRoutes = require("./routes/production-materials");
const sql = require("mssql");
const cors = require("cors");
const path = require("path");
const { connectDB } = require("./db");

// const API_ROUTE = `http://${window.location.hostname}:8000`;

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const PORT = process.env.PORT || 8000;

const app = express();

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

(async () => {
  try {
    await connectDB(config);

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Server không khởi động vì DB lỗi");
    process.exit(1);
  }
})();

app.get("/", (req, res) => {
  res.render("index", { title: "Trang chủ" });
});

app.get("/production-orders", (req, res) => {
  res.render("production-orders", { title: "Production Orders" });
});

app.get("/production-orders-by-batches-pos", (req, res) => {
  res.render("production-orders-by-batches-pos", {
    title: "Production Orders by Batches and POs",
  });
});

// Render recipes page
app.get("/recipes", (req, res) => {
  res.render("recipes", { title: "Quản lý Công thức" });
});

// Render products page
app.get("/products", (req, res) => {
  res.render("products", { title: "Quản lý Sản phẩm" });
});

// Render materials page
app.get("/materials", (req, res) => {
  res.render("materials", { title: "ConsumptionLog" });
});

// Render production order detail page
app.get("/production-order/:id", (req, res) => {
  res.render("production-order-detail", { orderId: req.params.id });
});

app.get("/recipe-detail/:id", (req, res) => {
  res.render("recipe-detail", { recipeId: req.params.id });
});

app.use("/api/production-orders", productionOrdersRoutes);
app.use("/api/production-order-detail", productionOrderDetailRoutes);
app.use("/api/production-recipes", productionRecipesRoutes);
app.use("/api/production-recipe-detail", productionRecipeDetailRoutes);
app.use("/api/production-products", productionProductsRoutes);
app.use("/api/production-materials", productionMaterialsRoutes);

module.exports = { sql };
