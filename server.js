import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import { MongoClient } from 'mongodb';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

// Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Express + Socket
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, { ssl: true, useNewUrlParser: true, useUnifiedTopology: true });
const dbName = 'ChatDB';
let userCollection, historyCollection, requestCollection, friendCollection;

client.connect().then(() => {
  const db = client.db(dbName);
  userCollection = db.collection('user');
  historyCollection = db.collection('bot_history');
  requestCollection = db.collection('friend_requests');
  friendCollection = db.collection('friends');
  console.log('✅ MongoDB Connected');
}).catch(err => console.error('❌ MongoDB Error:', err));

// Gemini API
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
async function generateBotReply(prompt) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Reply in short Hinglish. ${prompt}` }] }]
      })
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Bot confused hai.";
  } catch (e) {
    console.error("❌ Gemini API error:", e);
    return "Bot reply failed.";
  }
}

// UID Generator
function generateUID() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).send("Fill all fields");

  const exist = await userCollection.findOne({ $or: [{ email }, { name }] });
  if (exist) return res.status(400).send("User already exists");

  const uid = generateUID();
  await userCollection.insertOne({ name, email, password, uid });
  res.send("Registration success");
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await userCollection.findOne({ email, password });
  if (!user) return res.status(401).send("Invalid");
  res.json({ name: user.name, email: user.email, uid: user.uid });
});

app.post("/delete-account", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).send("Missing email");

  const result = await userCollection.deleteOne({ email });
  if (result.deletedCount === 1) {
    res.send("Account deleted");
  } else {
    res.status(404).send("User not found");
  }
});

app.get("/bot-history", async (req, res) => {
  const name = req.query.name;
  const rows = await historyCollection.find({ name }).toArray();
  res.json(rows);
});

// Friend System
app.post("/send-request", async (req, res) => {
  const { fromUid, toUid } = req.body;
  const toUser = await userCollection.findOne({ uid: toUid });
  if (!toUser) return res.status(404).send("UID not found");

  const alreadySent = await requestCollection.findOne({ from: fromUid, to: toUid });
  if (alreadySent) return res.status(400).send("Request already sent");

  await requestCollection.insertOne({ from: fromUid, to: toUid });
  res.send("Request sent");
});

app.get("/get-requests", async (req, res) => {
  const uid = req.query.uid;
  const requests = await requestCollection.find({ to: uid }).toArray();
  const names = await Promise.all(requests.map(async r => {
    const u = await userCollection.findOne({ uid: r.from });
    return u?.name || r.from;
  }));
  res.json(names);
});

app.post("/accept-request", async (req, res) => {
  const { fromUid, toUid } = req.body;
  await friendCollection.insertMany([
    { uid1: fromUid, uid2: toUid },
    { uid1: toUid, uid2: fromUid }
  ]);
  await requestCollection.deleteOne({ from: fromUid, to: toUid });
  res.send("Friend added");
});

app.get("/get-friends", async (req, res) => {
  const uid = req.query.uid;
  const friends = await friendCollection.find({ uid1: uid }).toArray();
  const result = await Promise.all(friends.map(async f => {
    const u = await userCollection.findOne({ uid: f.uid2 });
    return { name: u?.name || f.uid2, online: Object.values(users).includes(u?.name || '') };
  }));
  res.json(result);
});

// Chat System
const users = {};
let botActive = false;

io.on("connection", socket => {
  console.log("🔌 Connected:", socket.id);

  socket.on("set_name", data => {
    users[socket.id] = typeof data === 'object' ? data.name : data;
  });

  socket.on("message", async text => {
    const sender = users[socket.id] || "Unknown";
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

    if (botActive && text.toLowerCase().includes("bot")) {
      const clean = text.replace(/bot/gi, "").trim();
      const reply = await generateBotReply(clean || "Hello");
      io.emit("message", { sender: "BotX", text: reply });
      await historyCollection.insertOne({ name: sender, prompt: clean, reply });
    }
  });

  socket.on("typing", name => {
    socket.broadcast.emit("typing", name);
  });

  socket.on("join-room", room => {
    socket.join(room);
    const name = users[socket.id] || "User";
    socket.to(room).emit("room-joined", name);
  });

  socket.on("private-message", async data => {
    const { room, sender, text } = data;
    io.to(room).emit("private-message", { sender, text });

    if (text === ">>bot" && !botActive) {
      botActive = true;
      io.to(room).emit("private-message", { sender: "System", text: "Bot activated in room." });
      return;
    }

    if (botActive && text.toLowerCase().includes("bot")) {
      const prompt = text.replace(/bot/gi, "").trim();
      const reply = await generateBotReply(prompt);
      io.to(room).emit("private-message", { sender: "BotX", text: reply });
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
    delete users[socket.id];
  });
});

// Start
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
