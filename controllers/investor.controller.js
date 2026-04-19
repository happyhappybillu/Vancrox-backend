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
        .map(ad => {
          const sym = ad.symbol && ["XAUUSD","BTCUSDT","EURUSD","GBPUSD"].includes(ad.symbol) ? ad.symbol : "XAUUSD";
          return { ...ad, symbol: sym };
        });
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
    const { coin, amount } = req.body;
    if (!coin || !amount) return res.status(400).json({ message: "coin and amount required" });
    if (amount < 10) return res.status(400).json({ message: "Minimum deposit is $10" });

    const { createPayment, CURRENCY_MAP } = require("../utils/nowpayments");
    if (!CURRENCY_MAP[coin]) return res.status(400).json({ message: "Unsupported coin: " + coin });

    const user = req.user;
    const orderId = `VC-${user.uid}-${Date.now()}`;

    const payment = await createPayment({
      amount, coin, orderId,
      description: `VANCROX Deposit - UID${user.uid}`
    });

    const tx = await Transaction.create({
      userId: user._id, userName: user.name, userRole: "investor", uid: user.uid,
      type: "Deposit", amount: parseFloat(amount), network: coin, status: "Pending",
      note: `NowPayments ID: ${payment.payment_id}`,
    });

    await Approval.create({
      type: "DEPOSIT", status: "pending",
      userId: user._id, userName: user.name, userRole: "investor", uid: user.uid,
      amount: parseFloat(amount), depositNetwork: coin,
      transactionId: tx._id,
      npPaymentId: payment.payment_id, npOrderId: orderId,
    });

    res.json({
      success: true,
      paymentId:   payment.payment_id,
      payAddress:  payment.pay_address,
      payAmount:   payment.pay_amount,
      payCurrency: payment.pay_currency,
      network:     coin,
      expiresAt:   payment.expiration_estimate_date,
    });
  } catch(e) {
    console.error("initDeposit:", e.message);
    res.status(500).json({ message: "Payment gateway error: " + e.message });
  }
};

/* ── NOWPAYMENTS WEBHOOK ── */
exports.nowPaymentsWebhook = async (req, res) => {
  try {
    const { verifyIPN } = require("../utils/nowpayments");
    const sig = req.headers["x-nowpayments-sig"];
    // Try to verify — in dev/test mode, skip verification if no secret set
    const rawBody = req.rawBody || (typeof req.body === "string" ? req.body : JSON.stringify(req.body));
    if (sig && process.env.NOWPAYMENTS_IPN_SECRET) {
      if (!verifyIPN(rawBody, sig)) {
        console.error("❌ Invalid IPN signature — sig:", sig?.slice(0,20));
        return res.status(401).json({ message: "Invalid signature" });
      }
    }
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { payment_id, payment_status, price_amount, pay_amount, pay_currency } = body;
    console.log(`📩 IPN: id=${payment_id} status=${payment_status} amount=${pay_amount} ${pay_currency}`);
    // Log full body for debugging
    console.log("IPN body:", JSON.stringify(body).slice(0,300));

    // Accept partially_paid too (trailing zero / rounding tolerance)
    const _ps=(payment_status||"").toLowerCase();
    if (!["finished","confirmed","partially_paid","sending"].includes(_ps)) return res.json({ received: true });
    const payment_status_normalized=_ps;

    const dep = await Approval.findOne({ npPaymentId: String(payment_id), status: "pending" });
    if (!dep) return res.json({ received: true });

    await Approval.findByIdAndUpdate(dep._id, { $set: { status: "approved", npStatus: payment_status } });
    await User.findByIdAndUpdate(dep.userId, { $inc: { balance: dep.amount } });
    if (dep.transactionId) {
      await Transaction.findByIdAndUpdate(dep.transactionId, {
        status: "Completed", note: `NowPayments ${payment_status}. ID: ${payment_id}`
      });
    }
    const investor = await User.findById(dep.userId);
    if (investor?.referredBy) {
      const prev = await Transaction.countDocuments({ userId: dep.userId, type: "Deposit", status: "Completed" });
      if (prev === 1) {
        const bonus = parseFloat((dep.amount * 0.10).toFixed(2));
        await User.findByIdAndUpdate(investor.referredBy, { $inc: { referBalance: bonus, referEarned: bonus } });
      }
    }
    const Notification = require("../models/Notification");
    await Notification.create({
      userId: dep.userId, type: "general",
      title: "💰 Deposit Successful",
      message: `$${dep.amount.toFixed(2)} USDT has been credited to your VANCROX balance.`
    });
    console.log(`✅ $${dep.amount} credited to UID${dep.uid}`);
    res.json({ received: true });
  } catch(e) {
    console.error("webhook error:", e.message);
    res.status(500).json({ message: "error" });
  }
};

