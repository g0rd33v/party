// Party — main app
// Static SPA. No backend. No build step.

import { joinRoom } from 'https://esm.sh/trystero@0.21.4/torrent'

// ---------- Constants ----------

const APP_ID = 'party-2026-v1'
const HANDLE_LENGTH = 6
const HISTORY_HOURS = 24
const LS_CRED_ID = 'party.credentialId'
const LS_HANDLE = 'party.handle'
const LS_AVATAR_SEED = 'party.avatarSeed'
const DB_NAME = 'party'
const DB_VERSION = 1
const DB_STORE_MESSAGES = 'messages'

// ---------- Utilities ----------

const b64url = {
  encode(buf) {
    const bytes = new Uint8Array(buf)
    let s = ''
    for (const b of bytes) s += String.fromCharCode(b)
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  decode(str) {
    const pad = str.length % 4
    if (pad) str += '='.repeat(4 - pad)
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes.buffer
  },
}

async function sha256(buf) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf))
}

// Deterministic handle: hash credential ID, map first N bytes to a-z
async function deriveHandle(credentialIdBuf) {
  const hash = await sha256(credentialIdBuf)
  let out = ''
  for (let i = 0; i < HANDLE_LENGTH; i++) {
    out += String.fromCharCode(97 + (hash[i] % 26))
  }
  return out
}

