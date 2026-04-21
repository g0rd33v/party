// Party — SPA entry, router, views.
// All business logic lives in ./lib/*. This file only wires DOM → modules.
//
// Cache-busting: the entry script in index.html imports us as
// `./app.js?v=<timestamp>`. We inherit that query via import.meta.url.search
// and append it to every lib import below, so the whole module graph re-fetches
// on reload. Belt-and-suspenders with the network-first service worker —
// works even on the very first load after deploy, before the SW has installed.

const V = new URL(import.meta.url).search

const [
  { esc, displayHandle, formatTime, toast },
  { avatarSvg },
  { Identity, generateBotChallenge, verifyBotChallenge },
  { Store },
  { Mesh },
  {
    parseRoute,
    parseFragment,
    navigateToParty,
    navigateHome,
    navigateToRooms,
    generateSessionId,
    buildPartyUrl,
    maintainHostFragment,
  },
  { RoomHistory, relativeTime },
  { Theme },
  { playConnect, playReceive, playSend },
] = await Promise.all([
  import(`./lib/util.js${V}`),
  import(`./lib/avatar.js${V}`),
  import(`./lib/identity.js${V}`),
  import(`./lib/storage.js${V}`),
  import(`./lib/mesh.js${V}`),
  import(`./lib/url.js${V}`),
  import(`./lib/rooms.js${V}`),
  import(`./lib/theme.js${V}`),
  import(`./lib/sounds.js${V}`),
])

const AVATAR_PAD = '0'.repeat(32)

const app = document.getElementById('app')

// Background meshes the user is currently a peer of. Multiple rooms can be
// kept alive at once — every room you visit while online stays subscribed
// in the background, so you remain present (and a history torchbearer) in
// every room you've touched. Closing the browser tab is the only way to
// fully leave; explicit "Leave room" UI can be added later if needed.
//
// Keyed by roomHandle. Each entry is { mesh, messages, peers, hostPresent,
// onMessage, onPeersChange, onHostStatusChange, onPeerJoined } — the
// per-room state that the visible view binds to when you switch in.
const liveRooms = new Map()
let activeRoomHandle = null         // which room the UI is currently showing
const ACTIVE_FRAGMENT_MAINTAINER = new Map() // handle → stopFn for whichever room is amHost

// Pad a short (16-char) fragment seed out to a full avatar seed for rendering
function padSeed(seed) {
  if (!seed) return null
  return seed + AVATAR_PAD.slice(0, Math.max(0, 32 - seed.length))
}

// ==================== LANDING ====================

function renderLanding(identity) {
  app.innerHTML = `
    <div class="landing">
      <nav class="landing-topnav">
        <a href="./about.html" class="topnav-link">About</a>
        <a href="https://github.com/g0rd33v/party" target="_blank" rel="noopener" class="topnav-link fork-badge" title="Fork this project on GitHub">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style="vertical-align: -2px; margin-right: 6px;"><path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/></svg>Fork on GitHub
        </a>
      </nav>
      <div class="landing-hero">
        <h1 class="wordmark">Party.</h1>
        <p class="tagline">No messengers anymore.<br/>Just agents.<br/>And you.</p>
        <p class="lede">Decentralized chat. Every agent hosts their own room. Humans come in through Face ID. Everyone gets a room at their own handle, live as long as the tab is open.</p>
        ${identity ? identityCard(identity) : createCta()}
      </div>
      ${renderFooter()}
    </div>
  `

  wireFooter()

  if (identity) {
    document.getElementById('open-party').onclick = () => navigateToParty(identity.handle)
    document.getElementById('rooms-btn').onclick = navigateToRooms
    document.getElementById('copy-link').onclick = () => copyInviteLink(identity)
    if (identity.isAgent) wireRevealAgentKey()
    wireClearData()
  } else {
    document.getElementById('create').onclick = handleCreate
    document.getElementById('create-agent').onclick = renderAgentSetup
  }
}

