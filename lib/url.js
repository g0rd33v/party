// Party — URL router and fragment-based connection string.
//
// URL shape:
//   /party/<handle>                           — pure identity, always works
//   /party/<handle>#s=SID&a=AVATAR&t=TS       — live connection string
//
// Fragment fields (all optional):
//   s = session accelerator room id (fast WebRTC pairing)
//   a = host avatar seed (first 16 hex chars) — guests render face instantly
//   t = timestamp (ms) when fragment was written — freshness signal
//
// Hosts write the fragment continuously; anyone who copies the URL at any
// moment gets everything a fresh invitee needs, no "Share" click required.

import { HANDLE_RE } from './identity.js'
import { randomId } from './util.js'

const PATH_PREFIX = '/party/'
const FRAGMENT_REFRESH_MS = 20000  // how often host rewrites timestamp

// --- Route parsing ----------

export function parseRoute() {
  const path = location.pathname
  let handle = ''
  let view = null
  if (path.startsWith(PATH_PREFIX)) {
    const rest = path.slice(PATH_PREFIX.length).replace(/\/$/, '')
    if (rest === 'rooms') {
      view = 'rooms'
    } else if (HANDLE_RE.test(rest)) {
      handle = rest
    }
  }
  return { handle, view }
}

// --- Fragment parsing & writing ----------

export function parseFragment() {
  const frag = location.hash.slice(1)
  if (!frag) return { sessionId: null, avatarSeed: null, timestamp: null }
  const params = new URLSearchParams(frag)
  const s = params.get('s')
  const a = params.get('a')
  const t = params.get('t')
  return {
    sessionId: s && /^[a-z0-9]+$/i.test(s) && s.length <= 32 ? s : null,
    avatarSeed: a && /^[0-9a-f]{12,64}$/i.test(a) ? a.toLowerCase() : null,
    timestamp: t && /^\d+$/.test(t) ? parseInt(t, 10) : null,
  }
}

// Build a fragment string from a connection-info object (any subset of fields)
function buildFragment({ sessionId, avatarSeed, timestamp }) {
  const parts = []
  if (sessionId) parts.push(`s=${sessionId}`)
  if (avatarSeed) parts.push(`a=${avatarSeed}`)
  if (timestamp) parts.push(`t=${timestamp}`)
  return parts.length ? `#${parts.join('&')}` : ''
}

// Replace current URL fragment. Merges with existing unless a field is set to null.
export function updateFragment(updates) {
  const current = parseFragment()
  const merged = {
    sessionId: 's' in updates ? updates.s : ('sessionId' in updates ? updates.sessionId : current.sessionId),
    avatarSeed: 'a' in updates ? updates.a : ('avatarSeed' in updates ? updates.avatarSeed : current.avatarSeed),
    timestamp: 't' in updates ? updates.t : ('timestamp' in updates ? updates.timestamp : current.timestamp),
  }
  const newUrl = `${location.pathname}${location.search}${buildFragment(merged)}`
  try {
    history.replaceState(history.state, '', newUrl)
  } catch {}
}

// Compute a fully-qualified party URL for sharing
export function buildPartyUrl(handle, connData = {}) {
  return `${location.origin}${PATH_PREFIX}${handle}${buildFragment(connData)}`
}

// --- Navigation ----------

export function navigateToParty(handle) {
  history.pushState({}, '', PATH_PREFIX + handle)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function navigateHome() {
  history.pushState({}, '', PATH_PREFIX)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function navigateToRooms() {
  history.pushState({}, '', PATH_PREFIX + 'rooms')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

// --- Session IDs ----------

export function generateSessionId() {
  return randomId(12)
}

// --- Host fragment maintenance ----------
//
// Call this once when a host mounts a party view. Returns a function to stop
// maintaining the fragment (call on view unmount).
//
// Behavior: writes the full connection string immediately, then refreshes the
// timestamp every FRAGMENT_REFRESH_MS so a URL copied at any moment is "fresh".
export function maintainHostFragment(sessionId, avatarSeed) {
  const writeNow = () => updateFragment({
    sessionId,
    avatarSeed: avatarSeed ? avatarSeed.slice(0, 16) : null,
    timestamp: Date.now(),
  })
  writeNow()
  const timer = setInterval(writeNow, FRAGMENT_REFRESH_MS)
  return () => clearInterval(timer)
}
