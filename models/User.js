const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["investor", "trader", "admin"], required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, lowercase: true, trim: true, unique: true, sparse: true, default: null },
    mobile: { type: String, unique: true, sparse: true, default: null },
    password: { type: String, required: true, select: false },
    profilePhoto: { type: String, default: "" },

    /* IDs */
    uid: { type: Number, default: null, index: true },
    tid: { type: Number, default: null, index: true },

    /* INVESTOR */
    balance: { type: Number, default: 0, min: 0 },
    walletAddresses: {
      TRC20: { type: String, default: "" },
      ERC20: { type: String, default: "" },
      BEP20: { type: String, default: "" },
    },

    /* TRADER */
    securityMoney: { type: Number, default: 0, min: 0 },
    traderLevel: { type: Number, default: 1, min: 1, max: 10 },
    traderVerificationStatus: {
      type: String,
      enum: ["NOT_SUBMITTED", "PENDING", "APPROVED", "REJECTED"],
      default: "NOT_SUBMITTED",
    },
    traderHistoryFile: { type: String, default: "" },
    traderTotalEarning: { type: Number, default: 0 },
    rejectionReason: { type: String, default: "" },

    /* CONTROL */
    isBlocked: { type: Boolean, default: false, index: true },
    blockedReason: { type: String, default: "" },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, uid: 1 });
userSchema.index({ role: 1, tid: 1 });

module.exports = mongoose.model("User", userSchema);
