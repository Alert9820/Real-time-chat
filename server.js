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

// ✅ Server Running Test
app.get("/", (req, res) => {
    res.send("✅ Server is running...");
});

// ✅ Real-Time Chat System
io.on("connection", (socket) => {
    console.log(`✅ User connected: ${socket.id}`);
    
    // Confirm frontend connection
    socket.emit("test", { message: "✅ Connection successful!", id: socket.id });

    // ✅ Message Handling (FIXED: No Username Issue!)
    socket.on("message", (msg) => {
        console.log(`📩 Received message from frontend:`, msg);
        io.emit("message", msg); // Directly broadcast message
    });

    // User Disconnected
    socket.on("disconnect", () => {
        console.log(`❌ User disconnected: ${socket.id}`);
    });
});

// ✅ Start Server
server.listen(5000, "0.0.0.0", () => {
    console.log("🚀 Server running on port 5000");
});
