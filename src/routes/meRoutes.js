const express = require("express");
const router = express.Router();

const {
  getAddresses,
  updateUser,
  getUserData,
  addOrEditAddress,
} = require("../controllers/meController");

const {
  getOrders,
  getOrderDetails,
} = require("../controllers/orderController");

router.get("/", getUserData);
router.patch("/", updateUser);
router.get("/addresses", getAddresses);
router.post("/addresses", addOrEditAddress);

//Order API
router.get("/orders", getOrders);
router.get("/orders/:orderId", getOrderDetails);

module.exports = router;
