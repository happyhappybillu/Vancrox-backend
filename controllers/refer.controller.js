const User        = require("../models/User");
const Transaction = require("../models/Transaction");
const Approval    = require("../models/Approval");

/* ── GET MY REFER INFO ── */
exports.getMyRefer = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    /* Get all referred users */
    const referred = await User.find({ referredBy: user._id })
      .select("name uid referCode createdAt")
      .lean();

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
        referCode:  r.referCode,
        joinedAt:   r.createdAt,
        deposited:  !!firstDeposit,
        depositAmt: firstDeposit ? firstDeposit.amount : 0,
        earnedAmt:  firstDeposit ? parseFloat((firstDeposit.amount * 0.10).toFixed(2)) : 0,
      };
    }));

    res.json({
      success:      true,
      referCode:    user.referCode || ("UID" + user.uid),
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
      user.walletAddresses?.TRC20 ||
      user.walletAddresses?.ERC20 ||
      user.walletAddresses?.BEP20 || "";
    if (!wallet)
      return res.status(400).json({ message: "Save a withdrawal wallet address first" });

    /* Deduct */
    user.referBalance -= parseFloat(amount);
    await user.save();

    const tx = await Transaction.create({
      userId:       user._id,
      userName:     user.name,
      userRole:     "investor",
      uid:          user.uid,
      type:         "Referral Withdrawal",
      amount:       parseFloat(amount),
      walletAddress: wallet,
      status:       "Pending",
      note:         "Refer balance withdrawal",
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
    /* Get all investors who have referred at least 1 person */
    const referrers = await User.find({
      role:       "investor",
      referCode:  { $ne: "" },
    }).select("name uid referCode referBalance referEarned createdAt").lean();

    const stats = await Promise.all(referrers.map(async (r) => {
      const totalReferred = await User.countDocuments({ referredBy: r._id });
      const deposited     = await User.countDocuments({
        referredBy: r._id,
        _id: { $in: (await Transaction.distinct("userId", { type: "Deposit", status: "Completed" })) },
      });
      return {
        ...r,
        totalReferred,
        depositedCount: deposited,
        referEarned:    r.referEarned || 0,
        referBalance:   r.referBalance || 0,
      };
    }));

    /* Sort by most referred */
    stats.sort((a, b) => b.totalReferred - a.totalReferred);

    res.json({ success: true, stats });
  } catch (e) {
    console.error("adminReferStats:", e);
    res.status(500).json({ message: "Server error" });
  }
};
