const mongoose = require("mongoose");
const slugify = require("slugify");

const ColorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    slug: { type: String, unique: true },
  },
  { timestamps: true }
);

ColorSchema.pre("save", function (next) {
  // Convert name to Title Case
  this.name = this.name
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  // Generate slug from name
  this.slug = slugify(this.name, { lower: true, strict: true });

  next();
});

module.exports = mongoose.model("Colors", ColorSchema);
