const mongoose = require("mongoose");

const tradeSchema = new mongoose.Schema(
  {
    /* INVESTOR */
    investorId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    investorName: { type: String, default: "" },
    investorUid:  { type: Number, default: null },

    /* TRADER */
    traderId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    traderName:  { type: String, default: "" },
    traderTid:   { type: Number, default: null },

    /* AD */
    adId:      { type: mongoose.Schema.Types.ObjectId, ref: "Ad", default: null },
    returnPct: { type: Number, required: true },
    amount:    { type: Number, required: true },

    /* MARKET */
    symbol:     { type: String, enum: ["XAUUSD", "BTCUSDT", "EURUSD", "GBPUSD"], default: "XAUUSD" },
    entryPrice: { type: Number, default: 0 },

    /* STATUS */
    status: {
      type: String,
      enum: [
        "WAITING_TRADER_CONFIRMATION",
        "ONGOING",
        "COMPLETED",
        "REJECTED_BY_TRADER",
        "AUTO_REJECTED",
      ],
      default: "WAITING_TRADER_CONFIRMATION",
      index: true,
    },

    hireTime: { type: Date, default: Date.now },

    /* OUTCOME */
    outcome:      { type: String, enum: ["profit", "loss", null], default: null },
    profitAmount: { type: Number, default: 0 },
    traderFee:    { type: Number, default: 0 },
    archived:     { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Trade", tradeSchema);
