// Party — main app
// Static SPA. No backend. No build step.

import { joinRoom } from 'https://esm.sh/trystero@0.21.4/torrent'

// ---------- Constants ----------

const APP_ID = 'party-2026-v1'
const HISTORY_HOURS = 24
const HOST_SEARCH_TIMEOUT_MS = 30000
const HOST_GRACE_MS = 5000

// --- Word lists for 3-word handles (size-color-noun) ---
// Locked: never reorder or modify; append-only if ever extended.
// 64 sizes × 64 colors × 256 nouns = 1,048,576 combinations

const SIZE_WORDS = [
  'big','tiny','huge','small','giant','mini','tall','short',
  'wide','slim','old','new','fresh','young','quick','slow',
  'fast','swift','lazy','bold','shy','brave','calm','wild',
  'kind','happy','grumpy','jolly','proud','silly','wise','clever',
  'smart','chill','fierce','gentle','loud','quiet','soft','tough',
  'sleek','rough','smooth','sharp','dull','bright','dim','shiny',
  'plain','fancy','noble','humble','cosmic','lucky','sleepy','mighty',
  'tired','eager','zesty','fuzzy','merry','sunny','cheery','nimble',
]

const COLOR_WORDS = [
  'red','blue','green','gold','silver','pink','black','white',
  'purple','orange','yellow','crimson','scarlet','azure','teal','cyan',
  'violet','indigo','magenta','lime','olive','mint','jade','emerald',
  'ruby','amber','coral','pearl','ivory','bronze','copper','rust',
  'brown','tan','cream','beige','rose','peach','plum','lemon',
  'lilac','navy','mauve','cobalt','ochre','sable','honey','snow',
  'frost','ash','slate','smoke','neon','misty','starry','dusky',
  'velvet','glass','steel','clay','mossy','foamy','golden','silky',
]

const NOUNS = [
  // animals (80)
  'fox','wolf','bear','lion','tiger','deer','elk','moose',
  'horse','zebra','camel','panda','koala','sloth','monkey','lemur',
  'rabbit','hare','mouse','otter','beaver','seal','whale','dolphin',
  'shark','fish','squid','crab','shrimp','turtle','frog','toad',
  'snake','lizard','gecko','newt','bat','eagle','hawk','owl',
  'crow','raven','dove','swan','duck','goose','robin','finch',
  'sparrow','heron','stork','crane','falcon','kite','puffin','parrot',
  'bee','ant','wasp','moth','beetle','spider','cricket','firefly',
  'dragon','phoenix','griffin','unicorn','pegasus','kraken','sphinx','hydra',
  'husky','corgi','terrier','poodle','mustang','raccoon','badger','ferret',
  // objects (80)
  'apple','moon','star','cloud','wave','storm','flame','stone',
  'lake','river','hill','tree','leaf','seed','root','branch',
  'key','door','book','page','pen','lamp','candle','mirror',
  'cup','bowl','plate','spoon','bed','chair','table','rug',
  'shoe','hat','scarf','glove','ring','crown','sword','shield',
  'arrow','bow','tower','bridge','road','path','trail','map',
  'ship','boat','sail','anchor','wheel','car','bike','kite',
  'drum','flute','bell','song','mask','robe','cape','lantern',
  'compass','telescope','quill','scroll','prism','crystal','gem','jewel',
  'feather','brush','palette','chisel','hammer','anvil','forge','torch',
  // nature (48)
  'ocean','beach','island','valley','meadow','forest','jungle','desert',
  'canyon','cliff','cave','crater','volcano','glacier','reef','swamp',
  'marsh','pond','creek','stream','cascade','geyser','spring','peak',
  'summit','ridge','slope','gorge','plain','prairie','tundra','savanna',
  'oasis','dune','delta','lagoon','bay','cove','harbor','fjord',
  'atoll','mesa','grove','thicket','fern','vine','bloom','petal',
  // foods & plants (48)
  'mango','peach','plum','pear','grape','cherry','lemon','lime',
  'melon','orange','banana','olive','wheat','rice','bread','honey',
  'sugar','butter','cheese','pepper','basil','thyme','sage','clove',
  'ginger','cocoa','coffee','wine','milk','cream','berry','tomato',
  'onion','garlic','pasta','noodle','biscuit','muffin','waffle','donut',
  'pretzel','pickle','cookie','pancake','pizza','taco','barley','maple',
]
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

