const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ✅ Server Test Route
app.get("/", (req, res) => {
    res.send("✅ Server is running...");
});

// ✅ Real-Time Chat System
io.on("connection", (socket) => {
    console.log(`✅ User connected: ${socket.id}`);
    
    // Notify frontend that user is connected
    socket.emit("connected", { message: "You are connected!", id: socket.id });

    // Message handling
    socket.on("message", (data) => {
        console.log(`📩 Message from ${data.sender}: ${data.text}`);
        io.emit("message", { sender: data.sender, text: data.text }); // Broadcast message
    });

    // User disconnected
    socket.on("disconnect", () => {
        console.log(`❌ User disconnected: ${socket.id}`);
    });
});

// ✅ Start Server
server.listen(5000, "0.0.0.0", () => {
    console.log("🚀 Server running on port 5000");
});
