// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";
const DATA_DIR = process.env.DATA_DIR || path.resolve("./data");
const SONGS_FILE = path.join(DATA_DIR, "songs.json");
const STATE_FILE = path.join(DATA_DIR, "state.json");

await fs.mkdir(DATA_DIR, { recursive: true });

let songs: any[] = [];
let currentSong: any = null;
let nextSong: any = null;

// --- Helpers: load/save files
async function loadSongs() {
  try {
    const raw = await fs.readFile(SONGS_FILE, "utf8");
    songs = JSON.parse(raw);
  } catch (err) {
    console.warn("Could not load songs.json — starting empty.", err.message);
    songs = [];
  }
}

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

async function saveState() {
  const payload = { currentSong, nextSong, updatedAt: new Date().toISOString() };
  try {
    await fs.writeFile(STATE_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save state.json:", err);
  }
}

// Load data
await loadSongs();
await loadState();

const app = express();
app.use(express.json());
app.use(cors({ origin: CLIENT_ORIGIN }));

// --- REST Endpoints
app.get("/songs", (req, res) => res.json(songs));
app.get("/state", (req, res) => res.json({ songs, currentSong, nextSong }));

// --- HTTP + Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Send initial state
  socket.emit("state", { songs, currentSong, nextSong });

  // --- Set current song
  socket.on("setCurrentSong", async (payload) => {
    let song = null;
    if (typeof payload === "number") song = songs.find(s => s.id === payload) || null;
    else if (payload?.id) song = songs.find(s => s.id === payload.id) || null;

    if (!song) return socket.emit("error", "Song not found");

    currentSong = song;
    await saveState();
    io.emit("state", { songs, currentSong, nextSong });
  });

  // --- Set next song
  socket.on("setNextSong", async (payload) => {
    let song = null;
    if (typeof payload === "number") song = songs.find(s => s.id === payload) || null;
    else if (payload?.id) song = songs.find(s => s.id === payload.id) || null;

    if (!song) return socket.emit("error", "Song not found");

    nextSong = song;
    await saveState();
    io.emit("state", { songs, currentSong, nextSong });
  });

  socket.on("disconnect", (reason) => console.log("Client disconnected:", socket.id, reason));
});

// Graceful shutdown
async function shutdown() {
  console.log("Shutting down...");
  await saveState();
  io.close();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
