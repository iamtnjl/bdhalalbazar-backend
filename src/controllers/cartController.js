const Cart = require("../models/cartModel");
const Product = require("../models/productModel");
const Settings = require("../models/settingsModel");
const Category = require("../models/categoryModel");
const Order = require("../models/orderModel");

const { applyProfitMargin, applyDiscount } = require("../utils/price");

const addOrUpdateCart = async (req, res) => {
  try {
    const deviceId = req.body.deviceId;
    if (!deviceId) {
      return res.status(400).json({ message: "deviceID is required" });
    }

    let products = Array.isArray(req.body.cart)
      ? req.body.cart
      : [req.body.cart];

    // Fetch profit margin and profit categories once
    const settings = await Settings.findOne();
    const profitMargin = settings?.profit_margin || 0;

    const profitCategorySlugs = [
      "vegetable",
      "meat",
      "beef",
      "mutton",
      "chicken",
      "fish",
    ];
    const profitCategories = await Category.find({
      slug: { $in: profitCategorySlugs },
    });
    const profitCategoryIds = profitCategories.map((cat) => cat._id.toString());

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

      const product = await Product.findById(productId).populate("categories");
      if (!product) {
        return res
          .status(404)
          .json({ message: `Product ${productId} not found` });
      }

      // Check if product category requires profit margin
      const isProfitApplied = product.categories.some((cat) =>
        profitCategoryIds.includes(cat._id.toString())
      );

      // Apply profit margin if needed
      const basePrice = product.price;
      const priceWithProfit = isProfitApplied
        ? parseFloat((basePrice + (basePrice * profitMargin) / 100).toFixed(2))
        : basePrice;

      // Calculate final price after discount
      const discountPercent = product.discount || 0;
      const finalPrice =
        quantity *
        (priceWithProfit - (priceWithProfit * discountPercent) / 100);

      const productIndex = cart.cart_products.findIndex(
        (item) => item.product.toString() === productId
      );

      if (productIndex !== -1) {
        if (quantity === 0) {
          cart.cart_products.splice(productIndex, 1);
        } else {
          cart.cart_products[productIndex].quantity = quantity;
          cart.cart_products[productIndex].final_price = finalPrice;
          cart.cart_products[productIndex].weight = product.weight;
          cart.cart_products[productIndex].unit = product.unit;
        }
      } else {
        if (quantity > 0) {
          cart.cart_products.push({
            product: productId,
            quantity,
            final_price: finalPrice,
            weight: product.weight,
            unit: product.unit,
          });
        }
      }
    }

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

    // Recalculate totals with profit margin included
    cart.sub_total = cart.cart_products.reduce((sum, item) => {
      const prod = item.product;
      if (!prod) return sum;

      const isProfitApplied = prod.categories.some((cat) =>
        profitCategoryIds.includes(cat._id.toString())
      );

      const basePrice = prod.price;
      const priceWithProfit = isProfitApplied
        ? parseFloat((basePrice + (basePrice * profitMargin) / 100).toFixed(2))
        : basePrice;

      return sum + priceWithProfit * item.quantity;
    }, 0);

    cart.discount = cart.cart_products.reduce((sum, item) => {
      const prod = item.product;
      if (!prod) return sum;

      const isProfitApplied = prod.categories.some((cat) =>
        profitCategoryIds.includes(cat._id.toString())
      );

      const basePrice = prod.price;
      const priceWithProfit = isProfitApplied
        ? parseFloat((basePrice + (basePrice * profitMargin) / 100).toFixed(2))
        : basePrice;

      const discountAmount =
        priceWithProfit - priceWithProfit * ((prod.discount || 0) / 100);
      return sum + discountAmount * item.quantity;
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
    console.error("addOrUpdateCart error:", error);
    res.status(500).json({ message: error.message });
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
        { path: "categories", select: "name slug" }, // include slug to check categories
      ],
    });

    if (!cart || cart.cart_products.length === 0) {
      return res.status(200).json({
        message: "Cart not found for this device",
        cart_products: null,
      });
    }

    const settings = await Settings.findOne();
    const profitMargin = settings?.profit_margin || 0;
    let delivery_charge = settings?.delivery_charge || 0;
    const platform_fee = settings?.platform_fee || 0;

    // Check token for order
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded?.phone) {
          const previousOrder = await Order.findOne({ phone: decoded.phone });

          if (!previousOrder) {
            delivery_charge = 0; // waive delivery charge for returning user
          }
        }
      } catch (err) {
        console.error("Invalid token", err.message);
        // optionally return 401 or continue silently
      }
    } else {
      // Fallback to device-based check
      const previousOrder = await Order.findOne({ deviceId: cart.deviceId });
      if (!previousOrder) {
        delivery_charge = 0;
      }
    }

    // Profit categories slugs (same as before)
    const profitCategorySlugs = [
      "vegetable",
      "meat",
      "beef",
      "mutton",
      "chicken",
      "fish",
    ];
    const profitCategories = await Category.find({
      slug: { $in: profitCategorySlugs },
    });
    const profitCategoryIds = profitCategories.map((cat) => cat._id.toString());

    cart.cart_products = cart.cart_products.map((item) => {
      const product = item.product;

      const isProfitApplied = product.categories.some((cat) =>
        profitCategoryIds.includes(cat._id.toString())
      );

      const basePrice = product.price;
      const priceWithProfit = isProfitApplied
        ? parseFloat((basePrice + (basePrice * profitMargin) / 100).toFixed(2))
        : basePrice;

      // Update product.price with profit-adjusted price
      product.price = priceWithProfit;

      const discounted_price =
        priceWithProfit - (priceWithProfit * product.discount) / 100;

      item.final_price = parseFloat(
        (discounted_price * item.quantity).toFixed(2)
      );
      item.discountAmount = parseFloat(
        (((priceWithProfit * product.discount) / 100) * item.quantity).toFixed(
          2
        )
      );

      return item;
    });

    cart.sub_total = cart.cart_products.reduce((sum, item) => {
      const product = item.product;
      if (!product) return sum;
      // Subtotal = sum of (priceWithProfit * quantity)
      return sum + product.price * item.quantity;
    }, 0);

    cart.discount = cart.cart_products.reduce((sum, item) => {
      return sum + (item.discountAmount || 0);
    }, 0);

    cart.grand_total = cart.cart_products.reduce((sum, item) => {
      return sum + item.final_price;
    }, 0);

    // Add delivery charge and platform fee
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
