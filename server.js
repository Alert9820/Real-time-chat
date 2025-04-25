import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fetch from "node-fetch"; // use v2 for compatibility

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

async function getGeminiResponse(prompt) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await response.json();
    return (
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ Gemini AI didn't reply."
    );
  } catch (error) {
    console.error("Gemini Error:", error);
    return "⚠️ Gemini AI failed to respond.";
  }
}

app.get("/", (req, res) => {
  res.send("🚀 Server is running...");
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

    if (msg.toLowerCase().includes(">>bot")) {
      const prompt = msg.replace(">>bot", "").trim() || "Say hello!";
      const botReply = await getGeminiResponse(prompt);
      io.emit("message", { sender: "Shizune-Bot 🤖", text: botReply });
    }
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
  });
});

server.listen(5000, "0.0.0.0", () => {
  console.log("🚀 Server running on port 5000");
});