// Deterministic handle: size-color-noun picked from hash bytes
async function deriveHandle(credentialIdBuf) {
  const hash = await sha256(credentialIdBuf)
  // Use 5 bytes: first for size (mod 64), second for color (mod 64),
  // bytes 3+4 combined for noun (mod 256 = just byte 3)
  const sizeIdx = hash[0] % SIZE_WORDS.length
  const colorIdx = hash[1] % COLOR_WORDS.length
  const nounIdx = hash[2] % NOUNS.length
  return `${SIZE_WORDS[sizeIdx]}-${COLOR_WORDS[colorIdx]}-${NOUNS[nounIdx]}`
}

const HANDLE_RE = /^[a-z]{2,10}-[a-z]{2,10}-[a-z]{2,12}$/

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
  // Validate: must be size-color-noun pattern
  if (!HANDLE_RE.test(handle)) handle = ''
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

// ---------- Avatar (party-themed SVG, 10 icons × deterministic color) ----------

const AVATAR_ICONS = [
  // 0 — balloon
  (p, a) => `
    <ellipse cx="48" cy="38" rx="22" ry="26" fill="${p}"/>
    <ellipse cx="40" cy="30" rx="5" ry="7" fill="${a}" opacity="0.55"/>
    <path d="M 44 62 L 52 62 L 50 70 L 46 70 Z" fill="${p}"/>
    <path d="M 48 70 Q 54 80 46 90" stroke="${a}" stroke-width="1.5" fill="none"/>`,
  // 1 — star
  (p, a) => `
    <polygon points="48,14 56,38 82,38 61,54 69,80 48,64 27,80 35,54 14,38 40,38" fill="${p}"/>
    <circle cx="48" cy="46" r="5" fill="${a}"/>`,
  // 2 — cake
  (p, a) => `
    <rect x="18" y="50" width="60" height="28" fill="${p}" rx="2"/>
    <rect x="18" y="58" width="60" height="4" fill="${a}" opacity="0.55"/>
    <rect x="28" y="38" width="40" height="14" fill="${a}" rx="1"/>
    <rect x="46" y="22" width="4" height="16" fill="${a}"/>
    <ellipse cx="48" cy="18" rx="3" ry="5" fill="#ffa33d"/>`,
  // 3 — party hat
  (p, a) => `
    <polygon points="48,14 22,80 74,80" fill="${p}"/>
    <rect x="30" y="44" width="36" height="3" fill="${a}"/>
    <rect x="26" y="62" width="44" height="3" fill="${a}"/>
    <circle cx="48" cy="12" r="7" fill="${a}"/>`,
  // 4 — cocktail
  (p, a) => `
    <polygon points="20,22 76,22 48,58" fill="${p}"/>
    <rect x="46" y="58" width="4" height="18" fill="${a}"/>
    <rect x="30" y="76" width="36" height="4" fill="${a}" rx="1"/>
    <circle cx="60" cy="30" r="4" fill="#d84c4c"/>
    <line x1="60" y1="30" x2="70" y2="18" stroke="${a}" stroke-width="1.5"/>`,
  // 5 — disco ball
  (p, a) => `
    <circle cx="48" cy="48" r="30" fill="${p}"/>
    <path d="M 20 48 Q 48 36 76 48" stroke="${a}" stroke-width="1.5" fill="none" opacity="0.5"/>
    <path d="M 20 48 Q 48 60 76 48" stroke="${a}" stroke-width="1.5" fill="none" opacity="0.5"/>
    <line x1="48" y1="20" x2="48" y2="76" stroke="${a}" stroke-width="1" opacity="0.45"/>
    <line x1="30" y1="26" x2="30" y2="70" stroke="${a}" stroke-width="1" opacity="0.45"/>
    <line x1="66" y1="26" x2="66" y2="70" stroke="${a}" stroke-width="1" opacity="0.45"/>
    <circle cx="38" cy="38" r="4" fill="#fff" opacity="0.7"/>`,
  // 6 — music note
  (p, a) => `
    <ellipse cx="34" cy="66" rx="9" ry="7" fill="${p}" transform="rotate(-18 34 66)"/>
    <ellipse cx="64" cy="60" rx="9" ry="7" fill="${p}" transform="rotate(-18 64 60)"/>
    <rect x="42" y="22" width="3" height="44" fill="${p}"/>
    <rect x="72" y="16" width="3" height="44" fill="${p}"/>
    <polygon points="42,22 75,16 75,30 42,36" fill="${p}"/>
    <polygon points="42,36 75,30 75,38 42,44" fill="${a}" opacity="0.7"/>`,
  // 7 — gift
  (p, a) => `
    <rect x="18" y="36" width="60" height="48" fill="${p}" rx="2"/>
    <rect x="18" y="36" width="60" height="8" fill="${a}"/>
    <rect x="44" y="36" width="8" height="48" fill="${a}"/>
    <path d="M 48 36 C 36 24 24 30 30 36 Z" fill="${a}"/>
    <path d="M 48 36 C 60 24 72 30 66 36 Z" fill="${a}"/>`,
  // 8 — firework
  (p, a) => {
    let rays = ''
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4
      const x2 = (48 + Math.cos(angle) * 30).toFixed(1)
      const y2 = (48 + Math.sin(angle) * 30).toFixed(1)
      const cx = (48 + Math.cos(angle) * 34).toFixed(1)
      const cy = (48 + Math.sin(angle) * 34).toFixed(1)
      const c = i % 2 === 0 ? p : a
      rays += `<line x1="48" y1="48" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="3" fill="${c}"/>`
    }
    return `${rays}<circle cx="48" cy="48" r="4" fill="#fff"/>`
  },
  // 9 — confetti
  (p, a) => `
    <rect x="14" y="20" width="8" height="3" fill="${p}" transform="rotate(30 18 21)"/>
    <rect x="72" y="24" width="8" height="3" fill="${a}" transform="rotate(-15 76 26)"/>
    <rect x="40" y="14" width="7" height="3" fill="${a}" transform="rotate(60 44 15)"/>
    <circle cx="28" cy="40" r="3" fill="${a}"/>
    <circle cx="68" cy="52" r="3" fill="${p}"/>
    <circle cx="20" cy="68" r="2.5" fill="${p}"/>
    <rect x="52" y="70" width="8" height="3" fill="${p}" transform="rotate(20 56 72)"/>
    <rect x="72" y="74" width="6" height="3" fill="${a}" transform="rotate(-30 75 75)"/>
    <rect x="36" y="78" width="7" height="3" fill="${a}" transform="rotate(50 39 79)"/>
    <circle cx="48" cy="38" r="2" fill="${p}"/>
    <circle cx="58" cy="28" r="2" fill="${p}"/>
    <rect x="14" y="54" width="6" height="3" fill="${p}" transform="rotate(-20 17 55)"/>`,
]

