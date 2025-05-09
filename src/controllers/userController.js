const User = require("../models/userModel");
const cloudinary = require("../config/cloudinary");
const { generateTokens } = require("../utils/generateTokens");

// Register User
const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password, address, role, folderName } =
      req.body;

    if (!name || !phone || !password) {
      return res
        .status(400)
        .json({ message: "Name, Phone, and Password are required." });
    }

    const normalizedEmail = email?.trim().toLowerCase();

    let existingUser = await User.findOne({ phone });

    if (existingUser) {
      if (existingUser.status === "active") {
        return res.status(400).json({ message: "User already exists" });
      }
    }

    // Parse address
    let parsedAddress = [];
    if (address) {
      try {
        parsedAddress = JSON.parse(address);
      } catch (error) {
        return res.status(400).json({ message: "Invalid address format" });
      }
    }

    let images = { original: "", thumbnail: "", medium: "" };

    if (req.file) {
      const folder = folderName || "user_image";

      const original = await cloudinary.uploader.upload(req.file.path, {
        folder: folder,
      });

      const thumbnail = await cloudinary.uploader.upload(req.file.path, {
        folder: folder,
        transformation: [{ width: 150, height: 150, crop: "fill" }],
      });

      const medium = await cloudinary.uploader.upload(req.file.path, {
        folder: folder,
        transformation: [{ width: 500, height: 500, crop: "limit" }],
      });

      images = {
        original: original.secure_url,
        thumbnail: thumbnail.secure_url,
        medium: medium.secure_url,
      };
    }

    const userData = {
      name,
      phone,
      password,
      address: parsedAddress,
      role,
      images,
      status: "active", // Promote user from placeholder to active
    };

    if (normalizedEmail) {
      userData.email = normalizedEmail;
    }

    let user;

    if (existingUser) {
      // Update placeholder/suspended/pending user
      Object.assign(existingUser, userData);
      user = await existingUser.save();
    } else {
      // Create new user
      user = await User.create(userData);
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Login User (by email or phone)
const loginUser = async (req, res) => {
  const { user_id, password } = req.body;

  if (!user_id || !password) {
    return res
      .status(400)
      .json({ message: "User ID and password are required" });
  }

  // Check if the user_id is an email or phone number
  const isEmail = /\S+@\S+\.\S+/.test(user_id); // Basic email validation
  const query = isEmail ? { email: user_id } : { phone: user_id };

  const user = await User.findOne(query);
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  // Generate Access and Refresh Tokens
  const { accessToken, refreshToken } = generateTokens(user);

  // Update last login time
  user.lastLogin = new Date();
  await user.save();

  res.json({ access: accessToken, refresh: refreshToken });
};

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const saveFcmToken = async (req, res) => {
  try {
    const userId = req.user._id;
    const { token } = req.body;

    if (!token) return res.status(400).json({ message: "Token is required" });

    const user = await User.findByIdAndUpdate(
      userId,
      { fcm_token: token },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({ message: "FCM token saved", user });
  } catch (error) {
    console.error("Save FCM Token Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Setup Password for Placeholder Account
const setupPassword = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res
        .status(400)
        .json({ message: "Phone and password are required." });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.status !== "placeholder") {
      return res
        .status(400)
        .json({ message: "Account already set up or not eligible." });
    }

    user.password = password;
    user.status = "active";

    await user.save();

    const { accessToken, refreshToken } = generateTokens(user);

    return res.status(200).json({
      message: "Password set successfully. Account is now active.",
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
      access: accessToken,
      refresh: refreshToken,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getAllUsers,
  saveFcmToken,
  setupPassword,
};
