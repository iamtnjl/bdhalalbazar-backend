const express = require("express");
const { protect, adminProtect } = require("../middlewares/auth");
const {
  registerUser,
  loginUser,
  getAllUsers,
  getUserData,
} = require("../controllers/userController");
const router = express.Router();
const upload = require("../middlewares/multer");

//Public API
router.post("/register", upload.single("images"), registerUser);
router.post("/token", loginUser);

// Me API route (only accessible to the authenticated user)
router.get("/me", protect, getUserData); // Get user data (accessible by authenticated user)

// We API route (only accessible by admin users)
router.get("/we", protect, adminProtect, getAllUsers);

module.exports = router;
