const Trade = require("../models/Trade");
const User  = require("../models/User");
const Ad    = require("../models/Ad");

/* Runs every 30s — auto-rejects trades where 5-min window expired */
module.exports = async function autoReject() {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    const expired = await Trade.find({
      status: "WAITING_TRADER_CONFIRMATION",
      hireTime: { $lte: fiveMinAgo },
    });

    for (const trade of expired) {
      /* Refund investor */
      await User.findByIdAndUpdate(trade.investorId, {
        $inc: { balance: trade.amount },
      });

      /* Re-activate the trader's ad */
      if (trade.adId) {
        await Ad.findByIdAndUpdate(trade.adId, { active: true });
      }

      /* Mark trade as auto-rejected */
      trade.status = "AUTO_REJECTED";
      await trade.save();
    }

    if (expired.length) {
      console.log(`⏰ Auto-rejected ${expired.length} trade(s)`);
    }
  } catch (err) {
    console.error("AutoReject Error:", err.message);
  }
};
