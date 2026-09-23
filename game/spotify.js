// Optional Spotify personalization layer. Metadata ONLY (no audio, no downloads).
// Entirely inert unless SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are set, so the
// game runs with zero Spotify setup. Tokens stay server-side; the secret never
// reaches the browser.
//
// ponytail: the ingested top-tracks/artists metadata is exposed for building a
// player's taste profile. Mapping those tracks to YouTube video IDs needs the
// YouTube Data API (a keyed search) and is intentionally NOT wired into playback
// in the MVP — the curated songs.json drives questions. Wire the matcher in
// (engine already has the confidence-scoring shape) when you add a Data API key.

const ID = process.env.SPOTIFY_CLIENT_ID;
const SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT = process.env.SPOTIFY_REDIRECT_URI || "http://localhost:3000/api/spotify/callback";
const SCOPES = "user-top-read playlist-read-private"; // minimum needed for a taste profile

const tokens = new Map(); // state -> { access_token, ... }  (demo store; swap for a real session store)

export function registerSpotify(app) {
  app.get("/api/spotify/enabled", (_req, res) => res.json({ enabled: !!(ID && SECRET) }));

  if (!ID || !SECRET) return; // stay inert

  app.get("/api/spotify/login", (req, res) => {
    const state = Math.random().toString(36).slice(2);
    const url = new URL("https://accounts.spotify.com/authorize");
    url.search = new URLSearchParams({
      response_type: "code", client_id: ID, scope: SCOPES,
      redirect_uri: REDIRECT, state,
    }).toString();
    res.redirect(url.toString());
  });

  app.get("/api/spotify/callback", async (req, res) => {
    const { code, state } = req.query;
    if (!code) return res.status(400).send("Missing code");
    const body = new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: REDIRECT,
    });
    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${ID}:${SECRET}`).toString("base64"),
      },
      body,
    });
    const tok = await r.json();
    if (tok.error) return res.status(400).send("Spotify auth failed");
    tokens.set(state, tok);
    // hand a short-lived reference back to the opener window, then close
    res.send(`<script>
      window.opener?.postMessage({ type:"spotify", state:${JSON.stringify(state)} }, "*");
      window.close();
    </script>Connected. You can close this window.`);
  });

  // Returns taste metadata only (titles/artists/genres) for a connected user.
  app.get("/api/spotify/profile", async (req, res) => {
    const tok = tokens.get(req.query.state);
    if (!tok) return res.status(401).json({ error: "Not connected" });
    const auth = { Authorization: `Bearer ${tok.access_token}` };
    const [tracks, artists] = await Promise.all([
      fetch("https://api.spotify.com/v1/me/top/tracks?limit=20", { headers: auth }).then((r) => r.json()),
      fetch("https://api.spotify.com/v1/me/top/artists?limit=20", { headers: auth }).then((r) => r.json()),
    ]);
    res.json({
      topTracks: (tracks.items || []).map((t) => ({ title: t.name, artist: t.artists?.[0]?.name })),
      genres: [...new Set((artists.items || []).flatMap((a) => a.genres || []))].slice(0, 10),
    });
  });
}
