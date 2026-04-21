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

router.get("/search-users", protect, requireRole("admin"), adm.searchUsers);
router.delete("/delete-user", protect, requireRole("admin"), adm.deleteUser);
router.post("/adjust-balance", adm.adjustBalance);
// Announcements
const ann = require("../controllers/announcement.controller");
router.post("/announcements", ann.createAnnouncement);
router.get("/announcements", ann.listAnnouncements);
router.delete("/announcements/:id", ann.deleteAnnouncement);
router.patch("/announcements/:id/toggle", ann.toggleAnnouncement);
// Tournaments
const tourn = require("../controllers/tournament.controller");
router.post("/tournaments", tourn.adminCreate);
router.get("/tournaments", tourn.adminList);
router.put("/tournaments/:id", tourn.adminUpdate);
router.delete("/tournaments/:id", tourn.adminDelete);
router.post("/tournaments/:id/result", tourn.adminResult);
module.exports = router;
