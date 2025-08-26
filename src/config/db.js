const mongoose = require("mongoose");

async function connectDB(uri = process.env.MONGODB_URI, dbName = process.env.MONGODB_DB) {
  if (!uri) throw new Error("MONGODB_URI env var is required");
  mongoose.set("strictQuery", true);

  // Optional listeners
  mongoose.connection.on("connected", () =>
    console.log(`✅ MongoDB connected: ${mongoose.connection.name}`)
  );
  mongoose.connection.on("disconnected", () => console.warn("⚠️ MongoDB disconnected"));
  mongoose.connection.on("error", (err) => console.error("❌ MongoDB error:", err));

  await mongoose.connect(uri, {
    dbName,
    // tweak as needed:
    autoIndex: true,
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 10,
  });

  return mongoose.connection;
}

async function closeDB() {
  await mongoose.connection.close();
}

module.exports = { connectDB, closeDB };
