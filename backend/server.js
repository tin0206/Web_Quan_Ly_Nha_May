const express = require("express");
const productionOrdersRoutes = require("./routes/production-orders");
const productionOrderDetailRoutes = require("./routes/production-order-detail");
const productionRecipesRoutes = require("./routes/production-recipes");
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

app.set("view engine", "ejs");
app.set("views", "./views");
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

connectDB(config);

app.listen(PORT, "0.0.0.0", () => {
  // console.log(`🚀 Server đang chạy tại http://172.18.160.1:${PORT}`);
  console.log(`🚀 Server running on port ${PORT}`);
});

app.get("/", (req, res) => {
  res.render("index", { title: "Trang chủ" });
});

app.get("/production-orders", (req, res) => {
  res.render("production-orders", { title: "Production Orders" });
});

// Render recipes page
app.get("/recipes", (req, res) => {
  res.render("recipes", { title: "Quản lý Công thức" });
});

// Render products page
app.get("/products", (req, res) => {
  res.render("products", { title: "Quản lý Sản phẩm" });
});

// Render production order detail page
app.get("/production-order/:id", (req, res) => {
  res.render("production-order-detail", { orderId: req.params.id });
});

app.use("/api/production-orders", productionOrdersRoutes);
app.use("/api/production-order-detail", productionOrderDetailRoutes);
app.use("/api/production-recipes", productionRecipesRoutes);

module.exports = { sql };