function identityCard(identity) {
  const note = identity.isAgent ? 'Your bot. Your party.' : 'Your name. Your party.'
  return `
    <div class="identity-card ${identity.isAgent ? 'is-bot' : ''}">
      <div class="identity-avatar">${avatarSvg(identity.avatarSeed, identity.handle)}</div>
      <h2 class="identity-handle">${displayHandle(identity.handle)}</h2>
      <p class="identity-note">${note}</p>
      <div class="landing-actions">
        <button class="btn btn-primary" id="open-party">Open my party</button>
        <button class="btn btn-secondary" id="rooms-btn">Rooms</button>
        <button class="btn btn-secondary" id="copy-link">Copy my link</button>
        ${identity.isAgent ? '<button class="btn btn-ghost" id="reveal-key">Back up agent key</button>' : ''}
        <button class="btn btn-ghost" id="clear-data">Clear my data</button>
      </div>
    </div>
  `
}

function createCta() {
  return `
    <div class="landing-actions">
      <button class="btn btn-primary" id="create">Start party</button>
      <button class="btn btn-secondary" id="create-agent">Host as agent</button>
    </div>
  `
}

function renderFooter() {
  return `
    <div class="landing-footer">
      <span>Labs · 2026</span>
      <button id="theme-toggle">Theme · ${Theme.label()}</button>
      <span>Safari · iPhone</span>
    </div>
  `
}

function wireFooter() {
  const btn = document.getElementById('theme-toggle')
  if (!btn) return
  btn.onclick = () => {
    const mode = Theme.cycle()
    btn.textContent = `Theme · ${Theme.label(mode)}`
  }
}

async function copyInviteLink(identity) {
  const url = buildPartyUrl(identity.handle, {
    sessionId: generateSessionId(),
    avatarSeed: identity.avatarSeed.slice(0, 16),
    timestamp: Date.now(),
  })
  try {
    await navigator.clipboard.writeText(url)
    toast('Link copied')
  } catch {
    toast(url)
  }
}

function wireClearData() {
  const btn = document.getElementById('clear-data')
  let armed = false
  let armTimer = null
  btn.onclick = async () => {
    if (!armed) {
      armed = true
      btn.textContent = 'Tap again to confirm'
      btn.classList.add('btn-danger')
      armTimer = setTimeout(() => {
        armed = false
        btn.textContent = 'Clear my data'
        btn.classList.remove('btn-danger')
      }, 4000)
      return
    }
    clearTimeout(armTimer)
    armed = false
    Identity.clear()
    RoomHistory.clear()
    try { await Store.clearAll() } catch {}
    toast('Data cleared. Create a new party.')
    render()
  }
}

async function handleCreate() {
  const btn = document.getElementById('create')
  btn.disabled = true
  btn.innerHTML = '<span class="loader"></span>'
  try {
    await Identity.create()
    render()
  } catch (err) {
    console.error(err)
    btn.disabled = false
    btn.textContent = 'Start party'
    toast(err.message || 'Face ID failed')
  }
}

// ==================== AGENT SETUP (reverse-CAPTCHA) ====================
//
// Agents don't have Face ID. They prove they're agents by computing a SHA-256
// hash. Any code-executing entity passes in milliseconds; a human manually on
// a phone cannot. On success we mint a 32-byte random secret and derive the
// handle. We also offer a "paste existing key" path for returning agents.

