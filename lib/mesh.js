// mesh.js — MQTT pub/sub transport.
//
// Dropped WebRTC after repeated real-network failures: two peers behind the
// same NAT couldn't hairpin, Chrome's mDNS obfuscation blocked local host
// candidates cross-origin, cellular symmetric NAT killed srflx connectivity
// checks, and the entire free public TURN ecosystem (openrelay.metered.ca,
// expressturn) went offline in 2024-2025. No TURN, no relay, no party.
//
// Now: the MQTT broker we were already using for WebRTC signaling carries
// the chat itself. Every peer subscribes to one topic per party handle,
// publishes presence beats every few seconds, publishes messages when the
// user hits send. Every subscriber sees every publish. Zero NAT, zero ICE,
// zero "Looking for host…" timeouts.
//
// Privacy tradeoff: messages traverse the public broker. The session ID was
// already in the shared URL and signaling was already public, so incremental
// loss is that chat text is now readable by any topic subscriber. Users who
// want privacy bring their own broker via ?sig= or layer E2E on top later.
//
// Public interface matches the old mesh exactly — same constructor, same
// callbacks, same peerList(). app.js needs zero changes.

const V = new URL(import.meta.url).search
const [mqttMod, { HANDLE_RE }] = await Promise.all([
  import('https://esm.sh/mqtt@5.10.1?bundle'),
  import(`./identity.js${V}`),
])
const mqtt = mqttMod.default || mqttMod

const APP_ID = 'party-2026-v1'
const DEFAULT_BROKER = 'wss://broker.emqx.io:8084/mqtt'
const ANNOUNCE_INTERVAL_MS = 4000     // republish presence every 4s (gets throttled to ~60s when hidden)
const PEER_TIMEOUT_MS = 90000          // peer considered gone after 90s — generous enough that background tabs (whose setInterval Chrome throttles to 1/min) don't get GC'd
const HOST_GRACE_MS = 8000             // wait before declaring host offline
const CATCHUP_WINDOW_MS = 2500         // don't fire join notices on initial sync
const GC_INTERVAL_MS = 5000            // how often we purge stale peers
const MSG_MAX_LEN = 4000

// History-replay protocol — keeps room history alive as long as at least one
// peer is still here. Joiners broadcast a history-request envelope. Existing
// peers wait a small random delay (jittered so they don't all reply at once)
// then publish their in-memory log as a history-response targeted at the
// requester. Requester accepts the first response and ignores the rest.
// Last person closes their tab → log gone. No backend, no DB.
const HISTORY_MAX = 500                // hard cap on per-peer in-memory log
const HISTORY_REQUEST_TIMEOUT_MS = 5000 // requester gives up if no response by then
const HISTORY_RESPONSE_DELAY_MIN = 150  // jitter floor — give first/closest peer a chance
const HISTORY_RESPONSE_DELAY_MAX = 1200 // jitter ceiling — cap total wait reasonably

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

function topicFor(roomHandle) {
  return `${APP_ID}/party/${roomHandle}`
}

