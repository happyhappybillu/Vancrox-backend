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
    if (req.query.status) filter.status = req.query.status;
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
    if (approval.status !== "pending") return res.status(400).json({ message: "Already processed" });

    approval.status = "approved";
    await approval.save();

    /* ── WITHDRAWAL approved → mark tx completed ── */
    if (approval.type === "WITHDRAWAL") {
      if (approval.transactionId)
        await Transaction.findByIdAndUpdate(approval.transactionId, { status: "Completed" });
    }

    /* ── DEPOSIT approved → credit investor balance ── */
    if (approval.type === "DEPOSIT") {
      await User.findByIdAndUpdate(approval.userId, { $inc: { balance: approval.amount } });
      if (approval.transactionId)
        await Transaction.findByIdAndUpdate(approval.transactionId, { status: "Completed" });

      /* Refer & Earn — credit referrer 10% on FIRST deposit only */
      const investor = await User.findById(approval.userId);
      if (investor?.referredBy) {
        /* Check if this is their first completed deposit */
        const prevDeposits = await Transaction.countDocuments({
          userId: approval.userId,
          type:   "Deposit",
          status: "Completed",
        });
        if (prevDeposits === 1) { // just became 1 after update above
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
    if (approval.status !== "pending") return res.status(400).json({ message: "Already processed" });

    approval.status = "rejected";
    await approval.save();

    /* ── WITHDRAWAL rejected → refund balance ── */
    if (approval.type === "WITHDRAWAL") {
      await User.findByIdAndUpdate(approval.userId, { $inc: { balance: approval.amount } });
      if (approval.transactionId)
        await Transaction.findByIdAndUpdate(approval.transactionId, { status: "Failed" });
    }

    /* ── DEPOSIT rejected → mark tx failed ── */
    if (approval.type === "DEPOSIT") {
      if (approval.transactionId)
        await Transaction.findByIdAndUpdate(approval.transactionId, { status: "Failed" });
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
    const deposits = await Transaction.find({ type: "Deposit" })
      .sort({ createdAt: -1 }).lean();
    res.json({ success: true, deposits });
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
