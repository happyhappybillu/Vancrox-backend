const mongoose = require("mongoose");

const txSchema = new mongoose.Schema(
  {
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userName: { type: String, default: "" },
    userRole: { type: String, enum: ["investor", "trader"], default: "investor" },
    uid:      { type: Number, default: null },
    tid:      { type: Number, default: null },

    type: {
      type: String,
      enum: ["Deposit", "Withdrawal", "Profit", "Loss Refund", "Commission"],
      required: true,
    },

    amount:        { type: Number, required: true },
    uniqueAmount:  { type: Number, default: null }, // for deposits
    network:       { type: String, default: "" },   // TRC20/ERC20/BEP20
    walletAddress: { type: String, default: "" },   // for withdrawals

    status: {
      type: String,
      enum: ["Pending", "Completed", "Failed"],
      default: "Pending",
    },

    tradeId: { type: mongoose.Schema.Types.ObjectId, ref: "Trade", default: null },
    note:    { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", txSchema);
