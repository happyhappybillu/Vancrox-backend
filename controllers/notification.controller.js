const Notification = require("../models/Notification");
const PushSubscription = require("../models/PushSubscription");

/* ── GET ALL (investor side) — only own + general ── */
exports.getAll = async (req, res) => {
  try {
    const notifications = await Notification.find({
      $or: [{ userId: null }, { userId: req.user._id }]
    }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, notifications: notifications || [] });
  } catch (e) {
    console.error("getAll notif:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── SUBSCRIBE — save push subscription ── */
exports.subscribe = async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription) return res.status(400).json({ message: "No subscription" });
    // Upsert — one per user (update if exists)
    await PushSubscription.findOneAndUpdate(
      { userId: req.user._id },
      { userId: req.user._id, subscription },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (e) {
    console.error("subscribe push:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── GET ALL (admin side) ── */
exports.adminGetAll = async (req, res) => {
  try {
    const notifications = await Notification.find()
      .sort({ createdAt: -1 }).lean();
    res.json({ success: true, notifications: notifications || [] });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ── CREATE (admin broadcast) ── */
exports.create = async (req, res) => {
  try {
    const { title, message, image } = req.body;
    if (!title || !message)
      return res.status(400).json({ message: "Title and message required" });
    const notif = await Notification.create({
      title: title.trim(), message: message.trim(), image: image || "", type: "general"
    });
    res.json({ success: true, message: "Notification sent", notification: notif });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ── UPDATE ── */
exports.update = async (req, res) => {
  try {
    const { title, message, image } = req.body;
    const notif = await Notification.findByIdAndUpdate(
      req.params.id, { title, message, image: image || "" }, { new: true }
    );
    if (!notif) return res.status(404).json({ message: "Not found" });
    res.json({ success: true, notification: notif });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ── DELETE ── */
exports.remove = async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};
