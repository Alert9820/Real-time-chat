import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());

const users = {};
let botActive = false;
const GEMINI_API_KEY = "AIzaSyDdyDb0WR7cJBwT6Zj4Kbu9mV_f80Fy-zA"; // Replace with your Gemini key

app.get("/", (req, res) => {
  res.send("✅ BotX Real-Time Chat Server is Live!");
});

app.post("/gemini", async (req, res) => {
  const userMsg = req.body.prompt;
  const prompt = `You are BotX, a friendly assistant. Reply in short, simple Hinglish if the user uses Hindi. Be casual, avoid long explanations. Here's the message: ${userMsg}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "🤖 No reply.";
    res.json({ text });
  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).json({ text: "Error from Gemini API." });
  }
});

io.on("connection", (socket) => {
  console.log(`✅ Connected: ${socket.id}`);
  socket.emit("request_name", { message: "Please enter your name:" });

  socket.on("set_name", (name) => {
    users[socket.id] = name;
    socket.emit("name_confirmed", { message: `✅ Name set as ${name}` });
  });

  socket.on("message", async (msg) => {
    const sender = users[socket.id] || `User-${socket.id}`;
    io.emit("message", { sender, text: msg });

    if (msg === ">>bot") {
      botActive = true;
      io.emit("message", { sender: "BotX 🤖", text: "Bot is now active." });
      return;
    }

    if (msg === "<<bot") {
      botActive = false;
      io.emit("message", { sender: "BotX 🤖", text: "Bot is now inactive." });
      return;
    }

    if (
      botActive &&
      !msg.startsWith("[img]") &&
      sender !== "BotX 🤖" &&
      msg.toLowerCase().includes("bot")
    ) {
      try {
        const prompt = `You are BotX, a friendly assistant. Reply in short, simple Hinglish if the user uses Hindi. Be casual, avoid long explanations. Here's the message: ${msg}`;

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }]
            })
          }
        );

        const data = await geminiRes.json();
        const botReply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "🤖 No reply.";
        io.emit("message", { sender: "BotX 🤖", text: botReply });
      } catch (err) {
        io.emit("message", { sender: "BotX 🤖", text: "⚠️ Gemini API error." });
      }
    }
  });

  socket.on("typing", (username) => {
    socket.broadcast.emit("typing", username);
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
  });
});

server.listen(5000, "0.0.0.0", () => {
  console.log("🚀 BotX Server running on port 5000");
});
