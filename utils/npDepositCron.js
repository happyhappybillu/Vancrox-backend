/**
 * VANCROX — NowPayments auto-verify cron
 * Runs every 60s — polls all pending NowPayments deposits
 * Accepts: finished, confirmed, partially_paid, sending
 */
const Approval     = require("../models/Approval");
const Transaction  = require("../models/Transaction");
const User         = require("../models/User");
const Notification = require("../models/Notification");

const DONE_STATUS = ["finished", "confirmed", "partially_paid", "sending"];
const FAIL_STATUS = ["failed", "expired"];

async function creditDeposit(dep, ps) {
  const already = await Approval.findById(dep._id);
  if (!already || already.status !== "pending") return; // already processed

  await Approval.findByIdAndUpdate(dep._id, { $set: { status: "approved", npStatus: ps } });
  await User.findByIdAndUpdate(dep.userId, { $inc: { balance: dep.amount } });

  if (dep.transactionId) {
    await Transaction.findByIdAndUpdate(dep.transactionId, {
      status: "Completed",
      note: `NowPayments ${ps}. PayID: ${dep.npPaymentId}`
    });
  }

  // Referral bonus on first deposit
  const investor = await User.findById(dep.userId);
  if (investor?.referredBy) {
    const prev = await Transaction.countDocuments({
      userId: dep.userId, type: "Deposit", status: "Completed"
    });
    if (prev === 1) {
      const bonus = parseFloat((dep.amount * 0.10).toFixed(2));
      await User.findByIdAndUpdate(investor.referredBy, {
        $inc: { referBalance: bonus, referEarned: bonus }
      });
    }
  }

  await Notification.create({
    userId: dep.userId, type: "general",
    title: "💰 Deposit Successful",
    message: `$${dep.amount.toFixed(2)} has been credited to your VANCROX balance.`
  });
  console.log(`✅ NP cron credited $${dep.amount} to UID${dep.uid} (${ps})`);
}

module.exports = async function npDepositCron() {
  try {
    const { getPaymentStatus } = require("./nowpayments");
    const cutoff = new Date(Date.now() - 40 * 60 * 1000); // last 40 min

    const pending = await Approval.find({
      type:        "DEPOSIT",
      status:      "pending",
      npPaymentId: { $exists: true, $ne: "" },
      createdAt:   { $gte: cutoff }
    }).lean();

    if (!pending.length) return;
    console.log(`\n🔍 NP cron: checking ${pending.length} deposit(s)...`);

    for (const dep of pending) {
      try {
        const statusData = await getPaymentStatus(dep.npPaymentId);
        const ps = (statusData.payment_status || "").toLowerCase();
        const paidAmt  = parseFloat(statusData.actually_paid || 0);
        const expectedAmt = parseFloat(statusData.pay_amount || dep.amount);
        console.log(`  PayID=${dep.npPaymentId} status=${ps} paid=${paidAmt} expected=${expectedAmt}`);

        if (DONE_STATUS.includes(ps)) {
          // Accept if paid >= 99% of expected (trailing zero / rounding tolerance)
          const ratio = expectedAmt > 0 ? paidAmt / expectedAmt : 1;
          if (paidAmt === 0 || ratio >= 0.99) {
            await creditDeposit(dep, ps);
          } else {
            console.log(`  ⚠️ Partial: paid ${paidAmt} of ${expectedAmt} (${(ratio*100).toFixed(1)}%) — skipping`);
          }
        } else if (FAIL_STATUS.includes(ps)) {
          await Approval.findByIdAndUpdate(dep._id, { $set: { status: "cancelled", npStatus: ps } });
          if (dep.transactionId) {
            await Transaction.findByIdAndUpdate(dep.transactionId, { status: "Cancelled" });
          }
          console.log(`  ❌ NP cron: ${ps} for UID${dep.uid}`);
        }
      } catch(e) {
        console.error(`NP cron err for ${dep.npPaymentId}:`, e.message);
      }
    }
  } catch(e) {
    console.error("npDepositCron error:", e.message);
  }
};
