/**
 * VANCROX Price Cache
 * Gold: Twelve Data | BTC: Binance | EUR/GBP: Multiple APIs with fallback
 */

var https = require("https");
var TWELVE_KEY = process.env.TWELVE_DATA_KEY || "2c9d560d29294b25bbb5e9b29d016542";

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
    }).on("error", function(e){
      console.log("fetchJson error:", url.slice(0,50), e.message);
      resolve(null);
    }).on("timeout", function(){
      resolve(null);
    });
  });
}

async function fetchEURGBP() {
  // Try 1: open.er-api.com (free, no key needed)
  try {
    var d = await fetchJson("https://open.er-api.com/v6/latest/USD");
    if (d && d.rates && d.rates.EUR && d.rates.GBP) {
      var eur = parseFloat((1 / d.rates.EUR).toFixed(5));
      var gbp = parseFloat((1 / d.rates.GBP).toFixed(5));
      if (eur > 0.5 && eur < 2) { PRICE_CACHE.EURUSD = eur; }
      if (gbp > 0.5 && gbp < 2) { PRICE_CACHE.GBPUSD = gbp; }
      if (PRICE_CACHE.EURUSD > 0 && PRICE_CACHE.GBPUSD > 0) return;
    }
  } catch(e) { console.log("er-api err:", e.message); }

  // Try 2: Frankfurter
  try {
    var d2 = await fetchJson("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP");
    if (d2 && d2.rates) {
      if (d2.rates.EUR > 0) PRICE_CACHE.EURUSD = parseFloat((1 / d2.rates.EUR).toFixed(5));
      if (d2.rates.GBP > 0) PRICE_CACHE.GBPUSD = parseFloat((1 / d2.rates.GBP).toFixed(5));
      if (PRICE_CACHE.EURUSD > 0 && PRICE_CACHE.GBPUSD > 0) return;
    }
  } catch(e) { console.log("frankfurter err:", e.message); }

  // Try 3: exchangerate.host
  try {
    var d3 = await fetchJson("https://api.exchangerate.host/live?source=USD&currencies=EUR,GBP&access_key=free");
    if (d3 && d3.quotes) {
      if (d3.quotes.USDEUR > 0) PRICE_CACHE.EURUSD = parseFloat((1 / d3.quotes.USDEUR).toFixed(5));
      if (d3.quotes.USDGBP > 0) PRICE_CACHE.GBPUSD = parseFloat((1 / d3.quotes.USDGBP).toFixed(5));
      if (PRICE_CACHE.EURUSD > 0 && PRICE_CACHE.GBPUSD > 0) return;
    }
  } catch(e) { console.log("exchangerate.host err:", e.message); }

  // Try 4: fixer.io free tier (hardcoded fallback rates if all APIs fail)
  if (!PRICE_CACHE.EURUSD) PRICE_CACHE.EURUSD = 1.08500;
  if (!PRICE_CACHE.GBPUSD) PRICE_CACHE.GBPUSD = 1.26500;
  console.log("⚠️ EUR/GBP using fallback rates");
}

async function refreshPrices() {
  try {
    // 1. Gold — Twelve Data
    var gold = await fetchJson(
      "https://api.twelvedata.com/price?symbol=XAU/USD&apikey=" + TWELVE_KEY
    );
    if (gold && gold.price && parseFloat(gold.price) > 0) {
      PRICE_CACHE.XAUUSD = parseFloat(gold.price);
    }

    // 2. BTC — Binance
    var btc = await fetchJson("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
    if (btc && btc.price && parseFloat(btc.price) > 0) {
      PRICE_CACHE.BTCUSDT = parseFloat(btc.price);
    }

    // 3. EUR/GBP — multiple sources with fallback
    await fetchEURGBP();

    PRICE_CACHE.updatedAt = new Date().toISOString();
    console.log("✅ Prices updated:", JSON.stringify(PRICE_CACHE));
  } catch (e) {
    console.error("Price cache refresh error:", e.message);
  }
}

function startPriceCache() {
  refreshPrices();
  setInterval(refreshPrices, 15000);
  console.log("📈 Price cache started (refresh every 15s)");
}

function getPrices() { return PRICE_CACHE; }
function getPrice(symbol) { return PRICE_CACHE[symbol] || 0; }

module.exports = { startPriceCache, getPrices, getPrice };
