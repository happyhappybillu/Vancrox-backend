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

module.exports = router;
