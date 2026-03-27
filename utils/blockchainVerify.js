/**
 * VANCROX — Blockchain Auto-Verify
 * TRC20 → TronGrid | ERC20 → Etherscan | BEP20 → BscScan
 */

const https = require("https");

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port:     443,
      path:     urlObj.pathname + urlObj.search,
      method:   "GET",
      headers:  { "User-Agent": "VancroxBot/1.0", ...headers },
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { console.error("JSON parse error:", e.message, "raw:", raw.slice(0,200)); resolve(null); }
      });
    });
    req.on("error", (e) => { console.error("HTTP error:", e.message); reject(e); });
    req.setTimeout(15000, () => { console.error("HTTP timeout"); req.destroy(); });
    req.end();
  });
}

const CONTRACTS = {
  TRC20: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  ERC20: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  BEP20: "0x55d398326f99059fF775485246999027B3197955",
};

async function checkTRC20(walletAddress, expectedAmount) {
  try {
    const apiKey = process.env.TRONGRID_API_KEY;
    if (!apiKey) { console.error("TRONGRID_API_KEY missing"); return null; }

    // Check last 4 hours
    const minTs = Date.now() - 4 * 60 * 60 * 1000;
    const url = `https://api.trongrid.io/v1/accounts/${walletAddress}/transactions/trc20` +
      `?contract_address=${CONTRACTS.TRC20}&limit=50&only_confirmed=true&min_timestamp=${minTs}`;

    console.log(`🔍 TRC20 scan: wallet=${walletAddress.slice(0,10)}... expect=${expectedAmount}`);
    const data = await httpGet(url, { "TRON-PRO-API-KEY": apiKey });

    if (!data) { console.error("TRC20: null response from API"); return null; }
    if (!data.data) { console.error("TRC20 API response:", JSON.stringify(data).slice(0,300)); return null; }

    console.log(`TRC20: ${data.data.length} txns found`);

    for (const tx of data.data) {
      if (tx.token_info?.symbol !== "USDT") continue;
      const toAddr = (tx.to || "").toString();
      if (toAddr.toLowerCase() !== walletAddress.toLowerCase()) continue;
      const amount = parseFloat(tx.value) / 1e6;
      console.log(`  TRC20 tx: ${amount} USDT (expect ${expectedAmount}, diff=${Math.abs(amount-expectedAmount)})`);
      if (Math.abs(amount - expectedAmount) < 0.01) {
        return { found: true, txHash: tx.transaction_id, amount, confirmations: 1, network: "TRC20" };
      }
    }
    return null;
  } catch (err) {
    console.error("TRC20 check error:", err.message);
    return null;
  }
}

async function checkERC20(walletAddress, expectedAmount) {
  try {
    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) { console.error("ETHERSCAN_API_KEY missing"); return null; }

    const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx` +
      `&contractaddress=${CONTRACTS.ERC20}&address=${walletAddress}` +
      `&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;

    console.log(`🔍 ERC20 scan: wallet=${walletAddress.slice(0,10)}... expect=${expectedAmount}`);
    const data = await httpGet(url);
    if (!data?.result || !Array.isArray(data.result)) {
      console.error("ERC20 API error:", JSON.stringify(data).slice(0,300)); return null;
    }
    console.log(`ERC20: ${data.result.length} txns found`);

    const cutoff = Math.floor(Date.now() / 1000) - 4 * 60 * 60;
    for (const tx of data.result) {
      if (parseInt(tx.timeStamp) < cutoff) break;
      if (tx.to.toLowerCase() !== walletAddress.toLowerCase()) continue;
      const amount = parseFloat(tx.value) / 1e6;
      console.log(`  ERC20 tx: ${amount} USDT`);
      if (Math.abs(amount - expectedAmount) < 0.01) {
        return { found: true, txHash: tx.hash, amount, confirmations: parseInt(tx.confirmations || 0), network: "ERC20" };
      }
    }
    return null;
  } catch (err) {
    console.error("ERC20 check error:", err.message);
    return null;
  }
}

async function checkBEP20(walletAddress, expectedAmount) {
  try {
    const apiKey = process.env.BSCSCAN_API_KEY;
    if (!apiKey) { console.error("BSCSCAN_API_KEY missing"); return null; }

    const url = `https://api.bscscan.com/api?module=account&action=tokentx` +
      `&contractaddress=${CONTRACTS.BEP20}&address=${walletAddress}` +
      `&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;

    console.log(`🔍 BEP20 scan: wallet=${walletAddress.slice(0,10)}... expect=${expectedAmount}`);
    const data = await httpGet(url);
    if (!data?.result || !Array.isArray(data.result)) {
      console.error("BEP20 API error:", JSON.stringify(data).slice(0,300)); return null;
    }
    console.log(`BEP20: ${data.result.length} txns found`);

    const cutoff = Math.floor(Date.now() / 1000) - 4 * 60 * 60;
    for (const tx of data.result) {
      if (parseInt(tx.timeStamp) < cutoff) break;
      if (tx.to.toLowerCase() !== walletAddress.toLowerCase()) continue;
      const amount = parseFloat(tx.value) / 1e18;
      console.log(`  BEP20 tx: ${amount} USDT`);
      if (Math.abs(amount - expectedAmount) < 0.01) {
        return { found: true, txHash: tx.hash, amount, confirmations: parseInt(tx.confirmations || 0), network: "BEP20" };
      }
    }
    return null;
  } catch (err) {
    console.error("BEP20 check error:", err.message);
    return null;
  }
}

async function verifyDeposit({ network, uniqueAmount }) {
  const wallet = process.env[`WALLET_${network}`];
  if (!wallet) { console.error(`WALLET_${network} not set in .env`); return null; }

  console.log(`\n🔗 verifyDeposit: network=${network} amount=${uniqueAmount} wallet=${wallet.slice(0,12)}...`);

  let result = null;
  if (network === "TRC20") result = await checkTRC20(wallet, uniqueAmount);
  if (network === "ERC20") result = await checkERC20(wallet, uniqueAmount);
  if (network === "BEP20") result = await checkBEP20(wallet, uniqueAmount);

  if (!result?.found) { console.log(`❌ Not found on ${network}`); return null; }
  console.log(`✅ FOUND on ${network}: txHash=${result.txHash}`);
  return result;
}

module.exports = { verifyDeposit };
