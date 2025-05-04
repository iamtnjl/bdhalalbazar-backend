const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema(
  {
    order_id: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    payment_method: { type: String, required: true },
    delivery_date: { type: Date },

    // Address Structure
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      zip: { type: String, required: false },
    },

    delivery_charge: { type: Number, required: true },
    platform_fee: { type: Number, required: true },

    // Order Items
    items: [
      {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        discount_price: { type: Number, required: true },
        total_price: { type: Number, required: true },
        purchase_price: { type: Number, required: false },
        weight: { type: Number, default: 0 },
        unit: {
          type: String,
          enum: ["piece", "litre", "kg", "gram"],
          default: "kg",
        },
      },
    ],
    total_purchase_price: { type: Number, required: true, default: 0 },

    sub_total: { type: Number, required: true },
    discount: { type: Number, required: true },
    grand_total: { type: Number, required: true },
    review: { type: String, default: "" },
    rating: { type: Number, min: 1, max: 5, default: null },
    edit_reason: { type: String, default: "" },
    failed_reason: { type: String, default: "" },
    return_reason: { type: String, default: "" },

    // Order Status History
    status: [
      {
        name: { type: String, required: true },
        slug: {
          type: String,
          required: true,
          enum: [
            "pending",
            "accepted",
            "ready-to-deliver",
            "on-the-way",
            "delivered",
            "rejected",
            "canceled",
            "return",
            "failed-to-deliver",
            "completed",
          ],
        },
        stage: {
          type: String,
          enum: ["current", "pending", "completed"],
          required: true,
        },
        updatedAt: { type: Date, default: Date.now }, // Track when status was updated
      },
    ],
  },
  { timestamps: true }
);

// Function to update order status dynamically
OrderSchema.methods.updateStatus = function (newStatus) {
  const statusStages = [
    "pending",
    "accepted",
    "ready-to-deliver",
    "on-the-way",
    "delivered",
  ];

  const failedStatuses = [
    "rejected",
    "canceled",
    "return",
    "failed-to-deliver",
  ];

  let updatedStatusArray = [];

  if (failedStatuses.includes(newStatus)) {
    updatedStatusArray = [
      {
        name: "Canceled",
        slug: "canceled",
        stage: ["completed"],
        updatedAt: new Date(),
      },
    ];
  } else {
    updatedStatusArray = statusStages.map((status, index) => {
      return {
        name: status.replace(/-/g, " "),
        slug: status,
        stage:
          status === newStatus
            ? ["current"]
            : statusStages.indexOf(newStatus) > index
            ? ["completed"]
            : ["pending"],
        updatedAt: new Date(),
      };
    });
  }

  this.status = updatedStatusArray;
};

module.exports = mongoose.model("Order", OrderSchema);
