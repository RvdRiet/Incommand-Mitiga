/* InCommand service worker — offline app shell.
 *
 * Generated from scripts/sw-template.js by scripts/gen-sw.mjs at build time, which
 * stamps __SW_VERSION__ with the build id so every DEPLOY gets a fresh cache
 * (old caches are deleted on activate). Edit the template, not public/sw.js.
 *
 * Availability is paramount: the UI must load and the workspace must be usable
 * with no server connection. This SW caches the app shell + static assets and
 * serves the last-seen version of each page when offline. Actual incident DATA
 * is local-first (Zustand + IndexedDB) and syncs via the outbox when back online.
 */
const CACHE = "incommand-shell-__SW_VERSION__";

// Immutable / static assets → cache-first (hashed by Next, safe to keep).
const STATIC_RE = /\/_next\/static\/|\.(?:js|css|woff2?|ttf|png|jpe?g|svg|ico|webp|gif)$/;

// First install activates naturally (no existing worker to replace); an UPDATE
// waits until the page tells it to take over (SKIP_WAITING), so the app can show
// a "new version available" prompt instead of swapping mid-session.
self.addEventListener("install", () => {});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never intercept tiles/S3/APIs cross-origin
  if (url.pathname.startsWith("/api/")) return; // API is network-only; offline data = IndexedDB

  if (STATIC_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return hit || Response.error();
  }
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    const shell = (await cache.match("/dashboard")) || (await cache.match("/"));
    if (shell) return shell;
    return new Response(
      "<!doctype html><meta charset=utf-8><title>Offline</title><body style='font:16px system-ui;background:#0b1220;color:#e5e7eb;padding:2rem'><h1>Offline</h1><p>This page hasn't been opened yet on this device, so there's no cached copy. Reconnect once to cache it.</p></body>",
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}
