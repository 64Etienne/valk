// Bump this version on every SW-breaking change to invalidate old caches.
const CACHE = "valk-v2";

// Only cache things that are safe across deploys (versioned assets, static files).
// Do NOT cache HTML pages — they reference JS chunks whose IDs change each deploy,
// which causes "ChunkLoadError: Failed to load chunk /_next/static/chunks/<old-hash>.js"
// after a new deploy invalidates the old chunks.
const STATIC_PRECACHE = ["/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(STATIC_PRECACHE))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;

  const acceptsHtml = e.request.headers.get("accept")?.includes("text/html");
  const isNavigation = e.request.mode === "navigate" || acceptsHtml;

  if (isNavigation) {
    // Network-first for HTML pages so chunk references are always fresh.
    // Only fall back to cache on network failure (offline).
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request).then((r) => r || caches.match("/"))
      )
    );
    return;
  }

  // Stale-while-revalidate for everything else (static assets, fonts, icons).
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((resp) => {
          if (resp.ok && resp.type === "basic") {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
