// PipingBox Service Worker — MVP offline support for Tools
// Scope: cache shell + runtime assets, keep Supabase API calls network-only.

const CACHE_NAME = 'pipingbox-sw-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/assets/favicons/favicon-16.png',
  '/assets/favicons/favicon-32.png',
  '/assets/favicons/favicon-48.png',
  '/assets/favicons/favicon-192.png',
  '/assets/favicons/favicon-512.png',
  '/assets/favicons/apple-touch-icon-180.png',
  '/assets/favicons/icon-maskable-512.png',
  '/assets/logos/logo-icon.png',
  '/assets/logos/logo-horizontal.png',
];

const MAX_RUNTIME_CACHE_ENTRIES = 300;

function isSupabaseApi(url) {
  return (
    url.hostname.endsWith('.supabase.co') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/realtime/') ||
    url.pathname.startsWith('/storage/')
  );
}

function isAsset(url) {
  return /\.(js|css|png|jpg|jpeg|webp|avif|svg|gif|ico|woff|woff2|ttf|otf|json)$/.test(
    url.pathname
  );
}

async function trimRuntimeCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_RUNTIME_CACHE_ENTRIES) return;
  // Remove oldest entries (FIFO by insertion order)
  const toDelete = keys.slice(0, keys.length - MAX_RUNTIME_CACHE_ENTRIES);
  for (const request of toDelete) {
    await cache.delete(request);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Bypass non-GET requests and browser extensions
  if (request.method !== 'GET' || url.protocol.startsWith('chrome-extension')) {
    return;
  }

  // Supabase API and backend API: always network
  if (isSupabaseApi(url) || url.pathname.startsWith('/api/')) {
    return;
  }

  // Static assets: cache-first with runtime cache
  if (isAsset(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          return cached;
        }
        try {
          const response = await fetch(request);
          if (response && response.status === 200) {
            cache.put(request, response.clone());
            await trimRuntimeCache(cache);
          }
          return response;
        } catch (error) {
          // No fallback for missing asset
          throw error;
        }
      })
    );
    return;
  }

  // Navigation / HTML: network-first, fallback to cached shell
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches
            .open(CACHE_NAME)
            .then((cache) =>
              cache.match(request).then((cached) => cached || cache.match('/index.html'))
            )
        )
    );
    return;
  }

  // Default: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
