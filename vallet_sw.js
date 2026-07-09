const CACHE_NAME = 'eclub-vallet-v26';
const APP_SHELL = [
  './vallet_eclub.html',
  './vallet_eclub.html?v=26',
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
      .then((keys) => Promise.all(
        keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : Promise.resolve())
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // Para navegação, busca primeiro a versão atual na rede.
  // Sem internet, usa a versão v26 salva no aparelho.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put('./vallet_eclub.html', copy.clone());
            cache.put(request, copy);
          });
          return response;
        })
        .catch(async () => {
          return (await caches.match(request))
            || (await caches.match('./vallet_eclub.html?v=26'))
            || (await caches.match('./vallet_eclub.html'));
        })
    );
    return;
  }

  // Para os demais arquivos locais, usa cache com atualização em segundo plano.
  if (new URL(request.url).origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
});
