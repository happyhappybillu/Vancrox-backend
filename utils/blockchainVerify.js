/**
 * VANCROX — Blockchain Auto-Verify Service
 *
 * TRC20 → TronGrid API     → TRONGRID_API_KEY   (trongrid.io)
 * ERC20 → Etherscan V2 API → ETHERSCAN_API_KEY  (etherscan.io)
 * BEP20 → BscScan API      → BSCSCAN_API_KEY    (bscscan.com)
 *
 * Alag-alag keys = alag rate limits = no conflict
 */

const https = require("https");

/* ─────────────────────────────────────────────
   HELPER — HTTPS GET → JSON
───────────────────────────────────────────── */
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      headers,
    };
    https
      .get(options, (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try { resolve(JSON.parse(raw)); }
          catch { resolve(null); }
        });
      })
      .on("error", reject);
  });
}

/* ─────────────────────────────────────────────
   USDT CONTRACT ADDRESSES
───────────────────────────────────────────── */
const CONTRACTS = {
  TRC20: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",           // TRON
  ERC20: "0xdAC17F958D2ee523a2206206994597C13D831ec7",     // Ethereum (6 decimals)
  BEP20: "0x55d398326f99059fF775485246999027B3197955",     // BSC      (18 decimals)
};

/* ─────────────────────────────────────────────
   REQUIRED CONFIRMATIONS
───────────────────────────────────────────── */
const REQUIRED_CONFS = {
  TRC20: 1,
  ERC20: 6,
  BEP20: 3,
};

/* ─────────────────────────────────────────────
   1. TRC20 — TronGrid
   Key: TRONGRID_API_KEY
   Docs: https://developers.tron.network
───────────────────────────────────────────── */
async function checkTRC20(walletAddress, expectedAmount) {
  try {
    const apiKey = process.env.TRONGRID_API_KEY;
    if (!apiKey) throw new Error("TRONGRID_API_KEY missing in .env");

    const url =
      `https://api.trongrid.io/v1/accounts/${walletAddress}/transactions/trc20` +
      `?contract_address=${CONTRACTS.TRC20}` +
      `&limit=20` +
      `&only_confirmed=true` +
      `&min_timestamp=${Date.now() - 2 * 60 * 60 * 1000}`; // last 2 hours

    const data = await httpGet(url, { "TRON-PRO-API-KEY": apiKey });
    if (!data?.data) return null;

    for (const tx of data.data) {
      if (tx.token_info?.symbol !== "USDT") continue;
      if (tx.to.toLowerCase() !== walletAddress.toLowerCase()) continue;

      const amount = parseFloat(tx.value) / 1e6; // USDT = 6 decimals on TRON
      if (Math.abs(amount - expectedAmount) < 0.001) {
        return {
          found:         true,
          txHash:        tx.transaction_id,
          amount,
          confirmations: 1, // confirmed = 1 on TRON
          network:       "TRC20",
        };
      }
    }
    return null;
  } catch (err) {
    console.error("TRC20 check error:", err.message);
    return null;
  }
}

