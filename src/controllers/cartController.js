const Cart = require("../models/cartModel");
const Product = require("../models/productModel");

const addOrUpdateCart = async (req, res) => {
  try {
    let products = Array.isArray(req.body) ? req.body : [req.body]; // Ensure input is an array

    let cart = await Cart.findOne();
    if (!cart) {
      cart = new Cart({ cart_products: [] });
    }

    for (let { productId, quantity } of products) {
      if (!productId || quantity < 0) {
        return res
          .status(400)
          .json({ message: "Invalid productId or quantity" });
      }

      const product = await Product.findById(productId);
      if (!product) {
        return res
          .status(404)
          .json({ message: `Product ${productId} not found` });
      }

      const productIndex = cart.cart_products.findIndex(
        (item) => item.product.toString() === productId
      );

      if (productIndex !== -1) {
        if (quantity === 0) {
          // Remove item if quantity is 0
          cart.cart_products.splice(productIndex, 1);
        } else {
          //  Update quantity & final price
          cart.cart_products[productIndex].quantity = quantity;
          cart.cart_products[productIndex].final_price =
            quantity *
            (product.price - (product.price * product.discount) / 100);
        }
      } else {
        if (quantity > 0) {
          //  Add product if it's not in cart & quantity > 0
          cart.cart_products.push({
            product: productId,
            quantity: quantity,
            final_price:
              quantity *
              (product.price - (product.price * product.discount) / 100),
          });
        }
      }
    }

    // Save cart first so it can be populated
    await cart.save();

    // Populate product details before calculating totals
    await cart.populate("cart_products.product");

    // Recalculate totals
    cart.sub_total = cart.cart_products.reduce(
      (sum, item) => sum + (item.product?.price || 0) * item.quantity,
      0
    );

    cart.discount = cart.cart_products.reduce((sum, item) => {
      const discounted_price =
        item.product?.price -
        (item.product?.price * item.product?.discount) / 100;
      const discount = item.product?.price - discounted_price;

      return sum + discount * item.quantity;
    }, 0);

    cart.grand_total = cart.cart_products.reduce(
      (sum, item) => sum + item.final_price,
      0
    );

    await cart.save();

    res.json({
      message: "Cart updated",
      cart: {
        cart_products: cart.cart_products,
        sub_total: cart.sub_total,
        discount: cart.discount,
        grand_total: cart.grand_total,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne().populate({
      path: "cart_products.product",
      populate: [
        { path: "brand", select: "name" },
        { path: "colors", select: "name" },
        { path: "materials", select: "name" },
        { path: "categories", select: "name" },
      ],
    });

    if (!cart || cart.cart_products.length === 0) {
      return res.json({ message: "Cart is empty", cart: null });
    }

    //  Explicitly setting final_price for each cart product
    cart.cart_products = cart.cart_products.map((item) => {
      const discounted_price =
        item.product?.price -
        (item.product?.price * item.product?.discount) / 100;
      item.final_price = discounted_price * item.quantity;
      return item;
    });

    cart.sub_total = cart.cart_products.reduce(
      (sum, item) => sum + (item.product?.price || 0) * item.quantity,
      0
    );

    cart.discount = cart.cart_products.reduce((sum, item) => {
      const discounted_price =
        item.product?.price -
        (item.product?.price * item.product?.discount) / 100;
      const discount = item.product?.price - discounted_price;

      return sum + discount * item.quantity;
    }, 0);

    cart.grand_total = cart.cart_products.reduce(
      (sum, item) => sum + item.final_price,
      0
    );

    await cart.save();

    res.json({
      _id: cart._id,
      cart_products: cart.cart_products,
      sub_total: cart.sub_total,
      discount: cart.discount,
      grand_total: cart.grand_total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteCartItem = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({ message: "Product ID is required" });
    }

    let cart = await Cart.findOne();
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    // Find the product index
    const productIndex = cart.cart_products.findIndex(
      (item) => item.product.toString() === productId
    );

    if (productIndex === -1) {
      return res.status(404).json({ message: "Product not found in cart" });
    }

    // Remove the product from cart
    cart.cart_products.splice(productIndex, 1);

    // Recalculate totals
    cart.sub_total = cart.cart_products.reduce(
      (sum, item) => sum + (item.product?.price || 0) * item.quantity,
      0
    );

    cart.discount = cart.cart_products.reduce((sum, item) => {
      const discounted_price =
        item.product?.price -
        (item.product?.price * item.product?.discount) / 100;
      const discount = item.product?.price - discounted_price;

      return sum + discount * item.quantity;
    }, 0);

    cart.grand_total = cart.cart_products.reduce(
      (sum, item) => sum + item.final_price,
      0
    );

    await cart.save();

    res.json({
      message: "Product removed from cart",
      cart: {
        cart_products: cart.cart_products,
        sub_total: cart.sub_total,
        discount: cart.discount,
        grand_total: cart.grand_total,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { addOrUpdateCart, getCart, deleteCartItem };
