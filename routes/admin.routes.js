const router = require("express").Router();
const adm    = require("../controllers/admin.controller");
const sup    = require("../controllers/support.controller");
const { protect, requireRole } = require("../middleware/auth.middleware");

const guard = [protect, requireRole("admin")];

/* Users */
router.get("/investors",                  ...guard, adm.getInvestors);
router.get("/traders",                    ...guard, adm.getTraders);
router.post("/users/:id/block",           ...guard, adm.blockUser);
router.post("/traders/:id/verify",        ...guard, adm.verifyTrader);

/* Approvals */
router.get("/approvals",                  ...guard, adm.getApprovals);
router.post("/approvals/:id/approve",     ...guard, adm.approveItem);
router.post("/approvals/:id/reject",      ...guard, adm.rejectItem);
router.post("/approvals/:id/close",       ...guard, adm.closeDeposit);

/* Wallet Addresses */
router.get("/addresses",                  ...guard, adm.getAddresses);
router.post("/addresses",                 ...guard, adm.saveAddresses);

/* Reports */
router.get("/reports/deposits",           ...guard, adm.reportDeposits);
router.get("/reports/withdrawals",        ...guard, adm.reportWithdrawals);

/* Support Tickets */
router.get("/tickets",                    ...guard, sup.adminGetAll);
router.post("/tickets/:id/reply",         ...guard, sup.adminReply);
router.post("/tickets/:id/close",         ...guard, sup.adminClose);

module.exports = router;
