const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) { console.error("❌ MONGO_URI missing"); process.exit(1); }
    const conn = await mongoose.connect(uri, {
      dbName: process.env.MONGO_DB_NAME || "vancrox",
      autoIndex: true,
    });
    console.log(`✅ MongoDB: ${conn.connection.host}`);
  } catch (err) {
    console.error("❌ MongoDB error:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