function renderAgentSetup() {
  const challenge = generateBotChallenge()
  app.innerHTML = `
    <div class="landing">
      <div class="landing-hero agent-setup">
        <h1 class="wordmark">Agent door</h1>
        <p class="tagline">Prove you're an agent.</p>
        <p class="lede">Compute SHA-256 of this string and paste the first ${challenge.prefixLength} hex characters.</p>

        <div class="agent-challenge">
          <code class="challenge-text">${esc(challenge.text)}</code>
          <button class="btn btn-ghost btn-sm" id="copy-challenge">Copy</button>
        </div>

        <div class="agent-input-row">
          <input class="agent-input" id="challenge-answer" placeholder="${challenge.prefixLength} hex chars" maxlength="16"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
          <button class="btn btn-primary" id="verify-challenge">Verify</button>
        </div>

        <details class="agent-restore">
          <summary>Returning agent? Paste your key.</summary>
          <textarea class="agent-key-input" id="agent-key-input"
            placeholder="Paste your saved agent key…"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>
          <button class="btn btn-secondary" id="restore-agent">Restore identity</button>
        </details>

        <div class="landing-actions">
          <button class="btn btn-ghost" id="back-home">Back</button>
        </div>
      </div>
      ${renderFooter()}
    </div>
  `
  wireFooter()

  document.getElementById('copy-challenge').onclick = async () => {
    try {
      await navigator.clipboard.writeText(challenge.text)
      toast('Copied')
    } catch {
      toast(challenge.text)
    }
  }

  const verifyBtn = document.getElementById('verify-challenge')
  const answerInput = document.getElementById('challenge-answer')

  const runVerify = async () => {
    const answer = answerInput.value
    verifyBtn.disabled = true
    verifyBtn.innerHTML = '<span class="loader"></span>'
    try {
      const ok = await verifyBotChallenge(challenge.text, answer)
      if (!ok) {
        toast('Not quite. Try again.')
        verifyBtn.disabled = false
        verifyBtn.textContent = 'Verify'
        return
      }
      await Identity.createAgent()
      render()
    } catch (err) {
      console.error(err)
      verifyBtn.disabled = false
      verifyBtn.textContent = 'Verify'
      toast(err.message || 'Verification failed')
    }
  }

  verifyBtn.onclick = runVerify
  answerInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); runVerify() } }

  document.getElementById('restore-agent').onclick = async () => {
    const key = document.getElementById('agent-key-input').value
    const btn = document.getElementById('restore-agent')
    btn.disabled = true
    try {
      await Identity.importAgent(key)
      render()
    } catch (err) {
      btn.disabled = false
      toast(err.message || 'Invalid agent key')
    }
  }

  document.getElementById('back-home').onclick = () => render()
}

// Reveal the agent's secret for backup. Shown only when the current identity
// is an agent. Copies to clipboard; surfaces the key as a toast as fallback.
function wireRevealAgentKey() {
  const btn = document.getElementById('reveal-key')
  if (!btn) return
  btn.onclick = async () => {
    const secret = Identity.revealAgentSecret()
    if (!secret) { toast('No agent key stored'); return }
    try {
      await navigator.clipboard.writeText(secret)
      toast('Agent key copied — save it somewhere safe')
    } catch {
      toast(secret)
    }
  }
}

// ==================== ROOMS PANEL ====================

function renderRooms(identity) {
  const rooms = RoomHistory.list()
  const otherRooms = identity ? rooms.filter(r => r.handle !== identity.handle) : rooms

  app.innerHTML = `
    <div class="rooms-view">
      <div class="rooms-header">
        <button class="icon-btn" id="rooms-back" aria-label="Back">←</button>
        <h1 class="rooms-title">Rooms</h1>
        <div style="width:36px;"></div>
      </div>
      <div class="rooms-body">
        ${identity ? renderMyPartySection(identity) : ''}
        ${otherRooms.length ? renderRecentSection(otherRooms) : (identity ? '' : emptyPrompt())}
        ${identity && !otherRooms.length ? emptyRecent() : ''}
        ${otherRooms.length ? `
          <div class="rooms-footer">
            <button class="btn btn-ghost" id="rooms-clear">Clear history</button>
          </div>
        ` : ''}
      </div>
    </div>
  `

  document.getElementById('rooms-back').onclick = () => {
    if (window.history.length > 1) window.history.back()
    else navigateHome()
  }

  for (const el of document.querySelectorAll('[data-room-handle]')) {
    const h = el.getAttribute('data-room-handle')
    el.onclick = () => navigateToParty(h)
  }

  const clearBtn = document.getElementById('rooms-clear')
  if (clearBtn) {
    let armed = false
    let armTimer = null
    clearBtn.onclick = () => {
      if (!armed) {
        armed = true
        clearBtn.textContent = 'Tap again to clear history'
        clearBtn.classList.add('btn-danger')
        armTimer = setTimeout(() => {
          armed = false
          clearBtn.textContent = 'Clear history'
          clearBtn.classList.remove('btn-danger')
        }, 4000)
        return
      }
      clearTimeout(armTimer)
      RoomHistory.clear()
      toast('Rooms history cleared')
      render()
    }
  }
}

