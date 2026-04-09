const mongoose = require("mongoose");

const adSchema = new mongoose.Schema(
  {
    traderId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    traderName:  { type: String, default: "" },
    traderTid:   { type: Number, default: null },
    returnPct:   { type: Number, required: true, min: 1, max: 100 },
    tradeAmount: { type: Number, required: true },
    symbol:      { type: String, enum: ["XAUUSD", "BTCUSDT"], default: "XAUUSD" },
    active:      { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Ad", adSchema);
