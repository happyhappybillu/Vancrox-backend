/**
 * VANCROX — Deposit Auto-Verify Cron
 * Runs every 60 seconds.
 * Scans blockchain for each pending deposit → auto-credits if found.
 */

const Approval    = require("../models/Approval");
const Transaction = require("../models/Transaction");
const User        = require("../models/User");
const { verifyDeposit } = require("./blockchainVerify");

/* Tracks which approvals are currently being checked (prevent double-run) */
const inProgress = new Set();

module.exports = async function depositCron() {
  try {
    /* Get all pending deposits that haven't expired (within 30 mins) */
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

    const pendingDeposits = await Approval.find({
      type:      "DEPOSIT",
      status:    "pending",
      createdAt: { $gte: thirtyMinAgo },
    }).lean();

    if (!pendingDeposits.length) return;

    console.log(`🔍 Checking ${pendingDeposits.length} pending deposit(s)...`);

    for (const dep of pendingDeposits) {
      /* Skip if already being processed */
      if (inProgress.has(dep._id.toString())) continue;
      inProgress.add(dep._id.toString());

      try {
        const result = await verifyDeposit({
          network:      dep.depositNetwork,
          uniqueAmount: dep.uniqueAmount,
        });

        if (result?.found) {
          console.log(`✅ Deposit verified! TxHash: ${result.txHash} | Amount: $${result.amount} | ${result.network}`);

          /* 1. Mark approval as approved */
          await Approval.findByIdAndUpdate(dep._id, {
            status: "approved",
          });

          /* 2. Credit investor balance */
          await User.findByIdAndUpdate(dep.userId, {
            $inc: { balance: dep.amount },
          });

          /* 3. Mark transaction as completed + save txHash */
          await Transaction.findByIdAndUpdate(dep.transactionId, {
            status: "Completed",
            note:   `TxHash: ${result.txHash}`,
          });

          console.log(`💰 $${dep.amount} credited to user ${dep.userName} (UID${dep.uid})`);
        }

      } catch (err) {
        console.error(`Deposit check error for ${dep._id}:`, err.message);
      } finally {
        inProgress.delete(dep._id.toString());
      }
    }

    /* ── Also expire deposits older than 30 mins ── */
    const expired = await Approval.find({
      type:      "DEPOSIT",
      status:    "pending",
      createdAt: { $lt: thirtyMinAgo },
    });

    for (const dep of expired) {
      await Approval.findByIdAndUpdate(dep._id, { status: "rejected" });
      if (dep.transactionId) {
        await Transaction.findByIdAndUpdate(dep.transactionId, { status: "Failed" });
      }
      console.log(`⏰ Deposit expired for ${dep.userName}`);
    }

  } catch (err) {
    console.error("depositCron error:", err.message);
  }
};