// Deterministic avatar seed: another slice of the hash
async function deriveAvatarSeed(credentialIdBuf) {
  const hash = await sha256(credentialIdBuf)
  return Array.from(hash.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function parseRoute() {
  // Handles both g0rd33v.github.io/party/ and g0rd33v.github.io/party/alice
  // We look for everything after '/party/' (if present)
  const path = location.pathname
  const base = '/party/'
  let handle = ''
  if (path.startsWith(base)) {
    handle = path.slice(base.length).replace(/\/$/, '')
  } else if (path === '/party' || path === '/') {
    handle = ''
  } else {
    // local dev or other: take last path segment
    handle = path.split('/').filter(Boolean).pop() || ''
  }
  // Validate: must be 4-10 lowercase letters
  if (!/^[a-z]{4,10}$/.test(handle)) handle = ''
  return { handle }
}

function navigateToParty(handle) {
  const base = '/party/'
  history.pushState({}, '', base + handle)
  render()
}

function navigateHome() {
  history.pushState({}, '', '/party/')
  render()
}

function toast(msg, ms = 2200) {
  let el = document.querySelector('.toast')
  if (!el) {
    el = document.createElement('div')
    el.className = 'toast'
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(toast._t)
  toast._t = setTimeout(() => el.classList.remove('show'), ms)
}

// ---------- Avatar (deterministic SVG identicon) ----------

function avatarSvg(seedHex, size = 96) {
  // 5x5 symmetric grid, bits from seed hex
  const bits = []
  for (const ch of seedHex) {
    const n = parseInt(ch, 16)
    for (let b = 3; b >= 0; b--) bits.push((n >> b) & 1)
  }
  // Pick color from first 3 bytes of seed: constrained saturation/lightness for dark theme
  const r = parseInt(seedHex.slice(0, 2), 16)
  const hue = Math.floor((r / 255) * 360)
  const fg = `hsl(${hue}, 55%, 62%)`
  const bg = `#1a1a1a`

  let cells = ''
  const cellSize = size / 5
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const idx = row * 3 + col
      if (!bits[idx]) continue
      const x = col * cellSize
      const y = row * cellSize
      cells += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${fg}"/>`
      if (col < 2) {
        const mirrorX = (4 - col) * cellSize
        cells += `<rect x="${mirrorX}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${fg}"/>`
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${bg}"/>${cells}</svg>`
}

// ---------- Identity (WebAuthn + Face ID) ----------

const Identity = {
  async create() {
    if (!window.PublicKeyCredential) {
      throw new Error('This device does not support passkeys. Use Safari on iPhone.')
    }
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const userId = crypto.getRandomValues(new Uint8Array(16))

    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Party' },
        user: {
          id: userId,
          name: 'party-user',
          displayName: 'Party User',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },  // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    })
    if (!cred) throw new Error('Face ID cancelled')

    const rawId = cred.rawId
    const handle = await deriveHandle(rawId)
    const avatarSeed = await deriveAvatarSeed(rawId)

    localStorage.setItem(LS_CRED_ID, b64url.encode(rawId))
    localStorage.setItem(LS_HANDLE, handle)
    localStorage.setItem(LS_AVATAR_SEED, avatarSeed)

    return { handle, avatarSeed, rawIdB64: b64url.encode(rawId) }
  },

  load() {
    const credId = localStorage.getItem(LS_CRED_ID)
    const handle = localStorage.getItem(LS_HANDLE)
    const avatarSeed = localStorage.getItem(LS_AVATAR_SEED)
    if (!credId || !handle || !avatarSeed) return null
    return { handle, avatarSeed, rawIdB64: credId }
  },

  clear() {
    localStorage.removeItem(LS_CRED_ID)
    localStorage.removeItem(LS_HANDLE)
    localStorage.removeItem(LS_AVATAR_SEED)
  },
}

// ---------- Storage (IndexedDB, 24h rolling) ----------

const Store = {
  db: null,

  async open() {
    if (this.db) return this.db
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(DB_STORE_MESSAGES)) {
          const store = db.createObjectStore(DB_STORE_MESSAGES, { keyPath: 'id' })
          store.createIndex('byRoomTs', ['room', 'ts'])
          store.createIndex('byTs', 'ts')
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    return this.db
  },

  async addMessage(msg) {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE_MESSAGES, 'readwrite')
      const store = tx.objectStore(DB_STORE_MESSAGES)
      const req = store.put(msg)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  },

  async getMessages(room) {
    const db = await this.open()
    const cutoff = Date.now() - HISTORY_HOURS * 3600 * 1000
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE_MESSAGES, 'readonly')
      const store = tx.objectStore(DB_STORE_MESSAGES)
      const idx = store.index('byRoomTs')
      const range = IDBKeyRange.bound([room, cutoff], [room, Date.now() + 1])
      const req = idx.getAll(range)
      req.onsuccess = () => resolve(req.result.sort((a, b) => a.ts - b.ts))
      req.onerror = () => reject(req.error)
    })
  },

  async prune() {
    const db = await this.open()
    const cutoff = Date.now() - HISTORY_HOURS * 3600 * 1000
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE_MESSAGES, 'readwrite')
      const store = tx.objectStore(DB_STORE_MESSAGES)
      const idx = store.index('byTs')
      const req = idx.openCursor(IDBKeyRange.upperBound(cutoff))
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        } else {
          resolve()
        }
      }
      req.onerror = () => reject(req.error)
    })
  },
}

// ---------- Mesh (Trystero) ----------

class Mesh {
  constructor(roomHandle, me) {
    this.roomHandle = roomHandle
    this.me = me // { handle, avatarSeed }
    this.peers = new Map() // peerId -> { handle, avatarSeed }
    this.room = null
    this.sendMsg = null
    this.sendHello = null
    this.onMessage = () => {}
    this.onPeersChange = () => {}
    this.onHostStatusChange = () => {}
  }

