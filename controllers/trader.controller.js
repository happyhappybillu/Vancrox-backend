const User        = require("../models/User");
const Ad          = require("../models/Ad");
const Trade       = require("../models/Trade");
const Transaction = require("../models/Transaction");
const Approval    = require("../models/Approval");

/* ── SUBMIT VERIFICATION ── */
exports.submitVerification = async (req, res) => {
  try {
    const { historyFile, securityDeposit, network, uniqueAmount, paymentScreenshot } = req.body;

    if (!historyFile)
      return res.status(400).json({ message: "Trading history file required" });
    if (!securityDeposit || securityDeposit < 50)
      return res.status(400).json({ message: "Minimum security deposit is $50" });
    if (!network || !["TRC20","ERC20","BEP20"].includes(network))
      return res.status(400).json({ message: "Select a valid network" });
    if (!uniqueAmount)
      return res.status(400).json({ message: "uniqueAmount required" });

    /* Platform wallet check */
    const walletKey = `WALLET_${network}`;
    if (!process.env[walletKey])
      return res.status(500).json({ message: `Platform ${network} wallet not configured` });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.traderVerificationStatus === "APPROVED")
      return res.status(400).json({ message: "Already verified" });

    /* Save history file + mark PENDING — deposit not credited yet */
    user.traderVerificationStatus = "PENDING";
    user.traderHistoryFile        = historyFile;
    /* securityMoney will be set when admin approves deposit */
    await user.save();

    /* Create TRADER_VERIFICATION approval — doc review */
    await Approval.create({
      type:              "TRADER_VERIFICATION",
      status:            "pending",
      userId:            user._id,
      userName:          user.name,
      userRole:          "trader",
      tid:               user.tid,
      securityDeposit:   parseFloat(securityDeposit),
      historyFile,
      paymentScreenshot: paymentScreenshot || null,
      depositNetwork:    network,
      uniqueAmount:      parseFloat(uniqueAmount),
      amount:            parseFloat(securityDeposit),
      depositPaid:       false,
    });

    res.json({
      success:     true,
      message:     "Submitted! Awaiting admin review.",
      walletAddress: process.env[walletKey],
      network,
      uniqueAmount: parseFloat(uniqueAmount),
    });
  } catch (e) {
    console.error("submitVerification:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── GET MY ADS ── */
exports.getMyAds = async (req, res) => {
  try {
    const ads = await Ad.find({ traderId: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, ads });
  } catch (e) {
    console.error("getMyAds:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── CREATE AD ── */
exports.createAd = async (req, res) => {
  try {
    const { returnPct, tradeAmount } = req.body;

    if (!returnPct || returnPct < 1 || returnPct > 100)
      return res.status(400).json({ message: "Return % must be 1–100" });
    if (!tradeAmount || tradeAmount < 10)
      return res.status(400).json({ message: "Minimum trade amount is $10" });
    if (tradeAmount % 10 !== 0)
      return res.status(400).json({ message: "Trade amount must be multiple of 10 (10, 20, 30...)" });

    const trader = await User.findById(req.user._id);
    if (!trader) return res.status(404).json({ message: "Trader not found" });
    if (trader.traderVerificationStatus !== "APPROVED")
      return res.status(403).json({ message: "Trader not verified" });
    if (!trader.securityMoney || trader.securityMoney < 50)
      return res.status(400).json({ message: "Security deposit required" });

    /* Check total ads amount ≤ security money */
    const existingAds = await Ad.find({ traderId: trader._id });
    const usedAmount  = existingAds.reduce((sum, ad) => sum + (ad.tradeAmount || 0), 0);
    const remaining   = trader.securityMoney - usedAmount;

    if (tradeAmount > remaining) {
      return res.status(400).json({
        message: `Insufficient security. Used: $${usedAmount}, Remaining: $${remaining}. Add more security deposit to create bigger ads.`,
        remaining,
        used: usedAmount,
        security: trader.securityMoney,
      });
    }

    const ad = await Ad.create({
      traderId:    trader._id,
      traderName:  trader.name,
      traderTid:   trader.tid,
      returnPct:   parseFloat(returnPct),
      tradeAmount: parseFloat(tradeAmount),
      active:      true,
    });

    res.json({ success: true, message: "Ad created", ad });
  } catch (e) {
    console.error("createAd:", e);
    res.status(500).json({ message: "Server error" });
  }
};


/* ── TOGGLE AD (activate / deactivate) ── */
exports.toggleAd = async (req, res) => {
  try {
    const ad = await Ad.findOne({ _id: req.params.id, traderId: req.user._id });
    if (!ad) return res.status(404).json({ message: "Ad not found" });

    ad.active = req.body.active !== undefined ? req.body.active : !ad.active;
    await ad.save();

    res.json({ success: true, message: ad.active ? "Ad activated" : "Ad deactivated", ad });
  } catch (e) {
    console.error("toggleAd:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── DELETE AD ── */
exports.deleteAd = async (req, res) => {
  try {
    const ad = await Ad.findOneAndDelete({ _id: req.params.id, traderId: req.user._id });
    if (!ad) return res.status(404).json({ message: "Ad not found" });
    res.json({ success: true, message: "Ad deleted" });
  } catch (e) {
    console.error("deleteAd:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── GET MY TRADES ── */
exports.getMyTrades = async (req, res) => {
  try {
    const trades = await Trade.find({ traderId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, trades });
  } catch (e) {
    console.error("getMyTrades:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── ACCEPT TRADE ── */
exports.acceptTrade = async (req, res) => {
  try {
    const trade = await Trade.findOne({
      _id:      req.params.id,
      traderId: req.user._id,
      status:   "WAITING_TRADER_CONFIRMATION",
    });
    if (!trade) return res.status(404).json({ message: "Trade not found or expired" });

    /* Check 5-min window */
    const elapsed = Date.now() - new Date(trade.hireTime).getTime();
    if (elapsed > 5 * 60 * 1000) {
      trade.status = "AUTO_REJECTED";
      await trade.save();
      /* Refund investor */
      await User.findByIdAndUpdate(trade.investorId, { $inc: { balance: trade.amount } });
      await Ad.findByIdAndUpdate(trade.adId, { active: true });
      return res.status(400).json({ message: "Trade window expired — investor refunded" });
    }

    trade.status = "ONGOING";
    await trade.save();

    res.json({ success: true, message: "Trade accepted!", trade });
  } catch (e) {
    console.error("acceptTrade:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── REJECT TRADE ── */
exports.rejectTrade = async (req, res) => {
  try {
    const trade = await Trade.findOne({
      _id:      req.params.id,
      traderId: req.user._id,
      status:   "WAITING_TRADER_CONFIRMATION",
    });
    if (!trade) return res.status(404).json({ message: "Trade not found" });

    trade.status = "REJECTED_BY_TRADER";
    await trade.save();

    /* Refund investor */
    await User.findByIdAndUpdate(trade.investorId, { $inc: { balance: trade.amount } });
    /* Re-activate ad */
    await Ad.findByIdAndUpdate(trade.adId, { active: true });

    res.json({ success: true, message: "Trade rejected — investor refunded" });
  } catch (e) {
    console.error("rejectTrade:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── SET TRADE OUTCOME (profit / loss) ── */
exports.setOutcome = async (req, res) => {
  try {
    const { outcome } = req.body; // "profit" | "loss"
    if (!["profit", "loss"].includes(outcome))
      return res.status(400).json({ message: "outcome must be 'profit' or 'loss'" });

    const trade = await Trade.findOne({
      _id:      req.params.id,
      traderId: req.user._id,
      status:   "ONGOING",
    });
    if (!trade) return res.status(404).json({ message: "Active trade not found" });

    trade.outcome = outcome;
    trade.status  = "COMPLETED";

    if (outcome === "profit") {
      /* Profit = amount * returnPct / 100 */
      const profit    = parseFloat(((trade.amount * trade.returnPct) / 100).toFixed(2));
      const traderFee = parseFloat((profit * 0.10).toFixed(2)); // 10% of profit
      const investorReturn = trade.amount + profit - traderFee;

      trade.profitAmount = profit;
      trade.traderFee    = traderFee;

      /* Credit investor: principal + profit - 10% fee */
      await User.findByIdAndUpdate(trade.investorId, { $inc: { balance: investorReturn } });

      /* Credit trader: 10% of profit */
      await User.findByIdAndUpdate(trade.traderId, {
        $inc: { traderTotalEarning: traderFee },
      });

      /* Transactions */
      await Transaction.create({
        userId: trade.investorId, userName: trade.investorName, userRole: "investor",
        uid: trade.investorUid, type: "Profit", amount: profit - traderFee,
        status: "Completed", tradeId: trade._id,
        note: `Trade profit. Trader fee: $${traderFee}`,
      });
      await Transaction.create({
        userId: trade.traderId, userName: trade.traderName, userRole: "trader",
        tid: trade.traderTid, type: "Commission", amount: traderFee,
        status: "Completed", tradeId: trade._id,
        note: `10% commission from trade`,
      });

    } else {
      /* Loss → full refund to investor */
      await User.findByIdAndUpdate(trade.investorId, { $inc: { balance: trade.amount } });
      await Transaction.create({
        userId: trade.investorId, userName: trade.investorName, userRole: "investor",
        uid: trade.investorUid, type: "Loss Refund", amount: trade.amount,
        status: "Completed", tradeId: trade._id,
        note: "100% refund — trader made a loss",
      });
    }

    await trade.save();

    /* Re-activate the ad */
    await Ad.findByIdAndUpdate(trade.adId, { active: true });

    /* Update trader level (every 10 completed trades, level up) */
    const completedCount = await Trade.countDocuments({ traderId: req.user._id, status: "COMPLETED" });
    const newLevel = Math.min(10, Math.floor(completedCount / 10) + 1);
    await User.findByIdAndUpdate(req.user._id, { traderLevel: newLevel });

    res.json({ success: true, message: outcome === "profit" ? "Profit recorded!" : "Loss recorded — investor refunded", trade });
  } catch (e) {
    console.error("setOutcome:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── GET EARNINGS HISTORY ── */
exports.getEarnings = async (req, res) => {
  try {
    const earnings = await Transaction.find({
      userId: req.user._id,
      type:   "Commission",
    }).sort({ createdAt: -1 }).lean();

    res.json({ success: true, earnings });
  } catch (e) {
    console.error("getEarnings:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── WITHDRAW EARNINGS ── */
exports.withdrawEarnings = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 10) return res.status(400).json({ message: "Minimum withdrawal is $10" });

    const trader = await User.findById(req.user._id);
    if (!trader) return res.status(404).json({ message: "Trader not found" });
    if (trader.traderTotalEarning < amount)
      return res.status(400).json({ message: "Insufficient earnings" });

    const wallet =
      trader.walletAddresses?.TRC20 ||
      trader.walletAddresses?.BEP20 ||
      trader.walletAddresses?.ERC20 || "";
    if (!wallet) return res.status(400).json({ message: "Save a withdrawal wallet address first" });

    /* Deduct from earnings */
    trader.traderTotalEarning -= parseFloat(amount);
    await trader.save();

    const tx = await Transaction.create({
      userId: trader._id, userName: trader.name, userRole: "trader",
      tid: trader.tid, type: "Withdrawal", amount: parseFloat(amount),
      walletAddress: wallet, status: "Pending",
    });

    await Approval.create({
      type: "WITHDRAWAL", status: "pending",
      userId: trader._id, userName: trader.name, userRole: "trader", tid: trader.tid,
      amount: parseFloat(amount), walletAddress: wallet, transactionId: tx._id,
    });

    res.json({ success: true, message: "Withdrawal request submitted" });
  } catch (e) {
    console.error("withdrawEarnings:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── SAVE WALLET ADDRESSES ── */
exports.saveWallet = async (req, res) => {
  try {
    const { walletAddresses } = req.body;
    await User.findByIdAndUpdate(req.user._id, {
      "walletAddresses.TRC20": walletAddresses?.TRC20 || "",
      "walletAddresses.ERC20": walletAddresses?.ERC20 || "",
      "walletAddresses.BEP20": walletAddresses?.BEP20 || "",
    });
    res.json({ success: true, message: "Wallets saved" });
  } catch (e) {
    console.error("saveWallet:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── UPDATE PROFILE ── */
exports.updateProfile = async (req, res) => {
  try {
    const { name, profilePhoto } = req.body;
    const update = {};
    if (name)         update.name = String(name).trim();
    if (profilePhoto) update.profilePhoto = profilePhoto;
    await User.findByIdAndUpdate(req.user._id, update);
    res.json({ success: true, message: "Profile updated" });
  } catch (e) {
    console.error("updateProfile:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── TOGGLE AUTO ACCEPT ── */
exports.setAutoAccept = async (req, res) => {
  try {
    const { enabled } = req.body;
    await User.findByIdAndUpdate(req.user._id, { autoAccept: !!enabled });
    console.log(`⚡ AutoAccept ${enabled ? "ON" : "OFF"} for trader ${req.user._id}`);
    res.json({ success: true, autoAccept: !!enabled });
  } catch (e) {
    console.error("setAutoAccept:", e);
    res.status(500).json({ message: "Server error" });
  }
};
