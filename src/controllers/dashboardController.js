const Order = require("../models/orderModel");
const Product = require("../models/productModel");
const User = require("../models/userModel");

const getDashboardStats = async (req, res) => {
  try {
    // Default to today's range if not provided
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(new Date().setHours(0, 0, 0, 0));
    const endDate = req.query.endDate
      ? new Date(req.query.endDate)
      : new Date(new Date().setHours(23, 59, 59, 999));

    // Order stats
    const orders = await Order.find({
      createdAt: { $gte: startDate, $lte: endDate },
    });

    const pendingOrders = await Order.find({
      status: {
        $elemMatch: { slug: "pending", stage: "current" },
      },
      updatedAt: { $gte: startDate, $lte: endDate },
    });

    const totalPendingOrders = pendingOrders.length;

    const totalOrders = orders.length;
    const totalOrderAmount = orders.reduce(
      (sum, order) => sum + (order.grand_total || 0),
      0
    );
    const totalPurchaseAmount = orders.reduce(
      (sum, order) => sum + (order.total_purchase_price || 0),
      0
    );

    const completedStatuses = ["delivered", "completed"];

    const completedOrders = await Order.find({
      status: {
        $elemMatch: {
          slug: { $in: completedStatuses },
          stage: "current",
        },
      },
      updatedAt: { $gte: startDate, $lte: endDate },
    });
    const totalCompletedAmount = completedOrders.reduce(
      (sum, order) => sum + (order.grand_total || 0),
      0
    );

    const grossProfit = totalCompletedAmount - totalPurchaseAmount;

    const totalCompletedOrders = completedOrders.length;

    const canceledStatuses = [
      "rejected",
      "canceled",
      "return",
      "failed-to-deliver",
    ];
    const canceledOrders = await Order.find({
      status: {
        $elemMatch: {
          slug: { $in: canceledStatuses },
          stage: "current",
        },
      },
      updatedAt: { $gte: startDate, $lte: endDate },
    });
    const totalCanceledOrders = canceledOrders.length;

    // Product stats
    const totalProducts = await Product.countDocuments();
    const productsUpdatedInRange = await Product.countDocuments({
      updatedAt: { $gte: startDate, $lte: endDate },
    });

    // User stats
    const activeUsersInRange = await User.countDocuments({
      status: "active",
      createdAt: { $gte: startDate, $lte: endDate },
    });

    // Final structured response
    const stats = {
      orders: {
        total: totalOrders,
        totalAmount: totalOrderAmount,
        totalPurchaseAmount,
        grossProfit,
        completedAmount: totalCompletedAmount,
        canceledCount: totalCanceledOrders,
        totalCompletedOrders,
        totalPendingOrders,
      },
      products: {
        total: totalProducts,
        updatedInRange: productsUpdatedInRange,
      },
      users: {
        activeCreatedInRange: activeUsersInRange,
      },
      meta: {
        startDate,
        endDate,
      },
    };

    res.json(stats);
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { getDashboardStats };
