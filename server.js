// ✅ UPDATED SERVER WITH VOICE CALLING + GROUP CHAT FEATURE
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
dotenv.config();

// 📁 Path setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ⚙️ Express + HTTP + Socket.io
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
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
let userCollection, historyCollection, requestCollection, friendCollection, 
    privateMsgCollection, groupCollection, groupMessageCollection;

client
  .connect()
  .then(() => {
    const db = client.db(dbName);
    userCollection = db.collection("user");
    historyCollection = db.collection("bot_history");
    requestCollection = db.collection("friend_requests");
    friendCollection = db.collection("friends");
    privateMsgCollection = db.collection("privateMessages");
    groupCollection = db.collection("groups"); // ✅ NEW: Group collection
    groupMessageCollection = db.collection("groupMessages"); // ✅ NEW: Group messages
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Reply in short Hinglish. ${prompt}` }] }],
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

// 📝 Register User
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).send("Fill all fields");

    const exist = await userCollection.findOne({ $or: [{ email }, { name }] });
    if (exist) return res.status(400).send("User already exists");

    const uid = generateUID();
    await userCollection.insertOne({ name, email, password, uid });
    res.send("Registration success");
  } catch (e) {
    console.error("❌ Register Error:", e);
    res.status(500).send("Server error");
  }
});

// 🔑 Login
app.post("/login", async (req, res) => {
  try {
    let email, password;
    if (req.headers["content-type"]?.includes("application/json")) {
      ({ email, password } = req.body);
    } else {
      email = req.body.email;
      password = req.body.password;
    }

    const user = await userCollection.findOne({ email, password });
    if (!user) return res.status(401).send("Invalid");

    res.json({ name: user.name, email: user.email, uid: user.uid });
  } catch (e) {
    console.error("❌ Login Error:", e);
    res.status(500).send("Server error");
  }
});

// ❌ Delete Account
app.post("/delete-account", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).send("Missing email");

    const result = await userCollection.deleteOne({ email });
    if (result.deletedCount === 1) res.send("Account deleted successfully");
    else res.status(404).send("User not found");
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

// 🆕 GROUP CHAT ROUTES

// 📋 Create Group
app.post("/create-group", async (req, res) => {
  try {
    const { name, createdBy, participants } = req.body;
    
    if (!name || !createdBy) {
      return res.status(400).send("Group name and creator are required");
    }

    const groupId = generateUID();
    const groupData = {
      groupId,
      name,
      createdBy,
      participants: participants || [createdBy],
      createdAt: new Date()
    };

    await groupCollection.insertOne(groupData);
    res.json({ message: "Group created successfully", groupId });
  } catch (e) {
    console.error("❌ Create Group Error:", e);
    res.status(500).send("Server error");
  }
});

// 👥 Add Participants to Group
app.post("/add-to-group", async (req, res) => {
  try {
    const { groupId, userId } = req.body;
    
    if (!groupId || !userId) {
      return res.status(400).send("Group ID and User ID are required");
    }

    await groupCollection.updateOne(
      { groupId },
      { $addToSet: { participants: userId } }
    );
    
    res.send("User added to group");
  } catch (e) {
    console.error("❌ Add to Group Error:", e);
    res.status(500).send("Server error");
  }
});

// 📜 Get User Groups
app.get("/get-user-groups", async (req, res) => {
  try {
    const userId = req.query.userId;
    const groups = await groupCollection.find({ 
      participants: userId 
    }).toArray();
    
    res.json(groups);
  } catch (e) {
    console.error("❌ Get User Groups Error:", e);
    res.status(500).send("Server error");
  }
});

// 💬 Get Group Messages
app.get("/get-group-messages", async (req, res) => {
  try {
    const { groupId } = req.query;
    const messages = await groupMessageCollection.find({ 
      groupId 
    }).sort({ timestamp: 1 }).toArray();
    
    res.json(messages);
  } catch (e) {
    console.error("❌ Get Group Messages Error:", e);
    res.status(500).send("Error loading group messages");
  }
});

// 🧹 Clear Group Messages
app.post("/clear-group-messages", async (req, res) => {
  try {
    const { groupId } = req.body;
    await groupMessageCollection.deleteMany({ groupId });
    res.send("Group messages cleared");
  } catch (e) {
    console.error("❌ Clear Group Messages Error:", e);
    res.status(500).send("Error clearing group messages");
  }
});

// ✅ CLEAR GROUP CHAT ROUTE
app.post("/clear-group-chat", async (req, res) => {
  try {
    const { groupId } = req.body;
    await groupMessageCollection.deleteMany({ groupId });
    
    // Notify all group members
    io.to(`group-${groupId}`).emit("chat-cleared", {
      groupId,
      clearedBy: req.body.clearedBy || "Someone"
    });
    
    res.send("Chat cleared successfully");
  } catch (e) {
    console.error("❌ Clear Group Chat Error:", e);
    res.status(500).send("Error clearing chat");
  }
});

// ✅ RENAME GROUP ROUTE
app.post("/rename-group", async (req, res) => {
  try {
    const { groupId, newName } = req.body;
    
    if (!groupId || !newName) {
      return res.status(400).send("Group ID and new name are required");
    }

    await groupCollection.updateOne(
      { groupId },
      { $set: { name: newName } }
    );
    
    // Notify all group members
    io.to(`group-${groupId}`).emit("group-renamed", {
      groupId,
      newName
    });
    
    res.send("Group renamed successfully");
  } catch (e) {
    console.error("❌ Rename Group Error:", e);
    res.status(500).send("Error renaming group");
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
    
    console.log("📞 Call request from:", data.callerId, "to:", data.to);
    
    // Find recipient's socket ID
    const recipientEntry = Object.entries(users).find(([_, user]) => user.uid === data.to);
    
    if (recipientEntry) {
      const [recipientSocketId, recipient] = recipientEntry;
      
      // Store call info
      activeCalls[data.callerId] = {
        recipient: data.to,
        status: 'calling',
        socketId: socket.id
      };
      
      activeCalls[data.to] = {
        caller: data.callerId,
        status: 'ringing',
        socketId: recipientSocketId
      };
      
      // Send call request to recipient
      io.to(recipientSocketId).emit("incoming-call", {
        callerId: data.callerId,
        callerName: data.callerName || "Unknown"
      });
    } else {
      // Recipient not found or offline
      socket.emit("call-error", {
        message: "User is offline or unavailable"
      });
    }
  });

  // 📞 NEW: Handle call acceptance
  socket.on("call-accepted", (data) => {
    if (!data.to || !data.callerId) return;
    
    console.log("✅ Call accepted by:", data.callerId);
    
    // Find caller's socket ID from activeCalls
    const callInfo = activeCalls[data.callerId];
    if (callInfo && callInfo.socketId) {
      // Update call status
      activeCalls[data.callerId].status = 'connected';
      activeCalls[data.to].status = 'connected';
      
      // Notify caller
      io.to(callInfo.socketId).emit("call-accepted", {
        callerId: data.callerId
      });
    }
  });

  // 📞 NEW: Handle call rejection
  socket.on("call-rejected", (data) => {
    if (!data.to || !data.callerId) return;
    
    console.log("❌ Call rejected by:", data.callerId);
    
    // Find caller's socket ID from activeCalls
    const callInfo = activeCalls[data.callerId];
    if (callInfo && callInfo.socketId) {
      // Remove call info
      delete activeCalls[data.callerId];
      delete activeCalls[data.to];
      
      // Notify caller
      io.to(callInfo.socketId).emit("call-rejected", {
        callerId: data.callerId
      });
    }
  });

  // 📞 NEW: Handle call end
  socket.on("call-ended", (data) => {
    if (!data.to || !data.callerId) return;
    
    console.log("📞 Call ended:", data.callerId);
    
    // Find other user's call info
    const callInfo = activeCalls[data.callerId] || activeCalls[data.to];
    
    if (callInfo && callInfo.socketId) {
      // Remove call info
      delete activeCalls[data.callerId];
      delete activeCalls[data.to];
      
      // Notify other user
      io.to(callInfo.socketId).emit("call-ended", {
        callerId: data.callerId
      });
    }
  });

  // 📞 NEW: WebRTC signaling
  socket.on("webrtc-offer", (data) => {

  // 🆕 GROUP CHAT SOCKET EVENTS
  socket.on("join-group", (groupId) => {
    socket.join(`group-${groupId}`);
    console.log(`User joined group: ${groupId}`);
  });

  socket.on("leave-group", (groupId) => // 🧠 Socket.IO Logic
const users = {};       // socketId -> { uid, name, socketId }
const activeCalls = {}; // uid -> call state

io.on("connection", (socket) => {
  console.log("🔌 User connected:", socket.id);

  // Register user with name/uid
  socket.on("register-call-user", (data) => {
    if (data && data.uid) {
      users[socket.id] = {
        uid: data.uid,
        name: data.name || "Unknown",
        socketId: socket.id
      };
      console.log("📞 Registered:", data.uid, "->", socket.id);
    }
  });

  // 📞 Handle call request
  socket.on("call-request", (data) => {
    if (!data.to || !data.callerId) return;

    console.log("📞 Call request:", data.callerId, "->", data.to);

    // Find recipient
    const recipient = Object.values(users).find(u => u.uid === data.to);

    if (recipient) {
      // Save active call
      activeCalls[data.callerId] = { with: data.to, status: "calling", socketId: socket.id };
      activeCalls[data.to] = { with: data.callerId, status: "ringing", socketId: recipient.socketId };

      // Notify recipient
      io.to(recipient.socketId).emit("incoming-call", {
        callerId: data.callerId,
        callerName: data.callerName || "Unknown"
      });
    } else {
      socket.emit("call-error", { message: "User is offline or unavailable" });
    }
  });

  // 📞 Handle call acceptance
  socket.on("call-accepted", (data) => {
    if (!data.to || !data.callerId) return;

    console.log("✅ Call accepted by:", data.callerId);

    const callerCall = activeCalls[data.callerId];
    if (callerCall && callerCall.socketId) {
      activeCalls[data.callerId].status = "connected";
      activeCalls[data.to].status = "connected";

      io.to(callerCall.socketId).emit("call-accepted", {
        callerId: data.callerId
      });
    }
  });

  // 📞 Handle call rejection
  socket.on("call-rejected", (data) => {
    if (!data.to || !data.callerId) return;

    console.log("❌ Call rejected by:", data.callerId);

    const callerCall = activeCalls[data.callerId];
    if (callerCall && callerCall.socketId) {
      delete activeCalls[data.callerId];
      delete activeCalls[data.to];

      io.to(callerCall.socketId).emit("call-rejected", {
        callerId: data.callerId
      });
    }
  });

  // 📞 Handle call end
  socket.on("call-ended", (data) => {
    if (!data.to || !data.callerId) return;

    console.log("📞 Call ended:", data.callerId);

    const callInfo = activeCalls[data.callerId] || activeCalls[data.to];

    if (callInfo && callInfo.socketId) {
      delete activeCalls[data.callerId];
      delete activeCalls[data.to];

      io.to(callInfo.socketId).emit("call-ended", {
        callerId: data.callerId
      });
    }
  });

  // 📞 WebRTC signaling
  socket.on("webrtc-offer", (data) => {
    if (!data.to || !data.offer) return;

    const recipient = Object.values(users).find(u => u.uid === data.to);
    if (recipient) {
      io.to(recipient.socketId).emit("webrtc-offer", {
        offer: data.offer,
        from: data.from || users[socket.id]?.uid
      });
    }
  });

  socket.on("webrtc-answer", (data) => {
    if (!data.to || !data.answer) return;

    const recipient = Object.values(users).find(u => u.uid === data.to);
    if (recipient) {
      io.to(recipient.socketId).emit("webrtc-answer", {
        answer: data.answer,
        from: data.from || users[socket.id]?.uid
      });
    }
  });

  socket.on("webrtc-ice-candidate", (data) => {
    if (!data.to || !data.candidate) return;

    const recipient = Object.values(users).find(u => u.uid === data.to);
    if (recipient) {
      io.to(recipient.socketId).emit("webrtc-ice-candidate", {
        candidate: data.candidate,
        from: data.from || users[socket.id]?.uid
      });
    }
  });

  // 🧹 Handle disconnect
  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);

    const user = users[socket.id];
    if (user) {
      // Clean up active calls
      delete activeCalls[user.uid];
      delete users[socket.id];
    }
  });
});{
    socket.leave(`group-${groupId}`);
    console.log(`User left group: ${groupId}`);
  });

  socket.on("group-message", async (data) => {
    try {
      const { groupId, sender, text, senderName } = data;
      
      if (!groupId || !text) return;

      // Save group message to database
      const messageData = {
        groupId,
        sender,
        senderName,
        text,
        timestamp: new Date()
      };

      await groupMessageCollection.insertOne(messageData);
      
      // Send to all group members
      io.to(`group-${groupId}`).emit("group-message", messageData);
      
      // ✅ BOT AUTO-RESPONSE
      if (text.toLowerCase().includes("bot")) {
        const prompt = text.replace(/bot/gi, "").trim();
        if (prompt) {
          const reply = await generateBotReply(prompt);
          
          // Send bot reply
          io.to(`group-${groupId}`).emit("group-message", {
            groupId,
            sender: "BotX",
            senderName: "BotX",
            text: reply,
            timestamp: new Date()
          });
          
          // Save to history
          const user = await userCollection.findOne({ uid: sender });
          if (user) {
            await historyCollection.insertOne({
              name: user.name,
              prompt,
              reply,
              timestamp: new Date()
            });
          }
        }
      }
    } catch (e) {
      console.error("❌ Group Message Error:", e);
    }
  });

  // ✅ CLEAR CHAT EVENT
  socket.on("clear-chat", (data) => {
    const { groupId, clearedBy } = data;
    io.to(`group-${groupId}`).emit("chat-cleared", {
      groupId,
      clearedBy
    });
  });

  // ✅ BOT MESSAGE EVENT
  socket.on("bot-message", async (data) => {
    try {
      const { groupId, prompt, userId } = data;
      
      // Generate bot reply
      const reply = await generateBotReply(prompt);
      
      // Send bot reply to the group
      io.to(`group-${groupId}`).emit("bot-reply", {
        groupId,
        text: reply
      });
      
      // Save to history if needed
      const user = await userCollection.findOne({ uid: userId });
      if (user) {
        await historyCollection.insertOne({
          name: user.name,
          prompt,
          reply,
          timestamp: new Date()
        });
      }
    } catch (e) {
      console.error("❌ Bot message error:", e);
    }
  });

  // ✅ GROUP RENAME EVENT
  socket.on("group-rename", (data) => {
    const { groupId, newName } = data;
    io.to(`group-${groupId}`).emit("group-renamed", {
      groupId,
      newName
    });
  });

  socket.on("group-typing", (data) => {
    const { groupId, userName } = data;
    socket.to(`group-${groupId}`).emit("group-typing", userName);
  });

  socket.on("typing", (payload) => {
    if (payload && typeof payload === "object" && payload.room) socket.to(payload.room).emit("typing", payload.name || "Someone");
    else socket.broadcast.emit("typing", payload || "Someone");
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

    if (text === ">>bot") { botActive = true; io.emit("message", { sender: "System", text: "Bot is now active." }); return; }
    if (text === "<<bot") { botActive = false; io.emit("message", { sender: "System", text: "Bot is now inactive." }); return; }

    if (botActive && text.toLowerCase().includes("bot")) {
      const clean = text.replace(/bot/gi, "").trim();
      const reply = await generateBotReply(clean || "Hello");
      io.emit("message", { sender: "BotX", text: reply });
      await historyCollection.insertOne({ name: sender, prompt: clean, reply });
    }
  });

  // 🔒 Private Chat
  socket.on("private-message", async (payload) => {
    if (!payload || payload.__signal) return; // 🔹 ignore WebRTC signals

    const { room, sender, text } = payload;
    if (!room || !sender || !text) return;

    io.to(room).emit("private-message", { sender, text });

    // Save message
    try {
      await privateMsgCollection.insertOne({ room, sender, text, timestamp: new Date() });
    } catch (e) {
      console.error("❌ Save private message error:", e);
    }

    // Bot reply in private
    if (botActive && text.toLowerCase().includes("bot")) {
      const prompt = text.replace(/bot/gi, "").trim();
      const reply = await generateBotReply(prompt);
      io.to(room).emit("bot-reply", { sender: "BotX", text: reply });
      try { await historyCollection.insertOne({ name: sender, prompt, reply }); } catch {}
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id, users[socket.id] ? `(${users[socket.id].name}/${users[socket.id].uid})` : "");
    
    // 📞 NEW: Clean up active calls on disconnect
    if (users[socket.id] && users[socket.id].uid) {
      const uid = users[socket.id].uid;
      if (activeCalls[uid]) {
        const otherParty = activeCalls[uid].recipient || activeCalls[uid].caller;
        if (otherParty && activeCalls[otherParty]) {
          const otherSocketId = activeCalls[otherParty].socketId;
          if (otherSocketId) {
            io.to(otherSocketId).emit("call-ended", { callerId: uid });
          }
        }
        delete activeCalls[uid];
        if (otherParty) delete activeCalls[otherParty];
      }
    }
    
    delete users[socket.id];
  });
});

// 🚀 Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
