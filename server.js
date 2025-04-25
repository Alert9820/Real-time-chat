import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const users = {};
const GEMINI_API_KEY = "AIzaSyDdyDb0WR7cJBwT6Zj4Kbu9mV_f80Fy-zA";

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("✅ Real-Time Chat Server is Live!");
});

// ✅ Gemini API Route (FIXED MODEL NAME)
app.post("/gemini", async (req, res) => {
  const prompt = req.body.prompt;
  console.log("🔹 Gemini Prompt Received:", prompt);

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await geminiRes.json();
    console.log("🔸 Gemini Full Response:", JSON.stringify(data, null, 2));

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ Gemini did not reply.";
    res.json({ text });
  } catch (err) {
    console.error("❌ Gemini API Error:", err);
    res.status(500).json({ text: "Error from Gemini API." });
  }
});

// ✅ Real-time Chat (Socket.io)
io.on("connection", (socket) => {
  console.log(`✅ User connected: ${socket.id}`);
  socket.emit("request_name", { message: "Please enter your name:" });

  socket.on("set_name", (name) => {
    users[socket.id] = name;
    socket.emit("name_confirmed", { message: `✅ Name set as ${name}` });
  });

  socket.on("message", (msg) => {
    const sender = users[socket.id] || `User-${socket.id}`;
    io.emit("message", { sender, text: msg });
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
  });
});

server.listen(5000, "0.0.0.0", () => {
  console.log("🚀 Server running on port 5000");
});
