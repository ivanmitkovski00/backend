import express from "express";
import http from "http";
import { Server } from "socket.io";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 4000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
const SONGS_FILE = path.join(DATA_DIR, "songs.json");
const STATE_FILE = path.join(DATA_DIR, "state.json");

await fs.mkdir(DATA_DIR, { recursive: true });

let songs = [];
let currentSong = null;
let nextSong = null;

// --- Load songs
async function loadSongs() {
  try {
    songs = JSON.parse(await fs.readFile(SONGS_FILE, "utf8"));
  } catch {
    songs = [];
  }
}

// --- Load state
async function loadState() {
  try {
    const parsed = JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
    currentSong = parsed.currentSong ?? (songs.length ? songs[0] : null);
    nextSong = parsed.nextSong ?? null;
  } catch {
    currentSong = songs.length ? songs[0] : null;
    nextSong = null;
    await saveState();
  }
}

// --- Save state
async function saveState() {
  const payload = {
    currentSong,
    nextSong,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(STATE_FILE, JSON.stringify(payload, null, 2), "utf8");
}

// --- Initialize data
await loadSongs();
await loadState();

// --- Express
const app = express();
app.use(express.json());

app.get("/songs", (req, res) => res.json(songs));
app.get("/state", (req, res) => res.json({ songs, currentSong, nextSong }));

// --- HTTP + Socket.IO
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://band-oy2rxxhcg-samsaramk2025-5896s-projects.vercel.app",
    ],
    methods: ["GET", "POST"],
  },
  transports: ["websocket"],
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

server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
