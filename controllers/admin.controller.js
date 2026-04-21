const User          = require("../models/User");
const Ad            = require("../models/Ad");
const Trade         = require("../models/Trade");
const Transaction   = require("../models/Transaction");
const Approval      = require("../models/Approval");
const PlatformConfig= require("../models/PlatformConfig");

/* ── GET ALL INVESTORS ── */
exports.getInvestors = async (req, res) => {
  try {
    const investors = await User.find({ role: "investor" })
      .sort({ createdAt: -1 }).lean();
    res.json({ success: true, investors, total: investors.length });
  } catch (e) {
    console.error("getInvestors:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── GET ALL TRADERS ── */
exports.getTraders = async (req, res) => {
  try {
    const traders = await User.find({ role: "trader" })
      .sort({ createdAt: -1 }).lean();
    res.json({ success: true, traders, total: traders.length });
  } catch (e) {
    console.error("getTraders:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── BLOCK / UNBLOCK USER ── */
exports.blockUser = async (req, res) => {
  try {
    const { action } = req.body; // "block" | "unblock"
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isBlocked     = action === "block";
    user.blockedReason = action === "block" ? (req.body.reason || "Blocked by admin") : "";
    await user.save();

    res.json({ success: true, message: action === "block" ? "User blocked" : "User unblocked" });
  } catch (e) {
    console.error("blockUser:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── GET ALL APPROVALS ── */
exports.getApprovals = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    } else {
      /* By default show pending + expired (expired still need admin action) */
      filter.status = { $in: ["pending", "expired"] };
    }
    const approvals = await Approval.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, approvals, total: approvals.length });
  } catch (e) {
    console.error("getApprovals:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── APPROVE ── */
exports.approveItem = async (req, res) => {
  try {
    const approval = await Approval.findById(req.params.id);
    if (!approval)                     return res.status(404).json({ message: "Approval not found" });
    if (!["pending","expired"].includes(approval.status)) return res.status(400).json({ message: "Already processed" });

    approval.status = "approved";
    await approval.save();

    /* ── WITHDRAWAL approved → mark tx completed ── */
    if (approval.type === "WITHDRAWAL") {
      if (approval.transactionId)
        await Transaction.findByIdAndUpdate(approval.transactionId, { status: "Completed" });
      // Notify investor
      try {
        const Notif = require("../models/Notification");
        const amt = approval.amount || 0;
        await Notif.create({
          userId: approval.userId, type: "general",
          title: "Withdrawal Completed",
          message: `Your withdrawal request of $${parseFloat(amt).toFixed(2)} USDT has been successfully processed. Funds have been transferred to your wallet address.`
        });
      } catch(ne){}
    }

    /* ── DEPOSIT approved → credit investor balance ── */
    if (approval.type === "DEPOSIT") {
      /* Check if already auto-verified by blockchain cron */
      const tx = approval.transactionId
        ? await Transaction.findById(approval.transactionId)
        : null;
      const alreadyCompleted = tx && tx.status === "Completed";

      if (alreadyCompleted) {
        /* Already credited by blockchain cron — just mark approved, NO double credit */
        console.log(`⚠️ Deposit already auto-verified for ${approval.userName} — skipping double credit`);
      } else {
        /* Not yet credited — credit now */
        await User.findByIdAndUpdate(approval.userId, { $inc: { balance: approval.amount } });
        if (approval.transactionId)
          await Transaction.findByIdAndUpdate(approval.transactionId, { status: "Completed" });

        /* Refer bonus on first deposit */
        const investor = await User.findById(approval.userId);
        if (investor?.referredBy) {
          const prevDeposits = await Transaction.countDocuments({
            userId: approval.userId, type: "Deposit", status: "Completed",
          });
          if (prevDeposits === 1) {
            const referBonus = parseFloat((approval.amount * 0.10).toFixed(2));
            await User.findByIdAndUpdate(investor.referredBy, {
              $inc: { referBalance: referBonus, referEarned: referBonus },
            });
            await Transaction.create({
              userId:   investor.referredBy,
              userName: "Referral Bonus",
              userRole: "investor",
              type:     "Referral Bonus",
              amount:   referBonus,
              status:   "Completed",
              note:     `10% refer bonus from ${investor.name} (${investor.referCode}) first deposit`,
            });
          }
        }
      }
    }

    /* ── TRADER_VERIFICATION approved → unlock + credit security money ── */
    if (approval.type === "TRADER_VERIFICATION") {
      await User.findByIdAndUpdate(approval.userId, {
        traderVerificationStatus: "APPROVED",
        securityMoney:            approval.securityDeposit || 0,
      });

      /* Record security deposit as transaction */
      await Transaction.create({
        userId:   approval.userId,
        userName: approval.userName,
        userRole: "trader",
        tid:      approval.tid,
        type:     "Deposit",
        amount:   approval.securityDeposit || 0,
        network:  approval.depositNetwork || "",
        status:   "Completed",
        note:     "Security deposit — verified by admin",
      });
    }

    res.json({ success: true, message: "Approved successfully" });
  } catch (e) {
    console.error("approveItem:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── REJECT ── */
exports.rejectItem = async (req, res) => {
  try {
    const approval = await Approval.findById(req.params.id);
    if (!approval)                     return res.status(404).json({ message: "Approval not found" });
    if (!["pending","expired"].includes(approval.status)) return res.status(400).json({ message: "Already processed" });

    approval.status = "rejected";
    await approval.save();

    /* ── WITHDRAWAL rejected → refund balance ── */
    if (approval.type === "WITHDRAWAL") {
      await User.findByIdAndUpdate(approval.userId, { $inc: { balance: approval.amount } });
      if (approval.transactionId)
        await Transaction.findByIdAndUpdate(approval.transactionId, { status: "Failed" });
    }

    /* ── DEPOSIT rejected ── */
    if (approval.type === "DEPOSIT") {
      /* Check if already auto-verified and balance was credited */
      const tx = approval.transactionId
        ? await Transaction.findById(approval.transactionId)
        : null;
      const alreadyCredited = tx && tx.status === "Completed";

      if (alreadyCredited) {
        /* Auto-verify ne credit kar diya tha — wapas kato */
        await User.findByIdAndUpdate(approval.userId, { $inc: { balance: -approval.amount } });
        await Transaction.findByIdAndUpdate(approval.transactionId, {
          status: "Failed",
          note:   "Admin rejected — balance reversed",
        });
        console.log(`⚠️ Admin rejected auto-verified deposit — $${approval.amount} reversed for ${approval.userName}`);
      } else {
        /* Not yet credited — just mark failed */
        if (approval.transactionId)
          await Transaction.findByIdAndUpdate(approval.transactionId, { status: "Failed" });
      }
    }

    /* ── TRADER_VERIFICATION rejected → send back to re-submit ── */
    if (approval.type === "TRADER_VERIFICATION") {
      await User.findByIdAndUpdate(approval.userId, {
        traderVerificationStatus: "REJECTED",
        rejectionReason: req.body.reason || "Documents not valid or deposit not received",
      });
    }

    res.json({ success: true, message: "Rejected" });
  } catch (e) {
    console.error("rejectItem:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── VERIFY TRADER (direct from trader table) ── */
exports.verifyTrader = async (req, res) => {
  try {
    const { status } = req.body; // "APPROVED" | "REJECTED"
    if (!["APPROVED", "REJECTED"].includes(status))
      return res.status(400).json({ message: "status must be APPROVED or REJECTED" });

    const trader = await User.findOne({ _id: req.params.id, role: "trader" });
    if (!trader) return res.status(404).json({ message: "Trader not found" });

    trader.traderVerificationStatus = status;
    if (status === "REJECTED") trader.rejectionReason = req.body.reason || "Not approved";
    await trader.save();

    /* Also close the pending approval if any */
    await Approval.updateMany(
      { userId: trader._id, type: "TRADER_VERIFICATION", status: "pending" },
      { status: status === "APPROVED" ? "approved" : "rejected" }
    );

    res.json({ success: true, message: `Trader ${status.toLowerCase()}` });
  } catch (e) {
    console.error("verifyTrader:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── GET WALLET ADDRESSES ── */
exports.getAddresses = async (req, res) => {
  try {
    const cfg = await PlatformConfig.findOne({ key: "walletAddresses" });
    const addresses = cfg?.value || { TRC20: "", ERC20: "", BEP20: "" };
    res.json({ success: true, addresses });
  } catch (e) {
    console.error("getAddresses:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── SAVE WALLET ADDRESSES ── */
exports.saveAddresses = async (req, res) => {
  try {
    const { addresses } = req.body;
    if (!addresses) return res.status(400).json({ message: "addresses required" });

    await PlatformConfig.findOneAndUpdate(
      { key: "walletAddresses" },
      { key: "walletAddresses", value: addresses },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Addresses saved" });
  } catch (e) {
    console.error("saveAddresses:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── REPORTS: DEPOSITS ── */
exports.reportDeposits = async (req, res) => {
  try {
    const Approval = require("../models/Approval");
    const deposits = await Transaction.find({ type: "Deposit" })
      .sort({ createdAt: -1 }).lean();

    // Enrich with Approval data (NowPayments pay_amount, network etc.)
    const enriched = await Promise.all(deposits.map(async (tx) => {
      const appr = await Approval.findOne({ transactionId: tx._id }).lean();
      return {
        ...tx,
        uniqueAmount: tx.uniqueAmount || appr?.uniqueAmount || null,
        depositNetwork: tx.network || appr?.depositNetwork || "—",
        npPaymentId: appr?.npPaymentId || null,
        npStatus: appr?.npStatus || null,
        role: tx.userRole || "investor",
      };
    }));

    res.json({ success: true, deposits: enriched });
  } catch (e) {
    console.error("reportDeposits:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── REPORTS: WITHDRAWALS ── */
exports.reportWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Transaction.find({ type: "Withdrawal" })
      .sort({ createdAt: -1 }).lean();
    res.json({ success: true, withdrawals });
  } catch (e) {
    console.error("reportWithdrawals:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── CLOSE DEPOSIT (mark done without crediting — e.g. wrong amount) ── */
exports.closeDeposit = async (req, res) => {
  try {
    const approval = await Approval.findById(req.params.id);
    if (!approval) return res.status(404).json({ message: "Not found" });
    if (!["pending","expired"].includes(approval.status))
      return res.status(400).json({ message: "Already processed" });

    approval.status = "closed";
    await approval.save();

    if (approval.transactionId) {
      await Transaction.findByIdAndUpdate(approval.transactionId, { status: "Closed" });
    }

    res.json({ success: true, message: "Deposit closed — removed from pending list" });
  } catch (e) {
    console.error("closeDeposit:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── SEARCH USERS (for deletion) ── */
exports.searchUsers = async (req, res) => {
  try {
    const { q, role } = req.query;
    if (!q) return res.json({ success: true, users: [] });
    const regex = new RegExp(q.replace("UID","").replace("TID",""), "i");
    const query = {
      role: role || "investor",
      $or: [
        { name: regex },
        { email: regex },
        { uid: parseInt(q.replace("UID","")) || -1 },
        { tid: parseInt(q.replace("TID","")) || -1 },
      ]
    };
    const users = await User.find(query).select("name email uid tid role").limit(10).lean();
    res.json({ success: true, users });
  } catch(e) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ── DELETE ANY USER (admin) ── */
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "userId required" });

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "admin") return res.status(403).json({ message: "Cannot delete admin" });

    const Trade        = require("../models/Trade");
    const Transaction  = require("../models/Transaction");
    const Notification = require("../models/Notification");
    const PushSubscription = require("../models/PushSubscription");
    const SupportTicket = require("../models/SupportTicket");
    const Ad           = require("../models/Ad");

    if (user.role === "investor") {
      await Trade.deleteMany({ investorId: userId });
      await Transaction.deleteMany({ userId });
    } else if (user.role === "trader") {
      await Trade.deleteMany({ traderId: userId });
      await Ad.deleteMany({ traderId: userId });
    }

    await Notification.deleteMany({ userId });
    await PushSubscription.deleteMany({ userId });
    await SupportTicket.deleteMany({ userId: userId });
    await User.findByIdAndDelete(userId);

    console.log(`🗑️ Admin deleted user: ${user.email} (${user.role})`);
    res.json({ success: true, message: "User permanently deleted" });
  } catch(e) {
    console.error("adminDeleteUser:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── ADJUST USER BALANCE ── */
exports.adjustBalance = async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;
    if (!userId || amount === undefined) return res.status(400).json({ message: "userId and amount required" });
    const User = require("../models/User");
    const Transaction = require("../models/Transaction");
    const Notification = require("../models/Notification");

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const adj = parseFloat(amount);
    const newBalance = Math.max(0, (user.balance || 0) + adj);
    await User.findByIdAndUpdate(userId, { $set: { balance: newBalance } });

    // Log transaction
    await Transaction.create({
      userId: user._id, userName: user.name, userRole: user.role,
      uid: user.uid, type: adj > 0 ? "Deposit" : "Withdrawal",
      amount: Math.abs(adj), status: "Completed",
      note: "Admin: " + (reason || (adj > 0 ? "Credit" : "Deduction")),
    });

    // Notify user
    await Notification.create({
      userId: user._id, type: "general",
      title: adj > 0 ? "💰 Balance Credited" : "⚠️ Balance Adjusted",
      message: adj > 0
        ? `$${Math.abs(adj).toFixed(2)} has been credited to your account by admin. New balance: $${newBalance.toFixed(2)}`
        : `$${Math.abs(adj).toFixed(2)} has been deducted from your account. New balance: $${newBalance.toFixed(2)}`,
    });

    console.log(`💰 Admin adjusted UID${user.uid} by $${adj} → $${newBalance}`);
    res.json({ success: true, newBalance });
  } catch(e) {
    console.error("adjustBalance:", e);
    res.status(500).json({ message: "Server error" });
  }
};
