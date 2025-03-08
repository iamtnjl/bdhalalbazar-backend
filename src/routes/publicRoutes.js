const express = require("express");
const router = express.Router();

const { getAllBrands } = require("../controllers/brandController");
const { getAllMaterials } = require("../controllers/materialController");
const { getAllCategories } = require("../controllers/categoryController");
const { getAllColors } = require("../controllers/colorController");
const { getAllProducts } = require("../controllers/productController");

router.get("/brands", getAllBrands);
router.get("/materials", getAllMaterials);
router.get("/categories", getAllCategories);
router.get("/colors", getAllColors);
router.get("/products", getAllProducts);

module.exports = router;
