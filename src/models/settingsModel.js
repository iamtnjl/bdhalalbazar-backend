const mongoose = require("mongoose");

const ImageSchema = new mongoose.Schema({
  original: { type: String },
  thumbnail: { type: String },
  medium: { type: String },
});

const SettingsSchema = new mongoose.Schema(
  {
    delivery_charge: {
      type: Number,
      required: true,
    },
    platform_fee: {
      type: Number,
      default: 0,
    },
    profit_margin: {
      type: Number,
      default: 0,
    },
    banner_images: [{ type: ImageSchema }],
  },
  { timestamps: true, toJSON: { getters: true } }
);

module.exports = mongoose.model("Settings", SettingsSchema);
