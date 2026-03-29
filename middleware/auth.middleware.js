const jwt  = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "vancroxJWT@2026#SuperSecret";

/* ── PROTECT ── */
exports.protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
      return res.status(401).json({ message: "Not authorized, token missing" });

    const token = header.split(" ")[1];
    let decoded;
    try { decoded = jwt.verify(token, JWT_SECRET); }
    catch { return res.status(401).json({ message: "Invalid or expired token" }); }

    /* master admin */
    if (decoded.id === "master_admin") {
      req.user = { _id: "master_admin", id: "master_admin", role: "admin", name: "System Admin" };
      return next();
    }

    const user = await User.findById(decoded.id).select("-password");
    if (!user) return res.status(401).json({ message: "User not found" });
    if (user.isBlocked) return res.status(403).json({ message: "Your account has been temporarily suspended" });

    req.user = user;
    next();
  } catch (err) {
    console.error("Auth Middleware:", err);
    res.status(401).json({ message: "Authorization failed" });
  }
};

/* ── REQUIRE ROLE ── */
exports.requireRole = (...roles) => (req, res, next) => {
  if (req.user?.id === "master_admin") return next();
  if (!roles.includes(req.user?.role))
    return res.status(403).json({ message: "Access denied" });
  next();
};
