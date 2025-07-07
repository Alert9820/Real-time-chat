// ✅ MONGO-READY BACKEND (server.js)
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Setup
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
const dbName = 'ChatDB';
let userCollection, historyCollection;

client.connect().then(() => {
  const db = client.db(dbName);
  userCollection = db.collection('user');
  historyCollection = db.collection('bot_history');
  console.log('✅ MongoDB Connected');
}).catch(err => console.error('❌ Mongo Connection Error:', err));

const users = {};
let botActive = false;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Gemini Bot
async function generateBotReply(prompt) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `Reply in short Hinglish. ${prompt}` }]
        }]
      })
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Bot confused hai.";
  } catch (e) {
    console.error("Bot error:", e);
    return "Bot reply failed.";
  }
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

  await userCollection.insertOne({ name, email, password });
  res.send("Registration success");
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await userCollection.findOne({ email, password });
  if (!user) return res.status(401).send("Invalid");
  res.json({ name: user.name });
});

app.get("/bot-history", async (req, res) => {
  const name = req.query.name;
  const rows = await historyCollection.find({ name }).toArray();
  res.json(rows);
});

// Realtime Chat
io.on("connection", socket => {
  console.log("User connected:", socket.id);

  socket.on("set_name", name => {
    users[socket.id] = name;
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
    console.log("Disconnected:", socket.id);
    delete users[socket.id];
  });
});

// Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
