// Pure, server-authoritative game logic. No I/O, no sockets — so test.js can assert it.

const num = (v, d) => (v ? Number(v) : d);
export const ANSWER_MS = num(process.env.ANSWER_MS, 10000);   // answering window
export const CLIP_MS = num(process.env.CLIP_MS, 10000);       // how long the mystery clip plays
export const REVEAL_MS = num(process.env.REVEAL_MS, 6000);    // reveal dwell before next question
export const MAX_PLAYERS = 10;

// ---- answer normalization + deterministic fuzzy match (no LLM) ----
export function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // strip diacritics
    .replace(/&/g, "and")
    .replace(/\bfeat\.?\b.*$/g, "")                      // drop "feat ..."
    .replace(/\(.*?\)|\[.*?\]/g, "")                     // drop bracketed bits
    .replace(/[^a-z0-9 ]/g, " ")                         // punctuation -> space
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Accept close guesses without opening the door to false positives.
export function isCorrectHard(guess, title) {
  const g = normalize(guess), t = normalize(title);
  if (!g) return false;
  if (g === t) return true;
  // short titles must be near-exact; longer ones tolerate more slips
  const dist = levenshtein(g, t);
  const ratio = 1 - dist / Math.max(g.length, t.length);
  const allowed = t.length <= 6 ? 1 : t.length <= 12 ? 2 : 3;
  return dist <= allowed && ratio >= 0.8;
}

// ---- scoring (server-side only) ----
export function scoreFor(correct, submittedAt, startedAt) {
  if (!correct) return 0;
  const remaining = Math.max(0, ANSWER_MS - (submittedAt - startedAt));
  return 100 + Math.round(100 * (remaining / ANSWER_MS)); // base + speed bonus
}

export function streakLabel(streak) {
  if (streak >= 10) return "PERFECT PITCH";
  if (streak >= 5) return "ON FIRE";
  if (streak >= 3) return `${streak} SONG STREAK`;
  return null;
}

// ---- song pool selection from the group's preferences ----
// prefsList: array of { genres:[], eras:[], languages:[] } (one per player, empty = no filter)
export function buildPool(songs, prefsList) {
  const genres = new Set(), eras = new Set(), langs = new Set();
  for (const p of prefsList) {
    (p.genres || []).forEach((g) => genres.add(g));
    (p.eras || []).forEach((e) => eras.add(e));
    (p.languages || []).forEach((l) => langs.add(l));
  }
  const noFilter = genres.size === 0 && eras.size === 0 && langs.size === 0;
  if (noFilter) return songs.slice();
  const pool = songs.filter(
    (s) =>
      (genres.size === 0 || genres.has(s.genre)) &&
      (eras.size === 0 || eras.has(s.era)) &&
      (langs.size === 0 || langs.has(s.language))
  );
  return pool.length >= 4 ? pool : songs.slice(); // never ship an unplayable pool
}

// Round-robin across the group's selected genres so questions stay balanced (not pure random).
export function pickQuestionSongs(pool, count, rng = Math.random) {
  const byGenre = new Map();
  for (const s of pool) {
    if (!byGenre.has(s.genre)) byGenre.set(s.genre, []);
    byGenre.get(s.genre).push(s);
  }
  for (const arr of byGenre.values()) shuffle(arr, rng);
  const genres = shuffle([...byGenre.keys()], rng);
  const picked = [];
  const seen = new Set();
  let gi = 0;
  while (picked.length < count && seen.size < pool.length) {
    const bucket = byGenre.get(genres[gi % genres.length]);
    const song = bucket.find((s) => !seen.has(s.id));
    if (song) { picked.push(song); seen.add(song.id); }
    gi++;
    if (gi > pool.length * 4) break;
  }
  // if pool smaller than count, allow repeats to fill the game
  while (picked.length < count && pool.length) picked.push(pool[picked.length % pool.length]);
  return picked;
}

// ---- easy-mode distractors: prefer same genre/era, never obviously unrelated ----
export function makeOptions(song, pool, rng = Math.random) {
  const label = (s) => `${s.title} — ${s.artist}`;
  const others = pool.filter((s) => s.id !== song.id);
  const ranked = others
    .map((s) => ({ s, score: (s.genre === song.genre ? 2 : 0) + (s.era === song.era ? 1 : 0) + rng() }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
  // de-dupe by label in case pool has repeats
  const distractors = [];
  const used = new Set([label(song)]);
  for (const s of ranked) {
    const l = label(s);
    if (!used.has(l)) { distractors.push(l); used.add(l); }
    if (distractors.length === 3) break;
  }
  const options = shuffle([label(song), ...distractors], rng);
  return { options, correctIndex: options.indexOf(label(song)) };
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function roomCode(rng = Math.random) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let c = "";
  for (let i = 0; i < 5; i++) c += chars[Math.floor(rng() * chars.length)];
  return c;
}
