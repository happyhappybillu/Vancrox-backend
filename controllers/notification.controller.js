const Notification = require("../models/Notification");

/* ── GET ALL (investor side) ── */
exports.getAll = async (req, res) => {
  try {
    const notifications = await Notification.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, notifications });
  } catch (e) {
    console.error("getAll notif:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── GET ALL (admin side) ── */
exports.adminGetAll = async (req, res) => {
  try {
    const notifications = await Notification.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, notifications });
  } catch (e) {
    console.error("adminGetAll notif:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── CREATE ── */
exports.create = async (req, res) => {
  try {
    const { title, message, image } = req.body;
    if (!title || !message) return res.status(400).json({ message: "Title and message required" });

    const notif = await Notification.create({ title, message, image: image || "" });
    res.json({ success: true, message: "Notification sent", notification: notif });
  } catch (e) {
    console.error("create notif:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── UPDATE ── */
exports.update = async (req, res) => {
  try {
    const { title, message, image } = req.body;
    const notif = await Notification.findByIdAndUpdate(
      req.params.id,
      { title, message, image: image || "" },
      { new: true }
    );
    if (!notif) return res.status(404).json({ message: "Not found" });
    res.json({ success: true, message: "Updated", notification: notif });
  } catch (e) {
    console.error("update notif:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── DELETE ── */
exports.remove = async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (e) {
    console.error("delete notif:", e);
    res.status(500).json({ message: "Server error" });
  }
};
