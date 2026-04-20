// Party — theme manager.
// Three modes: auto (follows device), dark, light.
// Applied via `data-theme="..."` attribute on <html>; default (auto) has no attribute.

const KEY = 'party.theme'
const MODES = ['auto', 'dark', 'light']
const HTML = document.documentElement

export const Theme = {
  get() {
    const v = localStorage.getItem(KEY)
    return MODES.includes(v) ? v : 'auto'
  },

  set(mode) {
    if (!MODES.includes(mode)) mode = 'auto'
    if (mode === 'auto') {
      localStorage.removeItem(KEY)
      HTML.removeAttribute('data-theme')
    } else {
      localStorage.setItem(KEY, mode)
      HTML.setAttribute('data-theme', mode)
    }
    return mode
  },

  cycle() {
    const cur = this.get()
    const next = cur === 'auto' ? 'dark' : cur === 'dark' ? 'light' : 'auto'
    return this.set(next)
  },

  // Apply on boot
  apply() {
    const cur = this.get()
    if (cur === 'auto') HTML.removeAttribute('data-theme')
    else HTML.setAttribute('data-theme', cur)
  },

  // Resolve the effective theme right now (takes OS into account for auto)
  effective() {
    const cur = this.get()
    if (cur !== 'auto') return cur
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  },

  label(mode = this.get()) {
    return mode.charAt(0).toUpperCase() + mode.slice(1)
  },
}
