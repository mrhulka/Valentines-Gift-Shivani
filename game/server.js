import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  ANSWER_MS, CLIP_MS, REVEAL_MS, MAX_PLAYERS,
  isCorrectHard, scoreFor, streakLabel, buildPool, pickQuestionSongs,
  makeOptions, roomCode, shuffle,
} from "./engine.js";
import { registerSpotify } from "./spotify.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SONGS = JSON.parse(readFileSync(join(__dirname, "songs.json"), "utf8"));

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public")));
const http = createServer(app);
const io = new Server(http);

registerSpotify(app); // optional; no-op unless SPOTIFY_* env vars are set

/** rooms: code -> room. In-memory only.
 *  ponytail: in-memory store; add Postgres/Redis only when games must survive a restart. */
const rooms = new Map();

const AVATARS = ["🦊", "🐼", "🦄", "🐙", "🦁", "🐸", "🐵", "🐶", "🐱", "🐯", "🐨", "🦩"];
const sanitizePlayer = (p) => ({
  id: p.id, name: p.name, avatar: p.avatar, ready: p.ready,
  connected: p.connected, isHost: false, score: p.score, streak: p.streak,
  spotifyConnected: p.spotifyConnected,
});

function roomState(room) {
  const players = [...room.players.values()].map((p) => {
    const s = sanitizePlayer(p);
    s.isHost = p.id === room.hostId;
    return s;
  });
  return {
    code: room.code, mode: room.mode, answerMode: room.answerMode,
    questionCount: room.questionCount, status: room.status, hostId: room.hostId,
    players, phase: room.phase, questionNumber: room.current + 1,
    startAt: room.startAt || null, // set => auto-start countdown running
  };
}

const broadcast = (room) => io.to(room.code).emit("roomState", roomState(room));

// Auto-start 5s after every connected player is ready; cancel if that changes.
const START_DELAY = Number(process.env.START_DELAY) || 5000;
function evaluateStart(room) {
  clearTimeout(room.startTimer); room.startTimer = null; room.startAt = null;
  if (room.status !== "lobby") return;
  const conn = [...room.players.values()].filter((p) => p.connected);
  if (conn.length >= 1 && conn.every((p) => p.ready)) {
    room.startAt = Date.now() + START_DELAY;
    room.startTimer = setTimeout(() => { room.startAt = null; startGame(room).catch(() => {}); }, START_DELAY);
  }
}

// ---- HTTP: quick validity check for the join screen ----
app.get("/api/room/:code", (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json({ code: room.code, status: room.status, players: room.players.size, max: MAX_PLAYERS });
});

