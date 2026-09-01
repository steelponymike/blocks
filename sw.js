/* Blocks - offline service worker.
   Cache-first so the game opens with no signal at all. A background
   revalidate keeps the cache honest when there IS signal; the fresh
   copy is picked up on the next launch, never mid-game.
   Bump CACHE whenever a file here changes. */
const CACHE = "blocks-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./game.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(req).then(hit => {
        const fresh = fetch(req)
          .then(res => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);

        if (hit) return hit;

        return fresh.then(res => {
          if (res) return res;
          // offline and never cached: a navigation still gets the app shell
          if (req.mode === "navigate") return cache.match("./index.html");
          return new Response("", { status: 504, statusText: "Offline" });
        });
      })
    )
  );
});
