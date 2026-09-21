const CACHE_NAME = "power-trak-rack-v10";
const STATIC_ASSETS = ["/icon.png", "/assets/smart-logo.png", "/power-trak-rack.webmanifest", "/power-trak-rack-queue.js", "/power-trak-rack-sync.js"];
const RACK_SHELL = "/power-trak-rack-shell";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
    return;
  }
  if (request.mode === "navigate" && url.pathname === "/power-trak.html") {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(RACK_SHELL, copy));
      return response;
    }).catch(() => caches.match(RACK_SHELL)));
    return;
  }
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
