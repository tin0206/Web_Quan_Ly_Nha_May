const express = require("express");
const cors = require("cors");
const path = require("path");

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

(async () => {
  try {
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
