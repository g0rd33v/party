// Party — shared utility helpers

export function esc(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c])
}

// "big-red-apple" → "Big Red Apple"
export function displayHandle(handle) {
  if (!handle) return ''
  return handle
    .split('-')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ')
}

export function formatTime(ts) {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

export const b64url = {
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

export async function sha256(buf) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf))
}

// Compact base36 random id, e.g. for session accelerator room ids
export function randomId(length = 12) {
  const raw = crypto.getRandomValues(new Uint8Array(Math.ceil(length * 0.7)))
  return Array.from(raw).map(b => b.toString(36).padStart(2, '0')).join('').slice(0, length)
}

// Singleton toast notification
let toastEl = null
let toastTimer = null
export function toast(msg, ms = 2200) {
  if (!toastEl) {
    toastEl = document.createElement('div')
    toastEl.className = 'toast'
    document.body.appendChild(toastEl)
  }
  toastEl.textContent = msg
  toastEl.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms)
}
