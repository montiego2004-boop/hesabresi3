/* CACHE and RESOURCES are supplied by scripts/build-sw.mjs. This worker never opens IndexedDB. */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const result = await Promise.allSettled(
        Object.entries(RESOURCES).map(async ([url, expected]) => {
          const response = await fetch(
            new Request(url, { cache: 'reload', credentials: 'same-origin' }),
          );
          if (!response.ok) throw new Error('Incomplete application shell');
          const bytes = await response.clone().arrayBuffer();
          const hash = Array.from(
            new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
            (n) => n.toString(16).padStart(2, '0'),
          ).join('');
          if (hash !== expected) throw new Error('Asset mismatch: ' + url);
          await cache.put(url, response);
        }),
      );
      if (result.some((r) => r.status === 'rejected')) {
        await caches.delete(CACHE);
        throw new Error('Update was not installed');
      }
      // Do not skipWaiting here: other tabs can have unfinished business forms.
    })(),
  );
});
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      const old = (await caches.keys()).filter((k) => k.startsWith('daneh-shell-') && k !== CACHE);
      // Keep the immediately previous shell so an older open tab can still load a lazy chunk.
      await Promise.all(old.slice(0, -1).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener('message', (e) => {
  if (e.data === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      caches
        .open(CACHE)
        .then((c) => c.match('/index.html'))
        .then((hit) => hit || fetch(request)),
    );
  } else if (Object.hasOwn(RESOURCES, url.pathname) || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches
        .open(CACHE)
        .then((c) => c.match(url.pathname))
        .then(async (hit) => hit || (await caches.match(url.pathname)) || fetch(request)),
    );
  }
});