  start() {
    this.room = joinRoom({ appId: APP_ID }, this.roomHandle)

    const [sendMsg, getMsg] = this.room.makeAction('msg')
    const [sendHello, getHello] = this.room.makeAction('hello')
    this.sendMsg = sendMsg
    this.sendHello = sendHello

    this.room.onPeerJoin(peerId => {
      // Introduce ourselves to new peer
      sendHello({ handle: this.me.handle, avatarSeed: this.me.avatarSeed }, peerId)
    })

    this.room.onPeerLeave(peerId => {
      const was = this.peers.get(peerId)
      this.peers.delete(peerId)
      this.onPeersChange(this.peerList())
      // If host left, announce party over
      if (was && was.handle === this.roomHandle) {
        this.onHostStatusChange(false)
      }
    })

    getHello((data, peerId) => {
      if (!data || typeof data.handle !== 'string') return
      if (!/^[a-z]{4,10}$/.test(data.handle)) return
      this.peers.set(peerId, { handle: data.handle, avatarSeed: data.avatarSeed })
      this.onPeersChange(this.peerList())
      if (data.handle === this.roomHandle) {
        this.onHostStatusChange(true)
      }
    })

    getMsg((data, peerId) => {
      if (!data || typeof data.text !== 'string') return
      if (data.text.length > 2000) return
      const peer = this.peers.get(peerId)
      if (!peer) return
      const msg = {
        id: data.id || `${peerId}-${data.ts}`,
        room: this.roomHandle,
        from: peer.handle,
        fromAvatar: peer.avatarSeed,
        text: data.text.slice(0, 2000),
        ts: Number.isFinite(data.ts) ? Math.min(data.ts, Date.now()) : Date.now(),
      }
      this.onMessage(msg)
    })
  }

  peerList() {
    const list = [{ ...this.me, self: true }]
    for (const p of this.peers.values()) list.push(p)
    // Host first, then alphabetical
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
    if (this.sendMsg) this.sendMsg(msg)
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
    if (this.room) {
      try {
        this.room.leave()
      } catch {}
    }
    this.peers.clear()
  }
}

// ---------- Views ----------

const app = document.getElementById('app')

function esc(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c])
}

