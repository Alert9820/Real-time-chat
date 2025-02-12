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

    // ✅ Proper Message Logging (Fixed for Render)
    socket.on("message", (msg) => {
        console.log(`📩 Message received from ${socket.id}: ${msg}`);
        io.emit("message", { sender: `User-${socket.id}`, text: msg });
    });

    // ✅ Notify when a user disconnects
    socket.on("disconnect", () => {
        console.log(`❌ User disconnected: ${socket.id}`);
    });
});

// ✅ Start Server
server.listen(5000, "0.0.0.0", () => {
    console.log("🚀 Server running on port 5000");
});
