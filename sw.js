const CACHE_NAME = 'recept-v4';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/marked.min.js',
  'manifest.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'recept/basic-pizzadeg.md',
  'recept/belugalasagne.md',
  'recept/kottfarspaj-picknick.md',
  'recept/snabbaste-biffen.md',
  'recept/salsicciafars-spaghetti.md',
  'recept/goda-soppan-elsass.md',
  'recept/banankaka.md',
  'recept/glasstarta.md',
  'recept/potatis-purjoloekssoppa.md',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return res;
    }).catch(() => cached)),
  );
});
