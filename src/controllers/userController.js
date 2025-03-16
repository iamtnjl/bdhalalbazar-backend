const User = require("../models/userModel");
const cloudinary = require("../config/cloudinary");
const { generateTokens } = require("../utils/generateTokens");

// Register User
const registerUser = async (req, res) => {
  try {
    // Extract form-data fields
    const { name, email, phone, password, address, role, folderName } =
      req.body;

    // Check if all required fields are present
    if (!name || !phone || !password) {
      return res
        .status(400)
        .json({ message: "Name, Phone, Password is required." });
    }

    // Check if user already exists
    const normalizedEmail = email?.trim().toLowerCase();
    let existingUser;
    if (phone) {
      existingUser = await User.findOne({ phone });
    }

    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    // Convert address from string to JSON (if sent as JSON string in form-data)
    let parsedAddress = [];
    if (address) {
      try {
        parsedAddress = JSON.parse(address);
      } catch (error) {
        return res.status(400).json({ message: "Invalid address format" });
      }
    }

    let images = { original: "", thumbnail: "", medium: "" };

    // Upload image to Cloudinary if provided
    if (req.file) {
      const folder = folderName || "user_image";

      // Upload original image
      const original = await cloudinary.uploader.upload(req.file.path, {
        folder: folder,
      });

      // Upload thumbnail version
      const thumbnail = await cloudinary.uploader.upload(req.file.path, {
        folder: folder,
        transformation: [{ width: 150, height: 150, crop: "fill" }],
      });

      // Upload medium version
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

    let userData = {
      name,
      phone,
      password,
      address: parsedAddress,
      role,
      images,
    };

    if (normalizedEmail) {
      userData.email = normalizedEmail;
    }

    // Create user
    const user = await User.create(userData);

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

module.exports = {
  registerUser,
  loginUser,
  getAllUsers,
};
