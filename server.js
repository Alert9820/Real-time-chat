// Server.js - Final Full Updated BotX Pro v5.0

import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { createServer } from 'http';
import mysql from 'mysql2';
import bodyParser from 'body-parser';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

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

// Middlewares
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection using Environment Variables
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

// Database Connect
db.connect((err) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
  } else {
    console.log('✅ Connected to MySQL Database');
  }
});

// Gemini API
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Gemini API key from env

// Users
const users = {};
let botActive = false;

// Routes

// Registration
app.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).send('Please fill all fields.');
  }

  db.query('SELECT * FROM users WHERE email = ? OR name = ?', [email, name], (err, results) => {
    if (err) return res.status(500).send('Server Error');
    if (results.length > 0) return res.status(400).send('Email or Username already exists.');

    db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, password], (err, result) => {
      if (err) return res.status(500).send('Server Error on Registration');
      res.send('Registration successful!');
    });
  });
});

// Login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).send('Please fill all fields.');
  }

  db.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, results) => {
    if (err) return res.status(500).send('Server Error');
    if (results.length === 0) return res.status(401).send('Invalid Email or Password');

    res.json({ message: 'Login Successful', name: results[0].name });
  });
});

// Serve login page as default
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Socket.io Realtime Chat
io.on('connection', (socket) => {
  console.log('🟢 User connected:', socket.id);

  socket.on('set_name', (name) => {
    users[socket.id] = name;
  });

  socket.on('message', async (text) => {
    const sender = users[socket.id] || 'Unknown';

    // Bot Activation
    if (text === '>>bot') {
      botActive = true;
      io.emit('message', { sender: 'BotX', text: 'Bot is now active!' });
      return;
    }

    // Bot Deactivation
    if (text === '<<bot') {
      botActive = false;
      io.emit('message', { sender: 'BotX', text: 'Bot is now inactive!' });
      return;
    }

    // Normal User message
    io.emit('message', { sender, text });

    // If bot active and message contains "@bot" word
    if (botActive && text.includes('bot')) {
      const cleanedText = text.replace('bot', '').trim();
      const geminiResponse = await askGemini(cleanedText);
      io.emit('message', { sender: 'BotX', text: geminiResponse });
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

// Gemini API Call Function
async function askGemini(question) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Reply short, easy and friendly. If user speaks Hindi, reply in Hinglish. If someone asks who made you, say "Sunny Chaurasiya made me." Now answer: ${question}` }] }]
      })
    });

    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return reply || "Sorry, I couldn't understand!";
  } catch (error) {
    console.error('❌ Gemini API Error:', error);
    return "Error in Gemini AI.";
  }
}

// Server Start
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 BotX Pro Server running on port ${PORT}`);
});