function avatarSvg(seedHex) {
  if (!seedHex) seedHex = '0'.repeat(32)
  const iconIdx = parseInt(seedHex.slice(0, 2), 16) % AVATAR_ICONS.length
  const hue = Math.floor((parseInt(seedHex.slice(2, 4), 16) / 255) * 360)
  const accentOffset = 30 + (parseInt(seedHex.slice(4, 6), 16) % 90)
  const accentHue = (hue + accentOffset) % 360
  const primary = `hsl(${hue}, 72%, 62%)`
  const accent = `hsl(${accentHue}, 72%, 75%)`
  const bg = `hsl(${hue}, 38%, 14%)`
  const body = AVATAR_ICONS[iconIdx](primary, accent)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${bg}"/>${body}</svg>`
}

// Display helper: "big-red-apple" → "Big Red Apple"
function displayHandle(handle) {
  if (!handle) return ''
  return handle.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ')
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
          residentKey: 'required',
          requireResidentKey: true,
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

  async clearAll() {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE_MESSAGES, 'readwrite')
      const store = tx.objectStore(DB_STORE_MESSAGES)
      const req = store.clear()
      req.onsuccess = () => resolve()
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
    this.announcedHandles = new Set() // handles we've already shown join notices for
    this.startedAt = 0
    this.room = null
    this.sendMsg = null
    this.sendHello = null
    this.onMessage = () => {}
    this.onPeersChange = () => {}
    this.onHostStatusChange = () => {}
    this.onPeerJoined = () => {}
  }

  start() {
    this.startedAt = Date.now()
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
      // If host left, start grace timer — they may briefly reconnect
      if (was && was.handle === this.roomHandle) {
        if (this.hostGraceTimer) clearTimeout(this.hostGraceTimer)
        this.hostGraceTimer = setTimeout(() => {
          // Check whether host returned during the grace window
          const hostStillGone = !Array.from(this.peers.values())
            .some(p => p.handle === this.roomHandle)
          if (hostStillGone) this.onHostStatusChange(false)
          this.hostGraceTimer = null
        }, HOST_GRACE_MS)
      }
    })

    getHello((data, peerId) => {
      if (!data || typeof data.handle !== 'string') return
      if (!HANDLE_RE.test(data.handle)) return
      const isNewPeer = !this.peers.has(peerId)
      const isNewHandle = !this.announcedHandles.has(data.handle)
      this.peers.set(peerId, { handle: data.handle, avatarSeed: data.avatarSeed })
      this.announcedHandles.add(data.handle)
      this.onPeersChange(this.peerList())
      // Fire a join notice only after the initial catchup window (2s) —
      // avoids spamming existing peers who we meet on first connect.
      if (isNewPeer && isNewHandle && Date.now() - this.startedAt > 2000) {
        this.onPeerJoined(data.handle, data.avatarSeed)
      }
      if (data.handle === this.roomHandle) {
        // Host is present — cancel any pending grace timer
        if (this.hostGraceTimer) {
          clearTimeout(this.hostGraceTimer)
          this.hostGraceTimer = null
        }
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
            <h2 class="identity-handle">${displayHandle(identity.handle)}</h2>
            <p class="identity-note">Your name. Your party.</p>
            <div class="landing-actions">
              <button class="btn btn-primary" id="open-party">Open my party</button>
              <button class="btn btn-secondary" id="copy-link">Copy my link</button>
              <button class="btn btn-ghost" id="clear-data">Clear my data</button>
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
    const clearBtn = document.getElementById('clear-data')
    let clearArmed = false
    let clearTimer = null
    clearBtn.onclick = async () => {
      if (!clearArmed) {
        clearArmed = true
        clearBtn.textContent = 'Tap again to confirm'
        clearBtn.classList.add('btn-danger')
        clearTimer = setTimeout(() => {
          clearArmed = false
          clearBtn.textContent = 'Clear my data'
          clearBtn.classList.remove('btn-danger')
        }, 4000)
        return
      }
      clearTimeout(clearTimer)
      clearArmed = false
      Identity.clear()
      try { await Store.clearAll() } catch {}
      toast('Data cleared. Create a new party.')
      render()
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
      <h1 class="state-title">Party at ${esc(displayHandle(roomHandle))}</h1>
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
          <h2 class="party-handle">${esc(displayHandle(roomHandle))}</h2>
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
    const data = { title: 'Party', text: `Join ${displayHandle(roomHandle)} on Party`, url }
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
          <div class="peer-avatar">${avatarSvg(p.avatarSeed)}</div>
          <span>${esc(displayHandle(p.handle))}${p.self ? ' (you)' : ''}</span>
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
          <div class="message-avatar">${avatarSvg(m.fromAvatar)}</div>
          <div class="message-body">
            <div class="message-meta">
              <span class="message-handle">${esc(displayHandle(m.from))}</span>
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
        text: `${displayHandle(roomHandle)} left. Party's over.`,
        ts: Date.now(),
        system: true,
      }, false)
    }
    updateStatus()
  }
  mesh.onPeerJoined = (handle /*, avatarSeed */) => {
    addMessage({
      id: `sys-join-${handle}-${Date.now()}`,
      room: roomHandle,
      text: `${displayHandle(handle)} joined the party`,
      ts: Date.now(),
      system: true,
    }, false)
  }

  mesh.start()
  renderPeers()
  updateStatus()

  // If not host and after host-search timeout we've never seen them, mark as offline
  setTimeout(() => {
    if (!amHost && !state.hostPresent && !state.partyOver) {
      state.partyOver = true
      addMessage({
        id: `sys-offline-${Date.now()}`,
        room: roomHandle,
        text: `${displayHandle(roomHandle)} isn't hosting right now. Come back later.`,
        ts: Date.now(),
        system: true,
      }, false)
      updateStatus()
    }
  }, HOST_SEARCH_TIMEOUT_MS)
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
async function boot() {
  Store.open().catch(console.error)
  // Migrate any old-format handles (pre-word-based) to new format
  const credId = localStorage.getItem(LS_CRED_ID)
  const handle = localStorage.getItem(LS_HANDLE)
  if (credId && handle && !HANDLE_RE.test(handle)) {
    try {
      const rawIdBuf = b64url.decode(credId)
      const newHandle = await deriveHandle(rawIdBuf)
      const newSeed = await deriveAvatarSeed(rawIdBuf)
      localStorage.setItem(LS_HANDLE, newHandle)
      localStorage.setItem(LS_AVATAR_SEED, newSeed)
    } catch (e) {
      console.warn('Handle migration failed; clearing identity', e)
      Identity.clear()
    }
  }
  render()
}
boot()
