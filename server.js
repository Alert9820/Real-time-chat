// ✅ FINAL MONGO-READY BACKEND (server.js) WITH PRIVATE CHAT + BOT + FRIEND SYSTEM
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import { MongoClient } from "mongodb";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// 📁 Path setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ⚙️ Express + HTTP + Socket.io
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// 🔧 Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// 🗃️ MongoDB Setup
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  ssl: true,
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const dbName = "ChatDB";
let userCollection,
  historyCollection,
  requestCollection,
  friendCollection,
  privateMsgCollection;

client
  .connect()
  .then(() => {
    const db = client.db(dbName);
    userCollection = db.collection("user");
    historyCollection = db.collection("bot_history");
    requestCollection = db.collection("friend_requests");
    friendCollection = db.collection("friends");
    privateMsgCollection = db.collection("privateMessages"); // ✅ NEW
    console.log("✅ MongoDB Connected");
  })
  .catch((err) => console.error("❌ Mongo Connection Error:", err));

// 🔐 UID generator
function generateUID() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 🤖 Gemini Bot Reply (Short Hinglish)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
async function generateBotReply(prompt) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Reply in short Hinglish. ${prompt}` }] }],
        }),
      }
    );
    const data = await res.json();
    return (
      data.candidates?.[0]?.content?.parts?.[0]?.text || "Bot confused hai."
    );
  } catch (e) {
    console.error("❌ Bot error:", e);
    return "Bot reply failed.";
  }
}

// 🌐 Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// 📝 Register User
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).send("Fill all fields");

    const exist = await userCollection.findOne({ $or: [{ email }, { name }] });
    if (exist) return res.status(400).send("User already exists");

    const uid = generateUID();
    await userCollection.insertOne({ name, email, password, uid });
    res.send("Registration success");
  } catch (e) {
    console.error("❌ Register Error:", e);
    res.status(500).send("Server error");
  }
});

// 🔑 Login
app.post("/login", async (req, res) => {
  try {
    let email, password;
    if (req.headers["content-type"]?.includes("application/json")) {
      ({ email, password } = req.body);
    } else {
      email = req.body.email;
      password = req.body.password;
    }

    const user = await userCollection.findOne({ email, password });
    if (!user) return res.status(401).send("Invalid");

    res.json({ name: user.name, email: user.email, uid: user.uid });
  } catch (e) {
    console.error("❌ Login Error:", e);
    res.status(500).send("Server error");
  }
});

// ❌ Delete Account
app.post("/delete-account", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).send("Missing email");

    const result = await userCollection.deleteOne({ email });
    if (result.deletedCount === 1) {
      res.send("Account deleted successfully");
    } else {
      res.status(404).send("User not found");
    }
  } catch (e) {
    console.error("❌ Delete Account Error:", e);
    res.status(500).send("Server error");
  }
});

// 📜 Bot History
app.get("/bot-history", async (req, res) => {
  try {
    const name = req.query.name;
    const rows = await historyCollection.find({ name }).toArray();
    res.json(rows);
  } catch (e) {
    console.error("❌ History Fetch Error:", e);
    res.status(500).send("Error fetching history");
  }
});

// 👥 Get Users
app.get("/get-users", async (req, res) => {
  try {
    const users = await userCollection.find().toArray();
    res.json(users);
  } catch (e) {
    console.error("❌ Get Users Error:", e);
    res.status(500).send("Server error");
  }
});

// 📨 Friend Request System
app.post("/send-request", async (req, res) => {
  const { fromUid, toUid } = req.body;
  const toUser = await userCollection.findOne({ uid: toUid });
  if (!toUser) return res.status(404).send("UID not found");

  const alreadySent = await requestCollection.findOne({
    from: fromUid,
    to: toUid,
  });
  if (alreadySent) return res.status(400).send("Request already sent");

  await requestCollection.insertOne({ from: fromUid, to: toUid });
  res.send("Request sent");
});

app.get("/get-requests", async (req, res) => {
  const uid = req.query.uid;
  const requests = await requestCollection.find({ to: uid }).toArray();
  const names = await Promise.all(
    requests.map(async (r) => {
      const u = await userCollection.findOne({ uid: r.from });
      return u?.name || r.from;
    })
  );
  res.json(names);
});

app.post("/accept-request", async (req, res) => {
  const { fromUid, toUid } = req.body;
  await friendCollection.insertMany([
    { uid1: fromUid, uid2: toUid },
    { uid1: toUid, uid2: fromUid },
  ]);
  await requestCollection.deleteOne({ from: fromUid, to: toUid });
  res.send("Friend added");
});

app.get("/get-friends", async (req, res) => {
  try {
    const uid = req.query.uid;
    const friends = await friendCollection.find({ uid1: uid }).toArray();
    const result = await Promise.all(
      friends.map(async (f) => {
        const u = await userCollection.findOne({ uid: f.uid2 });
        return {
          // return uid explicitly so frontend won't get undefined
          name: u?.name || f.uid2,
          uid: u?.uid || f.uid2,
          online: Object.values(users).some((x) => x?.uid === (u?.uid || f.uid2)),
        };
      })
    );
    res.json(result);
  } catch (e) {
    console.error("❌ Get Friends Error:", e);
    res.status(500).send("Server error");
  }
});

// ✅ GET Saved Private Chat
app.get("/get-room-messages", async (req, res) => {
  try {
    const { room } = req.query;
    if (!room) return res.status(400).send("Missing room");
    const messages = await privateMsgCollection
      .find({ room })
      .sort({ timestamp: 1 })
      .toArray();
    res.json(messages);
  } catch (e) {
    console.error("❌ Message Fetch Error:", e);
    res.status(500).send("Error loading messages");
  }
});

// ❌ Clear Room Messages
app.post("/clear-room", async (req, res) => {
  try {
    const { room } = req.body;
    if (!room) return res.status(400).send("Missing room");
    await privateMsgCollection.deleteMany({ room });
    res.send("Room cleared");
  } catch (e) {
    console.error("❌ Clear Room Error:", e);
    res.status(500).send("Error clearing room");
  }
});

// 🧠 Socket.IO Logic
// users map: socketId => { uid, name }
const users = {};
let botActive = false;

io.on("connection", (socket) => {
  console.log("🔌 User connected:", socket.id);

  // Expect set_name to receive either string or object { uid, name }
  socket.on("set_name", (data) => {
    try {
      if (!data) {
        console.warn("set_name called with empty data from", socket.id);
        return;
      }
      if (typeof data === "string") {
        // legacy fallback: store name only (uid missing)
        users[socket.id] = { uid: null, name: data };
        console.log(`🟢 set_name (string) => ${data} for socket ${socket.id}`);
      } else if (typeof data === "object") {
        const { uid, name } = data;
        users[socket.id] = { uid: uid || null, name: name || "Unknown" };
        console.log(`🟢 set_name => ${name} (${uid}) for socket ${socket.id}`);
      } else {
        console.warn("set_name unknown data type from", socket.id, data);
      }
    } catch (err) {
      console.error("❌ set_name error:", err);
    }
  });

  socket.on("typing", (payload) => {
    // payload can be { room, name } or just name (legacy)
    try {
      if (payload && typeof payload === "object" && payload.room) {
        socket.to(payload.room).emit("typing", payload.name || "Someone");
      } else {
        socket.broadcast.emit("typing", payload || "Someone");
      }
    } catch (err) {
      console.error("❌ typing error:", err);
    }
  });

  socket.on("join-room", (room) => {
    try {
      if (!room) {
        console.error("❌ join-room failed: missing room for socket", socket.id);
        return;
      }
      socket.join(room);
      const user = users[socket.id] || { name: "Unknown", uid: null };
      console.log(`📌 Socket ${socket.id} (${user.name}/${user.uid}) joined room: ${room}`);
      socket.to(room).emit("room-joined", user.name);
    } catch (err) {
      console.error("❌ join-room error:", err);
    }
  });

  // 🌍 Global Chat
  socket.on("message", async (text) => {
    try {
      const user = users[socket.id] || { name: "Unknown", uid: null };
      const sender = user.name;
      console.log(`🌍 global message from ${sender}:`, text);
      io.emit("message", { sender, text });

      if (text === ">>bot") {
        botActive = true;
        io.emit("message", { sender: "System", text: "Bot is now active." });
        return;
      }

      if (text === "<<bot") {
        botActive = false;
        io.emit("message", { sender: "System", text: "Bot is now inactive." });
        return;
      }

      if (botActive && typeof text === "string" && text.toLowerCase().includes("bot")) {
        const clean = text.replace(/bot/gi, "").trim();
        const reply = await generateBotReply(clean || "Hello");
        io.emit("message", { sender: "BotX", text: reply });
        await historyCollection.insertOne({ name: sender, prompt: clean, reply });
      }
    } catch (err) {
      console.error("❌ global message handler error:", err);
    }
  });

  // 🔒 Private Chat
  socket.on("private-message", async (payload) => {
    try {
      // expected payload: { room, sender, text }
      if (!payload || typeof payload !== "object") {
        console.error("❌ private-message invalid payload from", socket.id, payload);
        return;
      }
      const { room, sender, text } = payload;
      if (!room || !sender || !text) {
        console.error("❌ private-message missing fields:", { room, sender, text, socket: socket.id });
        return;
      }

      console.log(`🔐 private-message in room ${room} from ${sender}: ${text}`);

      // emit only to that room
      io.to(room).emit("private-message", { sender, text });

      // Save to MongoDB (best-effort, non-blocking for emit)
      try {
        await privateMsgCollection.insertOne({
          room,
          sender,
          text,
          timestamp: new Date(),
        });
      } catch (dbErr) {
        console.error("❌ failed to save private message:", dbErr);
      }

      // Bot auto reply if active
      if (botActive && typeof text === "string" && text.toLowerCase().includes("bot")) {
  const prompt = text.replace(/bot/gi, "").trim();
  const reply = await generateBotReply(prompt);

  // ✅ Emit bot reply on a separate event
  io.to(room).emit("bot-reply", { sender: "BotX", text: reply });

  // Save bot history
  try {
    await historyCollection.insertOne({ name: sender, prompt, reply });
  } catch (hErr) {
    console.error("❌ failed to save bot history:", hErr);
  }
      }

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id, users[socket.id] ? `(${users[socket.id].name}/${users[socket.id].uid})` : "");
    delete users[socket.id];
  });
});

// 🚀 Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
