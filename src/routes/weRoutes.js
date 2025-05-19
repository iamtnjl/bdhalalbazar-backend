const express = require("express");
const router = express.Router();
const upload = require("../middlewares/multer");

const {
  getAllUsers,
  getUserDetailsById,
} = require("../controllers/userController");
const {
  getAllOrders,
  updateOrderStatus,
  editOrderItem,
  getAdminOrderDetails,
  getUserOrderSummary,
} = require("../controllers/orderController");
const { getDashboardStats } = require("../controllers/dashboardController");
const { getAllBrands, createBrand } = require("../controllers/brandController");
const { getAllColors, createColor } = require("../controllers/colorController");
const {
  getAllProducts,
  getProductDetails,
  createProduct,
  updateProduct,
  updateProductVisibility,
  deleteProductById,
} = require("../controllers/productController");

const {
  getAllCategories,
  createCategory,
} = require("../controllers/categoryController");
const {
  getAllMaterials,
  createMaterial,
} = require("../controllers/materialController");

const {
  getSettings,
  updateSettings,
} = require("../controllers/settingsController");

// Dashboard API
router.get("/dashboard", getDashboardStats);

//Admin user API
router.get("/", getAllUsers);
router.get("/users/:id", getUserDetailsById);

// Brands API
router.get("/brands", getAllBrands);
router.post("/brands", createBrand);

//Materials API
router.get("/materials", getAllMaterials);
router.post("/materials", createMaterial);

//Category API
router.get("/categories", getAllCategories);
router.post("/categories", createCategory);

//Color API
router.get("/colors", getAllColors);
router.post("/colors", createColor);

//Order API
router.get("/orders", getAllOrders);
router.get("/customers-orders", getUserOrderSummary);
router.get("/orders/:orderId", getAdminOrderDetails);
router.patch("/orders/:orderId", updateOrderStatus);
router.put("/orders/:orderId/edit", editOrderItem);

//Products API
router.get("/products", getAllProducts);
router.get("/products/:productId", getProductDetails);
router.post(
  "/products",
  upload.fields([
    { name: "primary_image", maxCount: 1 },
    { name: "images", maxCount: 10 },
  ]),
  createProduct
);
router.patch(
  "/product/:id",
  upload.fields([
    { name: "primary_image", maxCount: 1 },
    { name: "images", maxCount: 10 },
  ]),
  updateProduct
);
router.patch("/product/:id/publish", updateProductVisibility);
router.delete("/product/:id", deleteProductById);

//Settings API
router.get("/settings", getSettings);
router.put("/settings", updateSettings);

module.exports = router;