/* ── CHECK PAYMENT STATUS ── */
exports.checkPayment = async (req, res) => {
  try {
    const { getPaymentStatus } = require("../utils/nowpayments");
    const status = await getPaymentStatus(req.params.paymentId);
    res.json({ success: true, status });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
};


exports.nowPaymentsWebhook = async (req, res) => {
  try {
    const { verifyIPN } = require("../utils/nowpayments");
    const sig = req.headers["x-nowpayments-sig"];
    const rawBody = req.rawBody || (typeof req.body === "string" ? req.body : JSON.stringify(req.body));
    if (!sig || !verifyIPN(rawBody, sig)) {
      console.error("❌ Invalid IPN signature");
      return res.status(401).json({ message: "Invalid signature" });
    }
    const body = JSON.parse(rawBody);
    const { payment_id, payment_status, price_amount, pay_amount, pay_currency } = body;
    console.log(`📩 IPN: id=${payment_id} status=${payment_status} amount=${pay_amount} ${pay_currency}`);
    // Log full body for debugging
    console.log("IPN body:", JSON.stringify(body).slice(0,300));

    // Accept partially_paid too (trailing zero / rounding tolerance)
    const _ps=(payment_status||"").toLowerCase();
    if (!["finished","confirmed","partially_paid","sending"].includes(_ps)) return res.json({ received: true });
    const payment_status_normalized=_ps;

    const dep = await Approval.findOne({ npPaymentId: String(payment_id), status: "pending" });
    if (!dep) return res.json({ received: true });

    await Approval.findByIdAndUpdate(dep._id, { $set: { status: "approved", npStatus: payment_status } });
    await User.findByIdAndUpdate(dep.userId, { $inc: { balance: dep.amount } });
    if (dep.transactionId) {
      await Transaction.findByIdAndUpdate(dep.transactionId, {
        status: "Completed", note: `NowPayments ${payment_status}. ID: ${payment_id}`
      });
    }
    // Referral bonus
    const investor = await User.findById(dep.userId);
    if (investor?.referredBy) {
      const prev = await Transaction.countDocuments({ userId: dep.userId, type: "Deposit", status: "Completed" });
      if (prev === 1) {
        const bonus = parseFloat((dep.amount * 0.10).toFixed(2));
        await User.findByIdAndUpdate(investor.referredBy, { $inc: { referBalance: bonus, referEarned: bonus } });
      }
    }
    // Notification
    const Notification = require("../models/Notification");
    await Notification.create({
      userId: dep.userId, type: "general",
      title: "💰 Deposit Successful",
      message: `$${dep.amount.toFixed(2)} USDT has been credited to your VANCROX balance.`
    });
    console.log(`✅ $${dep.amount} credited to UID${dep.uid}`);
    res.json({ received: true });
  } catch(e) {
    console.error("webhook error:", e.message);
    res.status(500).json({ message: "error" });
  }
};

/* ── CHECK PAYMENT STATUS ── */
exports.checkPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { getPaymentStatus } = require("../utils/nowpayments");
    const data = await getPaymentStatus(paymentId);
    res.json({ success: true, status: data });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
};


