const express = require("express");
const { getUserData } = require("../controllers/userController");
const { getAddresses } = require("../controllers/meController");
const router = express.Router();

router.get("/", getUserData);
router.get("/address", getAddresses);

module.exports = router;
