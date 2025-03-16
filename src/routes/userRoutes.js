const express = require("express");
const { registerUser, loginUser } = require("../controllers/userController");
const router = express.Router();
const upload = require("../middlewares/multer");

//Public API
router.post("/register", upload.single("images"), registerUser);
router.post("/token", loginUser);

module.exports = router;
