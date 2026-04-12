/**
 * VANCROX — Midnight Reset
 * Runs at 00:00 every night:
 * 1. Archive ALL completed/rejected trades → My Traders section clean
 * 2. Delete today's trade notifications (trade_live, trade_complete)
 */

const Trade        = require("../models/Trade");
const Notification = require("../models/Notification");
const { getPrice } = require("./priceCache");

module.exports = async function midnightReset() {
  try {
    const now = new Date();

    // ══ 1. Archive ALL completed/rejected trades (not just before today) ══
    const toArchive = await Trade.find({
      status:   { $in: ["COMPLETED", "REJECTED_BY_TRADER", "AUTO_REJECTED"] },
      archived: { $ne: true },
    }).lean();

    for (const trade of toArchive) {
      const update = { archived: true };
      // Save closePrice for legacy trades that don't have it
      if (!(trade.closePrice > 0)) {
        try {
          const cp = getPrice(trade.symbol || "XAUUSD");
          if (cp > 0) update.closePrice = cp;
        } catch(e) {}
      }
      await Trade.findByIdAndUpdate(trade._id, { $set: update });
    }
    console.log(`🌙 My Traders reset: archived ${toArchive.length} trades`);

    // ══ 2. Delete trade notifications (trade_live, trade_complete) ══
    const notifRes = await Notification.deleteMany({
      type: { $in: ["trade_live", "trade_complete"] }
    });
    console.log(`🔔 Notifications reset: deleted ${notifRes.deletedCount} trade notifications`);

  } catch (e) {
    console.error("midnightReset error:", e.message);
  }
};
