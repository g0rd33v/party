// Party — WebRTC mesh over Trystero.
//
// Joins the main room keyed on the host's handle.
// When a sessionId is supplied (from URL fragment), also joins `s-<sessionId>`
// as a small accelerator room — broker pairing there is near-instant because
// only the host + the invitee are announcing to it.
//
// Messages broadcast through every joined room; receivers dedupe by message id.
//
// --- Transport ---
// MQTT over WebSocket. MQTT was chosen over Nostr because Nostr's relay-subset
// federation model doesn't guarantee two peers land on overlapping relays —
// each Trystero instance picks a random subset of a default list, and if your
// iPhone and my laptop don't share a single working relay, peer discovery
// silently fails forever. MQTT is topic-based: one broker, one topic, all
// subscribers meet. No coordination needed.
//
// The default broker is EMQX's free public MQTT broker — stable for years,
// accepts anonymous connections, and serves the open-source community. For
// production or self-hosted deployments (see README), override via the URL
// query string: https://.../party/foo?sig=wss://my-broker.example.com:8084/mqtt

// Cache-busting: propagate ?v= from the URL we were imported with. Trystero
// stays on its normal CDN import — esm.sh versions via the pinned @0.21.4.
const V = new URL(import.meta.url).search
const [{ joinRoom, getRelaySockets }, { HANDLE_RE }] = await Promise.all([
  import('https://esm.sh/trystero@0.21.4/mqtt'),
  import(`./identity.js${V}`),
])

const APP_ID = 'party-2026-v1'
const DEFAULT_BROKER = 'wss://broker.emqx.io:8084/mqtt'
const HOST_GRACE_MS = 5000  // debounce for brief host disconnects
const CATCHUP_WINDOW_MS = 2000  // don't fire join notices for peers we meet on first connect

// Broker socket health monitoring. Trystero 0.21.4 doesn't auto-reconnect when
// the MQTT broker drops the WebSocket (happens with public brokers on idle
// timeout, tab throttling, network blips). Without reconnect, a silent-but-dead
// party lingers forever. We watch the socket every HEARTBEAT_MS and recover
// via a full page reload — preserves identity + URL, rejoins the same party
// with a fresh session. RELOAD_COOLDOWN_MS prevents a flaky broker from causing
// a reload loop.
const HEARTBEAT_MS = 8000
const RELOAD_COOLDOWN_MS = 60000
const SS_LAST_RELOAD = 'party.lastAutoReload'

