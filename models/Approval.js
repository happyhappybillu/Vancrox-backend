const mongoose = require("mongoose");

/*
  TYPES:
  - WITHDRAWAL          → investor/trader wants to withdraw earnings
  - TRADER_VERIFICATION → trader submitted docs + security deposit
  - DEPOSIT             → semi-auto deposit confirmation (admin sees & confirms)
*/

const approvalSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["WITHDRAWAL", "TRADER_VERIFICATION", "DEPOSIT"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    /* User info */
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userName: { type: String, default: "" },
    userRole: { type: String, enum: ["investor", "trader"], default: "investor" },
    uid:      { type: Number, default: null },
    tid:      { type: Number, default: null },

    /* WITHDRAWAL fields */
    amount:        { type: Number, default: 0 },
    walletAddress: { type: String, default: "" },
    network:       { type: String, default: "" },

    /* TRADER_VERIFICATION fields */
    securityDeposit: { type: Number, default: 0 },
    historyFile:     { type: String, default: "" },

    /* DEPOSIT fields */
    uniqueAmount:    { type: Number, default: null },
    depositNetwork:  { type: String, default: "" },
    depositPaid:     { type: Boolean, default: false }, // admin confirms deposit received

    /* Linked transaction */
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Approval", approvalSchema);
