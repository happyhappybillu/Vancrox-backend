const SupportTicket = require("../models/SupportTicket");

/* ── USER: GET MY TICKET ── */
exports.myTicket = async (req, res) => {
  try {
    /* Only return open ticket — closed tickets have cleared messages */
    let ticket = await SupportTicket.findOne({ 
      userId: req.user._id,
      status: "open"
    }).lean();
    res.json({ success: true, ticket: ticket || null });
  } catch (e) {
    console.error("myTicket:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── USER: SEND MESSAGE ── */
exports.sendMessage = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: "Message required" });

    const user = req.user;
    let ticket = await SupportTicket.findOne({ userId: user._id, status: "open" });

    if (!ticket) {
      ticket = new SupportTicket({
        userId:     user._id,
        userName:   user.name,
        userRole:   user.role,
        userId_num: user.uid || user.tid || null,
        status:     "open",
        messages:   [],
      });
    }

    ticket.messages.push({ from: "user", text: message.trim() });
    await ticket.save();

    res.json({ success: true, ticket });
  } catch (e) {
    console.error("sendMessage:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── USER: RESOLVE TICKET ── */
exports.resolveTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ userId: req.user._id, status: "open" });
    if (!ticket) return res.status(404).json({ message: "No open ticket" });

    ticket.status   = "closed";
    ticket.messages = []; // clear chat history on close
    await ticket.save();

    res.json({ success: true, message: "Ticket closed" });
  } catch (e) {
    console.error("resolveTicket:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── ADMIN: GET ALL TICKETS ── */
exports.adminGetAll = async (req, res) => {
  try {
    const tickets = await SupportTicket.find().sort({ updatedAt: -1 }).lean();
    res.json({ success: true, tickets });
  } catch (e) {
    console.error("adminGetAll tickets:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── ADMIN: REPLY ── */
exports.adminReply = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: "Message required" });

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket)              return res.status(404).json({ message: "Ticket not found" });
    if (ticket.status !== "open") return res.status(400).json({ message: "Ticket is closed" });

    ticket.messages.push({ from: "admin", text: message.trim() });
    await ticket.save();

    res.json({ success: true, ticket });
  } catch (e) {
    console.error("adminReply:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── ADMIN: CLOSE TICKET ── */
exports.adminClose = async (req, res) => {
  try {
    const ticket = await SupportTicket.findByIdAndUpdate(
      req.params.id,
      { status: "closed", messages: [] }, // clear chat on close
      { new: true }
    );
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    res.json({ success: true, message: "Ticket closed" });
  } catch (e) {
    console.error("adminClose:", e);
    res.status(500).json({ message: "Server error" });
  }
};
