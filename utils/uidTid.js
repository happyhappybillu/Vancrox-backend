const User = require("../models/User");

async function generateUID() {
  const last = await User.findOne({ role: "investor", uid: { $gt: 0 } }).sort({ uid: -1 }).lean();
  return last?.uid ? last.uid + 1 : 10001;
}

async function generateTID() {
  const last = await User.findOne({ role: "trader", tid: { $gt: 0 } }).sort({ tid: -1 }).lean();
  return last?.tid ? last.tid + 1 : 50001;
}

module.exports = { generateUID, generateTID };
