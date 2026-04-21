const express = require("express");
const router   = require("express").Router();
const inv      = require("../controllers/investor.controller");
const { protect, requireRole } = require("../middleware/auth.middleware");

const guard = [protect, requireRole("investor")];

router.get("/platform-wallet",  protect, inv.getPlatformWallet); // get wallet address for network
router.get("/traders",         protect, inv.getTraders);
router.post("/deposit/init",   ...guard, inv.initDeposit);
router.post("/withdraw",       ...guard, inv.requestWithdraw);
router.post("/hire",           ...guard, inv.hireTrader);
router.get("/my-trades",       ...guard, inv.myTrades);
router.get("/history",         ...guard, inv.history);
router.post("/wallet",         ...guard, inv.saveWallet);
router.post("/profile",        ...guard, inv.updateProfile);

router.post("/delete-account", protect, requireRole("investor"), inv.deleteAccount);
router.post("/deposit/cancel", ...guard, inv.cancelDeposit);
// NowPayments
// Webhook needs raw body for signature verification, but also parse JSON
router.post("/nowpayments/webhook", 
  (req, res, next) => {
    let raw = "";
    req.on("data", c => raw += c);
    req.on("end", () => {
      req.rawBody = raw;
      try { req.body = JSON.parse(raw); } catch(e) { req.body = {}; }
      next();
    });
  },
  inv.nowPaymentsWebhook
);
router.get("/payment/status/:paymentId", ...guard, inv.checkPayment);
// Announcements
const ann = require("../controllers/announcement.controller");
router.get("/announcements", ...guard, ann.getActiveAnnouncements);
// Tournaments
const tourn = require("../controllers/tournament.controller");
router.get("/tournaments", ...guard, tourn.investorList);
router.post("/tournaments/:id/join", ...guard, tourn.investorJoin);
module.exports = router;
