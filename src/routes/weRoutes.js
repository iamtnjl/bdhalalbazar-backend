const express = require("express");
const router = express.Router();
const upload = require("../middlewares/multer");

const { getAllUsers } = require("../controllers/userController");
const {
  getAllOrders,
  updateOrderStatus,
  getOrderDetails,
} = require("../controllers/orderController");
const { getAllBrands, createBrand } = require("../controllers/brandController");
const { getAllColors, createColor } = require("../controllers/colorController");
const {
  getAllProducts,
  getProductDetails,
  createProduct,
  updateProduct,
} = require("../controllers/productController");

const {
  getAllCategories,
  createCategory,
} = require("../controllers/categoryController");
const {
  getAllMaterials,
  createMaterial,
} = require("../controllers/materialController");

router.get("/", getAllUsers);

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

//Orders API
router.get("/orders", getAllOrders);
router.get("/orders/:orderId", getOrderDetails);
router.patch("/orders/:orderId", updateOrderStatus);

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

module.exports = router;
