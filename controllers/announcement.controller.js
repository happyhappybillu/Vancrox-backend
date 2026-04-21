const Announcement = require("../models/Announcement");

/* Admin — create announcement */
exports.createAnnouncement = async (req, res) => {
  try {
    const { title, message, type, target, pinned } = req.body;
    if (!title || !message) return res.status(400).json({ message: "title and message required" });
    const ann = await Announcement.create({ title, message, type: type||"info", target: target||"all", pinned: !!pinned });
    res.json({ success: true, announcement: ann });
  } catch(e) {
    res.status(500).json({ message: "Server error" });
  }
};

/* Admin — list all */
exports.listAnnouncements = async (req, res) => {
  try {
    const anns = await Announcement.find().sort({ pinned: -1, createdAt: -1 }).lean();
    res.json({ success: true, announcements: anns });
  } catch(e) {
    res.status(500).json({ message: "Server error" });
  }
};

/* Admin — delete */
exports.deleteAnnouncement = async (req, res) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ message: "Server error" });
  }
};

/* Admin — toggle active */
exports.toggleAnnouncement = async (req, res) => {
  try {
    const ann = await Announcement.findById(req.params.id);
    if (!ann) return res.status(404).json({ message: "Not found" });
    ann.active = !ann.active;
    await ann.save();
    res.json({ success: true, active: ann.active });
  } catch(e) {
    res.status(500).json({ message: "Server error" });
  }
};

/* Investor/Trader — get active announcements */
exports.getActiveAnnouncements = async (req, res) => {
  try {
    const role = req.user?.role || "investor";
    const anns = await Announcement.find({
      active: true,
      target: { $in: ["all", role] }
    }).sort({ pinned: -1, createdAt: -1 }).lean();
    res.json({ success: true, announcements: anns });
  } catch(e) {
    res.status(500).json({ message: "Server error" });
  }
};
