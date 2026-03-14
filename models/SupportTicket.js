const mongoose = require("mongoose");

const msgSchema = new mongoose.Schema({
  from:    { type: String, enum: ["user", "admin"], required: true },
  text:    { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const ticketSchema = new mongoose.Schema(
  {
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userName: { type: String, default: "" },
    userRole: { type: String, enum: ["investor", "trader"], default: "investor" },
    userId_num: { type: Number, default: null }, // uid or tid

    status: { type: String, enum: ["open", "closed"], default: "open", index: true },
    messages: [msgSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("SupportTicket", ticketSchema);
