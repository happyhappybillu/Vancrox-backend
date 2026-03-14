const router = require("express").Router();
const tr     = require("../controllers/trader.controller");
const { protect, requireRole } = require("../middleware/auth.middleware");

const guard = [protect, requireRole("trader")];

router.post("/verify",                   ...guard, tr.submitVerification);
router.get("/ads",                       ...guard, tr.getMyAds);
router.post("/ads",                      ...guard, tr.createAd);
router.patch("/ads/:id",                 ...guard, tr.toggleAd);
router.delete("/ads/:id",               ...guard, tr.deleteAd);
router.get("/trades",                    ...guard, tr.getMyTrades);
router.post("/trades/:id/accept",        ...guard, tr.acceptTrade);
router.post("/trades/:id/reject",        ...guard, tr.rejectTrade);
router.post("/trades/:id/outcome",       ...guard, tr.setOutcome);
router.get("/earnings",                  ...guard, tr.getEarnings);
router.post("/withdraw",                 ...guard, tr.withdrawEarnings);
router.post("/wallet",                   ...guard, tr.saveWallet);
router.post("/profile",                  ...guard, tr.updateProfile);

module.exports = router;
