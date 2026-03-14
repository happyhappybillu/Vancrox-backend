const mongoose = require("mongoose");

/*
  STATUS FLOW:
  WAITING_TRADER_CONFIRMATION → (5 min timer)
    → ONGOING (accepted)
    → REJECTED_BY_TRADER (rejected)
    → AUTO_REJECTED (timer expired)
  ONGOING →
    → COMPLETED (outcome set)
*/

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
    amount:    { type: Number, required: true }, // = trader securityMoney

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

    hireTime:   { type: Date, default: Date.now }, // for 5-min countdown

    /* OUTCOME */
    outcome:      { type: String, enum: ["profit", "loss", null], default: null },
    profitAmount: { type: Number, default: 0 }, // investor profit
    traderFee:    { type: Number, default: 0 }, // 10% of profit = trader earning
  },
  { timestamps: true }
);

module.exports = mongoose.model("Trade", tradeSchema);
