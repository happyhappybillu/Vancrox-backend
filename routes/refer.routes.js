const router = require("express").Router();
const refer  = require("../controllers/refer.controller");
const { protect, requireRole } = require("../middleware/auth.middleware");

/* Investor */
router.get("/",        protect, refer.getMyRefer);
router.post("/withdraw", protect, refer.withdrawRefer);

/* Admin */
router.get("/admin/stats", protect, requireRole("admin"), refer.adminReferStats);

module.exports = router;
