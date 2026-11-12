// Service worker: precaches the app shell and caches the eye-tracking
// library and its model files at runtime so the app keeps working offline
// after the first successful online visit.

const VERSION = 'v1';
const SHELL_CACHE = `gaze-speller-shell-${VERSION}`;
const RUNTIME_CACHE = `gaze-speller-runtime-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/alphabets.js',
  './js/speech.js',
  './js/gaze.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL_CACHE, RUNTIME_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // App shell: cache first, then network (and keep the cache fresh).
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res.ok) caches.open(SHELL_CACHE).then((c) => c.put(req, res.clone()));
            return res;
          })
          .catch(() => cached || caches.match('./index.html'));
        return cached || network;
      }),
    );
    return;
  }

  // Cross-origin (WebGazer script, TensorFlow model files): network first, cache fallback.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || Response.error())),
  );
});