function randomId() {
  const arr = new Uint8Array(8)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

export class Mesh {
  constructor(roomHandle, me, sessionId = null) {
    this.roomHandle = roomHandle
    this.me = me                    // { handle, avatarSeed }
    this.sessionId = sessionId       // kept for URL compat, unused
    this.peerId = randomId()
    this.peers = new Map()           // peerId → { handle, avatarSeed, lastSeen }
    this.announcedHandles = new Set()
    this.client = null
    this.topic = topicFor(roomHandle)
    this.startedAt = 0
    this.announceTimer = null
    this.gcTimer = null
    this.hostGraceTimer = null
    this.hostCurrentlyHere = false
    this.seenMsgIds = new Set()      // dedup across client reconnects

    // History-replay state
    this.historyLog = []             // ordered list of msgs we've seen, capped at HISTORY_MAX
    this.historyReceived = false     // true once we've accepted a response (or given up)
    this.historyRequestTimer = null  // timeout that gives up waiting for a response
    this.pendingHistoryReplies = new Map() // requesterPeerId → setTimeout id (so we can cancel jittered replies if someone else gets there first)

    // Callbacks — set by the view layer
    this.onMessage = () => {}
    this.onPeersChange = () => {}
    this.onHostStatusChange = () => {}
    this.onPeerJoined = () => {}
  }

  start() {
    this.startedAt = Date.now()
    console.log('[mesh] starting; topic=%s handle=%s me=%s', this.topic, this.roomHandle, this.me.handle)

    this.client = mqtt.connect(BROKER_URL, {
      clientId: `party_${this.peerId}`,
      keepalive: 30,
      reconnectPeriod: 2000,
      clean: true,
    })

    this.client.on('connect', () => {
      console.log('[mesh] broker connected as', this.peerId)
      this.client.subscribe(this.topic, { qos: 0 }, (err) => {
        if (err) { console.error('[mesh] subscribe failed', err); return }
        console.log('[mesh] subscribed to', this.topic)
        this._announce()
        this._requestHistory()
      })
    })

    this.client.on('reconnect', () => console.log('[mesh] broker reconnecting'))
    this.client.on('close', () => console.log('[mesh] broker closed'))
    this.client.on('error', (e) => console.warn('[mesh] broker error', e?.message || e))

    this.client.on('message', (topic, payload) => {
      if (topic !== this.topic) return
      let envelope
      try { envelope = JSON.parse(payload.toString()) }
      catch { return }
      if (!envelope || typeof envelope !== 'object') return
      if (envelope.from === this.peerId) return // skip our own echoes
      this._dispatch(envelope)
    })

    this.announceTimer = setInterval(() => this._announce(), ANNOUNCE_INTERVAL_MS)
    this.gcTimer = setInterval(() => this._gc(), GC_INTERVAL_MS)

    // Chrome throttles setInterval to ~1/minute in hidden tabs. When the user
    // switches back, fire an announce right away so our peers see us again
    // without waiting for the next throttled tick.
    this._visibilityHandler = () => {
      if (document.visibilityState === 'visible') this._announce()
    }
    document.addEventListener('visibilitychange', this._visibilityHandler)
  }

  _announce() {
    this._publish({
      type: 'announce',
      handle: this.me.handle,
      avatarSeed: this.me.avatarSeed,
    })
  }

  _publish(body) {
    if (!this.client || !this.client.connected) return
    const envelope = { ...body, from: this.peerId, t: Date.now() }
    try {
      this.client.publish(this.topic, JSON.stringify(envelope), { qos: 0 })
    } catch (e) {
      console.warn('[mesh] publish failed', e?.message || e)
    }
  }

  _dispatch(env) {
    // History-replay control envelopes — handled before the standard handle/peer
    // bookkeeping because they don't carry a sender handle (just the peerId).
    if (env.type === 'history-request') {
      this._handleHistoryRequest(env)
      return
    }
    if (env.type === 'history-response') {
      this._handleHistoryResponse(env)
      return
    }

    if (!env.handle || typeof env.handle !== 'string') return
    if (!HANDLE_RE.test(env.handle)) return

    const existing = this.peers.get(env.from)
    const isNewPeer = !existing
    const isNewHandle = !this.announcedHandles.has(env.handle)

    this.peers.set(env.from, {
      handle: env.handle,
      avatarSeed: env.avatarSeed,
      lastSeen: Date.now(),
    })
    this.announcedHandles.add(env.handle)

    if (isNewPeer) {
      this.onPeersChange(this.peerList())
      if (isNewHandle && Date.now() - this.startedAt > CATCHUP_WINDOW_MS) {
        this.onPeerJoined(env.handle, env.avatarSeed)
      }
    }

    if (env.handle === this.roomHandle) {
      if (this.hostGraceTimer) {
        clearTimeout(this.hostGraceTimer)
        this.hostGraceTimer = null
      }
      if (!this.hostCurrentlyHere) {
        this.hostCurrentlyHere = true
        this.onHostStatusChange(true)
      }
    }

    if (env.type === 'msg') {
      if (typeof env.text !== 'string') return
      if (env.text.length > MSG_MAX_LEN) return
      const msgId = env.id || `${env.from}-${env.t}`
      if (this.seenMsgIds.has(msgId)) return
      this.seenMsgIds.add(msgId)
      if (this.seenMsgIds.size > 2000) {
        const arr = [...this.seenMsgIds]
        this.seenMsgIds = new Set(arr.slice(arr.length - 1000))
      }
      const msg = {
        id: msgId,
        room: this.roomHandle,
        from: env.handle,
        fromAvatar: env.avatarSeed,
        text: env.text.slice(0, MSG_MAX_LEN),
        ts: Number.isFinite(env.t) ? Math.min(env.t, Date.now()) : Date.now(),
      }
      this._recordHistory(msg)
      this.onMessage(msg)
    }
  }

  // ==================== History replay ====================

  // Append a message to our in-memory log, capped at HISTORY_MAX. Also serves
  // as the dedup point if we ever try to record the same id twice.
  _recordHistory(msg) {
    if (this.historyLog.length && this.historyLog[this.historyLog.length - 1].id === msg.id) return
    this.historyLog.push(msg)
    if (this.historyLog.length > HISTORY_MAX) {
      this.historyLog.splice(0, this.historyLog.length - HISTORY_MAX)
    }
  }

  // On join, ask anyone in the room to send us their history. We accept the
  // first response. If nobody responds within HISTORY_REQUEST_TIMEOUT_MS, we
  // accept that we're the first one here.
  _requestHistory() {
    if (this.historyReceived) return
    this._publish({ type: 'history-request' })
    this.historyRequestTimer = setTimeout(() => {
      if (!this.historyReceived) {
        this.historyReceived = true
        console.log('[mesh] no history response — first peer in room')
      }
      this.historyRequestTimer = null
    }, HISTORY_REQUEST_TIMEOUT_MS)
  }

  // Someone just joined and asked for history. If we have any, schedule a
  // jittered reply — the random delay means the closest/fastest peer typically
  // wins the race instead of every peer flooding the requester at once.
  // If we see another peer's response land before our timer fires, we cancel
  // ours (handled in _handleHistoryResponse).
  _handleHistoryRequest(env) {
    if (!env.from || env.from === this.peerId) return
    if (this.historyLog.length === 0) return
    if (this.pendingHistoryReplies.has(env.from)) return
    const delay = HISTORY_RESPONSE_DELAY_MIN + Math.random() * (HISTORY_RESPONSE_DELAY_MAX - HISTORY_RESPONSE_DELAY_MIN)
    const timer = setTimeout(() => {
      this.pendingHistoryReplies.delete(env.from)
      this._publish({ type: 'history-response', to: env.from, log: this.historyLog })
    }, delay)
    this.pendingHistoryReplies.set(env.from, timer)
  }

  // Someone responded to a history request. If we're the requester and haven't
  // accepted one yet, replay the messages through onMessage. Either way, if we
  // have a pending outbound reply for the same target, cancel it — no point in
  // a second copy.
  _handleHistoryResponse(env) {
    if (this.pendingHistoryReplies.has(env.to)) {
      clearTimeout(this.pendingHistoryReplies.get(env.to))
      this.pendingHistoryReplies.delete(env.to)
    }
    if (env.to !== this.peerId) return
    if (this.historyReceived) return
    if (!Array.isArray(env.log)) return
    this.historyReceived = true
    if (this.historyRequestTimer) {
      clearTimeout(this.historyRequestTimer)
      this.historyRequestTimer = null
    }
    let replayed = 0
    for (const m of env.log) {
      if (!m || typeof m !== 'object') continue
      if (typeof m.id !== 'string' || typeof m.text !== 'string') continue
      if (this.seenMsgIds.has(m.id)) continue
      this.seenMsgIds.add(m.id)
      const msg = {
        id: m.id,
        room: this.roomHandle,
        from: m.from,
        fromAvatar: m.fromAvatar,
        text: m.text.slice(0, MSG_MAX_LEN),
        ts: Number.isFinite(m.ts) ? m.ts : Date.now(),
        replayed: true,
      }
      this._recordHistory(msg)
      this.onMessage(msg)
      replayed++
    }
    console.log('[mesh] replayed %d historical messages', replayed)
  }

  _gc() {
    const now = Date.now()
    let peersChanged = false
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > PEER_TIMEOUT_MS) {
        this.peers.delete(id)
        peersChanged = true
        if (peer.handle === this.roomHandle) {
          const stillHere = [...this.peers.values()].some(p => p.handle === this.roomHandle)
          if (!stillHere && this.hostCurrentlyHere) {
            if (this.hostGraceTimer) clearTimeout(this.hostGraceTimer)
            this.hostGraceTimer = setTimeout(() => {
              const gone = ![...this.peers.values()].some(p => p.handle === this.roomHandle)
              if (gone) {
                this.hostCurrentlyHere = false
                this.onHostStatusChange(false)
              }
              this.hostGraceTimer = null
            }, HOST_GRACE_MS)
          }
        }
      }
    }
    if (peersChanged) this.onPeersChange(this.peerList())
  }

  peerList() {
    const seen = new Set([this.me.handle])
    const list = [{ ...this.me, self: true }]
    for (const p of this.peers.values()) {
      if (seen.has(p.handle)) continue
      seen.add(p.handle)
      list.push({ handle: p.handle, avatarSeed: p.avatarSeed })
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
    const id = `${this.me.handle}-${Date.now()}-${randomId().slice(0, 6)}`
    const msg = {
      type: 'msg',
      id,
      handle: this.me.handle,
      avatarSeed: this.me.avatarSeed,
      text,
    }
    this._publish(msg)
    this.seenMsgIds.add(id)
    const local = {
      id,
      room: this.roomHandle,
      from: this.me.handle,
      fromAvatar: this.me.avatarSeed,
      text,
      ts: Date.now(),
    }
    this._recordHistory(local)
    return local
  }

  leave() {
    if (this.announceTimer) { clearInterval(this.announceTimer); this.announceTimer = null }
    if (this.gcTimer) { clearInterval(this.gcTimer); this.gcTimer = null }
    if (this.hostGraceTimer) { clearTimeout(this.hostGraceTimer); this.hostGraceTimer = null }
    if (this.historyRequestTimer) { clearTimeout(this.historyRequestTimer); this.historyRequestTimer = null }
    for (const t of this.pendingHistoryReplies.values()) clearTimeout(t)
    this.pendingHistoryReplies.clear()
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler)
      this._visibilityHandler = null
    }
    if (this.client) {
      try { this.client.end(true) } catch {}
      this.client = null
    }
    this.peers.clear()
    this.announcedHandles.clear()
    this.seenMsgIds.clear()
    this.historyLog = []
    this.historyReceived = false
    this.hostCurrentlyHere = false
  }
}
