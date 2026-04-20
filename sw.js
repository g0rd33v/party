// Party — service worker.
//
// Purpose: make reload-means-reload. Without this, GitHub Pages serves every
// static asset with Cache-Control: max-age=600, so Safari (and every other
// browser) will happily serve 10-minute-stale JS/CSS when a user reloads —
// which means code changes don't take effect for up to 10 minutes and users
// have to manually purge their cache. That's the opposite of what we want for
// a live-updating party app.
//
// Strategy: network-first for every same-origin GET. The cache is consulted
// only as a fallback when the network fails (offline, broker hiccup, etc.).
// skipWaiting + clients.claim make this SW take over immediately on install,
// so the first reload after deploy already sees fresh code.
//
// There's a one-reload transition for users who already had Party open with
// no SW (or an older build). Their current page is still cached by the browser
// HTTP cache, so the first refresh may still show stale HTML. Once that first
// refresh completes, the new HTML runs, registers this SW, and every
// subsequent reload is fresh.

const CACHE_NAME = 'party-fallback-v1'

self.addEventListener('install', () => {
  // Take over right away on first install — don't wait for old tabs to close.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Control pages loaded before activation as well.
  event.waitUntil((async () => {
    // Drop any stale entries from prior cache versions so cache-fallback can't
    // serve ancient assets.
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request

  // Only handle GETs — POSTs etc. go straight to the network.
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Only same-origin requests. Cross-origin (fonts, MQTT WS, Gravatar) bypass
  // the worker entirely and use the browser's normal cache behavior, which is
  // what we want — those CDNs know how to cache themselves.
  if (url.origin !== self.location.origin) return

  event.respondWith((async () => {
    try {
      // Network first, with cache: 'no-store' to force browser HTTP cache bypass.
      // If the network returns anything (even a 404), use it and update the cache.
      const res = await fetch(req, { cache: 'no-store' })
      if (res && res.ok && res.type === 'basic') {
        const cache = await caches.open(CACHE_NAME)
        cache.put(req, res.clone()).catch(() => {})
      }
      return res
    } catch (err) {
      // Network failed (offline) — fall back to whatever the cache has.
      const cached = await caches.match(req)
      if (cached) return cached
      throw err
    }
  })())
})
