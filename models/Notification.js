const mongoose = require("mongoose");

const notifSchema = new mongoose.Schema(
  {
    title:   { type: String, required: true, trim: true },
    message: { type: String, required: true },
    image:   { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notifSchema);
