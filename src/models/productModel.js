const mongoose = require("mongoose");
const shortid = require("shortid");

const ImageSchema = new mongoose.Schema({
  original: { type: String },
  thumbnail: { type: String },
  medium: { type: String },
});

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: {
      type: Number,
      required: true,
      set: (val) => parseFloat(val).toFixed(2),
      get: (val) => (val % 1 === 0 ? parseInt(val) : parseFloat(val)),
    },
    discount: {
      type: Number,
      default: 0,
      set: (val) => parseFloat(val).toFixed(2),
      get: (val) => (val % 1 === 0 ? parseInt(val) : parseFloat(val)),
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
    primary_image: { type: ImageSchema },
    images: [ImageSchema],
    status: {
      type: String,
      enum: ["active", "draft", "pending"],
      default: "draft",
    },
    is_published: { type: Boolean, default: false },
    stock: {
      type: Number,
      default: 0,
    },
    orderable_stock: {
      type: Number,
      default: 0,
    },
    ad_pixel_id: { type: String, default: null },
    manufacturer: { type: String },
  },
  { timestamps: true, toJSON: { getters: true } }
);

module.exports = mongoose.model("Product", ProductSchema);