// Read the broker override (?sig=wss://...) at module load. A single broker
// URL drives the whole session; no mid-session switching.
function resolveBroker() {
  try {
    const params = new URLSearchParams(location.search)
    const override = params.get('sig')
    if (override && /^wss?:\/\//i.test(override)) return override
  } catch {}
  return DEFAULT_BROKER
}
const BROKER_URL = resolveBroker()
console.log('[mesh] broker:', BROKER_URL)

export class Mesh {
  constructor(roomHandle, me, sessionId = null) {
    this.roomHandle = roomHandle
    this.me = me // { handle, avatarSeed }
    this.sessionId = sessionId
    this.peers = new Map() // peerId → { handle, avatarSeed }
    this.announcedHandles = new Set() // for join-notice dedup
    this.rooms = [] // [{ room, sendMsg, sendHello }]
    this.startedAt = 0
    this.hostGraceTimer = null
    this.heartbeatTimer = null

    // Callbacks — set by the view layer
    this.onMessage = () => {}
    this.onPeersChange = () => {}
    this.onHostStatusChange = () => {}
    this.onPeerJoined = () => {}
  }

  start() {
    this.startedAt = Date.now()
    console.log('[mesh] starting; handle=%s session=%s me=%s', this.roomHandle, this.sessionId, this.me.handle)
    this._joinOne(this.roomHandle)
    if (this.sessionId) this._joinOne(`s-${this.sessionId}`)
    this.heartbeatTimer = setInterval(() => this._checkBrokerHealth(), HEARTBEAT_MS)
  }

  // If the broker socket is dead (CLOSING or CLOSED), recover by reloading
  // the page. Hosts land back in the same party under the same URL with a
  // fresh session; guests re-attempt the same join. Cooldown prevents
  // reload-loops when the broker is persistently flaky.
  _checkBrokerHealth() {
    if (!this.rooms.length) return
    try {
      const sockets = getRelaySockets()
      const states = Object.values(sockets).map(ws => ws?.readyState)
      const anyOpen = states.some(s => s === 1)
      if (anyOpen) return
      const lastReload = parseInt(sessionStorage.getItem(SS_LAST_RELOAD) || '0')
      if (Date.now() - lastReload < RELOAD_COOLDOWN_MS) return
      console.warn('[mesh] broker socket dead — reloading to reconnect', { states })
      sessionStorage.setItem(SS_LAST_RELOAD, String(Date.now()))
      location.reload()
    } catch (err) {
      console.warn('[mesh] heartbeat check failed', err)
    }
  }

  _joinOne(roomId) {
    console.log('[mesh] joinRoom:', roomId)
    const room = joinRoom({ appId: APP_ID, relayUrls: [BROKER_URL] }, roomId)
    const [sendMsg, getMsg] = room.makeAction('msg')
    const [sendHello, getHello] = room.makeAction('hello')

    room.onPeerJoin(peerId => {
      console.log('[mesh] onPeerJoin room=%s peer=%s', roomId, peerId)
      sendHello({ handle: this.me.handle, avatarSeed: this.me.avatarSeed }, peerId)
    })

    room.onPeerLeave(peerId => {
      console.log('[mesh] onPeerLeave room=%s peer=%s', roomId, peerId)
      this._handlePeerLeave(peerId)
    })

    getHello((data, peerId) => {
      console.log('[mesh] getHello from peer=%s data=%o', peerId, data)
      this._handleHello(data, peerId)
    })

    getMsg((data, peerId) => {
      console.log('[mesh] getMsg from peer=%s data=%o', peerId, data)
      this._handleMsg(data, peerId)
    })

    this.rooms.push({ room, sendMsg, sendHello })
    console.log('[mesh] joined:', roomId, '(total rooms=' + this.rooms.length + ')')
  }

  _handlePeerLeave(peerId) {
    const was = this.peers.get(peerId)
    if (!was) return
    this.peers.delete(peerId)
    this.onPeersChange(this.peerList())

    // Host may still be reachable via another room connection — only trigger
    // party-over if no peer entry anywhere still has the host handle.
    if (was.handle === this.roomHandle) {
      const stillHere = Array.from(this.peers.values()).some(p => p.handle === this.roomHandle)
      if (!stillHere) {
        if (this.hostGraceTimer) clearTimeout(this.hostGraceTimer)
        this.hostGraceTimer = setTimeout(() => {
          const gone = !Array.from(this.peers.values()).some(p => p.handle === this.roomHandle)
          if (gone) this.onHostStatusChange(false)
          this.hostGraceTimer = null
        }, HOST_GRACE_MS)
      }
    }
  }

  _handleHello(data, peerId) {
    if (!data || typeof data.handle !== 'string') return
    if (!HANDLE_RE.test(data.handle)) return

    const isNewPeer = !this.peers.has(peerId)
    const isNewHandle = !this.announcedHandles.has(data.handle)

    this.peers.set(peerId, { handle: data.handle, avatarSeed: data.avatarSeed })
    this.announcedHandles.add(data.handle)
    this.onPeersChange(this.peerList())

    // Only fire a join notice after the catchup window — avoids spamming
    // "X joined" for every peer that was already there when we connected.
    if (isNewPeer && isNewHandle && Date.now() - this.startedAt > CATCHUP_WINDOW_MS) {
      this.onPeerJoined(data.handle, data.avatarSeed)
    }

    if (data.handle === this.roomHandle) {
      if (this.hostGraceTimer) {
        clearTimeout(this.hostGraceTimer)
        this.hostGraceTimer = null
      }
      this.onHostStatusChange(true)
    }
  }

  _handleMsg(data, peerId) {
    if (!data || typeof data.text !== 'string') return
    if (data.text.length > 2000) return
    const peer = this.peers.get(peerId)
    if (!peer) return
    this.onMessage({
      id: data.id || `${peerId}-${data.ts}`,
      room: this.roomHandle,
      from: peer.handle,
      fromAvatar: peer.avatarSeed,
      text: data.text.slice(0, 2000),
      ts: Number.isFinite(data.ts) ? Math.min(data.ts, Date.now()) : Date.now(),
    })
  }

  // Deduped view of peers, host first then alphabetical
  peerList() {
    const seen = new Set([this.me.handle])
    const list = [{ ...this.me, self: true }]
    for (const p of this.peers.values()) {
      if (seen.has(p.handle)) continue
      seen.add(p.handle)
      list.push(p)
    }
    list.sort((a, b) => {
      const aHost = a.handle === this.roomHandle ? 0 : 1
      const bHost = b.handle === this.roomHandle ? 0 : 1
      if (aHost !== bHost) return aHost - bHost
      return a.handle.localeCompare(b.handle)
    })
    return list
  }

  send(text) {
    const msg = {
      id: `${this.me.handle}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      text,
    }
    for (const r of this.rooms) {
      try { r.sendMsg(msg) } catch {}
    }
    return {
      id: msg.id,
      room: this.roomHandle,
      from: this.me.handle,
      fromAvatar: this.me.avatarSeed,
      text,
      ts: msg.ts,
    }
  }

  leave() {
    for (const r of this.rooms) {
      try { r.room.leave() } catch {}
    }
    this.rooms = []
    this.peers.clear()
    this.announcedHandles.clear()
    if (this.hostGraceTimer) {
      clearTimeout(this.hostGraceTimer)
      this.hostGraceTimer = null
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}
