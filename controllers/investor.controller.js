const User        = require("../models/User");
const Ad          = require("../models/Ad");
const Trade       = require("../models/Trade");
const Transaction = require("../models/Transaction");
const Approval    = require("../models/Approval");

/* ── GET ALL APPROVED TRADERS WITH ACTIVE ADS ── */
exports.getTraders = async (req, res) => {
  try {
    const ads = await Ad.find({ active: true }).lean();
    if (!ads.length) return res.json({ success: true, traders: [] });

    const traderIds = [...new Set(ads.map(a => a.traderId.toString()))];
    const traders   = await User.find({
      _id: { $in: traderIds },
      role: "trader",
      traderVerificationStatus: "APPROVED",
      isBlocked: false,
    }).select("name tid securityMoney traderLevel profilePhoto traderVerificationStatus").lean();

    /* Attach ads + last 3 completed trades for avg time calc */
    const result = await Promise.all(traders.map(async t => {
      const recentTrades = await Trade.find({
        traderId: t._id,
        status: "COMPLETED",
      }).select("hireTime updatedAt status").sort({ updatedAt: -1 }).limit(3).lean();

      const traderAds = ads.filter(a => a.traderId.toString() === t._id.toString())
        .map(ad => ({ ...ad, symbol: ad.symbol || "XAUUSD" }));
      return {
        ...t,
        ads: traderAds,
        recentTrades,
      };
    }));

    res.json({ success: true, traders: result });
  } catch (e) {
    console.error("getTraders:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── GET PLATFORM WALLET ADDRESS ── */
exports.getPlatformWallet = async (req, res) => {
  try {
    const { network } = req.query;
    const wallets = {
      TRC20: process.env.WALLET_TRC20,
      ERC20: process.env.WALLET_ERC20,
      BEP20: process.env.WALLET_BEP20,
    };
    const address = wallets[network];
    if (!address) return res.status(400).json({ message: "Invalid network or wallet not configured" });
    res.json({ success: true, network, address });
  } catch (e) {
    console.error("getPlatformWallet:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── INIT DEPOSIT (blockchain auto-verify) ── */
exports.initDeposit = async (req, res) => {
  try {
    const { network, amount, uniqueAmount } = req.body;
    if (!network || !amount || !uniqueAmount)
      return res.status(400).json({ message: "network, amount, uniqueAmount required" });
    if (!["TRC20", "ERC20", "BEP20"].includes(network))
      return res.status(400).json({ message: "network must be TRC20, ERC20, or BEP20" });
    if (amount < 10) return res.status(400).json({ message: "Minimum deposit is $10" });

    /* Check platform wallet is configured */
    const walletKey = `WALLET_${network}`;
    if (!process.env[walletKey])
      return res.status(500).json({ message: `Platform ${network} wallet not configured` });

    const user = req.user;

    /* Check no duplicate pending deposit for same user+network */
    const existing = await Approval.findOne({
      userId: user._id,
      type:   "DEPOSIT",
      status: "pending",
      depositNetwork: network,
    });
    if (existing) {
      return res.status(400).json({
        message: "You already have a pending deposit on this network. Wait for it to confirm or expire.",
      });
    }

    /* Create pending transaction */
    const tx = await Transaction.create({
      userId:       user._id,
      userName:     user.name,
      userRole:     "investor",
      uid:          user.uid,
      type:         "Deposit",
      amount:       parseFloat(amount),
      uniqueAmount: parseFloat(uniqueAmount),
      network,
      status:       "Pending",
    });

    /* Create approval — blockchain cron will auto-approve when tx found */
    await Approval.create({
      type:           "DEPOSIT",
      status:         "pending",
      userId:         user._id,
      userName:       user.name,
      userRole:       "investor",
      uid:            user.uid,
      amount:         parseFloat(amount),
      uniqueAmount:   parseFloat(uniqueAmount),
      depositNetwork: network,
      transactionId:  tx._id,
    });

    res.json({
      success:    true,
      message:    "Deposit initiated. Blockchain is being monitored. Balance will auto-credit after confirmations.",
      walletAddress: process.env[walletKey],
      network,
      uniqueAmount: parseFloat(uniqueAmount),
      expiresIn:  "30 minutes",
    });
  } catch (e) {
    console.error("initDeposit:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── WITHDRAW REQUEST ── */
exports.requestWithdraw = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 50) return res.status(400).json({ message: "Minimum withdrawal is $50" });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.balance < amount) return res.status(400).json({ message: "Insufficient balance" });

    /* Pick best wallet */
    const wallet =
      user.walletAddresses?.TRC20 ||
      user.walletAddresses?.BEP20 ||
      user.walletAddresses?.ERC20 || "";

    if (!wallet) return res.status(400).json({ message: "Please save a withdrawal wallet address first" });

    /* Deduct balance immediately, refund if rejected */
    user.balance -= parseFloat(amount);
    await user.save();

    const tx = await Transaction.create({
      userId:        user._id,
      userName:      user.name,
      userRole:      "investor",
      uid:           user.uid,
      type:          "Withdrawal",
      amount:        parseFloat(amount),
      walletAddress: wallet,
      status:        "Pending",
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

    res.json({ success: true, message: "Withdrawal request submitted" });
  } catch (e) {
    console.error("requestWithdraw:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── HIRE TRADER ── */
exports.hireTrader = async (req, res) => {
  try {
    const { traderId, adId } = req.body;
    if (!traderId || !adId) return res.status(400).json({ message: "traderId and adId required" });

    const investor = await User.findById(req.user._id);
    const trader   = await User.findById(traderId);
    const ad       = await Ad.findById(adId);

    if (!trader) return res.status(404).json({ message: "Trader not found" });
    if (!ad || !ad.active) return res.status(400).json({ message: "Ad is not available" });
    if (trader.traderVerificationStatus !== "APPROVED") return res.status(400).json({ message: "Trader not verified" });
    if (trader.isBlocked) return res.status(400).json({ message: "Trader is blocked" });

    /* Max 3 hires per day per investor */
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayHires = await Trade.countDocuments({
      investorId: investor._id,
      createdAt:  { $gte: todayStart },
    });
    if (todayHires >= 3)
      return res.status(400).json({ message: "Daily limit reached. You can hire maximum 3 traders per day." });

    const amount = ad.tradeAmount;
    if (investor.balance < amount)
      return res.status(400).json({ message: `Insufficient balance. Need $${amount}` });

    /* Deduct investor balance */
    investor.balance -= amount;
    await investor.save();

    /* Deactivate ad (1 trade at a time) */
    ad.active = false;
    await ad.save();

    /* Create trade */
    const trade = await Trade.create({
      investorId:   investor._id,
      investorName: investor.name,
      investorUid:  investor.uid,
      traderId:     trader._id,
      traderName:   trader.name,
      traderTid:    trader.tid,
      adId:         ad._id,
      returnPct:    ad.returnPct,
      amount,
      symbol:       ad.symbol || "XAUUSD",
      status:       "WAITING_TRADER_CONFIRMATION",
      hireTime:     new Date(),
    });

    /* ── SERVER-SIDE AUTO ACCEPT ── */
    if (trader.autoAccept) {
      trade.status = "ONGOING";
      await trade.save();
      console.log(`⚡ Auto-accepted trade ${trade._id} for trader ${trader.name}`);
      return res.json({
        success: true,
        message: "Trader hired and auto-accepted! Trade is now ongoing.",
        trade,
        autoAccepted: true,
      });
    }

    res.json({ success: true, message: "Trader hired! Waiting for confirmation.", trade });
  } catch (e) {
    console.error("hireTrader:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── MY TRADES ── */
exports.myTrades = async (req, res) => {
  try {
    const trades = await Trade.find({
      investorId: req.user._id,
      archived:   { $ne: true },
    }).sort({ createdAt: -1 }).lean();

    /* Attach trader profilePhoto for each trade */
    const traderIds = [...new Set(trades.map(t => t.traderId?.toString()).filter(Boolean))];
    const traders = await User.find({ _id: { $in: traderIds } })
      .select("_id profilePhoto").lean();
    const traderMap = {};
    traders.forEach(t => { traderMap[t._id.toString()] = t.profilePhoto || ""; });

    const enriched = trades.map(t => ({
      ...t,
      symbol:     t.symbol || "XAUUSD",
      entryPrice: t.entryPrice || 0,
      traderPhoto: traderMap[t.traderId?.toString()] || "",
    }));

    res.json({ success: true, trades: enriched });
  } catch (e) {
    console.error("myTrades:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── HISTORY ── */
exports.history = async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, transactions });
  } catch (e) {
    console.error("history:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── SAVE WALLET ADDRESSES ── */
exports.saveWallet = async (req, res) => {
  try {
    const { walletAddresses } = req.body;
    if (!walletAddresses) return res.status(400).json({ message: "walletAddresses required" });

    await User.findByIdAndUpdate(req.user._id, {
      "walletAddresses.TRC20": walletAddresses.TRC20 || "",
      "walletAddresses.ERC20": walletAddresses.ERC20 || "",
      "walletAddresses.BEP20": walletAddresses.BEP20 || "",
    });

    res.json({ success: true, message: "Wallet addresses saved" });
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
