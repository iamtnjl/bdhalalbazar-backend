require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const connectDB = require("./config/db");
const { protect, adminProtect } = require("../src/middlewares/auth");
// const chalk = require("chalk");

// Initialize Express App
const app = express();
app.set("trust proxy", true)
const cookieParser = require("cookie-parser");
app.use(cookieParser());

// Middleware
app.use(express.json()); // Parse JSON
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded data
app.use(
  cors({
    origin: [
      "https://bdhalalbazar.com",
      "https://www.bdhalalbazar.com",
      "http://localhost:3000",
      "http://172.20.10.2:3000",
    ],
    credentials: true,
  })
); // Allow cross-origin requests
app.use(helmet()); // Secure HTTP headers
app.use(compression()); // Compress responses
app.use(morgan("dev")); // Log HTTP requests

// Connect to MongoDB
connectDB();

app.get("/", (req, res) => {
  res.status(200).json({ message: "Server is running successfully 🚀" });
});

// Routes
app.use("/api/public", require("./routes/publicRoutes"));
app.use("/api/auth", require("./routes/userRoutes"));
app.use("/api/me", protect, require("../src/routes/meRoutes"));
app.use("/api/we", protect, adminProtect, require("../src/routes/weRoutes"));
app.use("/api/facebook", require("./routes/facebook"));

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: err.message || "Internal Server Error" });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  const { default: chalk } = await import("chalk");
  console.log(chalk.green.bold(`Server is running on port ${PORT} 🚀`));
});
