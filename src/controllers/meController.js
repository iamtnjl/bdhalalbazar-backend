const Users = require("../models/userModel");
const bcrypt = require("bcryptjs");

const getUserData = (req, res) => {
  res.json({ user: req.user });
};

const getAddresses = async (req, res) => {
  try {
    // Fetch the user based on the ID in the decoded JWT token
    const user = await Users.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Return the addresses of the authenticated user
    return res.json(user.address);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const userId = req.user.id; // Get logged-in user ID from req.user
    const { name, email, phone, password, role, address, images } = req.body;

    console.log(req.body);

    // Find the authenticated user
    let user = await Users.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Update fields only if provided
    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;

    // Hash password if provided
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    if (role) user.role = role;

    // Ensure Mongoose detects the update for nested fields
    if (address) {
      user.address = address;
      user.markModified("address");
    }

    if (images) {
      user.images = images;
      user.markModified("images");
    }

    // Save the updated user
    await user.save();

    // Fetch latest data from DB to return
    const updatedUser = await Users.findById(userId);

    res
      .status(200)
      .json({ message: "User updated successfully", user: updatedUser });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const addOrEditAddress = async (req, res) => {
  try {
    const userId = req.user._id;
    const { addressId, street, city, zip } = req.body;

    if (!street || !city || !zip) {
      return res
        .status(400)
        .json({ message: "All address fields are required" });
    }

    const user = await Users.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (addressId) {
      // Edit existing address
      const addressIndex = user.address.findIndex(
        (addr) => addr._id.toString() === addressId
      );
      if (addressIndex === -1) {
        return res.status(404).json({ message: "Address not found" });
      }
      user.address[addressIndex] = { _id: addressId, street, city, zip };
    } else {
      // Add new address
      user.address.push({ street, city, zip });
    }

    await user.save();

    res.status(200).json({
      message: addressId
        ? "Address updated successfully"
        : "Address added successfully",
      user,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

module.exports = { getUserData, getAddresses, updateUser, addOrEditAddress };
