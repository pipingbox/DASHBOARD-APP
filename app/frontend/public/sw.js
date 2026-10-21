/*
 * PB-ANDROID-PLAYSTORE-001 — minimal offline fallback service worker.
 *
 * Scope: ONLY registered from the Android TWA channel (see
 * src/lib/registerOfflineFallback.ts). Purpose: satisfy the Trusted Web
 * Activity quality criteria (an offline navigation must not surface the
 * browser error page) without introducing an app-shell cache.
 *
 * Deliberate non-goals (PB-PWA-UPDATE-CACHE-001 pending, stale-version
 * detection PB-AUTH-CALLBACK-STALE-APP-001 relies on index.html always coming
 * from the network):
 *   - NEVER caches index.html, JS/CSS bundles, /version.json or API responses.
 *   - Network-first for navigations; the offline page is served only when the
 *     network request itself fails (no response at all).
 *   - Non-navigation requests are not intercepted.
 */
const CACHE_NAME = 'pb-offline-fallback-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/assets/favicons/favicon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL).then(
        (cached) =>
          cached ||
          new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }),
      ),
    ),
  );
});
