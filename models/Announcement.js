const mongoose = require("mongoose");
const announcementSchema = new mongoose.Schema({
  title:    { type: String, required: true },
  message:  { type: String, required: true },
  type:     { type: String, enum: ["info","warning","success","alert"], default: "info" },
  target:   { type: String, enum: ["all","investor","trader"], default: "all" },
  active:   { type: Boolean, default: true },
  pinned:   { type: Boolean, default: false },
  createdAt:{ type: Date, default: Date.now },
});
module.exports = mongoose.model("Announcement", announcementSchema);
