import express from "express";
import cors from "cors";
import http from "node:http";
import { Server } from "socket.io";
import { randomInt } from "node:crypto";
import { QUESTIONS } from "./questions.js";

const PORT = Number(process.env.PORT || 3001);
const ROUND_SECONDS = 20;
const INTERMISSION_MS = 4500;
const app = express();
app.use(cors());
app.get("/health", (_req, res) => res.json({ ok: true, service: "python-bug-hunt-arena", questions: QUESTIONS.length }));
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: process.env.CLIENT_ORIGIN || "*" } });

const rooms = new Map();
const cleanName = value => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 18) : "";
const publicQuestion = q => ({ title: q.title, code: q.code, options: q.options, explanation: q.explanation });
function snapshot(room) {
  return {
    code: room.code, status: room.status, roundIndex: room.roundIndex,
    roundSeconds: ROUND_SECONDS, deadline: room.deadline,
    question: room.roundIndex >= 0 && room.roundIndex < QUESTIONS.length ? publicQuestion(QUESTIONS[room.roundIndex]) : null,
    players: [...room.players.values()].map(p => ({ id: p.id, username: p.username, score: p.score, answered: room.answers.has(p.id), connected: p.connected })),
    results: room.results, hostId: room.hostId
  };
}
function broadcast(room) { io.to(room.code).emit("room:state", snapshot(room)); }
function finishRound(room) {
  if (room.status !== "playing") return;
  clearTimeout(room.timer);
  const q = QUESTIONS[room.roundIndex];
  room.status = "reveal";
  room.deadline = null;
  room.results = {
    correctIndex: q.answer,
    explanation: q.explanation,
    answers: [...room.players.values()].map(p => {
      const a = room.answers.get(p.id);
      return { id: p.id, username: p.username, choice: a?.choice ?? null, correct: a?.choice === q.answer, points: a?.points ?? 0 };
    })
  };
  broadcast(room);
  room.timer = setTimeout(() => {
    if (room.status !== "reveal") return;
    if (room.roundIndex + 1 >= QUESTIONS.length) {
      room.status = "finished";
      broadcast(room);
    } else {
      room.roundIndex += 1;
      room.answers = new Map();
      room.results = null;
      startRound(room);
    }
  }, INTERMISSION_MS);
}
function startRound(room) {
  room.status = "playing";
  room.deadline = Date.now() + ROUND_SECONDS * 1000;
  room.results = null;
  room.timer = setTimeout(() => finishRound(room), ROUND_SECONDS * 1000);
  broadcast(room);
}
function roomError(socket, message) { socket.emit("game:error", { message }); }
function roomFor(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) : null;
}
function leaveRoom(socket) {
  const room = roomFor(socket);
  if (!room) return;
  const player = room.players.get(socket.data.playerId);
  if (player) player.connected = false;
  if (player && room.hostId === player.id) {
    const nextHost = [...room.players.values()].find(p => p.id !== player.id && p.connected);
    if (nextHost) room.hostId = nextHost.id;
  }
  socket.leave(room.code);
  socket.data.roomCode = null;
  socket.data.playerId = null;
  if (room.players.size && !room.players.has(room.hostId)) room.hostId = room.players.keys().next().value;
  broadcast(room);
  // Keep room and player seat briefly so a refresh can reconnect.
  setTimeout(() => {
    const current = rooms.get(room.code);
    const p = current?.players.get(player?.id);
    if (current && p && !p.connected) {
      current.players.delete(p.id);
      if (!current.players.size) {
        clearTimeout(current.timer); rooms.delete(current.code);
      } else {
        if (current.hostId === p.id) current.hostId = current.players.keys().next().value;
        broadcast(current);
      }
    }
  }, 30000);
}
io.on("connection", socket => {
  socket.emit("server:ready", { questions: QUESTIONS.length });
  socket.on("room:create", ({ username } = {}) => {
    const name = cleanName(username);
    if (!name) return roomError(socket, "Enter a username (1–18 characters).");
    const code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(0, 32)]).join("");
    const player = { id: socket.id, username: name, score: 0, connected: true };
    const room = { code, status: "lobby", roundIndex: -1, deadline: null, players: new Map([[socket.id, player]]), answers: new Map(), results: null, hostId: socket.id, timer: null };
    rooms.set(code, room); socket.join(code); socket.data.roomCode = code; socket.data.playerId = socket.id;
    socket.emit("room:joined", { code, playerId: socket.id }); broadcast(room);
  });
  socket.on("room:join", ({ code, username } = {}) => {
    const roomCode = typeof code === "string" ? code.trim().toUpperCase() : "";
    const name = cleanName(username);
    const room = rooms.get(roomCode);
    if (!name) return roomError(socket, "Enter a username (1–18 characters).");
    if (!room || room.status === "finished") return roomError(socket, "That room code is invalid or the game has ended.");
    const existing = [...room.players.values()].find(p => p.username.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (existing.connected) return roomError(socket, "That username is already in use in this room.");
      // Best-effort reconnect: reclaim the disconnected seat.
      const oldId = existing.id;
      room.players.delete(oldId);
      const oldAnswer = room.answers.get(oldId);
      if (oldAnswer) { room.answers.delete(oldId); room.answers.set(socket.id, oldAnswer); }
      existing.id = socket.id; existing.connected = true; room.players.set(socket.id, existing);
      if (room.hostId === oldId) room.hostId = socket.id;
      socket.join(room.code); socket.data.roomCode = room.code; socket.data.playerId = socket.id;
      socket.emit("room:joined", { code: room.code, playerId: socket.id, reconnected: true }); broadcast(room); return;
    }
    if (room.status !== "lobby") return roomError(socket, "This game has already started. Rejoin with a disconnected player's username or create a new room.");
    const player = { id: socket.id, username: name, score: 0, connected: true };
    room.players.set(socket.id, player); socket.join(room.code); socket.data.roomCode = room.code; socket.data.playerId = socket.id;
    socket.emit("room:joined", { code: room.code, playerId: socket.id }); broadcast(room);
  });
  socket.on("game:start", () => {
    const room = roomFor(socket);
    if (!room) return roomError(socket, "Join a room first.");
    if (room.hostId !== socket.data.playerId) return roomError(socket, "Only the room host can start the game.");
    if (room.status !== "lobby") return roomError(socket, "This game has already started.");
    room.roundIndex = 0; room.answers = new Map(); startRound(room);
  });
  socket.on("answer:submit", ({ choice } = {}) => {
    const room = roomFor(socket);
    if (!room || room.status !== "playing") return roomError(socket, "There is no active question right now.");
    const playerId = socket.data.playerId;
    if (!room.players.has(playerId)) return roomError(socket, "Your player session is no longer in this room.");
    if (room.answers.has(playerId)) return roomError(socket, "You have already answered this round.");
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return roomError(socket, "Choose one of the four answers.");
    const remainingMs = Math.max(0, room.deadline - Date.now());
    const correct = choice === QUESTIONS[room.roundIndex].answer;
    const points = correct ? 100 + Math.round(50 * remainingMs / (ROUND_SECONDS * 1000)) : 0;
    room.answers.set(playerId, { choice, points });
    room.players.get(playerId).score += points;
    if ([...room.players.values()].filter(p => p.connected).every(p => room.answers.has(p.id))) finishRound(room);
    else broadcast(room);
  });
  socket.on("disconnect", () => leaveRoom(socket));
});
httpServer.listen(PORT, "0.0.0.0", () => console.log(`Python Bug Hunt Arena server listening on ${PORT}`));
export { app, io, rooms, QUESTIONS };
