const mongoose = require("mongoose");

async function generateId() {
  const { nanoid } = await import("nanoid");
  return nanoid();
}

const ImageSchema = new mongoose.Schema({
  original: { type: String },
  thumbnail: { type: String },
  medium: { type: String },
});

const ProductSchema = new mongoose.Schema(
  {
    name: {
      en: { type: String, required: true },
      bn: { type: String, required: true },
    },
    description: {
      en: { type: String },
      bn: { type: String },
    },
    price: {
      type: Number,
      required: true,
      set: (val) => parseFloat(val).toFixed(2),
      get: (val) => (val % 1 === 0 ? parseInt(val) : parseFloat(val)),
    },
    mrp_price: {
      type: Number,
      set: (val) => parseFloat(val).toFixed(2),
      get: (val) => (val % 1 === 0 ? parseInt(val) : parseFloat(val)),
    },
    discount: {
      type: Number,
      default: 0,
      set: (val) => parseFloat(val).toFixed(2),
      get: (val) => (val % 1 === 0 ? parseInt(val) : parseFloat(val)),
    },
    stock_id: { type: String, unique: true },
    brand: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Brand",
        required: true,
      },
    ],
    materials: [{ type: mongoose.Schema.Types.ObjectId, ref: "Material" }],
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
    },
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tag" }],
    searchTerms: [{ type: String }],
    colors: [{ type: mongoose.Schema.Types.ObjectId, ref: "Colors" }],
    primary_image: { type: ImageSchema },
    images: [ImageSchema],
    status: {
      type: String,
      enum: ["active", "draft", "pending"],
      default: "active",
    },
    is_published: { type: Boolean, default: true },
    stock: {
      type: Number,
      default: 0,
    },
    orderable_stock: {
      type: Number,
      default: 0,
    },
    weight: {
      type: Number,
      default: 0,
    },
    unit: {
      type: String,
      enum: ["piece", "litre", "kg", "gram"],
      default: "kg",
    },
    ad_pixel_id: { type: String, default: null },
    manufacturer: { type: String },
  },
  { timestamps: true, toJSON: { getters: true } }
);

// Pre-save hook to generate stock_id and populate searchTerms
ProductSchema.pre("save", async function (next) {
  if (!this.stock_id) {
    this.stock_id = await generateId();
  }

  // Make sure searchTerms exists
  if (!this.searchTerms) {
    this.searchTerms = [];
  }

  // Always add name.en
  if (this.name?.en) {
    const term = this.name.en.toLowerCase();
    if (!this.searchTerms.includes(term)) {
      this.searchTerms.push(term);
    }
  }

  // Always add name.bn
  if (this.name?.bn) {
    const term = this.name.bn.toLowerCase();
    if (!this.searchTerms.includes(term)) {
      this.searchTerms.push(term);
    }
  }

  next();
});

module.exports = mongoose.model("Product", ProductSchema);
