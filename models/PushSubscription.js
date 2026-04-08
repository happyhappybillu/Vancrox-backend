const mongoose = require("mongoose");

const pushSubSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  subscription: { type: String, required: true }, // JSON string of PushSubscription
}, { timestamps: true });

module.exports = mongoose.model("PushSubscription", pushSubSchema);