function formatTime(ts) {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

function renderLanding(identity) {
  app.innerHTML = `
    <div class="landing">
      <div class="landing-hero">
        <h1 class="wordmark">Party.</h1>
        <p class="tagline">A party is a link.<br/>Open Safari.<br/>Invite the world.</p>
        <p class="lede">Face ID gets you a unique name. Your name is your party. Post the link anywhere. Your fans come over. When you close Safari, the party's over.</p>
        ${identity ? `
          <div class="identity-card">
            <div class="identity-avatar">${avatarSvg(identity.avatarSeed)}</div>
            <h2 class="identity-handle">${identity.handle}</h2>
            <p class="identity-note">Your name. Your party.</p>
            <div class="landing-actions">
              <button class="btn btn-primary" id="open-party">Open my party</button>
              <button class="btn btn-secondary" id="copy-link">Copy my link</button>
            </div>
          </div>
        ` : `
          <div class="landing-actions">
            <button class="btn btn-primary" id="create">Create my party</button>
          </div>
        `}
      </div>
      <div class="landing-footer">
        <span>Labs · 2026</span>
        <span>Safari · iPhone</span>
      </div>
    </div>
  `

  if (identity) {
    document.getElementById('open-party').onclick = () => navigateToParty(identity.handle)
    document.getElementById('copy-link').onclick = async () => {
      const url = `${location.origin}/party/${identity.handle}`
      try {
        await navigator.clipboard.writeText(url)
        toast('Link copied')
      } catch {
        toast(url)
      }
    }
  } else {
    document.getElementById('create').onclick = async () => {
      const btn = document.getElementById('create')
      btn.disabled = true
      btn.innerHTML = '<span class="loader"></span>'
      try {
        await Identity.create()
        render()
      } catch (err) {
        console.error(err)
        btn.disabled = false
        btn.textContent = 'Create my party'
        toast(err.message || 'Face ID failed')
      }
    }
  }
}

function renderNeedsIdentity(roomHandle) {
  app.innerHTML = `
    <div class="center-state">
      <h1 class="state-title">Party at ${esc(roomHandle)}</h1>
      <p class="state-message">To join, use Face ID to get your own party name. No email, no password, no account.</p>
      <div class="state-actions">
        <button class="btn btn-primary" id="auth">Use Face ID</button>
        <button class="btn btn-secondary" id="home">Back</button>
      </div>
    </div>
  `
  document.getElementById('auth').onclick = async () => {
    const btn = document.getElementById('auth')
    btn.disabled = true
    btn.innerHTML = '<span class="loader"></span>'
    try {
      await Identity.create()
      render()
    } catch (err) {
      console.error(err)
      btn.disabled = false
      btn.textContent = 'Use Face ID'
      toast(err.message || 'Face ID failed')
    }
  }
  document.getElementById('home').onclick = navigateHome
}

let activeMesh = null

function renderParty(roomHandle, me) {
  // Cleanup previous mesh if any
  if (activeMesh) {
    activeMesh.leave()
    activeMesh = null
  }

  const amHost = roomHandle === me.handle
  const state = {
    roomHandle,
    me,
    amHost,
    messages: [],
    peers: [{ ...me, self: true }],
    hostPresent: amHost,
    partyOver: false,
  }

  app.innerHTML = `
    <div class="party">
      <div class="party-header">
        <div class="party-avatar" id="room-avatar"></div>
        <div class="party-title">
          <h2 class="party-handle">${esc(roomHandle)}</h2>
          <p class="party-status" id="room-status"><span class="status-dot"></span><span id="status-text">Connecting…</span></p>
        </div>
        <div class="party-header-actions">
          <button class="icon-btn" id="share-btn" title="Share">↗</button>
          <button class="icon-btn" id="home-btn" title="Home">×</button>
        </div>
      </div>
      <div class="party-peers" id="peers"></div>
      <div class="messages" id="messages"></div>
      <div class="compose">
        <input class="compose-input" id="compose-input" placeholder="${amHost ? 'Say something to your party…' : 'Say hi…'}" maxlength="2000" autocomplete="off" />
        <button class="compose-send" id="compose-send" disabled>→</button>
      </div>
    </div>
  `

  // Room avatar: host's avatar seed if host is us, else placeholder until we meet host
  const roomAvatarEl = document.getElementById('room-avatar')
  const renderRoomAvatar = (seed) => {
    roomAvatarEl.innerHTML = avatarSvg(seed || '000000000000000000000000000000000000')
  }
  renderRoomAvatar(amHost ? me.avatarSeed : null)

  const statusText = document.getElementById('status-text')
  const statusDot = document.querySelector('.status-dot')
  const peersEl = document.getElementById('peers')
  const messagesEl = document.getElementById('messages')
  const input = document.getElementById('compose-input')
  const sendBtn = document.getElementById('compose-send')

  document.getElementById('share-btn').onclick = async () => {
    const url = `${location.origin}/party/${roomHandle}`
    const data = { title: 'Party', text: `Join ${roomHandle} on Party`, url }
    if (navigator.share) {
      try { await navigator.share(data) } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url)
        toast('Link copied')
      } catch {
        toast(url)
      }
    }
  }
  document.getElementById('home-btn').onclick = navigateHome

  const updateStatus = () => {
    if (state.partyOver) {
      statusDot.classList.add('offline')
      statusText.textContent = "Party's over"
      input.disabled = true
      sendBtn.disabled = true
      return
    }
    statusDot.classList.remove('offline')
    const count = state.peers.length
    if (amHost) {
      statusText.textContent = `Hosting · ${count} ${count === 1 ? 'person' : 'people'}`
    } else if (state.hostPresent) {
      statusText.textContent = `Live · ${count} ${count === 1 ? 'person' : 'people'}`
    } else {
      statusText.textContent = 'Looking for host…'
    }
  }

  const renderPeers = () => {
    peersEl.innerHTML = state.peers.map(p => {
      const isHost = p.handle === roomHandle
      return `
        <div class="peer-chip ${isHost ? 'is-host' : ''}">
          <div class="peer-avatar">${avatarSvg(p.avatarSeed || '000000000000000000000000000000000000', 22)}</div>
          <span>${esc(p.handle)}${p.self ? ' (you)' : ''}</span>
          ${isHost ? '<span class="host-tag">host</span>' : ''}
        </div>
      `
    }).join('')
  }

  const renderMessages = () => {
    // Dedupe by id, keep sorted by ts
    const seen = new Set()
    const list = state.messages.filter(m => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    }).sort((a, b) => a.ts - b.ts)

    messagesEl.innerHTML = list.map(m => {
      if (m.system) {
        return `<div class="message system"><div class="message-body"><div class="message-text">${esc(m.text)}</div></div></div>`
      }
      return `
        <div class="message">
          <div class="message-avatar">${avatarSvg(m.fromAvatar || '000000000000000000000000000000000000', 28)}</div>
          <div class="message-body">
            <div class="message-meta">
              <span class="message-handle">${esc(m.from)}</span>
              <span class="message-time">${formatTime(m.ts)}</span>
            </div>
            <div class="message-text">${esc(m.text)}</div>
          </div>
        </div>
      `
    }).join('')
    messagesEl.scrollTop = messagesEl.scrollHeight
  }

  const addMessage = (m, persist = true) => {
    state.messages.push(m)
    renderMessages()
    if (persist && !m.system) {
      Store.addMessage(m).catch(console.error)
    }
  }

  // Input wiring
  input.oninput = () => {
    sendBtn.disabled = input.value.trim().length === 0 || state.partyOver
  }
  const doSend = () => {
    const text = input.value.trim()
    if (!text || state.partyOver) return
    const msg = activeMesh.send(text)
    addMessage(msg)
    input.value = ''
    sendBtn.disabled = true
  }
  sendBtn.onclick = doSend
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      doSend()
    }
  }

  // Load history
  Store.prune().catch(() => {})
  Store.getMessages(roomHandle).then(history => {
    for (const m of history) state.messages.push(m)
    renderMessages()
  }).catch(console.error)

  // Start mesh
  const mesh = new Mesh(roomHandle, me)
  activeMesh = mesh

  mesh.onMessage = (m) => addMessage(m, true)
  mesh.onPeersChange = (peers) => {
    state.peers = peers
    // If we now see the host, grab their avatar for the room header
    const host = peers.find(p => p.handle === roomHandle)
    if (host) {
      state.hostPresent = true
      renderRoomAvatar(host.avatarSeed)
    }
    renderPeers()
    updateStatus()
  }
  mesh.onHostStatusChange = (present) => {
    state.hostPresent = present
    if (!present && !amHost) {
      state.partyOver = true
      addMessage({
        id: `sys-${Date.now()}`,
        room: roomHandle,
        text: `${roomHandle} left. Party's over.`,
        ts: Date.now(),
        system: true,
      }, false)
    }
    updateStatus()
  }

  mesh.start()
  renderPeers()
  updateStatus()

  // If not host and after 8 seconds we've never seen them, mark as offline
  setTimeout(() => {
    if (!amHost && !state.hostPresent && !state.partyOver) {
      state.partyOver = true
      addMessage({
        id: `sys-offline-${Date.now()}`,
        room: roomHandle,
        text: `${roomHandle} isn't hosting right now. Come back later.`,
        ts: Date.now(),
        system: true,
      }, false)
      updateStatus()
    }
  }, 8000)
}

// ---------- Router ----------

function render() {
  const { handle: roomHandle } = parseRoute()
  const identity = Identity.load()

  // Route 1: no room in URL → landing
  if (!roomHandle) {
    if (activeMesh) { activeMesh.leave(); activeMesh = null }
    renderLanding(identity)
    return
  }

  // Route 2: room in URL but user has no identity → prompt Face ID
  if (!identity) {
    if (activeMesh) { activeMesh.leave(); activeMesh = null }
    renderNeedsIdentity(roomHandle)
    return
  }

  // Route 3: both present → render party
  renderParty(roomHandle, identity)
}

window.addEventListener('popstate', render)

// Cleanup on tab close / background
window.addEventListener('pagehide', () => {
  if (activeMesh) activeMesh.leave()
})

// Boot
Store.open().catch(console.error)
render()