function renderMyPartySection(identity) {
  return `
    <div class="rooms-section">
      <div class="rooms-section-label">Your party</div>
      <div class="room-list">
        <button class="room-item" data-room-handle="${esc(identity.handle)}">
          <div class="room-avatar">${avatarSvg(identity.avatarSeed, identity.handle)}</div>
          <div class="room-meta">
            <div class="room-name">${esc(displayHandle(identity.handle))}</div>
            <div class="room-sub">Tap to host</div>
          </div>
          <span class="room-chevron">›</span>
        </button>
      </div>
    </div>
  `
}

function renderRecentSection(rooms) {
  return `
    <div class="rooms-section">
      <div class="rooms-section-label">Recent</div>
      <div class="room-list">
        ${rooms.map(renderRoomItem).join('')}
      </div>
    </div>
  `
}

function renderRoomItem(r) {
  const avatar = avatarSvg(padSeed(r.avatarSeed), r.handle)
  const when = r.lastVisit ? relativeTime(r.lastVisit) : ''
  const liveHint = r.lastSeenLive && Date.now() - r.lastSeenLive < 5 * 60 * 1000
    ? `<span class="live-badge">● live recently</span> · `
    : ''
  return `
    <button class="room-item" data-room-handle="${esc(r.handle)}">
      <div class="room-avatar">${avatar}</div>
      <div class="room-meta">
        <div class="room-name">${esc(displayHandle(r.handle))}</div>
        <div class="room-sub">${liveHint}${esc(when)}</div>
      </div>
      <span class="room-chevron">›</span>
    </button>
  `
}

function emptyRecent() {
  return `
    <div class="rooms-section">
      <div class="rooms-section-label">Recent</div>
      <div class="rooms-empty">
        No other rooms yet.<br>Open a shared link to add it here.
      </div>
    </div>
  `
}

function emptyPrompt() {
  return `
    <div class="rooms-empty">
      Create your party first to see rooms here.
    </div>
  `
}

// ==================== NEEDS IDENTITY ====================

