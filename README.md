# Party

A party is a link. Open Safari. Invite the world.

Peer-to-peer ephemeral chat. Every iPhone is a node. Every party is a link. No accounts, no servers, no install.

---

## What it is

Party runs entirely inside Safari on iPhone. Static files only. No backend.

- **Face ID gives you a name.** Deterministic 3-word handle ("Big Red Apple") derived from your passkey. Same device = same name forever. No email, no password, no recovery.
- **Your name is your party.** `g0rd33v.github.io/party/big-red-apple` is your room.
- **Copy the URL, share the URL.** The URL fragment contains everything needed to connect — session ID, your avatar, freshness timestamp. Anyone who copies your URL at any moment gets the current connection string.
- **Open Safari = party on.** Close the tab = party's over. Presence equals the foreground.
- **Peers chat directly.** WebRTC mesh between browsers. No relay, no server, no middleman.
- **24h local history.** Messages live in your IndexedDB. Rolling window. Nothing on our side.

---

## Architecture

```
party/
├── index.html          # SPA entry
├── 404.html            # SPA fallback for /party/<handle> deep links
├── .nojekyll           # tell GitHub Pages to skip Jekyll
├── style.css           # Atom.me dark system
├── app.js              # SPA entry + router + views (the DOM layer)
└── lib/
    ├── util.js         # Helpers: sha256, base64url, esc, displayHandle, toast
    ├── avatar.js       # Pixel emoji face renderer (6^6 = 46,656 deterministic faces)
    ├── identity.js     # WebAuthn Face ID + 3-word handle derivation + migration
    ├── storage.js      # IndexedDB wrapper, 24h rolling retention
    ├── mesh.js         # Trystero multi-room WebRTC mesh
    └── url.js          # URL path/fragment parsing + live connection-string writer
```

Every file has a single responsibility. `app.js` only wires DOM events to module calls. Business logic lives in `lib/`.

---

## URL format

```
Path:     /party/<handle>              ← identity (always works)
Fragment: #s=SID&a=AVATAR&t=TIMESTAMP  ← live connection info
```

| Field | Purpose |
|---|---|
| `s` | Session accelerator room ID — a small extra Trystero room for fast WebRTC pairing |
| `a` | Host avatar seed (first 16 hex chars) — guests render the host's face instantly, before any network traffic |
| `t` | Timestamp when the fragment was written — freshness signal |

Hosts continuously maintain this fragment while their party is live. Any copy of the URL at any moment contains up-to-date connection info. No separate "Share" click needed — select the URL bar, copy, paste anywhere.

---

## MVP scope

| | |
|---|---|
| Platform | Safari on iPhone |
| Hosting | GitHub Pages (static) |
| Identity | WebAuthn passkey + Face ID, synced via iCloud Keychain |
| Handle | 3 words (size-color-noun), ~1M combinations |
| Avatar | Pixel emoji face, 46,656 combinations from passkey hash |
| Transport | WebRTC via Trystero (public BitTorrent WSS trackers for signaling) |
| Storage | IndexedDB, 24h rolling |
| Content | Text + emoji only |
| Rooms | Unlimited peers (gossip mesh), dies when host closes tab |

---

## Deploy

Static SPA. No build step.

```bash
git add .
git commit -m "update"
git push origin main
```

Then in repo settings: **Pages → Source: `main` / `/ (root)`**. Live at `https://<user>.github.io/party/` in ~60 seconds.

---

## How it works

### Create your party
1. Open `/party/` on iPhone Safari
2. Tap **Create my party** → Face ID
3. Passkey created, handle derived, pixel face rendered
4. You land on `/party/<your-handle>`

### Host a party
1. Open `/party/<your-handle>` — you're the host
2. Your URL bar now contains full connection info (session + avatar + freshness)
3. Copy the URL from anywhere (bar, **Share** button, **Copy my link** on landing)
4. Share it on Twitter / Telegram / TikTok bio
5. Anyone who clicks it while you're live lands in your party
6. Close Safari = party's over

### Join a party
1. Tap a Party link
2. Guest's browser extracts the fragment → renders host avatar immediately
3. Joins main room + session accelerator room → fast WebRTC handshake
4. If you don't have a passkey yet → Face ID creates one, then you're in
5. You can talk until the host closes their tab

---

## Technical notes

### Why two Trystero rooms

Main room (`big-red-apple`) matches everyone in the party. On a crowded tracker it can take 10–30 seconds to pair initially.

The session accelerator room (`s-<sessionId>`) typically has just the host and one invitee. Tracker pairing there is near-instant. Once paired via either room, messages broadcast through all joined rooms with receive-side dedup.

Net effect: first handshake lands fast; the full mesh fills in behind it.

### Host death

When the host closes Safari, their peer leaves all rooms. A 5-second grace timer handles brief reconnects. If the host doesn't return, guests see "Party's over" and input is disabled. Rooms are ephemeral by design.

### Handle collisions

3-word handles, ~1M combinations. Collision probability at 1K daily users ≈ 0.05%. Handles are not globally enforced; they're deterministic per device. If two users coincidentally derive the same handle, their parties collide at the same URL. If this matters in the future, bump to 4-word handles (~66M combinations).

### Why foreground-only

iOS Safari kills WebRTC connections within seconds of backgrounding. This is why presence equals the foreground tab. It's the feature, not the bug: a party is something happening *right now*.

---

## Roadmap

- True gossip relay for rooms with 50+ peers (current mesh handles up to ~30 reliably)
- Room customization (each Safari as its own rule-set / design / widgets)
- Promoted Nodes leaderboard (high-uptime chats compete to be entry points)
- Friend list synced to passkey for cross-device "homes"
- Images / media

---

## License

MIT.

---

Labs · 2026
