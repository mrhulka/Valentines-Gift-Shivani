// Runnable self-check for the game engine. `npm test`. No framework.
import assert from "assert";
import {
  normalize, isCorrectHard, scoreFor, buildPool, pickQuestionSongs, makeOptions, roomCode, ANSWER_MS,
} from "./engine.js";
import { readFileSync } from "fs";
const SONGS = JSON.parse(readFileSync(new URL("./songs.json", import.meta.url)));

// normalize
assert.equal(normalize("Blinding Lights (feat. X)"), "blinding lights");
assert.equal(normalize("Rock & Roll"), "rock and roll");
assert.equal(normalize("Déjà Vu!"), "deja vu");

// fuzzy hard-mode matching: accept near, reject unrelated
assert.ok(isCorrectHard("blinding lights", "Blinding Lights"));
assert.ok(isCorrectHard("Blinding Light", "Blinding Lights"));      // one char off
assert.ok(isCorrectHard("perfect", "Perfect"));
assert.ok(!isCorrectHard("perfetc job", "Perfect"));                // too far
assert.ok(!isCorrectHard("believer", "Bad Guy"));                  // unrelated
assert.ok(!isCorrectHard("", "Perfect"));                          // empty guess

// scoring: correct + faster => more points; wrong/none => 0
const start = 1000;
assert.equal(scoreFor(false, start + 500, start), 0);
const fast = scoreFor(true, start + 1000, start);
const slow = scoreFor(true, start + 8000, start);
assert.ok(fast > slow && fast <= 200 && slow >= 100);
assert.equal(scoreFor(true, start + ANSWER_MS, start), 100);       // deadline => base only

// pool filtering
const rockOnly = buildPool(SONGS, [{ genres: ["Rock"], eras: [], languages: [] }]);
assert.ok(rockOnly.length >= 4 && rockOnly.every((s) => s.genre === "Rock"));
const empty = buildPool(SONGS, [{ genres: [], eras: [], languages: [] }]);
assert.equal(empty.length, SONGS.length);                          // no prefs => full pool
const tiny = buildPool(SONGS, [{ genres: ["Jazz"], eras: [], languages: [] }]); // too few
assert.equal(tiny.length, SONGS.length);                           // falls back, never unplayable

// question selection: right count, uses the pool
const qs = pickQuestionSongs(rockOnly, 10);
assert.equal(qs.length, 10);
assert.ok(qs.every((s) => rockOnly.find((x) => x.id === s.id)));

// easy options: 4 unique, correct index valid and points to the song
const { options, correctIndex } = makeOptions(SONGS[0], SONGS);
assert.equal(options.length, 4);
assert.equal(new Set(options).size, 4);
assert.ok(options[correctIndex].startsWith(SONGS[0].title));

// room codes: 5 chars, no ambiguous glyphs
assert.match(roomCode(), /^[A-Z2-9]{5}$/);

console.log("✓ engine tests passed");
