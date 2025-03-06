const jwt = require("jsonwebtoken");

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { userId: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "15m" } // Access token valid for 15 minutes
  );

  const refreshToken = jwt.sign(
    { userId: user._id },
    process.env.REFRESH_SECRET,
    { expiresIn: "7d" } // Refresh token valid for 7 days
  );

  return { accessToken, refreshToken };
};

module.exports = { generateTokens };
