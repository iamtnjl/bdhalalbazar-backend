const Cart = require("../models/cartModel");
const Product = require("../models/productModel");
const Settings = require("../models/settingsModel");
const Order = require("../models/orderModel");

const addOrUpdateCart = async (req, res) => {
  try {
    const deviceId = req.body.deviceId;
    if (!deviceId) {
      return res.status(400).json({ message: "deviceID is required" });
    }

    let products = Array.isArray(req.body.cart)
      ? req.body.cart
      : [req.body.cart];

    const settings = await Settings.findOne();
    const delivery_charge = settings?.delivery_charge || 0;
    const platform_fee = settings?.platform_fee || 0;

    let cart = await Cart.findOne({ deviceId });
    if (!cart) {
      cart = { deviceId, cart_products: [] };
    }

    let newCartProducts = cart.cart_products || [];

    for (let { productId, quantity } of products) {
      if (!productId || quantity < 0) {
        return res
          .status(400)
          .json({ message: "Invalid productId or quantity" });
      }

      const product = await Product.findById(productId).populate([
        { path: "tags" },
      ]);
      if (!product) {
        return res
          .status(404)
          .json({ message: `Product ${productId} not found` });
      }

      const basePrice = product.price;

      const hasMRPTag = product.tags?.some(
        (tag) => tag.name?.toLowerCase() === "mrp"
      );

      let sellingPrice;
      if (hasMRPTag && product.mrp_price) {
        sellingPrice = product.mrp_price;
      } else {
        const tagMargins =
          product.tags?.length > 0
            ? product.tags.map((t) => t.margin || 0)
            : [0];
        const maxMargin = Math.max(...tagMargins);
        sellingPrice = basePrice + (basePrice * maxMargin) / 100;
      }

      const discountPercent = product.discount || 0;

      const discountedPrice =
        sellingPrice - (sellingPrice * discountPercent) / 100;

      const unitFinalPrice = discountedPrice * quantity;

      const productIndex = newCartProducts.findIndex(
        (item) => item.product.toString() === productId
      );

      if (productIndex !== -1) {
        if (quantity === 0) {
          newCartProducts.splice(productIndex, 1);
        } else {
          newCartProducts[productIndex].quantity = quantity;
          newCartProducts[productIndex].unit_price = parseFloat(
            sellingPrice.toFixed(2)
          );
          newCartProducts[productIndex].discounted_unit_price = parseFloat(
            discountedPrice.toFixed(2)
          );
          newCartProducts[productIndex].final_price = parseFloat(
            unitFinalPrice.toFixed(2)
          );
          newCartProducts[productIndex].weight = product.weight;
          newCartProducts[productIndex].unit = product.unit;
          newCartProducts[productIndex].discountAmount = parseFloat(
            ((sellingPrice - discountedPrice) * quantity).toFixed(2)
          );
        }
      } else {
        if (quantity > 0) {
          newCartProducts.push({
            product: productId,
            quantity,
            unit_price: parseFloat(sellingPrice.toFixed(2)),
            discounted_price: parseFloat(discountedPrice.toFixed(2)),
            final_price: parseFloat(unitFinalPrice.toFixed(2)),
            weight: product.weight,
            unit: product.unit,
            discountAmount: parseFloat(
              ((sellingPrice - discountedPrice) * quantity).toFixed(2)
            ),
          });
        }
      }
    }

    const sub_total = newCartProducts.reduce((sum, item) => {
      const unitPrice = Number(item.unit_price) || 0;
      const quantity = Number(item.quantity) || 0;
      return sum + unitPrice * quantity;
    }, 0);

    const discount = newCartProducts.reduce((sum, item) => {
      return sum + (Number(item.discountAmount) || 0);
    }, 0);

    let grand_total = newCartProducts.reduce((sum, item) => {
      return sum + (Number(item.final_price) || 0);
    }, 0);

    grand_total += delivery_charge + platform_fee;

    const updatedCart = await Cart.findOneAndUpdate(
      { deviceId },
      {
        $set: {
          cart_products: newCartProducts,
          sub_total,
          discount,
          grand_total,
        },
      },
      { new: true, upsert: true }
    ).populate({
      path: "cart_products.product",
      populate: [
        { path: "brand", select: "name" },
        { path: "materials", select: "name" },
        { path: "categories", select: "name slug" },
        { path: "colors", select: "name" },
        { path: "tags", select: "name margin" },
      ],
    });

    return res.json({
      message: "Cart updated",
      cart: {
        deviceId: updatedCart.deviceId,
        cart_products: updatedCart.cart_products,
        sub_total: parseFloat(sub_total.toFixed(2)),
        discount: parseFloat(discount.toFixed(2)),
        grand_total: parseFloat(grand_total.toFixed(2)),
        delivery_charge,
        platform_fee,
      },
    });
  } catch (error) {
    console.error("addOrUpdateCart error:", error);
    return res.status(500).json({ message: error.message });
  }
};

