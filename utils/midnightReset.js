/**
 * VANCROX — Midnight Reset
 * Runs at 00:00 every night
 * Archives completed/rejected trades so My Traders & My Inventory sections stay clean
 * History section still shows all trades
 */

const Trade = require("../models/Trade");

module.exports = async function midnightReset() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    /* Archive trades completed/rejected before today */
    const result = await Trade.updateMany(
      {
        status: { $in: ["COMPLETED", "REJECTED_BY_TRADER", "AUTO_REJECTED"] },
        archived: { $ne: true },
        updatedAt: { $lt: today },
      },
      { $set: { archived: true } }
    );

    if (result.modifiedCount > 0) {
      console.log(`🌙 Midnight reset: archived ${result.modifiedCount} completed trades`);
    }
  } catch (e) {
    console.error("midnightReset error:", e.message);
  }
};
