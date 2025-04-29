// server.js - BotX Pro v5.0 Final Server
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mysql from 'mysql2';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

// Required for ES Module path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// MySQL Connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,       // railway mysql host
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

db.connect((err) => {
  if (err) {
    console.error('❌ MySQL Connection Failed:', err);
  } else {
    console.log('✅ MySQL Connected Successfully');
  }
});

// Environment Variable
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const users = {};
let botActive = false;

// Gemini Response Handler
async function generateBotReply(prompt) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Reply in short, friendly Hinglish. Don't use Gemini name. If asked who made you, say: "Mujhe Sunny Chaurasiya ne banaya hai". User said: ${prompt}`
          }]
        }]
      })
    });
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, kuch error aaya.";
  } catch (err) {
    console.error("Gemini Error:", err);
    return "Error from bot.";
  }
}

// Routes

// Default
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Register
app.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).send('Please fill all fields.');

  db.query('SELECT * FROM person WHERE email = ? OR name = ?', [email, name], (err, results) => {
    if (err) return res.status(500).send('Server error while checking user.');
    if (results.length > 0) return res.status(400).send('Email or Username already exists.');

    db.query('INSERT INTO person (name, email, password) VALUES (?, ?, ?)', [name, email, password], (err) => {
      if (err) return res.status(500).send('Server error while inserting user.');
      res.send('Registration successful!');
    });
  });
});

// Login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).send('Please fill all fields.');

  db.query('SELECT * FROM person WHERE email = ? AND password = ?', [email, password], (err, results) => {
    if (err) return res.status(500).send('Server error while login.');
    if (results.length === 0) return res.status(401).send('Invalid credentials.');

    res.json({ message: 'Login successful', name: results[0].name });
  });
});

// Get All Users
app.get('/users', (req, res) => {
  db.query('SELECT name, email FROM person', (err, results) => {
    if (err) return res.status(500).send('Error fetching users.');
    res.json(results);
  });
});

// Count Users
app.get('/users/count', (req, res) => {
  db.query('SELECT COUNT(*) AS total FROM person', (err, results) => {
    if (err) return res.status(500).send('Error fetching count.');
    res.json({ totalUsers: results[0].total });
  });
});

// Real-time Communication
io.on('connection', (socket) => {
  console.log('🟢 New Socket Connected:', socket.id);

  socket.on('set_name', (name) => {
    users[socket.id] = name;
  });

  socket.on('message', async (text) => {
    const sender = users[socket.id] || 'Unknown';

    io.emit('message', { sender, text });

    // Bot Activation Control
    if (text === '>>bot') {
      botActive = true;
      io.emit('message', { sender: 'System', text: 'Bot is now active.' });
      return;
    }

    if (text === '<<bot') {
      botActive = false;
      io.emit('message', { sender: 'System', text: 'Bot is now inactive.' });
      return;
    }

    // Bot Auto-Reply
    if (botActive && (text.toLowerCase().includes('bot') || text.toLowerCase().includes('sunny'))) {
      const cleanPrompt = text.replace(/Reply to .*?:/, '')
                              .replace(/bot/gi, '')
                              .replace(/sunny/gi, '')
                              .trim();
      const botReply = await generateBotReply(cleanPrompt || "Hello");
      io.emit('message', { sender: "BotX", text: botReply });
    }
  });

  socket.on('typing', (name) => {
    socket.broadcast.emit('typing', name);
  });

  socket.on('disconnect', () => {
    console.log('🔴 Disconnected:', socket.id);
    delete users[socket.id];
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
