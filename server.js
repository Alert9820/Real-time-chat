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

// ✅ Test Route
app.get("/", (req, res) => {
    res.send("✅ Server is running...");
});

// ✅ Connection Handling
io.on("connection", (socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    // ✅ Message Handling (Sirf dusre users ko bhejega)
    socket.on("message", (data) => {
        console.log(`📩 Message from ${socket.id}: ${data}`);
        socket.broadcast.emit("message", { text: data, sender: socket.id });
    });

    // ✅ Disconnection Handling
    socket.on("disconnect", () => {
        console.log(`❌ User disconnected: ${socket.id}`);
    });
});

// ✅ Server Accessible from Any Device
server.listen(5000, "0.0.0.0", () => {
    console.log("🚀 Server running on port 5000");
});
