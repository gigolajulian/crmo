/* ============================================================================
   SERVICE WORKER

   Exists so Chrome can install CRMO as an app and so it opens without a
   connection. Network first, always: the app already has its own update check
   (version.json and the update banner), and a cache-first worker would keep
   serving the old build behind its back. The cache is only the offline copy.
   ========================================================================== */

const CACHE = 'crmo-offline-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  // Supabase and fonts live on other origins; leave them to the browser. The
  // version check must always reach the network.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.endsWith('/version.json')) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        // Any route of the single-page app is served by the same index.html.
        if (request.mode === 'navigate') {
          const shell = await caches.match(new URL('./', self.registration.scope).href)
          if (shell) return shell
        }
        return Response.error()
      }),
  )
})
