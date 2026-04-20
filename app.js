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

// ---------- Avatar (pixel emoji faces: 6 attrs × 6 variants = 46,656 combos) ----------

const AVATAR_FACES = {
  // 6 head colors — party-bright
  colors: [
    '#ff6ba8', // hot pink
    '#5eb8ff', // sky blue
    '#6be0a8', // mint
    '#ffd84a', // sunny yellow
    '#ff9255', // coral orange
    '#b489ff', // lavender
  ],

  // 6 hair styles (clipped to head circle)
  hair: [
    // 0 — short strip
    `<path d="M 12 30 Q 12 14 48 11 Q 84 14 84 30 L 84 34 L 12 34 Z" fill="#2a1f1a"/>`,
    // 1 — long (drapes down sides)
    `<path d="M 10 30 Q 10 10 48 9 Q 86 10 86 30 L 86 62 L 74 62 L 74 34 L 22 34 L 22 62 L 10 62 Z" fill="#2a1f1a"/>`,
    // 2 — curly puffs
    `<g fill="#2a1f1a"><circle cx="22" cy="22" r="10"/><circle cx="36" cy="14" r="10"/><circle cx="50" cy="11" r="10"/><circle cx="64" cy="14" r="10"/><circle cx="76" cy="22" r="10"/><rect x="14" y="22" width="68" height="12"/></g>`,
    // 3 — spiky
    `<g fill="#2a1f1a"><polygon points="14,34 24,10 32,34"/><polygon points="30,34 42,6 50,34"/><polygon points="46,34 58,6 66,34"/><polygon points="62,34 72,10 82,34"/></g>`,
    // 4 — bald
    ``,
    // 5 — mohawk
    `<g fill="#2a1f1a"><rect x="40" y="10" width="16" height="26"/><polygon points="40,10 56,10 52,2 44,2"/></g>`,
  ],

  // 6 eyes
  eyes: [
    // 0 — round dots
    `<rect x="32" y="42" width="4" height="5" fill="#2a1f1a"/><rect x="60" y="42" width="4" height="5" fill="#2a1f1a"/>`,
    // 1 — wide with whites
    `<rect x="28" y="40" width="10" height="10" fill="#fff"/><rect x="31" y="42" width="5" height="6" fill="#2a1f1a"/><rect x="58" y="40" width="10" height="10" fill="#fff"/><rect x="61" y="42" width="5" height="6" fill="#2a1f1a"/>`,
    // 2 — happy arcs
    `<path d="M 28 46 Q 34 40 40 46" stroke="#2a1f1a" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M 56 46 Q 62 40 68 46" stroke="#2a1f1a" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    // 3 — pixel X
    `<g fill="#2a1f1a"><rect x="30" y="41" width="10" height="2" transform="rotate(45 35 42)"/><rect x="30" y="41" width="10" height="2" transform="rotate(-45 35 42)"/><rect x="58" y="41" width="10" height="2" transform="rotate(45 63 42)"/><rect x="58" y="41" width="10" height="2" transform="rotate(-45 63 42)"/></g>`,
    // 4 — stars
    `<g fill="#ffdc4a" stroke="#2a1f1a" stroke-width="1"><polygon points="34,38 35.5,43 40,43 36,46 38,51 34,48 30,51 32,46 28,43 32.5,43"/><polygon points="62,38 63.5,43 68,43 64,46 66,51 62,48 58,51 60,46 56,43 60.5,43"/></g>`,
    // 5 — hearts
    `<g fill="#ff3a70"><path d="M 34 49 L 28 43 Q 27 39 31 39 Q 34 39 34 42 Q 34 39 37 39 Q 41 39 40 43 Z"/><path d="M 62 49 L 56 43 Q 55 39 59 39 Q 62 39 62 42 Q 62 39 65 39 Q 69 39 68 43 Z"/></g>`,
  ],

  // 6 noses
  nose: [
    `<rect x="47" y="55" width="2" height="2" fill="#2a1f1a" opacity="0.55"/>`,
    `<rect x="47" y="52" width="2" height="6" fill="#2a1f1a" opacity="0.5"/>`,
    `<polygon points="48,52 45,58 51,58" fill="#2a1f1a" opacity="0.55"/>`,
    ``,
    `<path d="M 45 53 Q 48 60 51 53" stroke="#2a1f1a" stroke-width="1.5" fill="none" opacity="0.55" stroke-linecap="round"/>`,
    `<rect x="45" y="56" width="2" height="2" fill="#2a1f1a" opacity="0.55"/><rect x="49" y="56" width="2" height="2" fill="#2a1f1a" opacity="0.55"/>`,
  ],

  // 6 mouths
  mouth: [
    `<path d="M 38 66 Q 48 74 58 66" stroke="#2a1f1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
    `<path d="M 36 64 Q 48 76 60 64 Z" fill="#2a1f1a"/><rect x="40" y="65" width="16" height="3" fill="#fff"/>`,
    `<ellipse cx="48" cy="68" rx="4" ry="5" fill="#2a1f1a"/>`,
    `<path d="M 38 64 Q 48 71 58 64" stroke="#2a1f1a" stroke-width="2.5" fill="none" stroke-linecap="round"/><ellipse cx="52" cy="70" rx="3" ry="4" fill="#ff3a70"/>`,
    `<rect x="40" y="66" width="16" height="2.5" fill="#2a1f1a" rx="1"/>`,
    `<polyline points="38,66 42,64 46,68 50,64 54,68 58,66" stroke="#2a1f1a" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  ],

  // 6 accessories (not clipped — can extend outside head)
  accessory: [
    // 0 — party hat
    `<g><polygon points="48,2 36,22 60,22" fill="#ff3a70"/><circle cx="48" cy="2" r="3.5" fill="#ffdc4a"/><rect x="40" y="12" width="16" height="2" fill="#ffdc4a"/></g>`,
    // 1 — sunglasses
    `<g><rect x="22" y="40" width="22" height="10" fill="#151515" rx="2"/><rect x="52" y="40" width="22" height="10" fill="#151515" rx="2"/><rect x="44" y="43" width="8" height="2" fill="#151515"/><rect x="26" y="42" width="6" height="2" fill="#444" opacity="0.7"/><rect x="56" y="42" width="6" height="2" fill="#444" opacity="0.7"/></g>`,
    // 2 — crown
    `<g fill="#ffdc4a" stroke="#2a1f1a" stroke-width="1"><polygon points="18,28 26,12 34,24 40,8 48,24 56,8 62,24 70,12 78,28"/><rect x="18" y="26" width="60" height="5"/><circle cx="30" cy="17" r="2" fill="#ff3a70"/><circle cx="48" cy="14" r="2" fill="#5eb8ff"/><circle cx="66" cy="17" r="2" fill="#6be0a8"/></g>`,
    // 3 — masquerade mask
    `<g><path d="M 22 42 Q 26 34 34 36 Q 44 36 48 44 Q 52 36 62 36 Q 70 34 74 42 Q 74 48 64 50 Q 54 50 48 46 Q 42 50 32 50 Q 22 48 22 42 Z" fill="#8a3dff" stroke="#2a1f1a" stroke-width="1"/><rect x="32" y="42" width="4" height="4" fill="#151515"/><rect x="60" y="42" width="4" height="4" fill="#151515"/></g>`,
    // 4 — headphones
    `<g><path d="M 14 48 Q 14 10 48 10 Q 82 10 82 48" stroke="#2a1f1a" stroke-width="4" fill="none"/><rect x="8" y="40" width="14" height="22" rx="3" fill="#ff3a70"/><rect x="74" y="40" width="14" height="22" rx="3" fill="#ff3a70"/></g>`,
    // 5 — none
    ``,
  ],
}

function avatarSvg(seedHex) {
  if (!seedHex || seedHex.length < 12) seedHex = '0'.repeat(32)
  const cIdx = parseInt(seedHex.slice(0, 2), 16) % 6
  const hIdx = parseInt(seedHex.slice(2, 4), 16) % 6
  const eIdx = parseInt(seedHex.slice(4, 6), 16) % 6
  const nIdx = parseInt(seedHex.slice(6, 8), 16) % 6
  const mIdx = parseInt(seedHex.slice(8, 10), 16) % 6
  const aIdx = parseInt(seedHex.slice(10, 12), 16) % 6

  const headColor = AVATAR_FACES.colors[cIdx]
  const bgHue = (cIdx * 60 + 20) % 360
  const bg = `hsl(${bgHue}, 30%, 13%)`

  // Unique clip id per render (avoids DOM collision across many avatars)
  avatarSvg._n = (avatarSvg._n || 0) + 1
  const clipId = `hc-${seedHex.slice(0, 10)}-${avatarSvg._n}`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
    <defs><clipPath id="${clipId}"><circle cx="48" cy="48" r="38"/></clipPath></defs>
    <rect width="96" height="96" fill="${bg}"/>
    <circle cx="48" cy="48" r="38" fill="${headColor}"/>
    <g clip-path="url(#${clipId})">${AVATAR_FACES.hair[hIdx]}</g>
    ${AVATAR_FACES.eyes[eIdx]}
    ${AVATAR_FACES.nose[nIdx]}
    ${AVATAR_FACES.mouth[mIdx]}
    ${AVATAR_FACES.accessory[aIdx]}
  </svg>`
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
        if (m.kind === 'join') {
          return `
            <div class="message-join">
              <div class="message-join-avatar">${avatarSvg(m.joinAvatarSeed)}</div>
              <div class="message-join-label"><strong>${esc(displayHandle(m.joinHandle))}</strong> joined the party</div>
            </div>
          `
        }
        return `<div class="message-alert"><div class="message-alert-text">${esc(m.text)}</div></div>`
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
  mesh.onPeerJoined = (handle, avatarSeed) => {
    addMessage({
      id: `sys-join-${handle}-${Date.now()}`,
      room: roomHandle,
      kind: 'join',
      joinHandle: handle,
      joinAvatarSeed: avatarSeed,
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