exports.nowPaymentsWebhook = async (req, res) => {
  try {
    const { verifyIPN } = require("../utils/nowpayments");
    const sig = req.headers["x-nowpayments-sig"];
    if (!sig || !verifyIPN(req.body, sig)) {
      console.error("❌ Invalid IPN signature");
      return res.status(401).json({ message: "Invalid signature" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { payment_id, payment_status, order_id, actually_paid, price_amount } = body;
    console.log(`📩 NowPayments IPN: id=${payment_id} status=${payment_status} order=${order_id}`);

    // Only process finished/confirmed payments
    if (!["finished","confirmed","partially_paid","sending"].includes((payment_status||"").toLowerCase())) {
      return res.json({ received: true });
    }

    // Find approval by npPaymentId
    const dep = await Approval.findOne({ npPaymentId: payment_id, status: "pending" });
    if (!dep) {
      console.log("No pending deposit found for payment_id:", payment_id);
      return res.json({ received: true });
    }

    // Credit balance
    const creditAmt = dep.amount; // always credit the USD amount they initiated
    await Approval.findByIdAndUpdate(dep._id, {
      $set: { status: "approved", npStatus: payment_status }
    });
    await User.findByIdAndUpdate(dep.userId, { $inc: { balance: creditAmt } });
    if (dep.transactionId) {
      await Transaction.findByIdAndUpdate(dep.transactionId, {
        status: "Completed",
        note: `NowPayments ${payment_status}. PayID: ${payment_id}`
      });
    }

    // Referral bonus on first deposit
    const investor = await User.findById(dep.userId);
    if (investor?.referredBy) {
      const prev = await Transaction.countDocuments({ userId: dep.userId, type: "Deposit", status: "Completed" });
      if (prev === 1) {
        const bonus = parseFloat((creditAmt * 0.10).toFixed(2));
        await User.findByIdAndUpdate(investor.referredBy, { $inc: { referBalance: bonus, referEarned: bonus } });
      }
    }

    // Send notification to investor
    const Notification = require("../models/Notification");
    await Notification.create({
      userId: dep.userId, type: "general",
      title: "💰 Deposit Successful",
      message: `$${creditAmt.toFixed(2)} USDT has been credited to your VANCROX balance.`
    });

    console.log(`✅ $${creditAmt} credited to UID${dep.uid}`);
    res.json({ received: true });
  } catch(e) {
    console.error("webhook error:", e.message);
    res.status(500).json({ message: "error" });
  }
};

/* ── CHECK PAYMENT STATUS ── */
exports.checkPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { getPaymentStatus } = require("../utils/nowpayments");
    const status = await getPaymentStatus(paymentId);
    res.json({ success: true, status });
  } catch(e) {
    res.status(500).json({ message: e.message });
  }
};


exports.nowPaymentsWebhook = async (req, res) => {
  try {
    const { verifyIPN } = require("../utils/nowpayments");
    const sig = req.headers["x-nowpayments-sig"];
    if (!sig || !verifyIPN(req.body, sig)) {
      console.error("❌ Invalid IPN signature");
      return res.status(401).json({ message: "Invalid signature" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { payment_id, payment_status, order_id, actually_paid, price_amount } = body;
    console.log(`📩 NowPayments IPN: id=${payment_id} status=${payment_status} order=${order_id}`);

    // Only process finished/confirmed payments
    if (!["finished","confirmed","partially_paid","sending"].includes((payment_status||"").toLowerCase())) {
      return res.json({ received: true });
    }

    // Find approval by npPaymentId
    const dep = await Approval.findOne({ npPaymentId: payment_id, status: "pending" });
    if (!dep) {
      console.log("No pending deposit found for payment_id:", payment_id);
      return res.json({ received: true });
    }

    // Credit balance
    const creditAmt = dep.amount; // always credit the USD amount they initiated
    await Approval.findByIdAndUpdate(dep._id, {
      $set: { status: "approved", npStatus: payment_status }
    });
    await User.findByIdAndUpdate(dep.userId, { $inc: { balance: creditAmt } });
    if (dep.transactionId) {
      await Transaction.findByIdAndUpdate(dep.transactionId, {
        status: "Completed",
        note: `NowPayments ${payment_status}. PayID: ${payment_id}`
      });
    }

    // Referral bonus on first deposit
    const investor = await User.findById(dep.userId);
    if (investor?.referredBy) {
      const prev = await Transaction.countDocuments({ userId: dep.userId, type: "Deposit", status: "Completed" });
      if (prev === 1) {
        const bonus = parseFloat((creditAmt * 0.10).toFixed(2));
        await User.findByIdAndUpdate(investor.referredBy, { $inc: { referBalance: bonus, referEarned: bonus } });
      }
    }

    // Send notification to investor
    const Notification = require("../models/Notification");
    await Notification.create({
      userId: dep.userId, type: "general",
      title: "💰 Deposit Successful",
      message: `$${creditAmt.toFixed(2)} USDT has been credited to your VANCROX balance.`
    });

    console.log(`✅ $${creditAmt} credited to UID${dep.uid}`);
    res.json({ received: true });
  } catch(e) {
    console.error("webhook error:", e.message);
    res.status(500).json({ message: "error" });
  }
};

/* ── CHECK PAYMENT STATUS ── */
exports.checkPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { getPaymentStatus } = require("../utils/nowpayments");
    const status = await getPaymentStatus(paymentId);
    res.json({ success: true, status });
  } catch(e) {
    res.status(500).json({ message: e.message });
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

        // Notify investor
    try {
      const Notif = require("../models/Notification");
      await Notif.create({
        userId: user._id, type: "general",
        title: "🏦 Withdrawal Requested",
        message: `Your withdrawal request of $${parseFloat(amount).toFixed(2)} USDT is under review. You will be notified once processed.`
      });
    } catch(ne){}

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
      $or: [{ archived: false }, { archived: null }, { archived: { $exists: false } }]
    }).sort({ createdAt: -1 }).lean();

    /* Attach trader profilePhoto for each trade */
    const traderIds = [...new Set(trades.map(t => t.traderId?.toString()).filter(Boolean))];
    const traders = await User.find({ _id: { $in: traderIds } })
      .select("_id profilePhoto tid").lean();
    const traderMap = {};
    traders.forEach(t => { traderMap[t._id.toString()] = t.profilePhoto || ""; });

    // Also get traderTid for TID display
    const traderTidMap = {};
    traders.forEach(tr => { traderTidMap[tr._id.toString()] = tr.tid || null; });

    const enriched = trades.map(t => ({
      ...t,
      symbol:      t.symbol || "XAUUSD",
      entryPrice:  t.entryPrice || 0,
      closePrice:  t.closePrice || 0,
      traderPhoto: traderMap[t.traderId?.toString()] || "",
      traderTid:   t.traderTid || traderTidMap[t.traderId?.toString()] || null,
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

/* ── DELETE OWN ACCOUNT ── */
exports.deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: "Password required" });

    const bcrypt = require("bcryptjs");
    const user = await User.findById(req.user._id).select("+password").lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Incorrect password" });

    // Delete all user data permanently
    const Trade        = require("../models/Trade");
    const Transaction  = require("../models/Transaction");
    const Notification = require("../models/Notification");
    const PushSubscription = require("../models/PushSubscription");
    const SupportTicket = require("../models/SupportTicket");

    await Trade.deleteMany({ investorId: req.user._id });
    await Transaction.deleteMany({ userId: req.user._id });
    await Notification.deleteMany({ userId: req.user._id });
    await PushSubscription.deleteMany({ userId: req.user._id });
    await SupportTicket.deleteMany({ userId: req.user._id });
    await User.findByIdAndDelete(req.user._id);

    console.log(`🗑️ Account deleted: ${user.email} (UID${user.uid})`);
    res.json({ success: true, message: "Account permanently deleted" });
  } catch (e) {
    console.error("deleteAccount:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── CANCEL DEPOSIT ── */
exports.cancelDeposit = async (req, res) => {
  try {
    const { network, uniqueAmount } = req.body;
    await Approval.findOneAndUpdate(
      { userId: req.user._id, type: "DEPOSIT", status: "pending", depositNetwork: network },
      { $set: { status: "cancelled" } }
    );
    await Transaction.findOneAndUpdate(
      { userId: req.user._id, type: "Deposit", status: "Pending", uniqueAmount: parseFloat(uniqueAmount) },
      { $set: { status: "Cancelled" } }
    );
    res.json({ success: true, message: "Deposit cancelled" });
  } catch(e) {
    res.status(500).json({ message: "Server error" });
  }
};
