const CACHE_NAME = 'hoteleria-hnpm-v5';
const urlsToCache = [
  // Manifests excluidos intencionalmente para que Chrome siempre los busque frescos al instalar PWA
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  // Tomar control inmediatamente sin esperar
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Eliminar caches viejos
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Siempre ir a red para HTML (navegacion) para evitar servir index.html viejo
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first para assets estaticos (js, css, imagenes)
  event.respondWith(
    caches.match(request).then((response) => response || fetch(request))
  );
});