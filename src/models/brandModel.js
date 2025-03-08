const mongoose = require("mongoose");
const slugify = require("slugify");

const BrandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    slug: { type: String, unique: true },
  },
  { timestamps: true }
);

BrandSchema.pre("save", function (next) {
  this.slug = slugify(this.name, { lower: true, strict: true });
  next();
});

module.exports = mongoose.model("Brand", BrandSchema);
