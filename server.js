const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const fetch = require("node-fetch"); // Gemini ke liye

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const users = {};

// Gemini AI logic
async function getGeminiReply(prompt) {
    try {
        const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=AIzaSyDdyDb0WR7cJBwT6Zj4Kbu9mV_f80Fy-zA", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        const data = await res.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't respond.";
    } catch (err) {
        console.error("Gemini error:", err);
        return "Oops! Something went wrong with AI.";
    }
}

app.get("/", (req, res) => {
    res.send("✅ Server is running...");
});

io.on("connection", (socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    socket.emit("request_name", { message: "Please enter your name:" });

    socket.on("set_name", (name) => {
        users[socket.id] = name;
        console.log(`👤 User set name: ${name}`);
        socket.emit("name_confirmed", { message: `✅ Name set as ${name}` });
    });

    socket.on("message", async (msg) => {
        const senderName = users[socket.id] || `User-${socket.id}`;
        console.log(`📩 Message from ${senderName}: ${msg}`);

        io.emit("message", { sender: senderName, text: msg });

        // Check for @bot mention
        if (msg.toLowerCase().includes("@bot")) {
            const prompt = msg.replace("@bot", "").trim();
            const botReply = await getGeminiReply(prompt || "Say hello!");
            io.emit("message", { sender: "Shizune-Bot 🤖", text: botReply });
        }
    });

    socket.on("disconnect", () => {
        console.log(`❌ User disconnected: ${socket.id}`);
        delete users[socket.id];
    });
});

server.listen(5000, "0.0.0.0", () => {
    console.log("🚀 Server running on port 5000");
});
