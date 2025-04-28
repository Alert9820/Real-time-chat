// BotX Pro Server.js (Sunny Chaurasiya Official Version Without ID Column)
// BotX Pro Server.js (Sunny Chaurasiya Official Version)

import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { createServer } from 'http';
import mysql from 'mysql2';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

// ES Module Setup
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

// Connect Database
db.connect((err) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
  } else {
    console.log('✅ Connected to MySQL Database');
  }
});

// Environment Variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// In-Memory Users and Bot Status
const users = {};
let botActive = false;

// Routes

// Home Route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Register Route
app.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).send('Please fill all fields.');
  }

  const checkQuery = 'SELECT * FROM person WHERE email = ? OR name = ?';
  db.query(checkQuery, [email, name], (err, results) => {
    if (err) {
      console.error('❌ Error while checking user:', err);
      return res.status(500).send('Server Error while checking user.');
    }
    if (results.length > 0) {
      return res.status(400).send('Email or Username already exists.');
    }

    const insertQuery = 'INSERT INTO person (name, email, password) VALUES (?, ?, ?)';
    db.query(insertQuery, [name, email, password], (err) => {
      if (err) {
        console.error('❌ Error while inserting user:', err);
        return res.status(500).send('Server Error while inserting user.');
      }
      res.status(200).send('Registration successful!');
    });
  });
});

// Login Route
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

// Fetch all registered users
app.get('/users', (req, res) => {
  db.query('SELECT name, email FROM person', (err, results) => {
    if (err) {
      console.error('❌ Error while fetching users:', err);
      return res.status(500).send('Server Error while fetching users.');
    }
    res.json(results);
  });
});

// Fetch total registered users count
app.get('/users/count', (req, res) => {
  db.query('SELECT COUNT(*) AS total FROM person', (err, results) => {
    if (err) {
      console.error('❌ Error while counting users:', err);
      return res.status(500).send('Server Error while counting users.');
    }
    res.json({ totalUsers: results[0].total });
  });
});

// Gemini API Request (Sunny's Bot Assistant)
async function generateBotReply(prompt) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Reply in Hinglish, short, easy way. No long paragraphs. Friendly tone. If asked who made you, reply: "Sunny Chaurasiya ne banaya hai mujhe." User said: ${prompt}` }] }]
      })
    });

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, kuch samajh nahi aaya!";
  } catch (err) {
    console.error('Gemini Error:', err);
    return "Sorry, kuch error aaya!";
  }
}

// Socket.IO - Realtime Messaging
io.on('connection', (socket) => {
  console.log('🔵 A user connected:', socket.id);

  socket.on('set_name', (name) => {
    users[socket.id] = name;
  });

  socket.on('message', async (text) => {
    const sender = users[socket.id] || 'Unknown';

    // Bot Activation
    if (text === '>>bot') {
      botActive = true;
      io.emit('message', { sender: "BotX", text: "Bot is now active! Feel free to ask me anything." });
      return;
    }

    // Bot Deactivation
    if (text === '<<bot') {
      botActive = false;
      io.emit('message', { sender: "BotX", text: "Bot is now inactive." });
      return;
    }

    // Broadcast user message
    io.emit('message', { sender, text });

    // Bot auto-reply if active and message contains "bot"
    if (botActive && (text.toLowerCase().includes("bot") || text.toLowerCase().includes("sunny"))) {
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
  console.log(`🚀 BotX Pro Server is running on port ${PORT}`);
});
