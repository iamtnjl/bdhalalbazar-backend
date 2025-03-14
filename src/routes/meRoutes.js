const express = require("express");
const { getUserData } = require("../controllers/userController");
const { getAddresses } = require("../controllers/meController");
const { getOrders, getOrderDetails } = require("../controllers/orderController");
const router = express.Router();

router.get("/", getUserData);
router.get("/addresses", getAddresses);

//Order API
router.get("/orders", getOrders);
router.get("/orders/:orderId", getOrderDetails);

module.exports = router;
