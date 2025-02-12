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

// ✅ Store users with their names
const users = {};

// ✅ Server Running Test
app.get("/", (req, res) => {
    res.send("✅ Server is running...");
});

// ✅ Real-Time Chat System
io.on("connection", (socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    // Ask for username
    socket.emit("request_name", { message: "Please enter your name:" });

    // Store username
    socket.on("set_name", (name) => {
        users[socket.id] = name;
        console.log(`👤 User set name: ${name}`);
        socket.emit("name_confirmed", { message: `✅ Name set as ${name}` });
    });

    // ✅ Proper Message Logging with Name
    socket.on("message", (msg) => {
        const senderName = users[socket.id] || `User-${socket.id}`;
        console.log(`📩 Message from ${senderName}: ${msg}`);
        io.emit("message", { sender: senderName, text: msg });
    });

    // ✅ Notify when a user disconnects
    socket.on("disconnect", () => {
        console.log(`❌ User disconnected: ${socket.id}`);
        delete users[socket.id]; // Remove user from list
    });
});

// ✅ Start Server
server.listen(5000, "0.0.0.0", () => {
    console.log("🚀 Server running on port 5000");
});
