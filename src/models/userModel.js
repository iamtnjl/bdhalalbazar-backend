const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const addressSchema = new mongoose.Schema({
  street: { type: String, required: true },
  city: { type: String, required: true },
  zip: { type: String, required: true },
});

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: false,
      trim: true,
      sparse: true,
      lowercase: true,
      validate: {
        validator: function (v) {
          return v === "" || /.+@.+\..+/.test(v);
        },
        message: "Invalid email format",
      },
    },
    phone: {
      type: String,
      required: true,
      unique: true,
    },
    password: { type: String },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    address: { type: [addressSchema], default: [] },
    lastLogin: { type: Date, default: null },
    images: {
      original: { type: String, required: false },
      thumbnail: { type: String },
      medium: { type: String },
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare passwords
userSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
