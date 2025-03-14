const users = require("../models/userModel");

const getAddresses = async (req, res) => {
  try {
    // Fetch the user based on the ID in the decoded JWT token
    const user = await users.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Return the addresses of the authenticated user
    return res.json(user.address);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { getAddresses };
