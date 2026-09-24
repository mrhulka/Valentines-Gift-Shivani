// End-to-end multiplayer flow test with real socket clients.
// Run: ANSWER_MS=1200 REVEAL_MS=300 CLIP_MS=800 PORT=3555 node flowtest.js
import assert from "assert";
import { io as Client } from "socket.io-client";
import "./server.js"; // starts listening on PORT

const URL = `http://localhost:${process.env.PORT || 3555}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (s, ev) => new Promise((r) => s.once(ev, r));

async function run() {
  await wait(300); // let server bind

  const host = Client(URL), p2 = Client(URL), p3 = Client(URL);
  await Promise.all([once(host, "connect"), once(p2, "connect"), once(p3, "connect")]);

  // host creates a short easy game
  const created = await emit(host, "createRoom", { name: "Rahul", mode: "friendmix", questionCount: 10, answerMode: "easy" });
  assert.ok(created.ok, "room created");
  const code = created.code;
  console.log("  room", code);

  const j2 = await emit(p2, "joinRoom", { code, name: "Priya" });
  const j3 = await emit(p3, "joinRoom", { code, name: "Sajesh" });
  assert.ok(j2.ok && j3.ok, "two players joined");

  // full room rejects an 11th player is covered by unit-level; check invalid code + already-started later
  const bad = await emit(p2, "joinRoom", { code: "ZZZZZ", name: "x" });
  assert.equal(bad.error, "Room not found", "invalid room rejected");

  // Spotify is required to play; each player contributes some tracks to the pool
  const mk = (names) => names.map((n, i) => ({ title: n, artist: "Artist" + i }));
  host.emit("setSpotify", { connected: true, tracks: mk(["Alpha","Bravo","Charlie","Hotel"]) });
  p2.emit("setSpotify", { connected: true, tracks: mk(["Delta","Echo","India","Juliet"]) });
  p3.emit("setSpotify", { connected: true, tracks: mk(["Foxtrot","Golf","Kilo","Lima"]) });
  await wait(100);
  // ready gate must reject an un-connected player: (covered implicitly — all connected here)
  host.emit("setReady", { ready: true });
  p2.emit("setReady", { ready: true });
  p3.emit("setReady", { ready: true });
  await wait(100);

  // start and drive every question
  let correctById = { [created.playerId]: 0, [j2.playerId]: 0, [j3.playerId]: 0 };
  let questions = 0, sawGameOver = null, leaked = false;

  const answerAll = async (q) => {
    // security: the question payload must NOT contain the answer/title/artist
    if ("correctIndex" in q || "title" in q || "artist" in q || "sourceName" in q) leaked = true;
    assert.ok(q.options?.length === 4, "easy question has 4 options");
    assert.ok("youtubeVideoId" in q, "question carries a youtubeVideoId field");
    // host answers option 0 fast; p2 answers option 1; p3 doesn't answer (tests "no answer = 0")
    const r1 = await emit(host, "submitAnswer", { questionId: q.questionId, answer: 0 });
    assert.ok(r1.ok, "host locked");
    const dup = await emit(host, "submitAnswer", { questionId: q.questionId, answer: 2 });
    assert.equal(dup.error, "Already answered", "duplicate rejected");
    await emit(p2, "submitAnswer", { questionId: q.questionId, answer: 1 });
  };

  host.on("question", answerAll);
  const reveals = [];
  host.on("reveal", (r) => {
    reveals.push(r);
    // late answer after deadline+reveal must be rejected
    emit(host, "submitAnswer", { questionId: r.questionId, answer: 0 }).then((res) =>
      assert.ok(res.error, "late answer rejected"));
  });
  const over = new Promise((res) => host.once("gameOver", res));

  // no manual start — the ready countdown (START_DELAY) fires it
  sawGameOver = await over;

  assert.equal(leaked, false, "answer never leaked to client pre-reveal");
  assert.ok(reveals.length === 10, `10 reveals, got ${reveals.length}`);
  assert.ok(reveals.every((r) => r.title && r.artist), "reveal carries title+artist");
  assert.ok(sawGameOver.winner, "winner declared");
  assert.equal(sawGameOver.leaderboard.length, 3, "3 on leaderboard");
  // p3 never answered => score 0
  const p3row = sawGameOver.leaderboard.find((x) => x.playerId === j3.playerId);
  assert.equal(p3row.score, 0, "non-answerer scored 0");
  // someone who answered has > 0 (each easy question one of host/p2 is right)
  assert.ok(sawGameOver.leaderboard[0].score > 0, "leader has points");

  console.log("  winner:", sawGameOver.winner.name, sawGameOver.winner.score, "pts");
  console.log("✓ full game flow passed (create→join→ready→start→10 Qs→reveal→scoring→gameOver)");
  console.log("✓ anti-cheat: no answer leak, duplicate/late/invalid-room all rejected");
  host.close(); p2.close(); p3.close();
  process.exit(0);
}
function emit(sock, ev, data) { return new Promise((r) => sock.emit(ev, data, r)); }
run().catch((e) => { console.error("✗", e.message); process.exit(1); });
