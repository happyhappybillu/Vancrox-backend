/**
 * VANCROX Price Cache
 * Gold: Twelve Data (800/day → call every 90s = ~960/day, fine)
 * BTC: Binance (unlimited)
 * EUR/GBP: Binance EURUSDT/GBPUSDT (unlimited, real-time)
 */

var https = require("https");
var TWELVE_KEY = process.env.TWELVE_DATA_KEY || "2c9d560d29294b25bbb5e9b29d016542";
var callCount = 0;

var PRICE_CACHE = {
  XAUUSD:  0,
  BTCUSDT: 0,
  EURUSD:  0,
  GBPUSD:  0,
  updatedAt: null
};

function fetchJson(url) {
  return new Promise(function(resolve) {
    https.get(url, { timeout: 8000 }, function(res) {
      var body = "";
      res.on("data", function(c){ body += c; });
      res.on("end", function(){
        try { resolve(JSON.parse(body)); }
        catch(e){ resolve(null); }
      });
    }).on("error", function(){ resolve(null); })
      .on("timeout", function(){ resolve(null); });
  });
}

// Gold — Twelve Data (call only every 2nd cycle = every 30s)
var _goldCycle = 0;
async function refreshGold() {
  try {
    var d = await fetchJson("https://api.twelvedata.com/price?symbol=XAU/USD&apikey=" + TWELVE_KEY);
    if (d && d.price && parseFloat(d.price) > 100) {
      PRICE_CACHE.XAUUSD = parseFloat(d.price);
      callCount++;
    }
  } catch(e) {}
}

// BTC — Binance (every cycle, unlimited)
async function refreshBTC() {
  try {
    var d = await fetchJson("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    if (d && d.price && parseFloat(d.price) > 1000) {
      PRICE_CACHE.BTCUSDT = parseFloat(d.price);
    }
  } catch(e) {}
}

// EUR/USD — Binance EURUSDT (unlimited, real-time)
async function refreshEUR() {
  try {
    var d = await fetchJson("https://api.binance.com/api/v3/ticker/price?symbol=EURUSDT");
    if (d && d.price) {
      var p = parseFloat(d.price);
      if (p > 0.5 && p < 2) PRICE_CACHE.EURUSD = parseFloat(p.toFixed(5));
    }
  } catch(e) {}
}

// GBP/USD — Binance GBPUSDT (unlimited, real-time)
async function refreshGBP() {
  try {
    var d = await fetchJson("https://api.binance.com/api/v3/ticker/price?symbol=GBPUSDT");
    if (d && d.price) {
      var p = parseFloat(d.price);
      if (p > 0.5 && p < 2) PRICE_CACHE.GBPUSD = parseFloat(p.toFixed(5));
    }
  } catch(e) {}
}

async function refreshPrices() {
  try {
    // BTC, EUR, GBP every 15s (unlimited APIs)
    await refreshBTC();
    await refreshEUR();
    await refreshGBP();

    // Gold every 90s (to stay within 800 calls/day limit)
    _goldCycle++;
    if (_goldCycle >= 6) { // every 6th cycle = every 90s
      _goldCycle = 0;
      await refreshGold();
    }

    PRICE_CACHE.updatedAt = new Date().toISOString();
    console.log("✅ Prices:", JSON.stringify(PRICE_CACHE));
  } catch(e) {
    console.error("priceCache error:", e.message);
  }
}

function startPriceCache() {
  // First run: fetch gold immediately too
  refreshGold();
  refreshBTC();
  refreshEUR();
  refreshGBP();
  PRICE_CACHE.updatedAt = new Date().toISOString();

  setInterval(refreshPrices, 15000);
  console.log("📈 Price cache started (BTC/EUR/GBP: 15s | Gold: 90s)");
}

function getPrices() { return PRICE_CACHE; }
function getPrice(symbol) { return PRICE_CACHE[symbol] || 0; }

module.exports = { startPriceCache, getPrices, getPrice };
