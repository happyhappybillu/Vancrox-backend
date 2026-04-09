const router = require("express").Router();
const { protect } = require("../middleware/auth.middleware");
const { getPrices, getPrice } = require("../utils/priceCache");

// GET /api/prices — all cached prices
router.get("/", protect, function(req, res) {
  res.json({ success: true, prices: getPrices() });
});

// GET /api/prices/:symbol — single price
router.get("/:symbol", protect, function(req, res) {
  var sym = req.params.symbol.toUpperCase();
  var price = getPrice(sym);
  res.json({ success: true, symbol: sym, price: price });
});

module.exports = router;
