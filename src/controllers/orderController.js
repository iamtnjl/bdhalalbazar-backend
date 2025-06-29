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
        { path: "tags", select: "name margin" },
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

    const settings = await Settings.findOne();
    const platform_fee = settings?.platform_fee || 0;
    const delivery_charge = settings?.delivery_charge || 0;

    // Compute item-level prices snapshot
    const orderItems = cart.cart_products.map((item) => {
      const product = item.product;

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

      return {
        _id: product._id,
        quantity: item.quantity,
        base_price: parseFloat(basePrice.toFixed(2)),
        selling_price: parseFloat(sellingPrice.toFixed(2)),
        discounted_price: parseFloat(discountedPrice.toFixed(2)),
        total_price: parseFloat((discountedPrice * item.quantity).toFixed(2)),
        weight: product.weight,
        unit: product.unit,
      };
    });

    const sub_total = orderItems.reduce(
      (sum, item) => sum + item.selling_price * item.quantity,
      0
    );

    const total_base_price = orderItems.reduce(
      (sum, item) => sum + item.base_price * item.quantity,
      0
    );

    const discount = orderItems.reduce(
      (sum, item) =>
        sum + (item.selling_price - item.discounted_price) * item.quantity,
      0
    );
    const grand_total = sub_total - discount + delivery_charge + platform_fee;
    const profit = grand_total - total_base_price;

    // Deduct stock
    for (const item of cart.cart_products) {
      await Product.findByIdAndUpdate(item.product._id, {
        $inc: { stock: -item.quantity },
      });
    }

    const count = await Order.countDocuments();

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
      sub_total,
      discount,
      grand_total,
      profit,
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

    // Send push notifications to admins
    const adminUsers = await User.find({
      role: "admin",
      fcm_token: { $exists: true, $ne: null },
    });

    if (adminUsers.length > 0) {
      const notifications = adminUsers.map((adminUser) => {
        const message = {
          token: adminUser.fcm_token,
          notification: {
            title: "New Order Placed!",
            body: `Order #${newOrder.order_id} placed by ${name}`,
          },
          data: {
            order_id: newOrder._id.toString(),
            type: "order_placed",
          },
          android: {
            notification: {
              sound: "default",
              click_action: "FLUTTER_NOTIFICATION_CLICK",
            },
          },
          apns: {
            payload: {
              aps: {
                sound: "default",
              },
            },
          },
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
        console.error("Error sending FCM notifications:", err.message);
      }
    }

    res
      .status(201)
      .json({ message: "Order placed successfully", order: newOrder });
  } catch (error) {
    console.error("placeOrder error:", error);
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

      return {
        _id: order._id,
        order_id: order.order_id,
        createdAt: order.createdAt,
        status: currentStatus ? currentStatus.name : "unknown",
        grand_total: order.grand_total,
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

    // Paginate orders
    const paginatedData = await paginate(
      Order,
      query,
      req,
      ["items._id"],
      { createdAt: -1 },
      { "items._id": "items.product" }
    );

    paginatedData.results = paginatedData.results.map((order) => {
      return {
        ...order,
      };
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
    let delivery_charge = settings?.delivery_charge || 0;
    const platform_fee = settings?.platform_fee || 0;

    let sub_total = 0;
    let discount_total = 0;
    let grand_total = 0;

    order.products = order.items.map((item) => {
      const product = item._id;
      const quantity = item.quantity || 1;

      const sellingPrice = item.selling_price ?? 0; // saved selling_price in `price` field
      const discountedPrice = item.discounted_price ?? 0; // saved discounted_price

      const totalPrice = item?.total_price;

      // Accumulate totals based on saved prices
      sub_total += sellingPrice * quantity;
      discount_total += (sellingPrice - discountedPrice) * quantity;
      grand_total += totalPrice;

      return {
        product,
        quantity,
        selling_price: sellingPrice,
        discounted_price: discountedPrice,
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
      const expected = item.product.weight !== item.weight;
      return expected;
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

    // ✅ Use snapshot prices only — NO selling price
    order.products = order.items.map((item) => {
      const product = item._id;
      const quantity = item.quantity ?? 1;

      const basePrice = item.base_price ?? 0; // if you saved it!
      const discountedPrice = item.discounted_price ?? 0; // snapshot
      const totalPrice = item.total_price ?? 0; // snapshot
      const purchasePrice = basePrice * quantity ?? 0;
      const sellingPrice = item.selling_price ?? 0;

      return {
        product,
        quantity,
        base_price: basePrice,
        discounted_price: discountedPrice,
        selling_price: sellingPrice,
        total_price: totalPrice,
        purchase_price: purchasePrice,
        weight: item.weight,
        unit: item.unit,
      };
    });

    order.isPriceEdited = order.products.some((item) => {
      const expected = item.weight !== item.product.weight;
      return expected;
    });

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
