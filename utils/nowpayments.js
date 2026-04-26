/**
 * VANCROX — NowPayments Integration
 */
const https = require("https");
const API_KEY    = process.env.NOWPAYMENTS_API_KEY;
const API_BASE   = "api.nowpayments.io";

function npRequest(method, path, body=null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: API_BASE, port: 443,
      path: "/v1" + path, method,
      headers: {
        "x-api-key": API_KEY,
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {})
      }
    };
    const req = https.request(opts, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch(e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("NowPayments timeout")); });
    if (data) req.write(data);
    req.end();
  });
}

/* Currency map — network/coin → NowPayments pay_currency */
const CURRENCY_MAP = {
  // Stablecoins
  TRC20:    "usdttrc20",
  ERC20:    "usdterc20",
  BEP20:    "usdtbsc",
  // Crypto
  BTC:      "btc",
  ETH:      "eth",
  BNB:      "bnbbsc",
  SOL:      "sol",
  XRP:      "xrp",
  ADA:      "ada",
  DOGE:     "doge",
  MATIC:    "maticpolygon",
  AVAX:     "avaxc",
  TON:      "ton",
};

async function createPayment({ amount, coin, orderId, description }) {
  const payCurrency = CURRENCY_MAP[coin];
  if (!payCurrency) throw new Error("Unsupported coin: " + coin);

  const body = {
    price_amount:      parseFloat(amount),
    price_currency:    "usd",
    pay_currency:      payCurrency,
    order_id:          orderId,
    order_description: description || "VANCROX Deposit",
    ipn_callback_url:  (process.env.BACKEND_URL || "https://vancrox.tech") + "/api/investor/nowpayments/webhook",
    is_fixed_rate:     false,
    is_fee_paid_by_user: false,
  };

  const res = await npRequest("POST", "/payment", body);
  if (res.status !== 201 && res.status !== 200) {
    console.error("NowPayments API error:", res.status, JSON.stringify(res.data).slice(0,200));
    throw new Error("NowPayments error " + res.status + ": " + (res.data?.message || JSON.stringify(res.data).slice(0,100)));
  }
  if (!res.data?.pay_address) {
    console.error("NowPayments no pay_address in response:", JSON.stringify(res.data).slice(0,300));
    throw new Error("Payment gateway did not return an address. Check NowPayments dashboard settings.");
  }
  return res.data;
}

async function getPaymentStatus(paymentId) {
  const res = await npRequest("GET", "/payment/" + paymentId);
  return res.data;
}

/* Verify IPN signature */
function verifyIPN(rawBody, receivedSig) {
  const crypto = require("crypto");
  const secret = process.env.NOWPAYMENTS_IPN_SECRET || "";
  try {
    const parsed = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
    const sorted = JSON.stringify(sortObject(parsed));
    const sig = crypto.createHmac("sha512", secret).update(sorted).digest("hex");
    console.log("IPN verify — expected:", sig.slice(0,20), "received:", receivedSig?.slice(0,20));
    return sig === receivedSig;
  } catch(e) {
    console.error("verifyIPN error:", e.message);
    return false;
  }
}

function sortObject(obj) {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sortObject);
  return Object.keys(obj).sort().reduce((acc, k) => { acc[k] = sortObject(obj[k]); return acc; }, {});
}

module.exports = { createPayment, getPaymentStatus, verifyIPN, CURRENCY_MAP };
