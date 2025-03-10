const express = require("express");
const router = express.Router();

const { getAllBrands } = require("../controllers/brandController");
const { getAllMaterials } = require("../controllers/materialController");
const { getAllCategories } = require("../controllers/categoryController");
const { getAllColors } = require("../controllers/colorController");
const {
  getAllProducts,
  getProductDetails,
} = require("../controllers/productController");
const {
  addOrUpdateCart,
  getCart,
  deleteCartItem,
} = require("../controllers/cartController");

//Tags API
router.get("/brands", getAllBrands);
router.get("/materials", getAllMaterials);
router.get("/categories", getAllCategories);
router.get("/colors", getAllColors);

//Products API
router.get("/products", getAllProducts);
router.get("/products/:productId", getProductDetails);

//Cart API
router.get("/cart", getCart);
router.post("/cart", addOrUpdateCart);
router.delete("/cart/:productId", deleteCartItem);

module.exports = router;
