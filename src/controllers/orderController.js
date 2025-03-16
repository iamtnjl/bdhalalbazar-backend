const Order = require("../models/orderModel.js");
const Cart = require("../models/cartModel.js");
const User = require("../models/userModel.js");
const Product = require("../models/productModel.js");
const mongoose = require("mongoose");

// Generate a unique Order ID
const generateOrderId = () => {
  return `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
};

// Place Order
const placeOrder = async (req, res) => {
  try {
    const { name, phone, address, cart_id, payment_method } = req.body;

    // Validate ObjectId format
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

    cart.grand_total = cart.sub_total - cart.discount;

    if (!cart) return res.status(404).json({ message: "Cart not found" });

    // Extract cart details for the order
    const orderItems = cart.cart_products.map((item) => ({
      _id: item.product._id,
      quantity: item.quantity,
      price: item.product.price,
      discount_price:
        item.product.price - (item.product.price * item.product.discount) / 100,
      total_price:
        (item.product.price -
          (item.product.price * item.product.discount) / 100) *
        item.quantity,
    }));

    // Deduct stock from product model
    for (const item of cart.cart_products) {
      await Product.findByIdAndUpdate(item.product._id, {
        $inc: { stock: -item.quantity },
      });
    }

    // Create Order
    const newOrder = new Order({
      order_id: generateOrderId(),
      name,
      phone,
      payment_method,
      address,
      delivery_charge: cart.delivery_charge,
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
      ],
    });

    await newOrder.save();

    await Cart.findByIdAndDelete(cart_id);

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

    // Extract filters from query params
    const { status, order_id } = req.query;

    // Base query to fetch orders by phone number
    let query = { phone: userPhone };

    // If order_id is provided, filter by order_id
    if (order_id) {
      query.order_id = order_id;
    }

    // If status filter is provided, filter by status.slug inside the status array
    if (status) {
      query["status.slug"] = status;
    }

    // Fetch orders with filtering and sorting by createdAt (newest first)
    const orders = await Order.find(query)
      .select("_id order_id createdAt status grand_total")
      .sort({ createdAt: -1 }) // Sorting in descending order (newest first)
      .exec();

    if (orders.length === 0) {
      return res
        .status(404)
        .json({ message: "No orders found for the given criteria" });
    }

    // Simplify the status field to include only the current stage
    const simplifiedOrders = orders.map((order) => {
      const currentStatus = order.status.find((status) =>
        status.stage.includes("current")
      );
      return {
        _id: order._id,
        order_id: order.order_id,
        createdAt: order.createdAt,
        status: currentStatus ? currentStatus.slug : "unknown",
        grand_total: order.grand_total,
      };
    });

    return res.status(200).json(simplifiedOrders);
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "An error occurred while fetching orders", error });
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
      .lean(); // Converts Mongoose document to plain JSON

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Transform the response to rename "items" to "products"
    order.products = order.items.map((item) => ({
      product: item._id, // Full product details including brand, colors, etc.
      quantity: item.quantity,
      price: item.price,
      discount_price: item.discount_price,
      total_price: item.total_price,
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

    const order = await Order.findOne({ order_id: orderId });
    if (!order) return res.status(404).json({ message: "Order not found" });

    let foundIndex = -1;

    // Loop through the status timeline
    order.status.forEach((status, index) => {
      if (status.slug === newStatus) foundIndex = index;
    });

    if (foundIndex === -1) {
      return res.status(400).json({ message: "Invalid order status" });
    }

    // Update status stages
    order.status.forEach((status, index) => {
      if (index < foundIndex) {
        status.stage = "completed";
      } else if (index === foundIndex) {
        status.stage = "current";
      } else {
        status.stage = "pending";
      }
    });

    // If the order is delivered, mark all statuses as completed
    if (newStatus === "delivered") {
      order.status.forEach((status) => {
        status.stage = "completed";
      });
    }

    await order.save();

    res.json({ message: "Order status updated successfully", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { updateOrderStatus, placeOrder, getOrders, getOrderDetails };
