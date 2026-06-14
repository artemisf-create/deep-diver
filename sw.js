const CACHE = 'deepdiver-v1';
const ASSETS = [
  '/deep-diver/',
  '/deep-diver/index.html',
  '/deep-diver/src/state.js',
  '/deep-diver/src/db.js',
  '/deep-diver/src/network.js',
  '/deep-diver/src/physics.js',
  '/deep-diver/src/render.js',
  '/deep-diver/src/input.js',
  '/deep-diver/src/main.js',
  '/deep-diver/icons/icon-192.png',
  '/deep-diver/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Сеть приоритет для Firebase/Ably, кэш для остального
  if (e.request.url.includes('firebase') || e.request.url.includes('ably')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }))
  );
});
