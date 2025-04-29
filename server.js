// BotX Pro v5.0 Full Server - by Sunny Chaurasiya

import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { createServer } from 'http';
import mysql from 'mysql2';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

// Setup for ES Module (path fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Socket.IO Setup
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

// MySQL Database Connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

db.connect((err) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
  } else {
    console.log('✅ Connected to MySQL Database');
  }
});

// Environment Variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// In-Memory Users
const users = {};
let botActive = false;

// Routes

// Home Route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Register
app.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).send('Please fill all fields.');
  }

  db.query('SELECT * FROM person WHERE email = ? OR name = ?', [email, name], (err, results) => {
    if (err) {
      console.error('❌ Error while checking user:', err);
      return res.status(500).send('Server Error while checking user.');
    }
    if (results.length > 0) {
      return res.status(400).send('Email or Username already exists.');
    }

    db.query('INSERT INTO person (name, email, password) VALUES (?, ?, ?)', [name, email, password], (err) => {
      if (err) {
        console.error('❌ Error while inserting user:', err);
        return res.status(500).send('Server Error while inserting user.');
      }
      res.status(200).send('Registration successful!');
    });
  });
});

// Login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).send('Please fill all fields.');
  }

  db.query('SELECT * FROM person WHERE email = ? AND password = ?', [email, password], (err, results) => {
    if (err) {
      console.error('❌ Error while logging in:', err);
      return res.status(500).send('Server Error while logging in.');
    }
    if (results.length === 0) {
      return res.status(401).send('Invalid Email or Password.');
    }

    res.json({ message: 'Login Successful', name: results[0].name });
  });
});

// Fetch all users
app.get('/users', (req, res) => {
  db.query('SELECT name, email FROM person', (err, results) => {
    if (err) {
      console.error('❌ Error while fetching users:', err);
      return res.status(500).send('Server Error while fetching users.');
    }
    res.json(results);
  });
});

// Fetch users count
app.get('/users/count', (req, res) => {
  db.query('SELECT COUNT(*) AS total FROM person', (err, results) => {
    if (err) {
      console.error('❌ Error while counting users:', err);
      return res.status(500).send('Server Error while counting users.');
    }
    res.json({ totalUsers: results[0].total });
  });
});

// Gemini API integration
async function generateBotReply(prompt) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Reply in Hinglish, short, simple way, friendly tone. Don't write long paragraphs. If asked who made you, say: "Mujhe Sunny Chaurasiya ne banaya hai." User said: ${prompt}` }] }]
      })
    });
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, kuch samajh nahi aaya.";
  } catch (error) {
    console.error('Gemini Error:', error);
    return "Sorry, kuch error aaya.";
  }
}

// Real-Time Chat (Socket.IO)
io.on('connection', (socket) => {
  console.log('🔵 New user connected:', socket.id);

  socket.on('set_name', (name) => {
    users[socket.id] = name;
  });

  socket.on('message', async (text) => {
    const sender = users[socket.id] || 'Unknown';

    io.emit('message', { sender, text });

    if (botActive && (text.toLowerCase().includes('bot') || text.toLowerCase().includes('sunny'))) {
      const cleanPrompt = text.replace(/bot/gi, '').replace(/sunny/gi, '').trim();
      const botReply = await generateBotReply(cleanPrompt || "Hello");
      io.emit('message', { sender: "BotX", text: botReply });
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
  console.log(`🚀 Server running on port ${PORT}`);
});
