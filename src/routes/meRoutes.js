const express = require("express");
const router = express.Router();

const {
  getAddresses,
  updateUser,
  getUserData,
} = require("../controllers/meController");

const {
  getOrders,
  getOrderDetails,
} = require("../controllers/orderController");

router.get("/", getUserData);
router.patch("/", updateUser);
router.get("/addresses", getAddresses);

//Order API
router.get("/orders", getOrders);
router.get("/orders/:orderId", getOrderDetails);

module.exports = router;
