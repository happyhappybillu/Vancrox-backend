const router = require("express").Router();
const sup    = require("../controllers/support.controller");
const { protect } = require("../middleware/auth.middleware");

/* User (investor / trader) */
router.get("/my-ticket", protect, sup.myTicket);
router.post("/send",     protect, sup.sendMessage);
router.post("/resolve",  protect, sup.resolveTicket);

module.exports = router;
