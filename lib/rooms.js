// Party — local room history.
// Tracks parties you've visited so the Rooms panel can list them.
// Purely local (localStorage); nothing sent anywhere.

const KEY = 'party.rooms'
const MAX = 30

function safeParse(raw) {
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

export const RoomHistory = {
  list() {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    return safeParse(raw)
      .filter(r => r && typeof r.handle === 'string')
      .sort((a, b) => (b.lastVisit || 0) - (a.lastVisit || 0))
  },

  // Upsert a visit. `meta.avatarSeed` optional (helps render the row even
  // before you've actually connected to the party).
  record(handle, meta = {}) {
    if (!handle) return
    const list = this.list()
    const existing = list.find(r => r.handle === handle)
    const entry = {
      handle,
      avatarSeed: meta.avatarSeed || (existing && existing.avatarSeed) || null,
      sessionId: meta.sessionId || null,
      lastVisit: Date.now(),
      lastSeenLive: meta.lastSeenLive || (existing && existing.lastSeenLive) || null,
    }
    const without = list.filter(r => r.handle !== handle)
    without.unshift(entry)
    const trimmed = without.slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(trimmed))
  },

  // Mark that we successfully observed the host of this room being online
  markLive(handle) {
    if (!handle) return
    const list = this.list()
    const existing = list.find(r => r.handle === handle)
    if (!existing) return
    existing.lastSeenLive = Date.now()
    localStorage.setItem(KEY, JSON.stringify(list))
  },

  remove(handle) {
    const list = this.list().filter(r => r.handle !== handle)
    localStorage.setItem(KEY, JSON.stringify(list))
  },

  clear() {
    localStorage.removeItem(KEY)
  },
}

// "2 minutes ago", "Yesterday", "3 days ago"
export function relativeTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60 * 1000) return 'just now'
  if (diff < 60 * 60 * 1000) {
    const m = Math.floor(diff / 60000)
    return `${m}m ago`
  }
  if (diff < 24 * 60 * 60 * 1000) {
    const h = Math.floor(diff / 3600000)
    return `${h}h ago`
  }
  const days = Math.floor(diff / 86400000)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) {
    const w = Math.floor(days / 7)
    return `${w}w ago`
  }
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}
