require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const connectDB = require("./config/db");

// Initialize Express App
const app = express();

// Middleware
app.use(express.json()); // Parse JSON
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded data
app.use(cors()); // Allow cross-origin requests
app.use(helmet()); // Secure HTTP headers
app.use(compression()); // Compress responses
app.use(morgan("dev")); // Log HTTP requests

// Connect to MongoDB
connectDB();

app.get("/", (req, res) => {
  res.status(200).json({ message: "Server is running successfully 🚀" });
});

// Routes
app.use("/api/users", require("./routes/userRoutes"));
// app.use("/api/products", require("./routes/productRoutes"));
// app.use("/api/orders", require("./routes/orderRoutes"));

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: err.message || "Internal Server Error" });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
