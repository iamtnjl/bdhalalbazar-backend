const express = require("express");
const router = express.Router();
const { saveFcmToken } = require("../controllers/userController");

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

//Firebase push notifications
router.post("/save-fcm-token", saveFcmToken);

module.exports = router;
