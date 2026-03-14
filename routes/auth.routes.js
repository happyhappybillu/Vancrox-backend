const router = require("express").Router();
const auth   = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth.middleware");

router.post("/register/investor", auth.registerInvestor);
router.post("/register/trader",   auth.registerTrader);
router.post("/login",             auth.login);
router.post("/admin/login",       auth.adminLogin);
router.get("/me",                 protect, auth.me);
router.post("/change-password",   protect, auth.changePassword);

module.exports = router;
