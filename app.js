// Party — SPA entry, router, views.
// All business logic lives in ./lib/*. This file only wires DOM → modules.

import { esc, displayHandle, formatTime, toast } from './lib/util.js'
import { avatarSvg } from './lib/avatar.js'
import { Identity } from './lib/identity.js'
import { Store } from './lib/storage.js'
import { Mesh } from './lib/mesh.js'
import {
  parseRoute,
  parseFragment,
  navigateToParty,
  navigateHome,
  navigateToRooms,
  generateSessionId,
  buildPartyUrl,
  maintainHostFragment,
} from './lib/url.js'
import { RoomHistory, relativeTime } from './lib/rooms.js'
import { Theme } from './lib/theme.js'

const HOST_SEARCH_TIMEOUT_MS = 60000
const AVATAR_PAD = '0'.repeat(32)

const app = document.getElementById('app')
let activeMesh = null
let stopFragmentMaintenance = null

// Pad a short (16-char) fragment seed out to a full avatar seed for rendering
function padSeed(seed) {
  if (!seed) return null
  return seed + AVATAR_PAD.slice(0, Math.max(0, 32 - seed.length))
}

// ==================== LANDING ====================

function renderLanding(identity) {
  app.innerHTML = `
    <div class="landing">
      <div class="landing-hero">
        <h1 class="wordmark">Party.</h1>
        <p class="tagline">A party is a link.<br/>Open Safari.<br/>Invite the world.</p>
        <p class="lede">Face ID gets you a unique name. Your name is your party. Post the link anywhere. Your fans come over. When you close Safari, the party's over.</p>
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
    wireClearData()
  } else {
    document.getElementById('create').onclick = handleCreate
  }
}

function identityCard(identity) {
  return `
    <div class="identity-card">
      <div class="identity-avatar">${avatarSvg(identity.avatarSeed)}</div>
      <h2 class="identity-handle">${displayHandle(identity.handle)}</h2>
      <p class="identity-note">Your name. Your party.</p>
      <div class="landing-actions">
        <button class="btn btn-primary" id="open-party">Open my party</button>
        <button class="btn btn-secondary" id="rooms-btn">Rooms</button>
        <button class="btn btn-secondary" id="copy-link">Copy my link</button>
        <button class="btn btn-ghost" id="clear-data">Clear my data</button>
      </div>
    </div>
  `
}

function createCta() {
  return `
    <div class="landing-actions">
      <button class="btn btn-primary" id="create">Create my party</button>
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
    btn.textContent = 'Create my party'
    toast(err.message || 'Face ID failed')
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
          <div class="room-avatar">${avatarSvg(identity.avatarSeed)}</div>
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
  const avatar = avatarSvg(padSeed(r.avatarSeed))
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
          ${avatarSvg(hostAvatarSeed)}
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

function renderParty(roomHandle, me, fragData) {
  cleanupActiveSession()

  const amHost = roomHandle === me.handle

  const sessionId = fragData.sessionId || (amHost ? generateSessionId() : null)

  // Record visit to rooms history (with any avatar/session info we already know)
  RoomHistory.record(roomHandle, {
    avatarSeed: amHost ? me.avatarSeed.slice(0, 16) : fragData.avatarSeed,
    sessionId,
  })

  const initialHostAvatar = amHost ? me.avatarSeed : padSeed(fragData.avatarSeed)

  if (amHost) {
    stopFragmentMaintenance = maintainHostFragment(sessionId, me.avatarSeed)
  }

  const state = {
    roomHandle, me, amHost, sessionId,
    messages: [],
    peers: [{ ...me, self: true }],
    hostPresent: amHost,
    partyOver: false,
  }

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
    el.roomAvatar.innerHTML = avatarSvg(seed || AVATAR_PAD)
  }
  renderRoomAvatar(initialHostAvatar)

  document.getElementById('share-btn').onclick = () => handleShare(roomHandle, me, sessionId, amHost)
  document.getElementById('rooms-btn').onclick = navigateToRooms
  document.getElementById('home-btn').onclick = navigateHome

  el.messages.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-retry]')
    if (!btn) return
    e.preventDefault()
    console.log('[party] retry tapped — re-entering flow')
    render()
  })

  const updateStatus = () => {
    if (state.partyOver) {
      el.statusDot.classList.add('offline')
      el.statusText.textContent = "Party's over"
      el.input.disabled = true
      el.send.disabled = true
      return
    }
    el.statusDot.classList.remove('offline')
    const count = state.peers.length
    if (amHost) {
      el.statusText.textContent = `Hosting · ${count} ${count === 1 ? 'person' : 'people'}`
    } else if (state.hostPresent) {
      el.statusText.textContent = `Live · ${count} ${count === 1 ? 'person' : 'people'}`
    } else {
      el.statusText.textContent = 'Looking for host…'
    }
  }

  const renderPeers = () => {
    el.peers.innerHTML = state.peers.map(p => renderPeerChip(p, roomHandle)).join('')
  }

  const renderMessages = () => {
    const seen = new Set()
    const list = state.messages
      .filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true })
      .sort((a, b) => a.ts - b.ts)
    el.messages.innerHTML = list.map(renderMessage).join('')
    el.messages.scrollTop = el.messages.scrollHeight
  }

  // Retry: tapping "Try again" on a party-over alert reloads the page, which
  // re-establishes identity and re-joins the mesh with a fresh signaling attempt.
  el.messages.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-retry]')
    if (btn) window.location.reload()
  })

  const addMessage = (m, persist = true) => {
    state.messages.push(m)
    renderMessages()
    if (persist && !m.system) Store.addMessage(m).catch(console.error)
  }

  el.input.oninput = () => {
    el.send.disabled = el.input.value.trim().length === 0 || state.partyOver
  }
  const doSend = () => {
    const text = el.input.value.trim()
    if (!text || state.partyOver) return
    const msg = activeMesh.send(text)
    addMessage(msg)
    el.input.value = ''
    el.send.disabled = true
  }
  el.send.onclick = doSend
  el.input.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doSend() }
  }

  Store.prune().catch(() => {})
  Store.getMessages(roomHandle).then(history => {
    for (const m of history) state.messages.push(m)
    renderMessages()
  }).catch(console.error)

  const mesh = new Mesh(roomHandle, me, sessionId)
  activeMesh = mesh

  mesh.onMessage = (m) => addMessage(m, true)
  mesh.onPeersChange = (peers) => {
    state.peers = peers
    const host = peers.find(p => p.handle === roomHandle)
    if (host) {
      state.hostPresent = true
      renderRoomAvatar(host.avatarSeed)
      // Update history with freshly-seen host avatar & live timestamp
      RoomHistory.record(roomHandle, {
        avatarSeed: host.avatarSeed ? host.avatarSeed.slice(0, 16) : null,
        sessionId,
      })
      RoomHistory.markLive(roomHandle)
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
        kind: 'retry-alert',
      }, false)
    }
    updateStatus()
  }
  mesh.onPeerJoined = (handle, avatarSeed) => {
    addMessage({
      id: `sys-join-${handle}-${Date.now()}`,
      room: roomHandle,
      ts: Date.now(),
      system: true,
      kind: 'join',
      joinHandle: handle,
      joinAvatarSeed: avatarSeed,
    }, false)
  }

  mesh.start()
  renderPeers()
  updateStatus()

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
      <div class="messages" id="messages"></div>
      <div class="compose">
        <input class="compose-input" id="compose-input" placeholder="${placeholder}" maxlength="2000" autocomplete="off" />
        <button class="compose-send" id="compose-send" disabled>→</button>
      </div>
    </div>
  `
}

function renderPeerChip(p, roomHandle) {
  const isHost = p.handle === roomHandle
  return `
    <div class="peer-chip ${isHost ? 'is-host' : ''}">
      <div class="peer-avatar">${avatarSvg(p.avatarSeed)}</div>
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
          <div class="message-join-avatar">${avatarSvg(m.joinAvatarSeed)}</div>
          <div class="message-join-label"><strong>${esc(displayHandle(m.joinHandle))}</strong> joined the party</div>
        </div>
      `
    }
    if (m.kind === 'retry-alert') {
      return `
        <div class="message-alert">
          <div class="message-alert-text">${esc(m.text)}</div>
          <button class="retry-btn" data-retry="1">Try again</button>
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

function cleanupActiveSession() {
  if (activeMesh) {
    activeMesh.leave()
    activeMesh = null
  }
  if (stopFragmentMaintenance) {
    stopFragmentMaintenance()
    stopFragmentMaintenance = null
  }
}

function render() {
  const { handle: roomHandle, view } = parseRoute()
  const fragData = parseFragment()
  const identity = Identity.load()

  if (view === 'rooms') {
    cleanupActiveSession()
    renderRooms(identity)
    return
  }

  if (!roomHandle) {
    cleanupActiveSession()
    renderLanding(identity)
    return
  }

  if (!identity) {
    cleanupActiveSession()
    renderNeedsIdentity(roomHandle, fragData)
    return
  }

  renderParty(roomHandle, identity, fragData)
}

window.addEventListener('popstate', render)
window.addEventListener('pagehide', cleanupActiveSession)

// ==================== BOOT ====================

async function boot() {
  Theme.apply()
  Store.open().catch(console.error)
  await Identity.migrate()
  render()
}
boot()
