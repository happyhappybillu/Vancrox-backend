const mongoose = require("mongoose");

const tournamentSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, default: "" },
  entryFee:    { type: Number, required: true, min: 0 },
  prizePool:   { type: Number, required: true },
  maxSeats:    { type: Number, required: true },
  filledSeats: { type: Number, default: 0 },
  fakeSeats:   { type: Number, default: 0 }, // fake joined count shown to users
  status:      { type: String, enum: ["upcoming","live","ended","cancelled"], default: "upcoming" },
  startAt:     { type: Date, required: true },
  endAt:       { type: Date, required: true },
  prizeBreakdown: [{
    rank:    Number,
    label:   String,
    amount:  Number,
    percent: Number,
  }],
  resultMode:  { type: String, enum: ["random","fake","specific","pending"], default: "pending" },
  specificWinnerId: { type: String, default: "" }, // userId for specific winner
  fakeWinnerName:   { type: String, default: "" },
  resultAnnounced:  { type: Boolean, default: false },
  winners: [{
    rank:    Number,
    name:    String,
    uid:     String,
    amount:  Number,
    isReal:  Boolean,
    userId:  mongoose.Schema.Types.ObjectId,
  }],
  joinedUsers: [{ // real joined users
    userId:  mongoose.Schema.Types.ObjectId,
    name:    String,
    uid:     String,
    joinedAt:{ type: Date, default: Date.now },
  }],
  platformFeePercent: { type: Number, default: 10 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Tournament", tournamentSchema);
