/* Network first, so an update is picked up at once and old and new files never mix.
   The cache is only the offline fallback. Raise VERSION together with the ?v= numbers in index.html. */
const VERSION = 'gaming-hub-v6';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/main.css?v=6',
  'css/home.css?v=6',
  'css/games.css?v=6',
  'js/storage.js?v=6',
  'js/audio.js?v=6',
  'js/engine.js?v=6',
  'js/games/space-invaders.js?v=6',
  'js/games/pong.js?v=6',
  'js/games/tic-tac-toe.js?v=6',
  'js/games/simon-says.js?v=6',
  'js/games/fruit-ninja.js?v=6',
  'js/navigation.js?v=6',
  'js/app.js?v=6',
  'js/install.js?v=6',
  'assets/icons/logo-icon-180.png',
  'assets/icons/logo-icon-192.png',
  'assets/icons/logo-icon-32.png',
  'assets/icons/logo-icon-512.png',
  'assets/icons/logo-icon-64.png',
  'assets/icons/logo-maskable-512.png',
  'assets/icons/share-2.jpg',
  'assets/images/fruit-ninja.svg',
  'assets/images/pong.svg',
  'assets/images/simon-says.svg',
  'assets/images/space-invaders.svg',
  'assets/images/tic-tac-toe.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION)
    .then(cache => cache.addAll(FILES.map(url => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  /* Other projects share this origin, so only this app's old caches are removed. */
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('gaming-hub-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      /* no-cache: always ask the server whether the file changed. */
      const response = await fetch(request.url, { cache: 'no-cache' });
      if (response.ok) event.waitUntil(cache.put(request, response.clone()));
      return response;
    } catch (error) {
      const saved = await cache.match(request) || (request.mode === 'navigate' ? await cache.match('index.html') : null);
      if (saved) return saved;
      throw error;
    }
  })());
});
