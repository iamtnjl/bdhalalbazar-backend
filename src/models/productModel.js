const mongoose = require("mongoose");
const shortid = require("shortid");

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    stock_id: { type: String, default: shortid.generate, unique: true },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
    },
    materials: [{ type: mongoose.Schema.Types.ObjectId, ref: "Material" }],
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    colors: [{ type: String }],
    images: {
      original: { type: String, required: true }, // Full-size image
      thumbnail: { type: String }, // Small size
      medium: { type: String }, // Medium size
    },
    status: {
      type: String,
      enum: ["active", "draft", "pending"],
      default: "draft",
    },
    is_published: { type: Boolean, default: false },
    ad_pixel_id: { type: Number, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", ProductSchema);
