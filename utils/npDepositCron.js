/**
 * VANCROX — NowPayments pending deposit cron
 * Runs every 3 minutes — polls unpaid NowPayments deposits
 */
const Approval     = require("../models/Approval");
const Transaction  = require("../models/Transaction");
const User         = require("../models/User");
const Notification = require("../models/Notification");

module.exports = async function npDepositCron() {
  try {
    const { getPaymentStatus } = require("./nowpayments");

    // Find NowPayments pending deposits from last 35 minutes
    const cutoff = new Date(Date.now() - 35 * 60 * 1000);
    const pending = await Approval.find({
      type:   "DEPOSIT",
      status: "pending",
      npPaymentId: { $exists: true, $ne: "" },
      createdAt: { $gte: cutoff }
    }).lean();

    if (!pending.length) return;
    console.log(`🔍 NP cron: checking ${pending.length} NowPayments pending deposit(s)`);

    for (const dep of pending) {
      try {
        const status = await getPaymentStatus(dep.npPaymentId);
        const ps = (status.payment_status || "").toLowerCase();
        console.log(`  PayID=${dep.npPaymentId} status=${ps} uid=${dep.uid}`);

        if (ps === "finished" || ps === "confirmed") {
          // Credit balance
          await Approval.findByIdAndUpdate(dep._id, { $set: { status: "approved", npStatus: ps } });
          await User.findByIdAndUpdate(dep.userId, { $inc: { balance: dep.amount } });
          if (dep.transactionId) {
            await Transaction.findByIdAndUpdate(dep.transactionId, {
              status: "Completed",
              note: `NowPayments ${ps}. ID: ${dep.npPaymentId}`
            });
          }
          // Referral bonus
          const investor = await User.findById(dep.userId);
          if (investor?.referredBy) {
            const prev = await Transaction.countDocuments({ userId: dep.userId, type: "Deposit", status: "Completed" });
            if (prev === 1) {
              const bonus = parseFloat((dep.amount * 0.10).toFixed(2));
              await User.findByIdAndUpdate(investor.referredBy, { $inc: { referBalance: bonus, referEarned: bonus } });
            }
          }
          await Notification.create({
            userId: dep.userId, type: "general",
            title: "💰 Deposit Successful",
            message: `$${dep.amount.toFixed(2)} USDT has been credited to your VANCROX balance.`
          });
          console.log(`✅ NP cron credited $${dep.amount} to UID${dep.uid}`);
        } else if (ps === "failed" || ps === "expired") {
          await Approval.findByIdAndUpdate(dep._id, { $set: { status: "cancelled", npStatus: ps } });
          if (dep.transactionId) await Transaction.findByIdAndUpdate(dep.transactionId, { status: "Cancelled" });
          console.log(`❌ NP cron: ${ps} for UID${dep.uid}`);
        }
      } catch(e) {
        console.error(`NP cron error for ${dep.npPaymentId}:`, e.message);
      }
    }
  } catch(e) {
    console.error("npDepositCron error:", e.message);
  }
};
