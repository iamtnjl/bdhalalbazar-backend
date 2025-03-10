const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema({
  cart_products: [
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      quantity: { type: Number, default: 1 },
      final_price: { type: Number, default: 0 },
    },
  ],
});

module.exports = mongoose.model("Cart", cartSchema);
