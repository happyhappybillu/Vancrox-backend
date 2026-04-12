const Notification = require("../models/Notification");
const PushSubscription = require("../models/PushSubscription");

/* ── INVESTOR: GET own + general notifications ── */
exports.getAll = async (req, res) => {
  try {
    const notifications = await Notification.find({
      $or: [
        { userId: null, type: "general" },
        { userId: { $exists: false } },
        { userId: req.user._id }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

    res.json({ success: true, notifications: notifications || [] });
  } catch (e) {
    console.error("getAll notif:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── SUBSCRIBE — save browser push subscription ── */
exports.subscribe = async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription) return res.status(400).json({ message: "No subscription" });
    await PushSubscription.findOneAndUpdate(
      { userId: req.user._id },
      { userId: req.user._id, subscription },
      { upsert: true, new: true }
    );
    console.log("✅ Push subscription saved for user:", req.user._id);
    res.json({ success: true });
  } catch (e) {
    console.error("subscribe push:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── ADMIN: GET ONLY admin-created notifications ── */
exports.adminGetAll = async (req, res) => {
  try {
    // Only show general broadcast notifications created by admin
    const notifications = await Notification.find({
      type: "general",
      userId: null
    })
    .sort({ createdAt: -1 })
    .lean();
    res.json({ success: true, notifications: notifications || [] });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ── ADMIN: CREATE BROADCAST ── */
exports.create = async (req, res) => {
  try {
    const { title, message, image } = req.body;
    if (!title || !message)
      return res.status(400).json({ message: "Title and message required" });
    const notif = await Notification.create({
      title: title.trim(),
      message: message.trim(),
      image: image || "",
      type: "general",
      userId: null
    });
    res.json({ success: true, message: "Notification sent to all", notification: notif });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ── ADMIN: UPDATE ── */
exports.update = async (req, res) => {
  try {
    const { title, message, image } = req.body;
    const notif = await Notification.findByIdAndUpdate(
      req.params.id,
      { title, message, image: image || "" },
      { new: true }
    );
    if (!notif) return res.status(404).json({ message: "Not found" });
    res.json({ success: true, notification: notif });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ── ADMIN: DELETE ── */
exports.remove = async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};
