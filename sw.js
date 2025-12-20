const CACHE_NAME = "kobra-v1";
const OFFLINE_ASSETS = [
  "/",
  "/server-intelligence.html",
  "/server-compare.html",
  "/css/server-intelligence.css",
  "/css/server-compare.css",
  "/js/server-intelligence.js",
  "/js/server-compare.js",
  "/manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});
