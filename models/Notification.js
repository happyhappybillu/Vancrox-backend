const mongoose = require("mongoose");

const notifSchema = new mongoose.Schema(
  {
    title:   { type: String, required: true, trim: true },
    message: { type: String, required: true },
    image:   { type: String, default: "" },
    type:    { type: String, default: "general" }, // general, trade_live, trade_complete
    userId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notifSchema);
