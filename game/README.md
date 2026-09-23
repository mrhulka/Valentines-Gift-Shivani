# 🎵 Guess the Track — a multiplayer music party game

Up to **10 friends** join one room from their own phones. The server plays a
short **mystery clip** of a song, everyone races a 10-second timer to guess it,
and points reward speed. Then the answer is revealed, the leaderboard slams into
place, and the next track drops. *Do you know your friends' music?*

Server-authoritative, real-time, and playable **with zero API keys**.

---

## Quick start

```bash
cd game
npm install
npm start            # http://localhost:3000
```

Open it, hit **Create Game**, share the invite link (or 5-letter room code) with
friends on the same network, everyone taps **Ready**, host taps **Start**. Done.

> Playback needs a sound-capable browser. On phones each player taps **"Tap to
> play"** on the first question to unlock audio (browser autoplay policy).

### Run the tests

```bash
npm test                                              # engine unit tests
ANSWER_MS=1000 REVEAL_MS=250 CLIP_MS=600 PORT=3555 \
  node flowtest.js                                    # full multiplayer flow + anti-cheat
```

---

## How it works

- **One Node process.** `express` serves the single-page client; `socket.io`
  carries real-time events. State lives in memory (`rooms` Map).
- **The server is the referee.** Current question, correct answer, timer,
  scoring, streaks and winner are all computed server-side. The client is never
  trusted and is never sent the answer before the reveal (verified by
  `flowtest.js`).
- **Playback = YouTube IFrame Player** (the compliant, keyless playback layer).
  The real full-size player runs behind an opaque **"MYSTERY TRACK"** cover, so
  the clip plays but the title/thumbnail stay hidden until reveal.
- **No audio is ever downloaded, extracted, ripped or proxied** from YouTube or
  Spotify. Spotify is metadata-only and optional.

### Files

| File | Role |
|------|------|
| `server.js`   | HTTP + Socket.IO, room lifecycle, authoritative game loop |
| `engine.js`   | Pure logic: normalization, fuzzy match, scoring, pool/question/option gen |
| `songs.json`  | Curated song pool (title, artist, genre, era, language, YouTube id) |
| `spotify.js`  | Optional, env-gated Spotify OAuth (metadata only) |
| `public/index.html` | The whole client (screens, YouTube player, sound fx) |
| `test.js` / `flowtest.js` | Engine unit tests / end-to-end multiplayer test |

---

## Game modes

- **Genre Battle** — everyone picks up to 3 genres / eras / languages; the pool
  is their combined taste, balanced round-robin across genres (not pure random).
- **Friend Mix** — same pool, but each song is attributed to a player; the reveal
  shows *"From Rahul's music."*

**Answer modes:** Easy (4 smart options — distractors prefer same genre/era),
Hard (type the title, deterministic fuzzy matching), or Mixed.

Scoring: `100` for correct `+` up to `100` speed bonus (`100 × remaining/total`).
Streaks at 3 / 5 / 10. All server-side.

Adding a mode (e.g. *Whose Song?*, *Chaos*) means adding a branch in
`startGame()`/`makeOptions()` — the question loop and state machine don't change.

---

## Configuration

Copy `.env.example` to `.env`. **Everything is optional** — the game runs as-is.

### Spotify (optional personalization)
1. Create an app at <https://developer.spotify.com/dashboard>.
2. Add redirect URI `http://localhost:3000/api/spotify/callback`.
3. Set `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` in `.env`.

Scopes requested are minimal (`user-top-read`, `playlist-read-private`) and only
metadata (top tracks/artists/genres) is read to build a taste profile. The client
secret never reaches the browser. Without these vars the Spotify routes stay inert.

### YouTube
Playback uses the **keyless IFrame Player API** — nothing to configure. A YouTube
**Data API** key is only needed to auto-match Spotify tracks to video IDs, which is
intentionally left out of the MVP (`songs.json` ships known-good ids). The confidence-
scoring shape for that matcher is sketched in `spotify.js`.

---

## Known ceilings (MVP)

- **In-memory rooms** — a server restart drops active games. Add Redis/Postgres
  when persistence matters; the data model (rooms/players/songs/questions/answers)
  maps straight onto tables.
- **Video ids can rot** — a region-locked or removed video shows *"Having trouble
  playing this track"*; the timer still runs. Refresh ids in `songs.json` or wire
  the Data API matcher for auto-selection.
- **Fixed 10s window / 7s clip** — tune via `ANSWER_MS` / `CLIP_MS` env vars.
