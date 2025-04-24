const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/genai"); // ✅ Gemini SDK

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const users = {};

// ✅ Gemini Setup
const ai = new GoogleGenerativeAI({
    apiKey: "AIzaSyDdyDb0WR7cJBwT6Zj4Kbu9mV_f80Fy-zA"
});

async function getGeminiResponse(prompt) {
    try {
        const model = ai.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent(prompt);
        const response = result.response;
        return await response.text(); // Gemini SDK response
    } catch (err) {
        console.error("Gemini error:", err);
        return "⚠️ Gemini AI failed to respond. Please try again later.";
    }
}

// ✅ Base Route
app.get("/", (req, res) => {
    res.send("🚀 Real-Time Chat Server is running...");
});

// ✅ Socket.IO Chat Logic
io.on("connection", (socket) => {
    console.log(`✅ User connected: ${socket.id}`);
    socket.emit("request_name", { message: "Please enter your name:" });

    socket.on("set_name", (name) => {
        users[socket.id] = name;
        console.log(`👤 User set name: ${name}`);
        socket.emit("name_confirmed", { message: `Welcome, ${name}!` });
    });

    socket.on("message", async (msg) => {
        const senderName = users[socket.id] || `User-${socket.id}`;
        console.log(`📩 ${senderName}: ${msg}`);
        io.emit("message", { sender: senderName, text: msg });

        // ✅ Trigger AI if @bot used
        if (msg.toLowerCase().includes("@bot")) {
            const prompt = msg.replace("@bot", "").trim() || "Say hello!";
            const botReply = await getGeminiResponse(prompt);
            io.emit("message", { sender: "Shizune-Bot 🤖", text: botReply });
        }
    });

    socket.on("disconnect", () => {
        console.log(`❌ User disconnected: ${socket.id}`);
        delete users[socket.id];
    });
});

// ✅ Start Server
server.listen(5000, "0.0.0.0", () => {
    console.log("🚀 Server is running on port 5000");
});
