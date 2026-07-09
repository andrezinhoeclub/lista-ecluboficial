const CACHE_NAME = 'eclub-vallet-v6';
const APP_SHELL = [
  './vallet_eclub.html',
  './vallet_manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : null)))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isNavigation = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./vallet_eclub.html', copy));
          return response;
        })
        .catch(() => caches.match('./vallet_eclub.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          if (req.url.startsWith(self.location.origin)) cache.put(req, copy);
        });
        return response;
      });
    })
  );
});
