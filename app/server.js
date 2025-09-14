import express from "express";
import http from "http";
import { Server } from "socket.io";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 4000;
const DATA_DIR = process.env.DATA_DIR || path.resolve("./data");
const SONGS_FILE = path.join(DATA_DIR, "songs.json");
const STATE_FILE = path.join(DATA_DIR, "state.json");

// Ensure data folder exists
await fs.mkdir(DATA_DIR, { recursive: true });

let songs = [];
let currentSong = null;
let nextSong = null;

// Load songs
async function loadSongs() {
  try {
    const raw = await fs.readFile(SONGS_FILE, "utf8");
    songs = JSON.parse(raw);
  } catch {
    songs = [];
  }
}

// Load state
async function loadState() {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    currentSong = parsed.currentSong ?? (songs.length ? songs[0] : null);
    nextSong = parsed.nextSong ?? null;
  } catch {
    currentSong = songs.length ? songs[0] : null;
    nextSong = null;
    await saveState();
  }
}

// Save state
async function saveState() {
  const payload = { currentSong, nextSong, updatedAt: new Date().toISOString() };
  await fs.writeFile(STATE_FILE, JSON.stringify(payload, null, 2), "utf8");
}

// Init
await loadSongs();
await loadState();

const app = express();
app.use(express.json());

// REST endpoints
app.get("/songs", (req, res) => res.json(songs));
app.get("/state", (req, res) => res.json({ songs, currentSong, nextSong }));

// HTTP + Socket.IO
const server = http.createServer(app);

// Socket.IO with CORS for Vercel + localhost
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",           // local dev
      "https://bandapp-beta.vercel.app"  // production FE
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"]
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.emit("state", { songs, currentSong, nextSong });

  socket.on("setCurrentSong", async (id) => {
    const song = songs.find((s) => s.id === id) || null;
    if (!song) return;
    currentSong = song;
    await saveState();
    io.emit("state", { songs, currentSong, nextSong });
  });

  socket.on("setNextSong", async (id) => {
    const song = songs.find((s) => s.id === id) || null;
    if (!song) return;
    nextSong = song;
    await saveState();
    io.emit("state", { songs, currentSong, nextSong });
  });

  socket.on("disconnect", () => console.log("Client disconnected:", socket.id));
});

// Start server
server.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));
