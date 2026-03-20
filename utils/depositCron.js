/**
 * VANCROX — Deposit Auto-Verify Cron
 * Runs every 60 seconds.
 * Scans blockchain for each pending deposit → auto-credits if found.
 * After 30 min window: marks as "expired" but admin can still manually approve.
 */

const Approval    = require("../models/Approval");
const Transaction = require("../models/Transaction");
const User        = require("../models/User");
const { verifyDeposit } = require("./blockchainVerify");

const inProgress = new Set();

module.exports = async function depositCron() {
  try {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

    /* Active pending deposits (within 30 min window) */
    const pendingDeposits = await Approval.find({
      type:      "DEPOSIT",
      status:    "pending",
      createdAt: { $gte: thirtyMinAgo },
    }).lean();

    if (pendingDeposits.length) {
      console.log(`🔍 Checking ${pendingDeposits.length} pending deposit(s)...`);
    }

    for (const dep of pendingDeposits) {
      if (inProgress.has(dep._id.toString())) continue;
      inProgress.add(dep._id.toString());

      try {
        const result = await verifyDeposit({
          network:      dep.depositNetwork,
          uniqueAmount: dep.uniqueAmount,
        });

        if (result?.found) {
          console.log(`✅ Auto-verified! TxHash: ${result.txHash} | $${result.amount} | ${result.network}`);

          await Approval.findByIdAndUpdate(dep._id, { status: "approved" });
          await User.findByIdAndUpdate(dep.userId, { $inc: { balance: dep.amount } });
          if (dep.transactionId) {
            await Transaction.findByIdAndUpdate(dep.transactionId, {
              status: "Completed",
              note:   `Auto-verified. TxHash: ${result.txHash}`,
            });
          }

          /* Refer bonus */
          const investor = await User.findById(dep.userId);
          if (investor?.referredBy) {
            const prevDeposits = await Transaction.countDocuments({
              userId: dep.userId, type: "Deposit", status: "Completed",
            });
            if (prevDeposits === 1) {
              const bonus = parseFloat((dep.amount * 0.10).toFixed(2));
              await User.findByIdAndUpdate(investor.referredBy, {
                $inc: { referBalance: bonus, referEarned: bonus },
              });
              console.log(`🎁 Refer bonus $${bonus} credited`);
            }
          }

          console.log(`💰 $${dep.amount} auto-credited to ${dep.userName}`);
        }
      } catch (err) {
        console.error(`Deposit check error for ${dep._id}:`, err.message);
      } finally {
        inProgress.delete(dep._id.toString());
      }
    }

    /* Mark expired deposits (over 30 min) — keep as "expired" NOT "rejected"
       so admin can still manually approve if needed */
    const expired = await Approval.find({
      type:      "DEPOSIT",
      status:    "pending",
      createdAt: { $lt: thirtyMinAgo },
    });

    for (const dep of expired) {
      await Approval.findByIdAndUpdate(dep._id, { status: "expired" });
      if (dep.transactionId) {
        await Transaction.findByIdAndUpdate(dep.transactionId, { status: "Expired" });
      }
      console.log(`⏰ Deposit window expired for ${dep.userName} — admin can still approve manually`);
    }

  } catch (err) {
    console.error("depositCron error:", err.message);
  }
};
