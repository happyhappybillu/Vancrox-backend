const router = require("express").Router();
const notif  = require("../controllers/notification.controller");
const { protect, requireRole } = require("../middleware/auth.middleware");

/* Investor/Trader — read all notifications (any logged-in user) */
router.get("/",        protect, notif.getAll);

/* Admin only — manage notifications */
router.get("/admin",   protect, requireRole("admin"), notif.adminGetAll);
router.post("/",       protect, requireRole("admin"), notif.create);
router.put("/:id",     protect, requireRole("admin"), notif.update);
router.delete("/:id",  protect, requireRole("admin"), notif.remove);

module.exports = router;
