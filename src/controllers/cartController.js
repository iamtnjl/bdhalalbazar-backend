const Cart = require("../models/cartModel");
const Product = require("../models/productModel");
const Settings = require("../models/settingsModel");

const addOrUpdateCart = async (req, res) => {
  try {
    const deviceId = req.body.deviceId;
    if (!deviceId) {
      return res.status(400).json({ message: "deviceID is required" });
    }

    let products = Array.isArray(req.body.cart)
      ? req.body.cart
      : [req.body.cart];

    let cart = await Cart.findOne({ deviceId });

    if (!cart) {
      cart = new Cart({ deviceId, cart_products: [] });
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

      const final_price =
        quantity * (product.price - (product.price * product.discount) / 100);

      if (productIndex !== -1) {
        if (quantity === 0) {
          cart.cart_products.splice(productIndex, 1);
        } else {
          cart.cart_products[productIndex].quantity = quantity;
          cart.cart_products[productIndex].final_price = final_price;
          cart.cart_products[productIndex].weight = product.weight;
          cart.cart_products[productIndex].unit = product.unit;
        }
      } else {
        if (quantity > 0) {
          cart.cart_products.push({
            product: productId,
            quantity,
            final_price,
            weight: product.weight,
            unit: product.unit,
          });
        }
      }
    }

    await cart.save();

    // Populate product + nested references
    await cart.populate({
      path: "cart_products.product",
      populate: [
        { path: "brand" },
        { path: "materials" },
        { path: "categories" },
        { path: "colors" },
      ],
    });

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
        deviceId: cart.deviceId,
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
    const deviceId = req.query.deviceId;

    if (!deviceId) {
      return res.status(400).json({ message: "Device ID is required" });
    }

    // Fetch cart with product and nested refs
    let cart = await Cart.findOne({ deviceId }).populate({
      path: "cart_products.product",
      populate: [
        { path: "brand", select: "name" },
        { path: "colors", select: "name" },
        { path: "materials", select: "name" },
        { path: "categories", select: "name" },
      ],
    });

    if (!cart || cart.cart_products.length === 0) {
      return res.status(200).json({
        message: "Cart not found for this device",
        cart_products: null,
      });
    }

    // Fetch delivery_charge and platform_fee from settings
    const settings = await Settings.findOne();
    const delivery_charge = settings?.delivery_charge || 0;
    const platform_fee = settings?.platform_fee || 0;

    // Calculate final prices
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

    // Add delivery_charge and platform_fee to grand_total
    cart.grand_total += delivery_charge + platform_fee;

    await cart.save();

    res.json({
      _id: cart._id,
      cart_products: cart.cart_products,
      sub_total: cart.sub_total,
      discount: cart.discount,
      grand_total: cart.grand_total,
      delivery_charge,
      platform_fee,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteCartItem = async (req, res) => {
  try {
    const { deviceId, productId } = req.params; // Extract deviceId and productId

    if (!deviceId || !productId) {
      return res
        .status(400)
        .json({ message: "Device ID and Product ID are required" });
    }

    // Find the cart associated with the deviceId
    let cart = await Cart.findOne({ deviceId }); // Find cart by deviceId
    if (!cart) {
      return res
        .status(404)
        .json({ message: "Cart not found for this device" });
    }

    // Find the product index in the cart
    const productIndex = cart.cart_products.findIndex(
      (item) => item.product.toString() === productId
    );

    if (productIndex === -1) {
      return res
        .status(404)
        .json({ message: "Product not found in this cart" });
    }

    // Remove the product from the cart
    cart.cart_products.splice(productIndex, 1);

    // Recalculate totals
    cart.sub_total = cart.cart_products.reduce(
      (sum, item) => sum + (item.product?.price || 0) * item.quantity,
      0
    );

    cart.discount = cart.cart_products.reduce((sum, item) => {
      const productPrice = item.product?.price || 0; // Default to 0 if price is undefined
      const productDiscount = item.product?.discount || 0; // Default to 0 if discount is undefined

      // Calculate discounted price and discount amount
      const discounted_price =
        productPrice - (productPrice * productDiscount) / 100;
      const discount = productPrice - discounted_price;

      // Add the discount amount for the current product to the total sum
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
