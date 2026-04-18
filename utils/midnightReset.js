/**
 * VANCROX — Midnight Reset
 * Runs at 00:00 IST (18:30 UTC)
 * 1. Archive ALL trades (completed/rejected/waiting/ongoing)
 * 2. Refund ONGOING trades
 * 3. Delete trade notifications
 */

const Trade        = require("../models/Trade");
const Notification = require("../models/Notification");
const User         = require("../models/User");
const { getPrice } = require("./priceCache");

module.exports = async function midnightReset() {
  try {
    console.log("🌙 Midnight reset starting...");

    // ══ 1. Refund ONGOING trades first ══
    const ongoingTrades = await Trade.find({
      status:  "ONGOING",
      $or: [{ archived: false }, { archived: null }, { archived: { $exists: false } }]
    }).lean();

    for (const trade of ongoingTrades) {
      try {
        const cp = getPrice(trade.symbol || "XAUUSD");
        await Trade.findByIdAndUpdate(trade._id, {
          $set: {
            archived:   true,
            status:     "COMPLETED",
            outcome:    "loss",
            closePrice: cp > 0 ? cp : 0,
          }
        });
        if (trade.investorId && trade.amount > 0) {
          await User.findByIdAndUpdate(trade.investorId, { $inc: { balance: trade.amount } });
        }
      } catch(e) { console.error("Ongoing refund err:", e.message); }
    }

    // ══ 2. Archive ALL remaining non-archived trades ══
    const archiveRes = await Trade.updateMany(
      {
        $or: [{ archived: false }, { archived: null }, { archived: { $exists: false } }]
      },
      {
        $set: { archived: true }
      }
    );

    console.log(`🌙 Reset: ${ongoingTrades.length} refunded, ${archiveRes.modifiedCount} archived`);

    // ══ 3. Delete trade notifications ══
    // Delete ALL user notifications — keep only admin broadcasts (userId=null)
    const notifRes = await Notification.deleteMany({
      userId: { $ne: null }
    });
    console.log(`🔔 Notifications reset: ${notifRes.deletedCount} user notifications deleted`);

    console.log("🌙 Midnight reset complete ✅");

  } catch (e) {
    console.error("midnightReset error:", e.message);
  }
};
