const Approval    = require("../models/Approval");
const Transaction = require("../models/Transaction");
const User        = require("../models/User");
const { verifyDeposit } = require("./blockchainVerify");

const inProgress = new Set();

module.exports = async function depositCron() {
  try {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

    const pending = await Approval.find({
      type:      "DEPOSIT",
      status:    "pending",
      createdAt: { $gte: thirtyMinAgo },
    }).lean();

    if (!pending.length) return;
    console.log(`\n🔍 Checking ${pending.length} pending deposit(s)...`);

    for (const dep of pending) {
      if (inProgress.has(dep._id.toString())) continue;
      inProgress.add(dep._id.toString());
      try {
        console.log(`  Deposit: user=${dep.userName} network=${dep.depositNetwork} uniqueAmt=${dep.uniqueAmount}`);
        const result = await verifyDeposit({
          network:      dep.depositNetwork,
          uniqueAmount: dep.uniqueAmount,
        });

        if (result?.found) {
          console.log(`✅ Verified! Amount=$${result.amount} TxHash=${result.txHash}`);
          await Approval.findByIdAndUpdate(dep._id, { status: "approved" });
          await User.findByIdAndUpdate(dep.userId, { $inc: { balance: dep.amount } });
          if (dep.transactionId) {
            await Transaction.findByIdAndUpdate(dep.transactionId, {
              status: "Completed",
              note:   `Auto-verified. TxHash: ${result.txHash}`,
            });
          }
          /* Refer bonus on first deposit */
          const investor = await User.findById(dep.userId);
          if (investor?.referredBy) {
            const prev = await Transaction.countDocuments({ userId: dep.userId, type: "Deposit", status: "Completed" });
            if (prev === 1) {
              const bonus = parseFloat((dep.amount * 0.10).toFixed(2));
              await User.findByIdAndUpdate(investor.referredBy, { $inc: { referBalance: bonus, referEarned: bonus } });
              console.log(`🎁 Refer bonus $${bonus} credited`);
            }
          }
          console.log(`💰 $${dep.amount} credited to ${dep.userName}`);
        }
      } catch (err) {
        console.error(`Deposit check error for ${dep._id}:`, err.message);
      } finally {
        inProgress.delete(dep._id.toString());
      }
    }

    /* Expire old deposits */
    const expired = await Approval.find({ type: "DEPOSIT", status: "pending", createdAt: { $lt: thirtyMinAgo } });
    for (const dep of expired) {
      await Approval.findByIdAndUpdate(dep._id, { status: "expired" });
      if (dep.transactionId) await Transaction.findByIdAndUpdate(dep.transactionId, { status: "Expired" });
      console.log(`⏰ Expired: ${dep.userName}`);
    }
  } catch (err) {
    console.error("depositCron error:", err.message);
  }
};
