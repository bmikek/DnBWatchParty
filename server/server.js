const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Helper to generate a code like 4XK9-RP2M
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars like I, O, 0, 1
  let code = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += "-";
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// API endpoint for the extension popup to request a new room code
app.get("/api/generate-room", (req, res) => {
  res.json({ roomId: generateRoomCode() });
});

const socketRooms = new Map();

io.on("connection", (socket) => {
  socket.on("join-room", (roomId) => {
    if (typeof roomId !== "string" || roomId.length > 64) return;
    
    // Leave previous room if they were in one
    const prevRoom = socketRooms.get(socket.id);
    if (prevRoom) socket.leave(prevRoom);

    socket.join(roomId);
    socketRooms.set(socket.id, roomId);
    console.log(`${socket.id} joined ${roomId}`);
  });

  socket.on("video-event", (data) => {
    const room = socketRooms.get(socket.id);
    if (!room || data.roomId !== room) return; 
    socket.to(room).emit("video-event", data);
  });

  socket.on("disconnect", () => {
    socketRooms.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));