// Kill-switch service worker. Earlier versions cached scripts cache-first, which could serve
// stale or mismatched assets after a deploy. This worker has no fetch handler: it removes every
// cache, unregisters itself and leaves the network to handle all requests.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch (error) {
        // nothing to clean up
      }
      try {
        await self.clients.claim();
      } catch (error) {
        // not fatal
      }
      try {
        await self.registration.unregister();
      } catch (error) {
        // not fatal
      }
    })()
  );
});
