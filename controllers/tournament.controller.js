const Tournament = require("../models/Tournament");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Notification = require("../models/Notification");

// Fake Indian names for tournament display
const FAKE_NAMES_F = ["Aarav","Arjun","Vivaan","Aditya","Sai","Arnav","Kabir","Rohan","Rahul","Amit","Karan","Dev","Nikhil","Sneha","Priya","Ananya","Kavya","Meera","Riya","Pooja","Simran","Neha","Shreya","Kunal","Vikram"];
const FAKE_NAMES_L = ["Sharma","Patel","Singh","Gupta","Kumar","Mehta","Joshi","Verma","Malhotra","Kapoor","Reddy","Rao","Shah","Desai","Iyer"];
function fakeName(seed){
  const s=Math.abs(seed);
  return FAKE_NAMES_F[s%FAKE_NAMES_F.length]+" "+FAKE_NAMES_L[Math.floor(s/FAKE_NAMES_F.length)%FAKE_NAMES_L.length].charAt(0)+".";
}
function fakeUID(seed){ return 80000+((seed*7919)%23500); }

/* ── ADMIN: Create tournament ── */
exports.adminCreate = async (req, res) => {
  try {
    const { title, description, entryFee, prizePool, maxSeats, fakeSeats,
            startAt, endAt, prizeBreakdown, platformFeePercent, resultMode } = req.body;
    if (!title||!entryFee==null||!prizePool||!maxSeats||!startAt||!endAt)
      return res.status(400).json({ message: "Required fields missing" });

    const t = await Tournament.create({
      title, description: description||"",
      entryFee: parseFloat(entryFee),
      prizePool: parseFloat(prizePool),
      maxSeats: parseInt(maxSeats),
      fakeSeats: parseInt(fakeSeats||0),
      filledSeats: parseInt(fakeSeats||0),
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      prizeBreakdown: prizeBreakdown||[],
      platformFeePercent: parseFloat(platformFeePercent||10),
      resultMode: resultMode||"pending",
      status: new Date(startAt)<=new Date() ? "live" : "upcoming",
    });
    res.json({ success:true, tournament:t });
  } catch(e) {
    console.error("adminCreate tournament:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── ADMIN: List all tournaments ── */
exports.adminList = async (req, res) => {
  try {
    const ts = await Tournament.find().sort({ startAt:-1 }).lean();
    res.json({ success:true, tournaments:ts });
  } catch(e) { res.status(500).json({ message:"Server error" }); }
};

/* ── ADMIN: Update tournament ── */
exports.adminUpdate = async (req, res) => {
  try {
    const t = await Tournament.findByIdAndUpdate(req.params.id, { $set: req.body }, { new:true });
    if(!t) return res.status(404).json({ message:"Not found" });
    res.json({ success:true, tournament:t });
  } catch(e) { res.status(500).json({ message:"Server error" }); }
};

/* ── ADMIN: Delete tournament ── */
exports.adminDelete = async (req, res) => {
  try {
    await Tournament.findByIdAndDelete(req.params.id);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ message:"Server error" }); }
};

/* ── ADMIN: Announce result ── */
exports.adminResult = async (req, res) => {
  try {
    const { resultMode, specificWinnerId, fakeWinnerName } = req.body;
    const t = await Tournament.findById(req.params.id).populate("joinedUsers.userId");
    if(!t) return res.status(404).json({ message:"Not found" });
    if(t.resultAnnounced) return res.status(400).json({ message:"Result already announced" });

    let winners = [];
    const breakdown = t.prizeBreakdown||[];
    if(!breakdown.length) return res.status(400).json({ message:"No prize breakdown set" });

    if(resultMode==="random"){
      // Pick random from real + fake users
      const allNames=[...t.joinedUsers.map((u,i)=>({name:u.name,uid:"UID"+u.uid,isReal:true,userId:u.userId}))];
      // Add fake names to fill
      const totalShown=t.filledSeats||10;
      for(let i=allNames.length;i<totalShown;i++) allNames.push({name:fakeName(t._id.toString().charCodeAt(0)+i),uid:"UID"+fakeUID(i),isReal:false});
      // Shuffle
      for(let i=allNames.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[allNames[i],allNames[j]]=[allNames[j],allNames[i]];}
      for(let r=0;r<Math.min(breakdown.length,allNames.length);r++){
        winners.push({rank:breakdown[r].rank,name:allNames[r].name,uid:allNames[r].uid,amount:breakdown[r].amount,isReal:allNames[r].isReal,userId:allNames[r].userId||null});
      }
    } else if(resultMode==="fake"){
      // All fake winners
      for(let r=0;r<breakdown.length;r++){
        const seed=Date.now()+r;
        winners.push({rank:breakdown[r].rank,name:fakeWinnerName&&r===0?fakeWinnerName:fakeName(seed+r),uid:"UID"+fakeUID(seed+r),amount:breakdown[r].amount,isReal:false});
      }
    } else if(resultMode==="specific"){
      // First winner is specific user, rest fake
      const realUser=await User.findById(specificWinnerId).lean();
      for(let r=0;r<breakdown.length;r++){
        if(r===0&&realUser){
          winners.push({rank:breakdown[r].rank,name:realUser.name,uid:"UID"+realUser.uid,amount:breakdown[r].amount,isReal:true,userId:realUser._id});
        } else {
          const seed=Date.now()+r;
          winners.push({rank:breakdown[r].rank,name:fakeName(seed+r),uid:"UID"+fakeUID(seed+r),amount:breakdown[r].amount,isReal:false});
        }
      }
    }

    // Credit real winners
    for(const w of winners){
      if(w.isReal&&w.userId){
        await User.findByIdAndUpdate(w.userId,{$inc:{balance:w.amount}});
        await Transaction.create({userId:w.userId,type:"Profit",amount:w.amount,status:"Completed",note:`Tournament Winner: ${t.title} - Rank #${w.rank}`});
        await Notification.create({userId:w.userId,type:"general",title:"🏆 Tournament Winner!",message:`Congratulations! You won Rank #${w.rank} in "${t.title}". $${w.amount.toFixed(2)} has been credited to your balance.`});
      }
    }

    await Tournament.findByIdAndUpdate(t._id,{$set:{winners,resultAnnounced:true,status:"ended",resultMode}});
    res.json({ success:true, winners });
  } catch(e){
    console.error("adminResult:", e);
    res.status(500).json({ message:"Server error" });
  }
};

/* ── INVESTOR: List active tournaments ── */
exports.investorList = async (req, res) => {
  try {
    const now = new Date();
    // Auto-update statuses
    await Tournament.updateMany({status:"upcoming",startAt:{$lte:now}},{$set:{status:"live"}});
    await Tournament.updateMany({status:"live",endAt:{$lte:now}},{$set:{status:"ended"}});

    const ts = await Tournament.find({ status:{$in:["live","upcoming","ended"]} })
      .sort({ status:1, startAt:1 }).lean();
    
    // Add fake user display list to each
    const result = ts.map(t => {
      const realJoined = t.joinedUsers||[];
      const totalShown = Math.max(t.filledSeats||0, realJoined.length);
      // Build fake display users (show first 8)
      const fakeUsers = [];
      for(let i=realJoined.length; i<Math.min(8, totalShown); i++){
        fakeUsers.push({ name: fakeName(t._id.toString().charCodeAt(0)+i), uid: "UID"+fakeUID(i), isReal:false });
      }
      const isJoined = realJoined.some(u=>u.userId?.toString()===req.user?._id?.toString());
      return { ...t, joinedDisplay: [...realJoined.slice(0,4).map(u=>({name:u.name,uid:"UID"+u.uid,isReal:true})), ...fakeUsers].slice(0,8), isJoined, totalShown };
    });
    res.json({ success:true, tournaments:result });
  } catch(e){
    console.error("investorList:", e);
    res.status(500).json({ message:"Server error" });
  }
};

/* ── INVESTOR: Join tournament ── */
exports.investorJoin = async (req, res) => {
  try {
    const t = await Tournament.findById(req.params.id);
    if(!t) return res.status(404).json({ message:"Tournament not found" });
    if(t.status!=="live"&&t.status!=="upcoming") return res.status(400).json({ message:"Tournament not active" });
    if(t.filledSeats>=t.maxSeats) return res.status(400).json({ message:"Tournament is full" });
    
    const alreadyJoined = t.joinedUsers.some(u=>u.userId?.toString()===req.user._id.toString());
    if(alreadyJoined) return res.status(400).json({ message:"Already joined" });

    const user = await User.findById(req.user._id);
    if(!user) return res.status(404).json({ message:"User not found" });
    if(t.entryFee>0&&user.balance<t.entryFee) return res.status(400).json({ message:"Insufficient balance" });

    // Deduct entry fee
    if(t.entryFee>0){
      user.balance -= t.entryFee;
      await user.save();
      await Transaction.create({userId:user._id,userName:user.name,userRole:"investor",uid:user.uid,type:"Withdrawal",amount:t.entryFee,status:"Completed",note:`Tournament Entry: ${t.title}`});
    }

    t.joinedUsers.push({ userId:user._id, name:user.name, uid:user.uid });
    t.filledSeats += 1;
    await t.save();
    res.json({ success:true, message:"Joined successfully!" });
  } catch(e){
    console.error("investorJoin:", e);
    res.status(500).json({ message:"Server error" });
  }
};
