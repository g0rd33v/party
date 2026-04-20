# Party

A party is a link. Open Safari. Invite the world.

Peer-to-peer ephemeral chat. Every iPhone is a node. Every party is a link. No accounts, no servers, no install.

---

## What it is

Party runs entirely inside Safari on iPhone. Static files only. No backend.

- **Face ID gives you a name.** Deterministic 6-letter handle derived from your passkey. Same device = same name forever. No email, no password, no recovery.
- **Your name is your party.** `g0rd33v.github.io/party/ktrmqx` is your room. Post the link anywhere.
- **Open Safari = party on.** Close the tab = party's over. Presence equals the foreground.
- **Peers chat directly.** WebRTC mesh between browsers. No relay, no server, no middleman.
- **24h local history.** Messages live in your IndexedDB. Rolling window. Nothing on our side.

---

## MVP scope

| | |
|---|---|
| Platform | Safari on iPhone |
| Hosting | GitHub Pages (static) |
| Identity | WebAuthn passkey + Face ID |
| Handle | 6 lowercase letters, derived from credential |
| Avatar | Deterministic 5×5 SVG identicon, derived from credential |
| Transport | WebRTC via Trystero (public BitTorrent WSS trackers for signaling) |
| Storage | IndexedDB, 24h rolling |
| Content | Text + emoji only |
| Rooms | Unlimited peers (gossip mesh), dies when host closes tab |
| Auth per session | None — Face ID on first credential creation only |
| Moderation | None in MVP — each room is the host's sandbox |

---

## Deploy

This is a static SPA. No build step.

```bash
# In this repo, on main branch
git add .
git commit -m "init party mvp"
git push origin main
```

Then in GitHub repo settings: **Pages → Source: `main` branch / root (`/`)**.

Site will be live at `https://<user>.github.io/party/` within ~60 seconds.

---

## File structure

```
party/
├── index.html      # SPA entry
├── 404.html        # SPA fallback so /party/<handle> URLs work
├── app.js          # All logic: routing, Face ID, mesh, storage, UI
├── style.css       # Atom.me dark system
├── .nojekyll       # Tell GitHub Pages to skip Jekyll
└── README.md
```

---

## How it works

### Create your party

1. Open `/party/` on iPhone Safari
2. Tap **Create my party**
3. Face ID prompts — scan face
4. Passkey is created locally (never leaves your device)
5. We hash the passkey → derive 6-letter handle + avatar
6. Your party is now at `/party/<handle>`

### Host a party

1. Open `/party/<your-handle>`
2. You're the host
3. While the tab stays foreground, the party is live
4. Share the URL on Twitter / Telegram / TikTok bio / anywhere
5. Anyone who clicks it while you're live joins the party
6. Close Safari → party's over

### Join a party

1. Tap a Party link
2. If you don't have a passkey yet → Face ID creates one, then you're in
3. If you do → you enter immediately
4. You see the host's avatar, live peers, chat stream
5. You can talk until the host closes their tab

---

## Technical notes

### WebRTC signaling

Party uses [Trystero](https://github.com/dmotz/trystero) with the BitTorrent WSS tracker strategy. Trackers are public community infrastructure, same as used by WebTorrent. No backend of ours.

The room ID on the tracker is the host handle. When the host's tab goes live, they announce. When a peer clicks the link, they discover the host through the same tracker, and WebRTC takes over. After the first connection, peer gossip handles everything else.

### Host death

When the host closes Safari or backgrounds the tab long enough for iOS to kill the WebRTC session, other peers see `onPeerLeave` for the host's peer ID. The room immediately shows "Party's over" and input is disabled. Guests can't see each other's messages anymore — by design.

### Why not a real gossip relay?

MVP uses Trystero's default full mesh. Every peer connects to every peer. This works well up to ~20–50 peers. Beyond that, a phone's WebRTC stack starts struggling. True gossip relay (messages hop through neighbors, not direct to host) is v1.1 engineering.

### Handle collisions

6 lowercase letters = 26⁶ = ~309M combinations. At 10K daily users, collision probability per day is ~0.016%. Handles are not enforced globally unique — they're deterministic per device. Two users *could* get the same handle by coincidence; their parties would collide. If this matters in v2, bump to 8 chars (≈208B combinations, essentially collision-free).

### Safari foreground only

iOS Safari kills WebRTC connections within seconds of backgrounding. This is why Party only works while the tab is foreground. It's the feature, not the bug: presence equals attention.

---

## Roadmap (post-MVP)

- Room customization (rules, design, widgets) — each Safari is its own sandbox
- Promoted Nodes leaderboard (enthusiasts compete on uptime)
- Friend list (saved handles to ping on boot)
- True gossip relay for rooms >50 peers
- Images / media
- Browser support beyond Safari iOS

---

## License

MIT.

---

Labs · 2026