/* ─────────────────────────────────────────────
   2. ERC20 — Etherscan V2 (chainid=1, Ethereum)
   Key: ETHERSCAN_API_KEY  (separate from BSC)
   Docs: https://api.etherscan.io/v2/api?chainid=1
───────────────────────────────────────────── */
async function checkERC20(walletAddress, expectedAmount) {
  try {
    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) throw new Error("ETHERSCAN_API_KEY missing in .env");

    const url =
      `https://api.etherscan.io/v2/api` +
      `?chainid=1` +
      `&module=account` +
      `&action=tokentx` +
      `&contractaddress=${CONTRACTS.ERC20}` +
      `&address=${walletAddress}` +
      `&startblock=0&endblock=99999999` +
      `&sort=desc` +
      `&apikey=${apiKey}`;

    const data = await httpGet(url);
    if (!data?.result || !Array.isArray(data.result)) return null;
    if (data.status === "0" && data.message !== "No transactions found") {
      console.error("ERC20 Etherscan error:", data.message);
      return null;
    }

    const cutoff = Math.floor(Date.now() / 1000) - 2 * 60 * 60;

    for (const tx of data.result) {
      if (parseInt(tx.timeStamp) < cutoff) break;
      if (tx.to.toLowerCase() !== walletAddress.toLowerCase()) continue;
      if (tx.contractAddress.toLowerCase() !== CONTRACTS.ERC20.toLowerCase()) continue;

      const amount = parseFloat(tx.value) / 1e6; // Ethereum USDT = 6 decimals
      if (Math.abs(amount - expectedAmount) < 0.001) {
        return {
          found:         true,
          txHash:        tx.hash,
          amount,
          confirmations: parseInt(tx.confirmations || 0),
          network:       "ERC20",
        };
      }
    }
    return null;
  } catch (err) {
    console.error("ERC20 check error:", err.message);
    return null;
  }
}

/* ─────────────────────────────────────────────
   3. BEP20 — BscScan (BSC, chainid=56)
   Key: BSCSCAN_API_KEY  (separate from Etherscan)
   Docs: https://api.bscscan.com/api
───────────────────────────────────────────── */
async function checkBEP20(walletAddress, expectedAmount) {
  try {
    const apiKey = process.env.BSCSCAN_API_KEY;
    if (!apiKey) throw new Error("BSCSCAN_API_KEY missing in .env");

    const url =
      `https://api.bscscan.com/api` +
      `?module=account` +
      `&action=tokentx` +
      `&contractaddress=${CONTRACTS.BEP20}` +
      `&address=${walletAddress}` +
      `&startblock=0&endblock=99999999` +
      `&sort=desc` +
      `&apikey=${apiKey}`;

    const data = await httpGet(url);
    if (!data?.result || !Array.isArray(data.result)) return null;
    if (data.status === "0" && data.message !== "No transactions found") {
      console.error("BEP20 BscScan error:", data.message);
      return null;
    }

    const cutoff = Math.floor(Date.now() / 1000) - 2 * 60 * 60;

    for (const tx of data.result) {
      if (parseInt(tx.timeStamp) < cutoff) break;
      if (tx.to.toLowerCase() !== walletAddress.toLowerCase()) continue;
      if (tx.contractAddress.toLowerCase() !== CONTRACTS.BEP20.toLowerCase()) continue;

      const amount = parseFloat(tx.value) / 1e18; // BSC USDT = 18 decimals
      if (Math.abs(amount - expectedAmount) < 0.001) {
        return {
          found:         true,
          txHash:        tx.hash,
          amount,
          confirmations: parseInt(tx.confirmations || 0),
          network:       "BEP20",
        };
      }
    }
    return null;
  } catch (err) {
    console.error("BEP20 check error:", err.message);
    return null;
  }
}

/* ─────────────────────────────────────────────
   MAIN — verifyDeposit
───────────────────────────────────────────── */
async function verifyDeposit({ network, uniqueAmount }) {
  const wallets = {
    TRC20: process.env.WALLET_TRC20,
    ERC20: process.env.WALLET_ERC20,
    BEP20: process.env.WALLET_BEP20,
  };

  const wallet = wallets[network];
  if (!wallet) {
    console.error(`No wallet configured for ${network} in .env`);
    return null;
  }

  let result = null;
  if (network === "TRC20") result = await checkTRC20(wallet, uniqueAmount);
  if (network === "ERC20") result = await checkERC20(wallet, uniqueAmount);
  if (network === "BEP20") result = await checkBEP20(wallet, uniqueAmount);

  if (!result?.found) return null;

  const required = REQUIRED_CONFS[network] || 1;
  if (result.confirmations < required) {
    console.log(`⏳ ${network} tx found — ${result.confirmations}/${required} confirmations`);
    return null;
  }

  return result; // { found, txHash, amount, confirmations, network }
}

module.exports = { verifyDeposit };