const getCart = async (req, res) => {
  try {
    const deviceId = req.query.deviceId;

    if (!deviceId) {
      return res.status(400).json({ message: "Device ID is required" });
    }

    // Fetch cart with populated product and nested references
    let cart = await Cart.findOne({ deviceId }).populate({
      path: "cart_products.product",
      populate: [
        { path: "brand", select: "name" },
        { path: "colors", select: "name" },
        { path: "materials", select: "name" },
        { path: "categories", select: "name slug" },
        { path: "tags", select: "name margin" }, // ✅ ensure tags with margin are loaded
      ],
    });

    if (!cart || cart.cart_products.length === 0) {
      return res.status(200).json({
        message: "Cart not found for this device",
        cart_products: null,
      });
    }

    const settings = await Settings.findOne();
    let delivery_charge = settings?.delivery_charge || 0;
    const platform_fee = settings?.platform_fee || 0;

    // 👉 Calculate per product
    cart.cart_products = cart.cart_products.map((item) => {
      const product = item.product;

      const basePrice = product.price;

      // MRP or margin logic
      const hasMRPTag = product.tags?.some(
        (tag) => tag.name?.toLowerCase() === "mrp"
      );

      let sellingPrice;

      if (hasMRPTag && product.mrp_price) {
        sellingPrice = product.mrp_price;
      } else {
        const tagMargins =
          product.tags?.length > 0
            ? product.tags.map((t) => t.margin || 0)
            : [0];
        const maxMargin = Math.max(...tagMargins);
        sellingPrice = basePrice + (basePrice * maxMargin) / 100;
      }

      const discountPercent = product.discount || 0;

      const discountedPrice =
        sellingPrice - (sellingPrice * discountPercent) / 100;

      // ✅ Add fields to `product` itself
      product.price = parseFloat(sellingPrice.toFixed(2)); // 👉 new `price`
      product.discounted_price = parseFloat(discountedPrice.toFixed(2)); // 👉 new `discounted_price`

      // ✅ Update cart item fields too (per-unit)
      item.unit_price = product.price;
      item.discounted_unit_price = product.discounted_price;
      item.final_price = parseFloat(
        (product.discounted_price * item.quantity).toFixed(2)
      );
      item.discountAmount = parseFloat(
        ((product.price - product.discounted_price) * item.quantity).toFixed(2)
      );

      return item;
    });

    // ✅ New Subtotal
    cart.sub_total = cart.cart_products.reduce((sum, item) => {
      return sum + item.unit_price * item.quantity;
    }, 0);

    // ✅ New Discount
    cart.discount = cart.cart_products.reduce((sum, item) => {
      return sum + (item.discountAmount || 0);
    }, 0);

    // ✅ New Grand Total
    cart.grand_total = cart.cart_products.reduce((sum, item) => {
      return sum + item.final_price;
    }, 0);

    // ✅ Add delivery and platform fee
    cart.grand_total += delivery_charge + platform_fee;

    await cart.save();

    res.json({
      _id: cart._id,
      cart_products: cart.cart_products,
      sub_total: parseFloat(cart.sub_total.toFixed(2)),
      discount: parseFloat(cart.discount.toFixed(2)),
      grand_total: parseFloat(cart.grand_total.toFixed(2)),
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

const getCartsWithUserInfo = async (req, res) => {
  try {
    const search = req.query.search || "";

    // Step 1: Filter by search (phone -> matching deviceIds)
    let match = {
      cart_products: { $ne: [] },
    };
    if (search) {
      const matchingOrders = await Order.find({
        phone: { $regex: search, $options: "i" },
      }).select("deviceId");
      const matchedDeviceIds = matchingOrders.map((o) => o.deviceId);
      match.deviceId = { $in: matchedDeviceIds };
    }

    // Step 2: Get all matching carts
    let allCarts = await Cart.find(match)
      .populate("cart_products.product")
      .sort({ createdAt: -1 }) // Sort newest first
      .lean();

    // Step 3: Enrich with base_product and user info
    allCarts = await Promise.all(
      allCarts.map(async (cart) => {
        for (const item of cart.cart_products) {
          const product = item.product;
          if (product && product.base_product) {
            const baseProduct = await Product.findById(
              product.base_product
            ).lean();
            item.product.base_product = baseProduct || null;
          }
        }

        const order = await Order.findOne({ deviceId: cart.deviceId })
          .sort({ createdAt: -1 })
          .select("name phone")
          .lean();

        cart.user = order ? { name: order.name, phone: order.phone } : null;

        // Ensure createdAt and updatedAt fields exist in response
        return {
          ...cart,
          createdAt: cart.createdAt,
          updatedAt: cart.updatedAt,
        };
      })
    );

    // Step 4: Sort carts with user info first, keeping createdAt desc order
    allCarts.sort((a, b) => {
      const aHasUser = a.user && a.user.name && a.user.phone;
      const bHasUser = b.user && b.user.name && b.user.phone;

      if (aHasUser === bHasUser) {
        return new Date(b.createdAt) - new Date(a.createdAt); // Newest first
      }

      return bHasUser - aHasUser; // True (1) comes before false (0)
    });

    // Step 5: Manual pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.show) || 20;
    const skip = (page - 1) * limit;
    const paginatedResults = allCarts.slice(skip, skip + limit);

    // Step 6: Response with pagination info
    const baseUrl = `${req.protocol}://${req.get("host")}${req.baseUrl}${
      req.path
    }`;
    const queryParams = new URLSearchParams(req.query);
    queryParams.set("show", limit);
    queryParams.delete("page");

    const nextPage =
      page * limit < allCarts.length
        ? `${baseUrl}?${queryParams.toString()}&page=${page + 1}`
        : null;
    const prevPage =
      page > 1 ? `${baseUrl}?${queryParams.toString()}&page=${page - 1}` : null;

    return res.status(200).json({
      count: allCarts.length,
      next: nextPage,
      previous: prevPage,
      results: paginatedResults,
    });
  } catch (err) {
    console.error("Failed to fetch carts:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  addOrUpdateCart,
  getCart,
  deleteCartItem,
  getCartsWithUserInfo,
};
