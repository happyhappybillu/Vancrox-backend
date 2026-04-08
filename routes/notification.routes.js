const router = require("express").Router();
const notif  = require("../controllers/notification.controller");
const { protect, requireRole } = require("../middleware/auth.middleware");

/* Investor — read own + general notifications */
router.get("/",           protect, notif.getAll);

/* Investor — save push subscription */
router.post("/subscribe", protect, notif.subscribe);

/* Admin only */
router.get("/admin",      protect, requireRole("admin"), notif.adminGetAll);
router.post("/",          protect, requireRole("admin"), notif.create);
router.put("/:id",        protect, requireRole("admin"), notif.update);
router.delete("/:id",     protect, requireRole("admin"), notif.remove);

module.exports = router;
