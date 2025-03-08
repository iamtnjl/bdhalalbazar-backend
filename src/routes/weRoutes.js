const express = require("express");
const { getAllUsers } = require("../controllers/userController");
const { getAllBrands, createBrand } = require("../controllers/brandController");
const { getAllColors, createColor } = require("../controllers/colorController");
const {
  getAllProducts,
  createProduct,
} = require("../controllers/productController");

const {
  getAllCategories,
  createCategory,
} = require("../controllers/categoryController");
const {
  getAllMaterials,
  createMaterial,
} = require("../controllers/materialController");
const router = express.Router();

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

//Products API
router.get("/products", getAllProducts);
router.post("/products", createProduct);

module.exports = router;
