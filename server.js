import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { createServer } from 'http';
import mysql from 'mysql2';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch'; // Gemini API ke liye fetch

// ES module setup ke liye
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

// MySQL Connection
const db = mysql.createConnection({
  host: 'localhost',      
  user: 'root',             
  password: '',            
  database: 'botx_db'      
});

db.connect((err) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
  } else {
    console.log('✅ Connected to MySQL Database');
  }
});

// In-memory object to store users
const users = {};
let botActive = false;

// Gemini API Details
const GEMINI_API_KEY = "AIzaSyDdyDb0WR7cJBwT6Zj4Kbu9mV_f80Fy-zA"; // tumhara key

async function askGemini(prompt) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-pro:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Reply short, simple and friendly in Hinglish:\n${prompt}` }] }]
      })
    });

    const data = await response.json();
    const botReply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Kuch samajh nahi aaya!";
    return botReply;
  } catch (error) {
    console.error("Gemini API error:", error);
    return "Sorry, kuch error aa gaya!";
  }
}

// Routes

// Register
app.post('/register', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).send('Please fill all fields.');
  }

  db.query('SELECT * FROM users WHERE email = ? OR name = ?', [email, name], (err, results) => {
    if (err) return res.status(500).send('Server Error');
    if (results.length > 0) return res.status(400).send('Email or Username already exists.');

    db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, password], (err, result) => {
      if (err) return res.status(500).send('Registration Error');
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

// Serve login.html as default page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Socket.IO realtime chat
io.on('connection', (socket) => {
  console.log('🔵 User connected:', socket.id);

  socket.on('set_name', (name) => {
    users[socket.id] = name;
  });

  socket.on('message', async (text) => {
    const senderName = users[socket.id] || "Unknown";

    if (text === '>>bot') {
      botActive = true;
      io.emit('message', { sender: "BotX", text: "Bot activated! Ask me anything!" });
      return;
    }
    if (text === '<<bot') {
      botActive = false;
      io.emit('message', { sender: "BotX", text: "Bot deactivated!" });
      return;
    }

    io.emit('message', { sender: senderName, text });

    if (botActive && (text.toLowerCase().includes('bot') || senderName === 'BotX')) {
      const botReply = await askGemini(text);
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
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
