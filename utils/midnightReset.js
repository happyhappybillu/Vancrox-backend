/**
 * VANCROX — Midnight Reset
 * Runs at 00:00 every night
 * Archives completed/rejected trades
 * closePrice already saved in DB when trade completed — preserved
 */

const Trade = require("../models/Trade");
const { getPrice } = require("./priceCache");

module.exports = async function midnightReset() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find completed trades that are not archived yet
    const toArchive = await Trade.find({
      status: { $in: ["COMPLETED", "REJECTED_BY_TRADER", "AUTO_REJECTED"] },
      archived: { $ne: true },
      updatedAt: { $lt: today },
    }).lean();

    if (!toArchive.length) return;

    for (const trade of toArchive) {
      const update = { archived: true };
      // If closePrice was never saved (legacy trades) — save current price now
      if (!(trade.closePrice > 0)) {
        try {
          const sym = trade.symbol || "XAUUSD";
          const cp = getPrice(sym);
          if (cp > 0) update.closePrice = cp;
        } catch(e) {}
      }
      await Trade.findByIdAndUpdate(trade._id, { $set: update });
    }

    console.log(`🌙 Midnight reset: archived ${toArchive.length} trades with closePrice preserved`);
  } catch (e) {
    console.error("midnightReset error:", e.message);
  }
};
