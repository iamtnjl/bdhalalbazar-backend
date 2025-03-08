const mongoose = require("mongoose");
const shortid = require("shortid");

const ImageSchema = new mongoose.Schema({
  original: { type: String, required: true },
  thumbnail: { type: String },
  medium: { type: String },
});

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: {
      type: Number,
      required: true,
      set: (val) => parseFloat(val).toFixed(2), // Ensures two decimal places
      get: (val) => parseFloat(val).toFixed(2),
    },
    discount: {
      type: Number,
      default: 0,
      set: (val) => parseFloat(val).toFixed(2),
      get: (val) => parseFloat(val).toFixed(2),
    },
    stock_id: { type: String, default: shortid.generate, unique: true },
    brand: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Brand",
        required: true,
      },
    ],
    materials: [{ type: mongoose.Schema.Types.ObjectId, ref: "Material" }],
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    colors: [{ type: mongoose.Schema.Types.ObjectId, ref: "Colors" }],
    primary_image: { type: ImageSchema, required: true },
    images: [ImageSchema],
    status: {
      type: String,
      enum: ["active", "draft", "pending"],
      default: "draft",
    },
    is_published: { type: Boolean, default: false },
    ad_pixel_id: { type: Number, default: null },
  },
  { timestamps: true, toJSON: { getters: true } }
);

module.exports = mongoose.model("Product", ProductSchema);
