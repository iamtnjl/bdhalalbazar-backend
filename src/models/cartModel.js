const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  cart_products: [
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      quantity: { type: Number, required: true },
      final_price: { type: Number, required: true },
    },
  ],
  sub_total: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  grand_total: { type: Number, default: 0 },
});

module.exports = mongoose.model("Cart", cartSchema);
