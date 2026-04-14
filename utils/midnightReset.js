/**
 * VANCROX — Midnight Reset
 * Runs at 00:00 every night:
 * 1. Archive ALL completed/rejected trades
 * 2. Refund and archive ONGOING trades (so My Traders is clean next day)
 * 3. Delete trade notifications (trade_live, trade_complete)
 */

const Trade        = require("../models/Trade");
const Notification = require("../models/Notification");
const User         = require("../models/User");
const { getPrice } = require("./priceCache");

module.exports = async function midnightReset() {
  try {
    // ══ 1. Archive completed/rejected trades ══
    const doneStatuses = ["COMPLETED", "REJECTED_BY_TRADER", "AUTO_REJECTED", "WAITING_TRADER_CONFIRMATION"];
    const toArchive = await Trade.find({
      status:   { $in: doneStatuses },
      archived: { $ne: true },
    }).lean();

    for (const trade of toArchive) {
      const update = { archived: true };
      if (!(trade.closePrice > 0)) {
        try {
          const cp = getPrice(trade.symbol || "XAUUSD");
          if (cp > 0) update.closePrice = cp;
        } catch(e) {}
      }
      await Trade.findByIdAndUpdate(trade._id, { $set: update });
    }

    // ══ 2. ONGOING trades — refund investor + archive ══
    const ongoingTrades = await Trade.find({
      status:   "ONGOING",
      archived: { $ne: true },
    }).lean();

    for (const trade of ongoingTrades) {
      try {
        const cp = getPrice(trade.symbol || "XAUUSD");
        const update = {
          archived:   true,
          status:     "COMPLETED",
          outcome:    "loss",
          closePrice: cp > 0 ? cp : 0,
        };
        await Trade.findByIdAndUpdate(trade._id, { $set: update });
        // Refund investor
        if (trade.investorId && trade.amount > 0) {
          await User.findByIdAndUpdate(trade.investorId, { $inc: { balance: trade.amount } });
        }
      } catch(e) {
        console.error("Ongoing trade reset err:", e.message);
      }
    }

    console.log(`🌙 My Traders reset: ${toArchive.length} archived, ${ongoingTrades.length} ongoing refunded`);

    // ══ 3. Delete all trade notifications ══
    const notifRes = await Notification.deleteMany({
      type: { $in: ["trade_live", "trade_complete"] }
    });
    console.log(`🔔 Notifications reset: deleted ${notifRes.deletedCount} trade notifications`);

  } catch (e) {
    console.error("midnightReset error:", e.message);
  }
};
