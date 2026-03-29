const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const User   = require("../models/User");
const { generateUID, generateTID } = require("../utils/uidTid");

const JWT_SECRET = process.env.JWT_SECRET || "vancroxJWT@2026#SuperSecret";
const JWT_EXPIRE = "7d";

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRE });

/* ── REGISTER INVESTOR ── */
exports.registerInvestor = async (req, res) => {
  try {
    let { name, email, mobile, password, refCode } = req.body;
    if (!name || !password)         return res.status(400).json({ message: "Name & password required" });
    if (!email && !mobile)          return res.status(400).json({ message: "Email or mobile required" });

    name   = String(name).trim();
    email  = email  ? String(email).trim().toLowerCase()  : null;
    mobile = mobile ? String(mobile).trim()               : null;

    const exists = await User.findOne({ $or: [...(email?[{email}]:[]), ...(mobile?[{mobile}]:[]) ] });
    if (exists) return res.status(400).json({ message: "User already exists" });

    const uid  = await generateUID();
    const hash = await bcrypt.hash(String(password), 10);

    /* ── REFER CODE LOOKUP ── */
    let referrerId = null;
    if (refCode) {
      const code = String(refCode).trim().toUpperCase();
      console.log(`🔗 Register with refCode: "${code}"`);

      /* Try 1: exact referCode field match */
      let referrer = await User.findOne({ referCode: code });

      /* Try 2: UID+number → search by uid number */
      if (!referrer && code.startsWith("UID")) {
        const uidNum = parseInt(code.replace("UID", ""), 10);
        if (!isNaN(uidNum)) {
          referrer = await User.findOne({ uid: uidNum, role: "investor" });
          console.log(`🔍 Fallback uid lookup: uid=${uidNum} → found=${!!referrer}`);
        }
      }

      if (referrer) {
        referrerId = referrer._id;
        console.log(`✅ Referrer found: ${referrer.name} (UID${referrer.uid})`);
        /* Auto-fix referCode if empty */
        if (!referrer.referCode) {
          await User.findByIdAndUpdate(referrer._id, { referCode: "UID" + referrer.uid });
          console.log(`🔧 Auto-fixed referCode for ${referrer.name}`);
        }
      } else {
        console.log(`❌ No referrer found for code: "${code}"`);
      }
    }

    const user = await User.create({
      role: "investor", name, email, mobile, password: hash, uid, balance: 0,
      referCode:  "UID" + uid,
      referredBy: referrerId,
    });

    if (referrerId) {
      console.log(`🎉 New user ${name} (UID${uid}) registered via refer — referredBy: ${referrerId}`);
    }

    const token = signToken(user);

    res.json({ success: true, token, role: "investor", uid: user.uid, name: user.name });
  } catch (e) {
    console.error("Register Investor:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── REGISTER TRADER ── */
exports.registerTrader = async (req, res) => {
  try {
    let { name, email, mobile, password } = req.body;
    if (!name || !password)    return res.status(400).json({ message: "Name & password required" });
    if (!email && !mobile)     return res.status(400).json({ message: "Email or mobile required" });

    name   = String(name).trim();
    email  = email  ? String(email).trim().toLowerCase() : null;
    mobile = mobile ? String(mobile).trim()              : null;

    const exists = await User.findOne({ $or: [...(email?[{email}]:[]), ...(mobile?[{mobile}]:[]) ] });
    if (exists) return res.status(400).json({ message: "User already exists" });

    const tid  = await generateTID();
    const hash = await bcrypt.hash(String(password), 10);

    const user = await User.create({
      role: "trader", name, email, mobile, password: hash, tid,
      traderVerificationStatus: "NOT_SUBMITTED", securityMoney: 0, traderLevel: 1,
    });
    const token = signToken(user);

    res.json({ success: true, token, role: "trader", tid: user.tid, name: user.name });
  } catch (e) {
    console.error("Register Trader:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── LOGIN ── */
exports.login = async (req, res) => {
  try {
    const { emailOrMobile, password } = req.body;
    if (!emailOrMobile || !password) return res.status(400).json({ message: "Credentials required" });

    const id = String(emailOrMobile).trim().toLowerCase();
    const user = await User.findOne({ $or: [{ email: id }, { mobile: id }] }).select("+password");

    if (!user)          return res.status(400).json({ message: "Invalid credentials" });
    if (user.isBlocked) return res.status(403).json({ message: "Your account has been temporarily suspended" });

    const match = await bcrypt.compare(String(password), String(user.password));
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user);
    res.json({
      success: true, token,
      role: user.role, uid: user.uid || null, tid: user.tid || null,
      name: user.name, email: user.email, mobile: user.mobile,
    });
  } catch (e) {
    console.error("Login:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── ADMIN LOGIN ── */
exports.adminLogin = async (req, res) => {
  try {
    const { emailOrMobile, password } = req.body;
    if (!emailOrMobile || !password) return res.status(400).json({ message: "Credentials required" });

    if (emailOrMobile !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASS)
      return res.status(401).json({ message: "Invalid admin credentials" });

    const token = jwt.sign({ id: "master_admin", role: "admin" }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
    res.json({ success: true, token, role: "admin", name: "System Admin" });
  } catch (e) {
    console.error("Admin Login:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── ME ── */
exports.me = async (req, res) => {
  try {
    if (req.user.id === "master_admin")
      return res.json({ success: true, user: { role: "admin", name: "System Admin" } });

    const user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    res.json({ success: true, user });
  } catch (e) {
    console.error("Me:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── CHANGE PASSWORD ── */
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ message: "Both passwords required" });

    const user = await User.findById(req.user._id).select("+password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const ok = await bcrypt.compare(String(oldPassword), String(user.password));
    if (!ok) return res.status(400).json({ message: "Old password incorrect" });

    user.password = await bcrypt.hash(String(newPassword), 10);
    await user.save();

    res.json({ success: true, message: "Password updated" });
  } catch (e) {
    console.error("Change Password:", e);
    res.status(500).json({ message: "Server error" });
  }
};
