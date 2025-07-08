const mongoose = require("mongoose");

const productLogSchema = new mongoose.Schema(
  {
    refId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    refModel: {
      type: String,
      required: true,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      enum: ["create", "update"],
      required: true,
    },
    changes: [
      {
        field: String,
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProductLog", productLogSchema);
