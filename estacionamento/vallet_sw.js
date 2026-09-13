// ===== O QUE SEGURA O VALLET SEM INTERNET =====
// Mora na mesma pasta da tela de proposito: este tipo de arquivo so consegue
// cuidar da pasta em que ele esta. Na raiz, ele cuidaria do site inteiro e
// acabaria guardando a portaria e as listas dentro da memoria do vallet.
const CACHE_NAME = 'eclub-vallet-v53';

// A tela e guardada pelo endereco da pasta ('./'), nao pelo nome do arquivo:
// assim /estacionamento e /estacionamento/index.html apontam para a mesma copia.
const APP_SHELL = [
  './',
  './vallet_manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
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

  const isHtml = req.mode === 'navigate' || req.destination === 'document';

  if (isHtml) {
    // Primeiro a internet, e so depois a copia guardada: assim uma versao nova
    // da tela chega no mesmo instante em que e publicada.
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./', copy));
          return response;
        })
        .catch(() => caches.match('./'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      return fetch(req)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            if (req.url.startsWith(self.location.origin)) cache.put(req, copy);
          });
          return response;
        })
        .catch(() => cached);
    })
  );
});
