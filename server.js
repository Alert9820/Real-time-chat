import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { createServer } from 'http';
import mysql from 'mysql2';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// MySQL
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});
db.connect(err => {
  if (err) console.error('❌ DB Failed:', err);
  else console.log('✅ MySQL Connected');
});

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
          parts: [{
            text: `Reply in short, friendly Hinglish. Avoid long answers and never mention Gemini. If asked who created you, say: "Mujhe Sunny Chaurasiya ne banaya hai." Question: ${prompt}`
          }]
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
app.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).send("Fill all fields");

  db.query('SELECT * FROM person WHERE email = ? OR name = ?', [email, name], (err, result) => {
    if (err) return res.status(500).send("Server error");
    if (result.length > 0) return res.status(400).send("Already exists");

    db.query('INSERT INTO person (name, email, password) VALUES (?, ?, ?)', [name, email, password], err => {
      if (err) return res.status(500).send("Registration failed");
      res.send("Registration success");
    });
  });
});
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.query('SELECT * FROM person WHERE email = ? AND password = ?', [email, password], (err, result) => {
    if (err || result.length === 0) return res.status(401).send("Invalid");
    res.json({ name: result[0].name });
  });
});
app.get("/bot-history", (req, res) => {
  const name = req.query.name;
  db.query("SELECT * FROM bot_history WHERE name = ?", [name], (err, rows) => {
    if (err) return res.status(500).send("Error");
    res.json(rows);
  });
});

// Realtime
io.on("connection", socket => {
  console.log("User connected:", socket.id);

  socket.on("set_name", name => {
    users[socket.id] = name;
  });

  // Realtime Chatroom
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
      const clean = text.replace(/Reply to .*?:/, "").replace(/bot/gi, "").trim();
      const reply = await generateBotReply(clean || "Hello");
      io.emit("message", { sender: "BotX", text: reply });
      db.query("INSERT INTO bot_history (name, prompt, reply) VALUES (?, ?, ?)", [sender, clean, reply]);
    }
  });

  // Typing Event (global)
  socket.on("typing", name => {
    socket.broadcast.emit("typing", name);
  });

  // ======================
  // Private Room Section
  // ======================
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
