const Order = require("../models/orderModel.js");
const Cart = require("../models/cartModel.js");
const Settings = require("../models/settingsModel.js");
const User = require("../models/userModel.js");
const Product = require("../models/productModel.js");
const Category = require("../models/categoryModel.js");
const mongoose = require("mongoose");
const paginate = require("../utils/pagination.js");
const { adminMessaging } = require("../config/firebase.js");

// Place Order
const placeOrder = async (req, res) => {
  try {
    const { name, phone, address, cart_id, payment_method } = req.body;

    if (!mongoose.isValidObjectId(cart_id)) {
      return res.status(400).json({ message: "Invalid cart ID" });
    }

    const cart = await Cart.findById(cart_id).populate({
      path: "cart_products.product",
      populate: [
        { path: "brand", select: "name" },
        { path: "colors", select: "name" },
        { path: "materials", select: "name" },
        { path: "categories", select: "name" },
      ],
    });

    if (!cart) return res.status(404).json({ message: "Cart not found" });

    let user = await User.findOne({ phone });

    if (!user) {
      user = new User({
        name,
        phone,
        address: [address],
        status: "placeholder",
      });

      await user.save();
    }

    // Fetch settings

    const previousOrder = await Order.findOne({ deviceId: cart.deviceId });
    const settings = await Settings.findOne();
    const delivery_charge = previousOrder ? settings?.delivery_charge : 0;
    const platform_fee = settings?.platform_fee || 0;

    // Subtotal and discount calculations
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

    cart.grand_total =
      cart.sub_total - cart.discount + delivery_charge + platform_fee;

    const orderItems = cart.cart_products.map((item) => ({
      _id: item.product._id,
      quantity: item.quantity,
      price: item.product.price,
      weight: item.product.weight,
      unit: item.product.unit,
      discount_price:
        item.product.price - (item.product.price * item.product.discount) / 100,
      total_price:
        (item.product.price -
          (item.product.price * item.product.discount) / 100) *
        item.quantity,
    }));

    for (const item of cart.cart_products) {
      await Product.findByIdAndUpdate(item.product._id, {
        $inc: { stock: -item.quantity },
      });
    }

    const count = await mongoose.model("Order").countDocuments();

    const newOrder = new Order({
      order_id: `${count + 1}`,
      name,
      phone,
      payment_method,
      address,
      delivery_charge,
      platform_fee,
      deviceId: cart.deviceId,
      items: orderItems,
      sub_total: cart.sub_total,
      discount: cart.discount,
      grand_total: cart.grand_total,
      status: [
        { name: "Pending", slug: "pending", stage: "current" },
        { name: "Accepted", slug: "accepted", stage: "pending" },
        {
          name: "Ready to Deliver",
          slug: "ready-to-deliver",
          stage: "pending",
        },
        { name: "On the Way", slug: "on-the-way", stage: "pending" },
        { name: "Delivered", slug: "delivered", stage: "pending" },
        { name: "Canceled", slug: "canceled", stage: "pending" },
        { name: "Rejected", slug: "rejected", stage: "pending" },
        {
          name: "Failed to deliver",
          slug: "failed-to-deliver",
          stage: "pending",
        },
        { name: "Completed", slug: "completed", stage: "pending" },
      ],
    });

    await newOrder.save();
    await Cart.findByIdAndDelete(cart_id);
    const adminUsers = await User.find({
      role: "admin",
      fcm_token: { $exists: true, $ne: null },
    });

    if (adminUsers.length > 0) {
      const notifications = adminUsers.map((adminUser) => {
        const message = {
          notification: {
            title: "New Order Placed!",
            body: `Order #${newOrder.order_id} placed by ${name}`,
          },
          token: adminUser.fcm_token,
          webpush: {
            notification: {
              icon: "/logo/logo.png",
              click_action: `https://bdhalalbazar.com/we/orders/${newOrder._id}`,
            },
          },
        };

        return adminMessaging.send(message);
      });

      try {
        await Promise.all(notifications);
      } catch (err) {
        console.error(
          "Error sending FCM notifications to admins:",
          err.message
        );
      }
    }

    res
      .status(201)
      .json({ message: "Order placed successfully", order: newOrder });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// Get Order List (Search by Order ID & Filter by Status)
// Function to get orders for the logged-in user based on phone number
const getOrders = async (req, res) => {
  try {
    const userPhone = req.user?.phone;
    if (!userPhone) {
      return res.status(401).json({
        message: "User is not authenticated or phone number is missing",
      });
    }

    const { status, order_id } = req.query;

    let query = { phone: userPhone };

    if (order_id) {
      query.order_id = order_id;
    }

    if (status) {
      query.status = {
        $elemMatch: {
          slug: status,
          stage: { $in: ["current"] },
        },
      };
    }

    const settings = await Settings.findOne();
    const profitMargin = settings?.profit_margin || 0;
    const deliveryChargeDefault = settings?.delivery_charge || 0;
    const platformFeeDefault = settings?.platform_fee || 0;

    const profitCategories = await Category.find({
      slug: { $in: ["vegetable", "meat", "beef", "mutton", "chicken", "fish"] },
    });
    const profitCategoryIds = profitCategories.map((cat) => cat._id.toString());

    const paginatedOrders = await paginate(
      Order,
      query,
      req,
      ["items._id"],
      { createdAt: -1 },
      { "items._id": "items.product" }
    );

    paginatedOrders.results = paginatedOrders.results.map((order) => {
      const currentStatus = Array.isArray(order.status)
        ? order.status.find((s) => s?.stage === "current")
        : null;

      let subtotal = 0;

      if (Array.isArray(order.items)) {
        order.items.forEach((item) => {
          const product = item.product;
          if (!product) return;

          const categories = product.categories || [];
          const isProfitApplied = categories.some((cat) =>
            profitCategoryIds.includes(cat._id?.toString())
          );

          const basePrice = product.price || 0;
          const discount = product.discount || 0;

          const priceWithProfit = isProfitApplied
            ? basePrice + (basePrice * profitMargin) / 100
            : basePrice;

          const discountedPrice =
            priceWithProfit - (priceWithProfit * discount) / 100;

          subtotal += discountedPrice * item.quantity;
        });
      }

      const delivery_charge =
        typeof order.delivery_charge === "number"
          ? order.delivery_charge
          : deliveryChargeDefault;

      const platform_fee =
        typeof order.platform_fee === "number"
          ? order.platform_fee
          : platformFeeDefault;

      const grand_total = parseFloat(
        (subtotal + delivery_charge + platform_fee).toFixed(2)
      );

      return {
        _id: order._id,
        order_id: order.order_id,
        createdAt: order.createdAt,
        status: currentStatus ? currentStatus.name : "unknown",
        grand_total,
      };
    });

    res.status(200).json(paginatedOrders);
  } catch (error) {
    console.error("Error in getOrders:", error);
    res.status(500).json({
      message: "An error occurred while fetching orders",
      error: error.message || error.toString(),
    });
  }
};

const getAllOrders = async (req, res) => {
  try {
    const { search, status } = req.query;

    let query = {};

    // 🔍 Search by phone or order_id
    if (search) {
      query.$or = [
        { phone: { $regex: search, $options: "i" } },
        { order_id: { $regex: search, $options: "i" } },
      ];
    }

    // 🎯 Filter by current status
    if (status) {
      query.status = {
        $elemMatch: {
          slug: status,
          stage: "current",
        },
      };
    }

    // Get profit settings
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

    const settings = await Settings.findOne();
    const profitMargin = settings?.profit_margin || 0;

    // Paginate orders
    const paginatedData = await paginate(
      Order,
      query,
      req,
      ["items._id"],
      { createdAt: -1 },
      { "items._id": "items.product" }
    );

    // Recalculate grand_total per order
    paginatedData.results = paginatedData.results.map((order) => {
      let itemsTotal = 0;

      order.items?.forEach((item) => {
        const product = item.product;
        const quantity = item.quantity ?? 1;

        if (!product || typeof product !== "object") return;

        const isProfitApplied = product.categories?.some((cat) =>
          profitCategoryIds.includes(cat._id?.toString())
        );

        const basePrice = product.price ?? 0;
        const priceWithProfit = isProfitApplied
          ? parseFloat(
              (basePrice + (basePrice * profitMargin) / 100).toFixed(2)
            )
          : basePrice;

        const discountedPrice =
          priceWithProfit - (priceWithProfit * (product.discount || 0)) / 100;

        itemsTotal += discountedPrice * quantity;
      });

      const deliveryCharge = order.delivery_charge || 0;
      const platformFee = order.platform_fee || 0;

      order.grand_total = parseFloat(
        (itemsTotal + deliveryCharge + platformFee).toFixed(2)
      );

      return order;
    });

    return res.status(200).json(paginatedData);
  } catch (error) {
    console.error("Error fetching all orders:", error);
    return res.status(500).json({
      message: "An error occurred while fetching orders",
      error,
    });
  }
};

//  Get Order Details
const getOrderDetails = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate({
        path: "items._id",
        model: "Product",
        populate: [
          { path: "brand", select: "name" },
          { path: "materials", select: "name slug" },
          { path: "colors", select: "name slug" },
          { path: "categories", select: "name slug" },
        ],
      })
      .lean();

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const settings = await Settings.findOne();
    const profitPercentage = settings?.profit_margin || 0;
    const profitCategoryIds = (settings?.profit_categories || []).map((id) =>
      id.toString()
    );
    let delivery_charge = settings?.delivery_charge || 0;
    const platform_fee = settings?.platform_fee || 0;

    const specialCategorySlugs = [
      "vegetable",
      "meat",
      "beef",
      "mutton",
      "chicken",
      "fish",
    ];

    function shouldApplyProfit(product) {
      const categoryIds =
        product.categories?.map((cat) => cat._id?.toString()) || [];
      const categorySlugs = product.categories?.map((cat) => cat.slug) || [];

      return (
        categoryIds.some((id) => profitCategoryIds.includes(id)) ||
        categorySlugs.some((slug) => specialCategorySlugs.includes(slug))
      );
    }

    let sub_total = 0;
    let discount_total = 0;
    let grand_total = 0;

    order.products = order.items.map((item) => {
      const product = item._id;
      const quantity = item.quantity || 1;

      let basePrice = product?.price || 0;
      const discount = product?.discount || 0;

      // Apply profit margin to base price
      if (shouldApplyProfit(product)) {
        basePrice += (basePrice * profitPercentage) / 100;
      }

      // Set the modified price into the product object directly
      product.price = parseFloat(basePrice.toFixed(2));

      const discountPrice = basePrice - (basePrice * discount) / 100;
      const totalPrice = discountPrice * quantity;

      sub_total += basePrice * quantity;
      discount_total += (basePrice - discountPrice) * quantity;
      grand_total += totalPrice;

      return {
        product,
        quantity,
        price: parseFloat(basePrice.toFixed(2)),
        discount_price: parseFloat(discountPrice.toFixed(2)),
        total_price: parseFloat(totalPrice.toFixed(2)),
        weight: item.weight,
        unit: item.unit,
      };
    });

    order.sub_total = parseFloat(sub_total.toFixed(2));
    order.discount = parseFloat(discount_total.toFixed(2));
    order.grand_total =
      parseFloat(grand_total.toFixed(2)) + platform_fee + delivery_charge;
    order.calculated_total_price = order.grand_total;

    order.isPriceEdited = order.products.some((item) => {
      const expected = item.discount_price * item.quantity;
      return Math.round(expected) !== Math.round(item.total_price);
    });

    delete order.items;

    const failedStatuses = [
      "rejected",
      "canceled",
      "return",
      "failed-to-deliver",
    ];

    let showCanceled = false;
    let canceledTimestamp = null;

    for (const status of order.status) {
      if (failedStatuses.includes(status.slug) && status.stage === "current") {
        showCanceled = true;
        canceledTimestamp = status.updatedAt;
        break;
      }
    }

    const filteredStatus = order.status.filter(
      (status) => !failedStatuses.includes(status.slug)
    );

    if (showCanceled) {
      filteredStatus.push({
        name: "Canceled",
        slug: "canceled",
        stage: "current",
        updatedAt: canceledTimestamp || new Date(),
      });
    }

    order.status = filteredStatus;

    res.json(order);
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAdminOrderDetails = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate({
        path: "items._id",
        model: "Product",
        populate: [
          { path: "brand", select: "name" },
          { path: "materials", select: "name" },
          { path: "colors", select: "name" },
          { path: "categories", select: "name slug" },
        ],
      })
      .lean();

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const settings = await Settings.findOne();
    const profitMargin = settings?.profit_margin || 0;
    const deliveryCharge = order.delivery_charge || 0;
    const platformFee = order.platform_fee || 0;

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

    let calculatedTotal = 0;

    order.products = order.items.map((item) => {
      const product = item._id;
      const quantity = item.quantity ?? 1;

      const isProfitApplied = product.categories?.some((cat) =>
        profitCategoryIds.includes(cat._id.toString())
      );

      const basePrice = product.price ?? 0;
      const priceWithMargin = isProfitApplied
        ? parseFloat((basePrice + (basePrice * profitMargin) / 100).toFixed(2))
        : basePrice;

      const discountedPrice =
        priceWithMargin - (priceWithMargin * (product.discount || 0)) / 100;
      const totalPrice = discountedPrice * quantity;

      calculatedTotal += totalPrice;

      return {
        product,
        quantity,
        price: priceWithMargin,
        discount_price: discountedPrice,
        total_price: totalPrice,
        purchase_price: item.purchase_price,
        weight: item.weight,
        unit: item.unit,
      };
    });

    order.grand_total = calculatedTotal + deliveryCharge + platformFee;

    // Other fields
    order.total_purchase_price = order.items.reduce(
      (sum, item) => sum + (item.purchase_price ?? 0),
      0
    );

    order.isPriceEdited = order.products.some((item) => {
      const expected = Math.round(item.total_price);
      const actual = Math.round(item.total_price); // Same here since recalculated
      return expected !== actual;
    });

    order.calculated_total_price = calculatedTotal;

    // Cleanup
    delete order.items;

    res.json(order);
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

//  Update Order Status
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { newStatus } = req.body;

    const order = await Order.findOne({ _id: orderId });
    if (!order) return res.status(404).json({ message: "Order not found" });

    let foundIndex = order.status.findIndex((s) => s.slug === newStatus);
    if (foundIndex === -1) {
      return res.status(400).json({ message: "Invalid order status" });
    }

    order.status.forEach((status, index) => {
      const previousStage = status.stage;

      if (index < foundIndex) {
        status.stage = "completed";
        if (previousStage !== "completed") {
          status.updatedAt = new Date();
        }
      } else if (index === foundIndex) {
        status.stage = "current";
        if (previousStage !== "current") {
          status.updatedAt = new Date();
        }
      } else {
        status.stage = "pending";
        // Keep updatedAt as is for pending
      }
    });

    await order.save();
    res.json({ message: "Order status updated successfully", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

//Edit order items
const editOrderItem = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { product_id, weight, unit, total_price, purchase_price } = req.body;

    if (
      !mongoose.isValidObjectId(orderId) ||
      !mongoose.isValidObjectId(product_id)
    ) {
      return res.status(400).json({ message: "Invalid Order or Product ID" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const itemIndex = order.items.findIndex((item) =>
      item._id.equals(product_id)
    );

    if (itemIndex === -1) {
      return res.status(404).json({ message: "Product not found in order" });
    }

    // Update the specific item
    order.items[itemIndex].weight = weight;
    order.items[itemIndex].unit = unit;
    order.items[itemIndex].total_price = total_price;
    order.items[itemIndex].purchase_price = purchase_price;

    // Recalculate prices
    order.sub_total = order.items.reduce(
      (sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1),
      0
    );

    order.discount = order.items.reduce(
      (sum, item) =>
        sum +
        ((item.price ?? 0) - (item.discount_price ?? 0)) * (item.quantity ?? 1),
      0
    );

    order.total_purchase_price = order.items.reduce(
      (sum, item) => sum + (item.purchase_price ?? 0),
      0
    );

    const itemTotal = order.items.reduce(
      (sum, item) => sum + (item.total_price ?? 0),
      0
    );

    order.grand_total =
      itemTotal + (order.delivery_charge ?? 0) + (order.platform_fee ?? 0);

    await order.save();

    res.status(200).json({ message: "Order item updated successfully", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUserOrderSummary = async (req, res) => {
  try {
    const { search } = req.query;

    // Match only users with role "user"
    let match = { role: "user" };

    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      match.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { phone: { $regex: safeSearch, $options: "i" } },
      ];
    }

    // Paginate user list
    const paginatedUsers = await paginate(User, match, req, [], {
      createdAt: -1,
    });

    // Pull phones from current page users
    const userPhones = paginatedUsers.results.map((user) => user.phone);

    // Aggregate order info by user phone
    const orderData = await Order.aggregate([
      { $match: { phone: { $in: userPhones } } },
      {
        $group: {
          _id: "$phone",
          total_orders: { $sum: 1 },
          total_amount: { $sum: "$grand_total" },
          last_order_date: { $max: "$createdAt" },
        },
      },
    ]);

    const orderMap = {};
    orderData.forEach((entry) => {
      orderMap[entry._id] = entry;
    });

    // Merge user + order summary
    paginatedUsers.results = paginatedUsers.results.map((user) => {
      const summary = orderMap[user.phone] || {
        total_orders: 0,
        total_amount: 0,
        last_order_date: null,
      };

      return {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        status: user.status,
        total_orders: summary.total_orders,
        total_amount: summary.total_amount,
        last_order_date: summary.last_order_date,
      };
    });

    res.status(200).json(paginatedUsers);
  } catch (err) {
    console.error("getUserOrderSummary error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = {
  updateOrderStatus,
  placeOrder,
  getOrders,
  getOrderDetails,
  getAllOrders,
  getAdminOrderDetails,
  editOrderItem,
  getUserOrderSummary,
};
