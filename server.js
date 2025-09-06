// ✅ UPDATED SERVER WITH VOICE CALLING FEATURE 
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
import bcrypt from "bcrypt"; // ✅ Password encryption ke liye

dotenv.config();

// 📁 Path setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ⚙️ Express + HTTP + Socket.io
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
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
let userCollection, historyCollection, requestCollection, friendCollection, privateMsgCollection;

client.connect()
  .then(() => {
    const db = client.db(dbName);
    userCollection = db.collection("user");
    historyCollection = db.collection("bot_history");
    requestCollection = db.collection("friend_requests");
    friendCollection = db.collection("friends");
    privateMsgCollection = db.collection("privateMessages");
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
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Reply in short Hinglish. ${prompt}`
            }]
          }],
        }),
      }
    );
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Bot confused hai.";
  } catch (e) {
    console.error("❌ Bot error:", e);
    return "Bot reply failed.";
  }
}

// 🌐 Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// 📝 Register User - ✅ FIXED
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).send("Fill all fields");

    // Check if user already exists
    const existingUser = await userCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).send("User already exists with this email");
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const uid = generateUID();

    // Create new user
    await userCollection.insertOne({
      name,
      email,
      password: hashedPassword, // ✅ Encrypted password
      uid,
      createdAt: new Date()
    });

    res.json({ message: "Registration successful", uid, name });
  } catch (e) {
    console.error("❌ Register Error:", e);
    res.status(500).send("Server error");
  }
});

// 🔑 Login - ✅ FIXED
app.post("/login", async (req, res) => {
  try {
    let email, password;
    if (req.headers["content-type"]?.includes("application/json")) {
      ({ email, password } = req.body);
    } else {
      email = req.body.email;
      password = req.body.password;
    }

    if (!email || !password) return res.status(400).send("Email and password required");

    // Find user
    const user = await userCollection.findOne({ email });
    if (!user) {
      return res.status(400).send("User not found");
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).send("Invalid password");
    }

    res.json({ message: "Login successful", uid: user.uid, name: user.name });
  } catch (e) {
    console.error("❌ Login Error:", e);
    res.status(500).send("Server error");
  }
});

// ❌ Delete Account - ✅ FIXED
app.post("/delete-account", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).send("Missing email or password");

    // Find user and verify password
    const user = await userCollection.findOne({ email });
    if (!user) {
      return res.status(400).send("User not found");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).send("Invalid password");
    }

    // Delete user and associated data
    await userCollection.deleteOne({ email });
    await historyCollection.deleteMany({ name: user.name });
    await requestCollection.deleteMany({ $or: [{ from: user.uid }, { to: user.uid }] });
    await friendCollection.deleteMany({ $or: [{ uid1: user.uid }, { uid2: user.uid }] });
    
    res.send("Account deleted successfully");
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

  const alreadySent = await requestCollection.findOne({ from: fromUid, to: toUid });
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
    const messages = await privateMsgCollection.find({ room }).sort({ timestamp: 1 }).toArray();
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
const users = {};
const activeCalls = {};
let botActive = false;

io.on("connection", (socket) => {
  console.log("🔌 User connected:", socket.id);

  socket.on("set_name", (data) => {
    if (!data) return;
    if (typeof data === "string") {
      users[socket.id] = { uid: null, name: data, socketId: socket.id };
    } else if (typeof data === "object") {
      const { uid, name } = data;
      users[socket.id] = { uid: uid || null, name: name || "Unknown", socketId: socket.id };
    }
  });

  // 📞 NEW: Register user for calling
  socket.on("register-call-user", (data) => {
    if (data && data.uid) {
      users[socket.id] = {
        uid: data.uid,
        name: data.name || "Unknown",
        socketId: socket.id
      };
      console.log("📞 User registered for calling:", data.uid);
    }
  });

  // 📞 NEW: Handle call requests
  socket.on("call-request", (data) => {
    if (!data.to || !data.callerId) return;
    
    const recipient = Object.values(users).find(user => user.uid === data.to);
    if (recipient && recipient.socketId) {
      io.to(recipient.socketId).emit("incoming-call", {
        callerId: data.callerId,
        callerName: users[socket.id]?.name || "Unknown",
        signal: data.signal
      });
    } else {
      socket.emit("call-error", "User not available");
    }
  });

  // 📞 NEW: Handle call acceptance
  socket.on("call-accepted", (data) => {
    if (!data.to || !data.callerId || !data.signal) return;
    
    const caller = Object.values(users).find(user => user.uid === data.callerId);
    if (caller && caller.socketId) {
      io.to(caller.socketId).emit("call-accepted", {
        signal: data.signal,
        recipientId: data.to
      });
    }
  });

  // 📞 NEW: Handle call rejection
  socket.on("call-rejected", (data) => {
    if (!data.to || !data.callerId) return;
    
    const caller = Object.values(users).find(user => user.uid === data.callerId);
    if (caller && caller.socketId) {
      io.to(caller.socketId).emit("call-rejected", {
        recipientId: data.to
      });
    }
  });

  // 📞 NEW: Handle call end
  socket.on("call-ended", (data) => {
    if (!data.to) return;
    
    const recipient = Object.values(users).find(user => user.uid === data.to);
    if (recipient && recipient.socketId) {
      io.to(recipient.socketId).emit("call-ended");
    }
  });

  // 📞 NEW: WebRTC signaling
  socket.on("webrtc-offer", (data) => {
    if (!data.to || !data.offer) return;
    
    const recipient = Object.values(users).find(user => user.uid === data.to);
    if (recipient && recipient.socketId) {
      io.to(recipient.socketId).emit("webrtc-offer", {
        offer: data.offer,
        callerId: data.callerId
      });
    }
  });

  socket.on("webrtc-answer", (data) => {
    if (!data.to || !data.answer) return;
    
    const recipient = Object.values(users).find(user => user.uid === data.to);
    if (recipient && recipient.socketId) {
      io.to(recipient.socketId).emit("webrtc-answer", {
        answer: data.answer
      });
    }
  });

  socket.on("webrtc-ice-candidate", (data) => {
    if (!data.to || !data.candidate) return;
    
    const recipient = Object.values(users).find(user => user.uid === data.to);
    if (recipient && recipient.socketId) {
      io.to(recipient.socketId).emit("webrtc-ice-candidate", {
        candidate: data.candidate
      });
    }
  });

  socket.on("typing", (payload) => {
    if (payload && typeof payload === "object" && payload.room) 
      socket.to(payload.room).emit("typing", payload.name || "Someone");
    else 
      socket.broadcast.emit("typing", payload || "Someone");
  });

  socket.on("join-room", (room) => {
    if (!room) return;
    socket.join(room);
    const user = users[socket.id] || { name: "Unknown", uid: null };
    socket.to(room).emit("room-joined", user.name);
  });

  // 🌍 Global Chat
  socket.on("message", async (text) => {
    if (!text || typeof text !== "string") return;
    const user = users[socket.id] || { name: "Unknown", uid: null };
    const sender = user.name;
    io.emit("message", { sender, text });

    if (text.startsWith("/bot ") && !botActive) {
      botActive = true;
      const prompt = text.substring(5);
      const reply = await generateBotReply(prompt);
      io.emit("message", { sender: "ChatBot", text: reply });
      
      if (user.name !== "Unknown") {
        await historyCollection.insertOne({
          name: user.name,
          prompt,
          reply,
          timestamp: new Date()
        });
      }
      botActive = false;
    }
  });

  // 🔒 Private Chat
  socket.on("private-message", async (payload) => {
    if (!payload || payload.__signal) return; // 🔹 ignore WebRTC signals
    
    const { room, text, sender } = payload;
    if (!room || !text || !sender) return;
    
    const messageData = {
      room,
      sender,
      text,
      timestamp: new Date()
    };
    
    // Save to database
    await privateMsgCollection.insertOne(messageData);
    
    // Send to all in room
    io.to(room).emit("private-message", messageData);
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id, users[socket.id] ? `${users[socket.id].name}/${users[socket.id].uid}` : "");
    delete users[socket.id];
  });

  // 📞 NEW: Call timer synchronization
  socket.on("call-timer-sync", (data) => {
    if (data.to && data.callerId) {
      const recipient = Object.values(users).find(user => user.uid === data.to);
      if (recipient && recipient.socketId) {
        io.to(recipient.socketId).emit("call-timer-update", {
          callerId: data.callerId,
          timestamp: data.timestamp
        });
      }
    }
  });

  // 📞 NEW: Call connected event
  socket.on("call-connected", (data) => {
    if (data.to && data.callerId) {
      const recipient = Object.values(users).find(user => user.uid === data.to);
      if (recipient && recipient.socketId) {
        io.to(recipient.socketId).emit("call-connected", {
          callerId: data.callerId,
          timestamp: data.timestamp
        });
      }
    }
  });
});

// 🚀 Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
