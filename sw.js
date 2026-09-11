/* Offline cache for the tactical playbook */
const CACHE = "cs2-playbook-v5";
const CORE_ASSETS = [
  "./",
  "index.html",
  "styles.css?v=5",
  "app.js?v=5",
  "data.js?v=5",
  "manifest.webmanifest",
  "assets/icon.svg",
  "assets/maps/mirage.png",
  "assets/maps/ancient.png",
  "assets/maps/dust2.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) || (await cache.match("index.html"));
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    return cache.match("index.html");
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const destination = event.request.destination;
  const needsFreshVersion = event.request.mode === "navigate" || destination === "document" || destination === "script" || destination === "style";
  event.respondWith(needsFreshVersion ? networkFirst(event.request) : cacheFirst(event.request));
});
