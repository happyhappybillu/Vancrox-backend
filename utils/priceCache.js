/**
 * VANCROX Price Cache
 * Fetches all symbols once, serves all users
 * Gold/Silver: Twelve Data (800/day — 1 call per refresh)
 * BTC/ETH: Binance (unlimited)
 * EUR/GBP: Frankfurter (unlimited)
 */

var https = require("https");
var TWELVE_KEY = process.env.TWELVE_DATA_KEY || "2c9d560d29294b25bbb5e9b29d016542";

// Cache object
var PRICE_CACHE = {
  XAUUSD:  0,
  BTCUSDT: 0,
  EURUSD:  0,
  GBPUSD:  0,
  updatedAt: null
};

function fetchJson(url) {
  return new Promise(function(resolve) {
    https.get(url, { timeout: 10000 }, function(res) {
      var body = "";
      res.on("data", function(c){ body += c; });
      res.on("end", function(){
        try { resolve(JSON.parse(body)); }
        catch(e){ resolve(null); }
      });
    }).on("error", function(){ resolve(null); });
  });
}

async function refreshPrices() {
  try {
    // 1. Gold — Twelve Data (1 call)
    var gold = await fetchJson(
      "https://api.twelvedata.com/price?symbol=XAU/USD&apikey=" + TWELVE_KEY
    );
    if (gold && gold.price) {
      PRICE_CACHE.XAUUSD = parseFloat(gold.price);
    }

    // 2. BTC — Binance (unlimited, free)
    var btc = await fetchJson(
      "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
    );
    if (btc && btc.price) {
      PRICE_CACHE.BTCUSDT = parseFloat(btc.price);
    }

    // 3. EUR/USD + GBP/USD — Frankfurter (both in 1 call, inversion method)
    var forexData = await fetchJson("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP");
    if (forexData && forexData.rates) {
      if (forexData.rates.EUR && forexData.rates.EUR > 0) {
        PRICE_CACHE.EURUSD = parseFloat((1 / forexData.rates.EUR).toFixed(5));
      }
      if (forexData.rates.GBP && forexData.rates.GBP > 0) {
        PRICE_CACHE.GBPUSD = parseFloat((1 / forexData.rates.GBP).toFixed(5));
      }
    }
    // Fallback: direct calls if combined failed
    if (!PRICE_CACHE.EURUSD) {
      var eurDirect = await fetchJson("https://api.frankfurter.app/latest?from=EUR&to=USD");
      if (eurDirect && eurDirect.rates && eurDirect.rates.USD) {
        PRICE_CACHE.EURUSD = parseFloat(eurDirect.rates.USD.toFixed(5));
      }
    }
    if (!PRICE_CACHE.GBPUSD) {
      var gbpDirect = await fetchJson("https://api.frankfurter.app/latest?from=GBP&to=USD");
      if (gbpDirect && gbpDirect.rates && gbpDirect.rates.USD) {
        PRICE_CACHE.GBPUSD = parseFloat(gbpDirect.rates.USD.toFixed(5));
      }
    }

    PRICE_CACHE.updatedAt = new Date().toISOString();
    console.log("✅ Prices updated:", JSON.stringify(PRICE_CACHE));
  } catch (e) {
    console.error("Price cache refresh error:", e.message);
  }
}

// Refresh every 15 seconds
function startPriceCache() {
  refreshPrices();
  setInterval(refreshPrices, 15000);
  console.log("📈 Price cache started (refresh every 15s)");
}

function getPrices() {
  return PRICE_CACHE;
}

function getPrice(symbol) {
  return PRICE_CACHE[symbol] || 0;
}

module.exports = { startPriceCache, getPrices, getPrice };
