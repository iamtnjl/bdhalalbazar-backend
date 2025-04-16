const Order = require("../models/orderModel.js");
const Cart = require("../models/cartModel.js");
const Settings = require("../models/settingsModel.js");
const User = require("../models/userModel.js");
const Product = require("../models/productModel.js");
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

    // Fetch settings
    const settings = await Settings.findOne();
    const delivery_charge = settings?.delivery_charge || 0;
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
    const userPhone = req.user.phone;
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
      query["status"] = {
        $elemMatch: {
          slug: status,
          stage: { $in: ["current"] },
        },
      };
    }

    const paginatedOrders = await paginate(Order, query, req, [], {
      createdAt: -1,
    });

    paginatedOrders.results = paginatedOrders.results.map((order) => {
      const currentStatus = order.status.find((s) =>
        s.stage.includes("current")
      );
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
    console.error(error);
    res.status(500).json({
      message: "An error occurred while fetching orders",
      error,
    });
  }
};

const getAllOrders = async (req, res) => {
  try {
    const { status, order_id } = req.query;

    let query = {};

    // If order_id is provided, search by exact match
    if (order_id) {
      query.order_id = { $regex: order_id, $options: "i" }; // case-insensitive search
    }

    // If status is provided, search for status.slug inside array of objects
    if (status) {
      query.status = {
        $elemMatch: {
          slug: status,
          stage: "current", // Optional: match only if the stage is "current"
        },
      };
    }

    const paginatedData = await paginate(Order, query, req);

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
          { path: "materials", select: "name" },
          { path: "colors", select: "name" },
          { path: "categories", select: "name" },
        ],
      })
      .lean();

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Map product items
    order.products = order.items.map((item) => ({
      product: item._id,
      quantity: item.quantity,
      price: item.price,
      discount_price: item.discount_price,
      total_price: item.total_price,
      weight: item.weight,
      unit: item.unit,
    }));
    delete order.items;

    // Filter and transform statuses
    const failedStatuses = [
      "rejected",
      "canceled",
      "return",
      "failed-to-deliver",
    ];

    let showCanceled = false;
    let canceledTimestamp = null;

    // Loop through all statuses to check if we should show 'Canceled'
    for (const status of order.status) {
      if (failedStatuses.includes(status.slug) && status.stage === "current") {
        showCanceled = true;
        canceledTimestamp = status.updatedAt;
        break;
      }
    }

    // Filter out failed statuses
    const filteredStatus = order.status.filter(
      (status) => !failedStatuses.includes(status.slug)
    );

    // Append synthetic "Canceled" status if needed
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
          { path: "categories", select: "name" },
        ],
      })
      .lean(); // Converts Mongoose document to plain JSON

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.products = order.items.map((item) => ({
      product: item._id,
      quantity: item.quantity,
      price: item.price,
      discount_price: item.discount_price,
      total_price: item.total_price,
      weight: item.weight,
      unit: item.unit,
    }));

    // Remove the original "items" field
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

module.exports = {
  updateOrderStatus,
  placeOrder,
  getOrders,
  getOrderDetails,
  getAllOrders,
  getAdminOrderDetails,
};