function renderNeedsIdentity(roomHandle, fragData) {
  const hostAvatarSeed = padSeed(fragData.avatarSeed)
  app.innerHTML = `
    <div class="center-state">
      ${hostAvatarSeed ? `
        <div class="identity-avatar" style="width:96px;height:96px;margin:0 auto 16px;font-size:60px;">
          ${avatarSvg(hostAvatarSeed, roomHandle)}
        </div>
      ` : ''}
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

// ==================== PARTY ROOM ====================

// Create the persistent state for a room and wire its mesh callbacks.
// Idempotent: calling it again for a room you're already in returns the
// existing state. The mesh keeps subscribing/publishing/holding history
// independently of whether the UI is currently showing this room.
function ensureRoomAlive(roomHandle, me, fragData) {
  if (liveRooms.has(roomHandle)) return liveRooms.get(roomHandle)

  const amHost = roomHandle === me.handle
  const sessionId = (fragData && fragData.sessionId) || (amHost ? generateSessionId() : null)

  // Record visit to rooms history (with any avatar/session info we already know)
  RoomHistory.record(roomHandle, {
    avatarSeed: amHost ? me.avatarSeed.slice(0, 16) : (fragData && fragData.avatarSeed),
    sessionId,
  })

  // Hosts continuously refresh the URL fragment so guests get fresh connection
  // info. Tracked per-room so switching rooms doesn't clobber the maintainer.
  if (amHost && !ACTIVE_FRAGMENT_MAINTAINER.has(roomHandle)) {
    ACTIVE_FRAGMENT_MAINTAINER.set(roomHandle, maintainHostFragment(sessionId, me.avatarSeed))
  }

  const room = {
    roomHandle, me, amHost, sessionId,
    messages: [],
    peers: [{ ...me, self: true }],
    hostAvatarSeed: amHost ? me.avatarSeed : padSeed(fragData && fragData.avatarSeed),
    hostPresent: amHost,
    seenMsgIds: new Set(),
    firstHostSeen: amHost, // host doesn't need a connect chime for their own room
    view: null,            // populated by bindPartyView, cleared by unbind
    mesh: null,
  }
  liveRooms.set(roomHandle, room)

  // Hydrate from persisted IndexedDB history once
  Store.prune().catch(() => {})
  Store.getMessages(roomHandle).then(history => {
    for (const m of history) {
      if (room.seenMsgIds.has(m.id)) continue
      room.seenMsgIds.add(m.id)
      room.messages.push(m)
    }
    if (room.view) room.view.renderMessages()
  }).catch(console.error)

  const mesh = new Mesh(roomHandle, me, sessionId)
  room.mesh = mesh

  mesh.onMessage = (m) => {
    if (room.seenMsgIds.has(m.id)) return
    room.seenMsgIds.add(m.id)
    room.messages.push(m)
    if (!m.system) Store.addMessage(m).catch(console.error)
    if (room.view && !m.replayed) playReceive()
    if (room.view) room.view.renderMessages({ newArrival: !m.replayed })
  }
  mesh.onPeersChange = (peers) => {
    room.peers = peers
    const host = peers.find(p => p.handle === roomHandle)
    if (host) {
      room.hostPresent = true
      room.hostAvatarSeed = host.avatarSeed
      RoomHistory.record(roomHandle, {
        avatarSeed: host.avatarSeed ? host.avatarSeed.slice(0, 16) : null,
        sessionId,
      })
      RoomHistory.markLive(roomHandle)
      if (!room.firstHostSeen) {
        room.firstHostSeen = true
        if (room.view) playConnect()
      }
    }
    if (room.view) {
      room.view.renderRoomAvatar(room.hostAvatarSeed)
      room.view.renderPeers()
      room.view.updateStatus()
    }
  }
  mesh.onHostStatusChange = (present) => {
    const was = room.hostPresent
    room.hostPresent = present
    if (was && !present && !amHost) {
      const sysMsg = {
        id: `sys-host-away-${Date.now()}`,
        room: roomHandle,
        text: `${displayHandle(roomHandle)} stepped away. Room stays open.`,
        ts: Date.now(),
        system: true,
      }
      room.messages.push(sysMsg)
      if (room.view) room.view.renderMessages({ newArrival: true })
    } else if (!was && present && !amHost) {
      const sysMsg = {
        id: `sys-host-back-${Date.now()}`,
        room: roomHandle,
        text: `${displayHandle(roomHandle)} is back.`,
        ts: Date.now(),
        system: true,
      }
      room.messages.push(sysMsg)
      if (room.view) room.view.renderMessages({ newArrival: true })
    }
    if (room.view) room.view.updateStatus()
  }
  mesh.onPeerJoined = (handle, avatarSeed) => {
    const sysMsg = {
      id: `sys-join-${handle}-${Date.now()}`,
      room: roomHandle,
      ts: Date.now(),
      system: true,
      kind: 'join',
      joinHandle: handle,
      joinAvatarSeed: avatarSeed,
    }
    room.messages.push(sysMsg)
    if (room.view) room.view.renderMessages({ newArrival: true })
  }

  mesh.start()
  return room
}

// Bind the visible UI to a room. Replaces #app with the party shell, wires
// DOM events, and stores render closures on room.view so the background mesh
// callbacks can drive the UI when this room is active.
function bindPartyView(room) {
  const { roomHandle, me, amHost } = room

  app.innerHTML = partyShell(roomHandle, amHost)

  const el = {
    roomAvatar: document.getElementById('room-avatar'),
    statusText: document.getElementById('status-text'),
    statusDot: document.querySelector('.status-dot'),
    peers: document.getElementById('peers'),
    messages: document.getElementById('messages'),
    input: document.getElementById('compose-input'),
    send: document.getElementById('compose-send'),
  }

  const renderRoomAvatar = (seed) => {
    el.roomAvatar.innerHTML = avatarSvg(seed || AVATAR_PAD, roomHandle)
  }

  const updateStatus = () => {
    el.statusDot.classList.remove('offline')
    const count = room.peers.length
    if (amHost) {
      el.statusText.textContent = `Hosting · ${count} ${count === 1 ? 'person' : 'people'}`
    } else if (count <= 1) {
      el.statusText.textContent = 'Just you here · share the link'
    } else {
      el.statusText.textContent = `Live · ${count} people`
    }
  }

  const renderPeers = () => {
    el.peers.innerHTML = room.peers.map(p => renderPeerChip(p, roomHandle)).join('')
    wireHandleClicks(el.peers, me.handle)
  }

  // Smart scroll-to-bottom behavior:
  //   - If the user was at (or near) the bottom when a new message lands, we
  //     stick to the bottom and keep them following the conversation.
  //   - If they've scrolled up to read older messages, we DON'T jerk them
  //     back to the bottom. Instead we show a "↓ new messages" badge that
  //     they can tap to jump back down.
  // Threshold of 80px is generous — it accommodates inertial scroll on iOS
  // and tiny offsets from sub-pixel layout, while still detecting genuine
  // upward intent.
  const STICK_THRESHOLD = 80
  let unreadCount = 0

  const isNearBottom = () => {
    const el2 = el.messages
    return (el2.scrollHeight - el2.scrollTop - el2.clientHeight) <= STICK_THRESHOLD
  }

  const scrollToBottom = (smooth = false) => {
    // Defer past layout so scrollHeight reflects the just-rendered content —
    // doing the write synchronously can race iOS Safari's layout pass and the
    // scroll silently no-ops.
    requestAnimationFrame(() => {
      try {
        el.messages.scrollTo({ top: el.messages.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
      } catch {
        el.messages.scrollTop = el.messages.scrollHeight
      }
    })
    unreadCount = 0
    updateUnreadBadge()
  }

  const updateUnreadBadge = () => {
    const badge = document.getElementById('unread-badge')
    if (!badge) return
    if (unreadCount > 0) {
      badge.textContent = `↓ ${unreadCount} new`
      badge.classList.add('is-visible')
    } else {
      badge.classList.remove('is-visible')
    }
  }

  // Called whenever the user manually scrolls. If they reach the bottom, the
  // unread counter resets and the badge hides. If they scroll back up, the
  // counter keeps accumulating from any new messages that land.
  el.messages.onscroll = () => {
    if (isNearBottom()) {
      unreadCount = 0
      updateUnreadBadge()
    }
  }

  const renderMessages = (opts = {}) => {
    const stickToBottom = opts.stickToBottom != null ? opts.stickToBottom : isNearBottom()
    const isNewArrival = !!opts.newArrival

    const seen = new Set()
    const list = room.messages
      .filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true })
      .sort((a, b) => a.ts - b.ts)
    el.messages.innerHTML = list.map(renderMessage).join('')
    wireHandleClicks(el.messages, me.handle)

    if (stickToBottom) {
      scrollToBottom(false)
    } else if (isNewArrival) {
      unreadCount += 1
      updateUnreadBadge()
    }
  }

  el.input.oninput = () => {
    el.send.disabled = el.input.value.trim().length === 0
  }
  const doSend = () => {
    const text = el.input.value.trim()
    if (!text) return
    const local = room.mesh.send(text)
    playSend()
    if (!room.seenMsgIds.has(local.id)) {
      room.seenMsgIds.add(local.id)
      room.messages.push(local)
      Store.addMessage(local).catch(console.error)
      renderMessages({ stickToBottom: true })
    }
    el.input.value = ''
    el.send.disabled = true
  }
  el.send.onclick = doSend
  el.input.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doSend() }
  }

  document.getElementById('share-btn').onclick = () => handleShare(roomHandle, me, room.sessionId, amHost)
  document.getElementById('rooms-btn').onclick = navigateToRooms
  document.getElementById('home-btn').onclick = navigateHome
  document.getElementById('unread-badge').onclick = () => scrollToBottom(true)

  // Initial render based on whatever state the background mesh has accumulated.
  // Always start at the bottom — entering a room means seeing the latest.
  renderRoomAvatar(room.hostAvatarSeed)
  renderMessages({ stickToBottom: true })
  renderPeers()
  updateStatus()

  // Save closures so the background mesh's callbacks can drive the UI
  room.view = { renderRoomAvatar, renderMessages, renderPeers, updateStatus }
}

// Find every [data-handle] inside `container` whose handle isn't your own,
// and wire a click that navigates to that handle's room. Centralized so peer
// chips and message authors share the same behavior.
function wireHandleClicks(container, myHandle) {
  container.querySelectorAll('[data-handle]').forEach(node => {
    const handle = node.getAttribute('data-handle')
    if (!handle || handle === myHandle) return
    node.addEventListener('click', (e) => {
      e.preventDefault()
      navigateToParty(handle)
    })
  })
}

function unbindPartyView(roomHandle) {
  const room = liveRooms.get(roomHandle)
  if (room) room.view = null
}

function renderParty(roomHandle, me, fragData) {
  // Unbind whatever room the UI was previously showing — its mesh keeps running
  // in the background.
  if (activeRoomHandle && activeRoomHandle !== roomHandle) {
    unbindPartyView(activeRoomHandle)
  }
  activeRoomHandle = roomHandle
  const room = ensureRoomAlive(roomHandle, me, fragData)
  bindPartyView(room)
}

function partyShell(roomHandle, amHost) {
  const placeholder = amHost ? 'Say something to your party…' : 'Say hi…'
  return `
    <div class="party">
      <div class="party-header">
        <div class="party-avatar" id="room-avatar"></div>
        <div class="party-title">
          <h2 class="party-handle">${esc(displayHandle(roomHandle))}</h2>
          <p class="party-status" id="room-status">
            <span class="status-dot"></span>
            <span id="status-text">Connecting…</span>
          </p>
        </div>
        <div class="party-header-actions">
          <button class="icon-btn" id="rooms-btn" title="Rooms" aria-label="Rooms">≡</button>
          <button class="icon-btn" id="share-btn" title="Share" aria-label="Share">↗</button>
          <button class="icon-btn" id="home-btn" title="Home" aria-label="Home">×</button>
        </div>
      </div>
      <div class="party-peers" id="peers"></div>
      <div class="messages-wrap">
        <div class="messages" id="messages"></div>
        <button class="unread-badge" id="unread-badge" type="button" aria-live="polite"></button>
      </div>
      <div class="compose">
        <input class="compose-input" id="compose-input" placeholder="${placeholder}" maxlength="2000" autocomplete="off" />
        <button class="compose-send" id="compose-send" disabled>→</button>
      </div>
    </div>
  `
}

function renderPeerChip(p, roomHandle) {
  const isHost = p.handle === roomHandle
  const clickable = !p.self
  const handleAttr = clickable ? `data-handle="${esc(p.handle)}"` : ''
  const chipClass = `peer-chip ${isHost ? 'is-host' : ''} ${clickable ? 'is-clickable' : ''}`.trim()
  const labelTitle = clickable ? ` title="Open ${esc(displayHandle(p.handle))}'s room"` : ''
  return `
    <div class="${chipClass}" ${handleAttr}${labelTitle}>
      <div class="peer-avatar">${avatarSvg(p.avatarSeed, p.handle)}</div>
      <span>${esc(displayHandle(p.handle))}${p.self ? ' (you)' : ''}</span>
      ${isHost ? '<span class="host-tag">host</span>' : ''}
    </div>
  `
}

function renderMessage(m) {
  if (m.system) {
    if (m.kind === 'join') {
      return `
        <div class="message-join">
          <div class="message-join-avatar" data-handle="${esc(m.joinHandle)}">${avatarSvg(m.joinAvatarSeed, m.joinHandle)}</div>
          <div class="message-join-label"><strong data-handle="${esc(m.joinHandle)}" class="is-clickable">${esc(displayHandle(m.joinHandle))}</strong> joined the party</div>
        </div>
      `
    }
    return `<div class="message-alert"><div class="message-alert-text">${esc(m.text)}</div></div>`
  }
  return `
    <div class="message">
      <div class="message-avatar is-clickable" data-handle="${esc(m.from)}" title="Open ${esc(displayHandle(m.from))}'s room">${avatarSvg(m.fromAvatar, m.from)}</div>
      <div class="message-body">
        <div class="message-meta">
          <span class="message-handle is-clickable" data-handle="${esc(m.from)}" title="Open ${esc(displayHandle(m.from))}'s room">${esc(displayHandle(m.from))}</span>
          <span class="message-time">${formatTime(m.ts)}</span>
        </div>
        <div class="message-text">${esc(m.text)}</div>
      </div>
    </div>
  `
}

async function handleShare(roomHandle, me, sessionId, amHost) {
  const url = amHost
    ? buildPartyUrl(roomHandle, {
        sessionId,
        avatarSeed: me.avatarSeed.slice(0, 16),
        timestamp: Date.now(),
      })
    : `${location.origin}${location.pathname}${location.hash}`

  const shareData = {
    title: 'Party',
    text: `Join ${displayHandle(roomHandle)} on Party`,
    url,
  }
  if (navigator.share) {
    try { await navigator.share(shareData) } catch {}
  } else {
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied')
    } catch {
      toast(url)
    }
  }
}

// ==================== ROUTER ====================

// Just unbind the visible UI — meshes for whichever rooms the user has open
// keep running in the background. They become "true background presence",
// announcing the user to peers and holding history for joiners. Switching to
// landing or rooms view should not kick the user out of the rooms they're in.
function unbindCurrentView() {
  if (activeRoomHandle) {
    unbindPartyView(activeRoomHandle)
    activeRoomHandle = null
  }
}

// Full shutdown of every live mesh + fragment maintainer. Called on tab close
// / pagehide — at that point we really do want to leave everything cleanly so
// other peers see us drop.
function tearDownAllRooms() {
  for (const room of liveRooms.values()) {
    try { room.mesh && room.mesh.leave() } catch {}
  }
  liveRooms.clear()
  for (const stop of ACTIVE_FRAGMENT_MAINTAINER.values()) {
    try { stop() } catch {}
  }
  ACTIVE_FRAGMENT_MAINTAINER.clear()
  activeRoomHandle = null
}

function render() {
  const { handle: roomHandle, view } = parseRoute()
  const fragData = parseFragment()
  const identity = Identity.load()

  if (view === 'rooms') {
    unbindCurrentView()
    renderRooms(identity)
    return
  }

  if (!roomHandle) {
    unbindCurrentView()
    renderLanding(identity)
    return
  }

  if (!identity) {
    unbindCurrentView()
    renderNeedsIdentity(roomHandle, fragData)
    return
  }

  renderParty(roomHandle, identity, fragData)
}

window.addEventListener('popstate', render)
window.addEventListener('pagehide', tearDownAllRooms)

// ==================== BOOT ====================

async function boot() {
  Theme.apply()
  Store.open().catch(console.error)
  await Identity.migrate()
  render()
}
boot()
