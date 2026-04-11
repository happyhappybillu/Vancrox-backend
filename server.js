require("dotenv").config();
const express    = require("express");
const { startPriceCache } = require("./utils/priceCache");
const cors       = require("cors");
const connectDB  = require("./config/db");
const cron       = require("node-cron");
const autoReject    = require("./utils/autoReject");
const depositCron   = require("./utils/depositCron");
const midnightReset = require("./utils/midnightReset");

const app = express();

/* ── DB ── */
connectDB().then(async () => {
  /* Auto-fix missing referCodes for existing users */
  try {
    const User = require("./models/User");
    const usersWithoutCode = await User.find({ role: "investor", $or: [{ referCode: "" }, { referCode: null }] });
    for (const u of usersWithoutCode) {
      await User.findByIdAndUpdate(u._id, { referCode: "UID" + u.uid });
    }
    if (usersWithoutCode.length > 0) {
      console.log(`✅ Fixed referCode for ${usersWithoutCode.length} existing users`);
    }
  } catch (e) {
    console.error("referCode fix error:", e.message);
  }

  // Migrate existing ads/trades — set default symbol if missing
  try {
    const Ad = require("./models/Ad");
    const Trade = require("./models/Trade");
    const validSyms = ["XAUUSD", "BTCUSDT", "EURUSD", "GBPUSD"];
    const adRes = await Ad.updateMany(
      { $or: [{ symbol: { $exists: false } }, { symbol: null }, { symbol: "" }, { symbol: { $nin: validSyms } }] },
      { $set: { symbol: "XAUUSD" } }
    );
    const trRes = await Trade.updateMany(
      { $or: [{ symbol: { $exists: false } }, { symbol: null }, { symbol: "" }, { symbol: { $nin: validSyms } }] },
      { $set: { symbol: "XAUUSD" } }
    );
    console.log(`✅ Symbol migration: ${adRes.modifiedCount} ads, ${trRes.modifiedCount} trades updated`);
  } catch (me) {
    console.log("Symbol migration skip:", me.message);
  }
});

/* ── MIDDLEWARE ── */
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

/* ── ROUTES ── */
app.use("/api/auth",          require("./routes/auth.routes"));
app.use("/api/investor",      require("./routes/investor.routes"));
app.use("/api/trader",        require("./routes/trader.routes"));
app.use("/api/admin",         require("./routes/admin.routes"));
app.use("/api/prices",        require("./routes/price.routes"));
app.use("/api/notifications", require("./routes/notification.routes"));
app.use("/api/support",       require("./routes/support.routes"));
app.use("/api/refer",         require("./routes/refer.routes"));

/* ── HEALTH ── */
app.get("/", (req, res) => res.json({ status: "VANCROX API Running ✅", time: new Date() }));

/* ── AUTO-REJECT CRON — every 30s ── */
cron.schedule("*/30 * * * * *", autoReject);

/* ── DEPOSIT AUTO-VERIFY CRON — every 1 minute ── */
cron.schedule("0 * * * * *", depositCron);
console.log("⛓️  Blockchain deposit verifier running (every 60s)");

/* ── MIDNIGHT RESET — every night at 00:00 ── */
cron.schedule("0 0 * * *", midnightReset);
console.log("🌙 Midnight reset scheduled (00:00 daily)");

/* ── START ── */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 VANCROX Server running on port ${PORT}`));
