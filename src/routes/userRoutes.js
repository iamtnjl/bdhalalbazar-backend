const express = require("express");
const {
  registerUser,
  loginUser,
  setupPassword,
} = require("../controllers/userController");
const router = express.Router();
const upload = require("../middlewares/multer");

//Public API
router.post("/register", upload.single("images"), registerUser);
router.post("/token", loginUser);
router.post("/setup-password", setupPassword);

module.exports = router;
