import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { createServer } from 'http';
import mysql from 'mysql2';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch'; // Required for Gemini API

// Path Setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection (ENV variables)
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

// Connect Database
db.connect((err) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
  } else {
    console.log('✅ Connected to MySQL Database');
  }
});

// In-Memory Users
const users = {};
let botActive = false;

// Routes

// Home
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Register
app.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).send('Please fill all fields.');

  db.query('SELECT * FROM users WHERE email = ? OR name = ?', [email, name], (err, results) => {
    if (err) {
      console.error('Error while checking user:', err);
      return res.status(500).send('Server Error while checking user.');
    }
    if (results.length > 0) return res.status(400).send('Email or Username already exists.');

    db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, password], (err, result) => {
      if (err) {
        console.error('Error while registering user:', err);
        return res.status(500).send('Server Error while registering user.');
      }
      res.send('Registration successful!');
    });
  });
});

// Login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).send('Please fill all fields.');

  db.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, results) => {
    if (err) {
      console.error('Error while logging in:', err);
      return res.status(500).send('Server Error while logging in.');
    }
    if (results.length === 0) return res.status(401).send('Invalid Email or Password.');
    
    res.json({ message: 'Login Successful', name: results[0].name });
  });
});

// Gemini AI API Key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Set on Render Environment Variable

// Gemini AI Prompt Function
async function generateGeminiResponse(prompt) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Tum hinglish me reply do, jyada bada reply mat do. Simple, friendly aur easy way me batao. Agar koi pooche ki tumko kisne banaya, to bolo "Sunny Chaurasiya ne banaya hai mujhe!".\n\nPrompt: ${prompt}` }] }]
      })
    });

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, kuch error aa gaya.";
  } catch (err) {
    console.error('Gemini Error:', err);
    return "Sorry, Gemini AI se reply nahi aa paya.";
  }
}

// Socket.IO for Real-Time Chat
io.on('connection', (socket) => {
  console.log('🔵 A user connected:', socket.id);

  socket.on('set_name', (name) => {
    users[socket.id] = name;
  });

  socket.on('message', async (text) => {
    const sender = users[socket.id] || 'Unknown';

    if (text === '>>bot') {
      botActive = true;
      io.emit('message', { sender: "BotX", text: "Bot is now active! Ask me anything!" });
      return;
    }
    if (text === '<<bot') {
      botActive = false;
      io.emit('message', { sender: "BotX", text: "Bot is now inactive." });
      return;
    }

    // Normal message
    io.emit('message', { sender, text });

    // Bot auto-reply
    if (botActive && (text.toLowerCase().includes("bot") || sender === "BotX")) {
      const cleanPrompt = text.replace(/bot/gi, '').trim();
      const reply = await generateGeminiResponse(cleanPrompt || "Hello");
      io.emit('message', { sender: "BotX", text: reply });
    }
  });

  socket.on('typing', (name) => {
    socket.broadcast.emit('typing', name);
  });

  socket.on('disconnect', () => {
    console.log('🔴 User disconnected:', socket.id);
    delete users[socket.id];
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 BotX Pro Server running on port ${PORT}`);
});
