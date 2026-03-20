const User        = require("../models/User");
const Transaction = require("../models/Transaction");
const Approval    = require("../models/Approval");

/* ── GET MY REFER INFO ── */
exports.getMyRefer = async (req, res) => {
  try {
    let user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    /* Auto-set referCode if missing (existing users) */
    if (!user.referCode && user.uid) {
      await User.findByIdAndUpdate(user._id, { referCode: "UID" + user.uid });
      user.referCode = "UID" + user.uid;
      console.log("Auto-set referCode: UID" + user.uid + " for " + user.name);
    }

    /* Get all referred users — show even if not deposited yet */
    const referred = await User.find({ referredBy: user._id })
      .select("name uid createdAt")
      .sort({ createdAt: -1 })
      .lean();

    console.log(user.name + " referCode=" + user.referCode + " referred=" + referred.length);

    /* Check which ones have made first deposit */
    const referredWithStatus = await Promise.all(referred.map(async (r) => {
      const firstDeposit = await Transaction.findOne({
        userId: r._id,
        type:   "Deposit",
        status: "Completed",
      }).lean();
      return {
        _id:        r._id,
        name:       r.name,
        uid:        r.uid,
        joinedAt:   r.createdAt,
        deposited:  !!firstDeposit,
        depositAmt: firstDeposit ? firstDeposit.amount : 0,
        earnedAmt:  firstDeposit ? parseFloat((firstDeposit.amount * 0.10).toFixed(2)) : 0,
      };
    }));

    res.json({
      success:      true,
      referCode:    user.referCode,
      referBalance: user.referBalance || 0,
      referEarned:  user.referEarned  || 0,
      referred:     referredWithStatus,
      total:        referred.length,
    });
  } catch (e) {
    console.error("getMyRefer:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── WITHDRAW REFER BALANCE ── */
exports.withdrawRefer = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 10)
      return res.status(400).json({ message: "Minimum refer withdrawal is $10" });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if ((user.referBalance || 0) < amount)
      return res.status(400).json({ message: "Insufficient refer balance" });

    const wallet =
      (user.walletAddresses && (user.walletAddresses.TRC20 ||
      user.walletAddresses.ERC20 ||
      user.walletAddresses.BEP20)) || "";
    if (!wallet)
      return res.status(400).json({ message: "Save a withdrawal wallet address first" });

    user.referBalance -= parseFloat(amount);
    await user.save();

    const tx = await Transaction.create({
      userId:        user._id,
      userName:      user.name,
      userRole:      "investor",
      uid:           user.uid,
      type:          "Referral Withdrawal",
      amount:        parseFloat(amount),
      walletAddress: wallet,
      status:        "Pending",
      note:          "Refer balance withdrawal",
    });

    await Approval.create({
      type:          "WITHDRAWAL",
      status:        "pending",
      userId:        user._id,
      userName:      user.name,
      userRole:      "investor",
      uid:           user.uid,
      amount:        parseFloat(amount),
      walletAddress: wallet,
      transactionId: tx._id,
    });

    res.json({ success: true, message: "Withdrawal request submitted. Will be sent within 30 minutes." });
  } catch (e) {
    console.error("withdrawRefer:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── ADMIN: ALL REFERRAL STATS ── */
exports.adminReferStats = async (req, res) => {
  try {
    const referrers = await User.find({
      role:      "investor",
      referCode: { $ne: "" },
    }).select("name uid referCode referBalance referEarned createdAt").lean();

    const depositedIds = await Transaction.distinct("userId", { type: "Deposit", status: "Completed" });

    const stats = await Promise.all(referrers.map(async (r) => {
      const totalReferred  = await User.countDocuments({ referredBy: r._id });
      const depositedCount = await User.countDocuments({
        referredBy: r._id,
        _id: { $in: depositedIds },
      });
      return {
        name:          r.name,
        uid:           r.uid,
        referCode:     r.referCode,
        referBalance:  r.referBalance  || 0,
        referEarned:   r.referEarned   || 0,
        createdAt:     r.createdAt,
        totalReferred,
        depositedCount,
      };
    }));

    stats.sort((a, b) => b.totalReferred - a.totalReferred);
    res.json({ success: true, stats });
  } catch (e) {
    console.error("adminReferStats:", e);
    res.status(500).json({ message: "Server error" });
  }
};