// ---- playback: find a PLAYABLE YouTube video for each song.
// videoEmbeddable=true means the API only returns videos that are allowed to
// play in an embed — the exact filter that avoids the "embedding disabled"
// failures. Needs YOUTUBE_API_KEY. Cached. Curated songs already carry an id.
const YT_KEY = process.env.YOUTUBE_API_KEY;
const ytCache = new Map(); // "title|artist" -> videoId | null
async function resolveYouTube(song) {
  if (song.youtubeVideoId) return song.youtubeVideoId; // curated fallback has one
  const key = `${song.title}|${song.artist}`.toLowerCase();
  if (ytCache.has(key)) return ytCache.get(key);
  let id = null;
  if (YT_KEY) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 4000);
      const u = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=1&q=${encodeURIComponent(song.title + " " + song.artist + " official audio")}&key=${YT_KEY}`;
      const r = await fetch(u, { signal: ac.signal });
      clearTimeout(t);
      const j = await r.json();
      id = j.items?.[0]?.id?.videoId || null;
    } catch { /* miss -> null; round still runs, just no audio */ }
  }
  ytCache.set(key, id);
  return id;
}

// ================= game loop (server-authoritative) =================
async function startGame(room) {
  const players = [...room.players.values()];

  // Pool = the connected players' Spotify libraries, each song attributed to
  // whoever it came from (Friend Mix). Falls back to the curated list so the
  // game never breaks if Spotify returns nothing.
  const contrib = new Map(); // key -> {id,title,artist,genre,era,sources:Set}
  for (const p of players) {
    for (const t of p.spotifyTracks || []) {
      const key = `${t.title}|${t.artist}`.toLowerCase();
      if (!contrib.has(key)) contrib.set(key, { id: key, title: t.title, artist: t.artist, genre: "", era: "", sources: new Set() });
      contrib.get(key).sources.add(p.id);
    }
  }
  let pool = [...contrib.values()];
  if (pool.length < 4) pool = SONGS.map((s) => ({ ...s, sources: new Set() })); // fallback

  // pick the questions first, then resolve previews only for those (fewer iTunes calls).
  // distractors are just labels, so they can come from the whole pool without a preview.
  const songs = shuffle(pool.slice()).slice(0, room.questionCount);
  await Promise.all(songs.map(async (s) => { s.youtubeVideoId = await resolveYouTube(s); }));
  room.questions = songs.map((song, i) => {
    let sourceId = null;
    if (room.mode === "friendmix") {
      const ids = [...(song.sources || [])];
      sourceId = ids.length ? ids[Math.floor(Math.random() * ids.length)] : (players[Math.floor(Math.random() * players.length)]?.id || null);
    }
    const mode = room.answerMode === "mixed" ? (i % 2 ? "hard" : "easy") : room.answerMode;
    const q = { id: randomUUID(), number: i + 1, song, answerMode: mode, sourceId };
    if (mode === "easy") { const o = makeOptions(song, pool); q.options = o.options; q.correctIndex = o.correctIndex; }
    return q;
  });

  room.status = "playing";
  room.current = -1;
  for (const p of room.players.values()) { p.score = 0; p.streak = 0; p.bestStreak = 0; p.answers = []; }
  nextQuestion(room);
}

function nextQuestion(room) {
  clearTimeout(room.timer);
  room.current++;
  if (room.current >= room.questions.length) return finishGame(room);

  const q = room.questions[room.current];
  q.answers = new Map(); // playerId -> {answer, submittedAt, correct, score}
  room.phase = "question";
  const startedAt = Date.now();
  q.startedAt = startedAt;
  q.deadline = startedAt + ANSWER_MS;
  // random part of the song each time (server picks, same for everyone)
  const clipStart = 20 + Math.floor(Math.random() * 50); // 20–69s in

  // Never leak the answer: options/title/artist/source are NOT in this payload.
  io.to(room.code).emit("question", {
    questionId: q.id, number: q.number, total: room.questions.length,
    answerMode: q.answerMode, youtubeVideoId: q.song.youtubeVideoId || null,
    clipStart, clipMs: CLIP_MS,
    options: q.answerMode === "easy" ? q.options : null,
    startedAt, deadline: q.deadline, serverNow: Date.now(),
  });
  broadcast(room);
  room.timer = setTimeout(() => revealQuestion(room), ANSWER_MS + 400); // small grace for in-flight answers
}

function revealQuestion(room) {
  clearTimeout(room.timer);
  const q = room.questions[room.current];
  room.phase = "reveal";

  const results = [];
  for (const p of room.players.values()) {
    const a = q.answers.get(p.id);
    const correct = !!a?.correct;
    const scoreDelta = a?.score || 0;
    if (correct) { p.score += scoreDelta; p.streak++; p.bestStreak = Math.max(p.bestStreak, p.streak); }
    else p.streak = 0;
    p.answers.push({ q: q.number, correct, scoreDelta, rt: a ? a.submittedAt - q.startedAt : null });
    results.push({ playerId: p.id, name: p.name, avatar: p.avatar, correct, scoreDelta, streakLabel: streakLabel(p.streak) });
  }
  results.sort((a, b) => b.scoreDelta - a.scoreDelta);

  const source = q.sourceId ? room.players.get(q.sourceId) : null;
  io.to(room.code).emit("reveal", {
    questionId: q.id, title: q.song.title, artist: q.song.artist,
    sourceName: source ? source.name : null,
    correctIndex: q.answerMode === "easy" ? q.correctIndex : null,
    results, leaderboard: leaderboard(room),
  });
  broadcast(room);
  room.timer = setTimeout(() => nextQuestion(room), REVEAL_MS);
}

const leaderboard = (room) =>
  [...room.players.values()]
    .map((p) => ({ playerId: p.id, name: p.name, avatar: p.avatar, score: p.score, bestStreak: p.bestStreak }))
    .sort((a, b) => b.score - a.score);

function finishGame(room) {
  clearTimeout(room.timer);
  room.status = "finished";
  room.phase = "finished";
  const board = leaderboard(room);
  const stats = [...room.players.values()].map((p) => {
    const correct = p.answers.filter((a) => a.correct).length;
    const rts = p.answers.filter((a) => a.rt != null).map((a) => a.rt);
    return {
      playerId: p.id, name: p.name, avatar: p.avatar, score: p.score,
      answered: p.answers.filter((a) => a.rt != null).length, correct,
      total: p.answers.length, bestStreak: p.bestStreak,
      avgRt: rts.length ? Math.round(rts.reduce((s, x) => s + x, 0) / rts.length) : null,
    };
  });
  io.to(room.code).emit("gameOver", { winner: board[0] || null, leaderboard: board, stats });
  broadcast(room);
}

// ================= socket wiring =================
io.on("connection", (socket) => {
  const join = (room, player) => {
    socket.join(room.code);
    socket.data = { code: room.code, playerId: player.id };
  };

  socket.on("createRoom", (d, cb) => {
    const name = String(d?.name || "").trim().slice(0, 20) || "Host";
    let code; do { code = roomCode(); } while (rooms.has(code));
    const player = newPlayer(name);
    const room = {
      code, hostId: player.id, mode: d?.mode === "friendmix" ? "friendmix" : "genre",
      answerMode: ["easy", "hard", "mixed"].includes(d?.answerMode) ? d.answerMode : "easy",
      questionCount: [10, 20, 30].includes(d?.questionCount) ? d.questionCount : 10,
      status: "lobby", phase: "lobby", current: -1, questions: [], players: new Map(),
    };
    room.players.set(player.id, player);
    rooms.set(code, room);
    join(room, player);
    cb?.({ ok: true, code, playerId: player.id, you: sanitizePlayer(player) });
    broadcast(room);
  });

  socket.on("joinRoom", (d, cb) => {
    const room = rooms.get(String(d?.code || "").toUpperCase());
    if (!room) return cb?.({ error: "Room not found" });
    // reconnection: existing playerId keeps state
    let player = d?.playerId && room.players.get(d.playerId);
    if (player) { player.connected = true; if (d?.name) player.name = String(d.name).trim().slice(0, 20); }
    else {
      if (room.status !== "lobby") return cb?.({ error: "Game already started" });
      if (room.players.size >= MAX_PLAYERS) return cb?.({ error: "Room is full" });
      player = newPlayer(String(d?.name || "").trim().slice(0, 20) || "Player");
      room.players.set(player.id, player);
    }
    join(room, player);
    cb?.({ ok: true, code: room.code, playerId: player.id, you: sanitizePlayer(player) });
    evaluateStart(room); // a new unready player cancels any pending countdown
    broadcast(room);
  });

  socket.on("setPrefs", (d) => withPlayer(socket, (room, p) => {
    if (room.status !== "lobby") return;
    p.prefs = {
      genres: (d?.genres || []).slice(0, 3),
      eras: (d?.eras || []).slice(0, 3),
      languages: (d?.languages || []).slice(0, 3),
    };
    broadcast(room);
  }));

  socket.on("setReady", (d) => withPlayer(socket, (room, p) => {
    if (d?.ready && !p.spotifyConnected) return; // must connect Spotify to play
    p.ready = !!d?.ready;
    evaluateStart(room); // all ready -> 5s countdown; un-ready -> cancel
    broadcast(room);
  }));

  socket.on("setSpotify", (d) => withPlayer(socket, (room, p) => {
    p.spotifyConnected = !!d?.connected;
    if (Array.isArray(d?.tracks)) {
      p.spotifyTracks = d.tracks
        .map((t) => ({ title: String(t?.title || "").slice(0, 120), artist: String(t?.artist || "").slice(0, 120) }))
        .filter((t) => t.title && t.artist)
        .slice(0, 50);
    }
    if (!p.spotifyConnected) { p.spotifyTracks = []; p.ready = false; evaluateStart(room); }
    broadcast(room);
  }));

  socket.on("submitAnswer", (d, cb) => withPlayer(socket, (room, p) => {
    const q = room.questions[room.current];
    if (!q || room.phase !== "question" || q.id !== d?.questionId) return cb?.({ error: "Not accepting answers" });
    if (q.answers.has(p.id)) return cb?.({ error: "Already answered" });   // no duplicates
    const now = Date.now();
    if (now > q.deadline) return cb?.({ error: "Too late" });              // reject late
    let correct;
    if (q.answerMode === "easy") correct = Number(d.answer) === q.correctIndex;
    else correct = isCorrectHard(String(d.answer || ""), q.song.title);
    const score = scoreFor(correct, now, q.startedAt);
    q.answers.set(p.id, { answer: d.answer, submittedAt: now, correct, score });
    cb?.({ ok: true });                                                    // client learns locked, NOT correctness
    io.to(room.code).emit("answerLocked", { playerId: p.id });             // others see who locked, not what
  }));

  socket.on("playAgain", () => withPlayer(socket, (room, p) => {
    if (p.id !== room.hostId) return;
    room.status = "lobby"; room.phase = "lobby"; room.current = -1; room.questions = [];
    for (const pl of room.players.values()) { pl.ready = false; pl.score = 0; pl.streak = 0; }
    evaluateStart(room);
    broadcast(room);
  }));

  socket.on("disconnect", () => {
    const d = socket.data;
    if (!d?.code) return;
    const room = rooms.get(d.code);
    if (!room) return;
    const p = room.players.get(d.playerId);
    if (!p) return;
    p.connected = false;
    // host handoff to any connected player so the game can continue
    if (p.id === room.hostId) {
      const next = [...room.players.values()].find((x) => x.connected && x.id !== p.id);
      if (next) room.hostId = next.id;
    }
    // drop disconnected players from an idle lobby; keep them mid-game for reconnect
    if (room.status === "lobby") room.players.delete(p.id);
    if (room.players.size === 0) { clearTimeout(room.timer); clearTimeout(room.startTimer); rooms.delete(room.code); return; }
    evaluateStart(room); // a leaver may complete (or break) readiness
    broadcast(room);
  });
});

function newPlayer(name) {
  return {
    id: randomUUID(), name, avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
    ready: false, connected: true, spotifyConnected: false, spotifyTracks: [],
    prefs: { genres: [], eras: [], languages: [] },
    score: 0, streak: 0, bestStreak: 0, answers: [],
  };
}

function withPlayer(socket, fn) {
  const d = socket.data;
  if (!d?.code) return;
  const room = rooms.get(d.code);
  const p = room?.players.get(d.playerId);
  if (room && p) fn(room, p); // membership is validated here — you can only act as yourself, in your room
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`🎵 Music party on http://localhost:${PORT}`));

export { rooms, io }; // for tests / embedding
