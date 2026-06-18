// Detect if running in Capacitor (Android/iOS WebView)
const isCapacitor = location.href.includes('localhost') || location.href.includes('capacitor:');

if (isCapacitor) {
  // Self-destruct Service Worker for Capacitor native apps to resolve caching catch-22
  self.addEventListener('install', event => {
    self.skipWaiting();
  });

  self.addEventListener('activate', event => {
    event.waitUntil(
      caches.keys().then(keys => {
        return Promise.all(keys.map(key => caches.delete(key)));
      }).then(() => {
        return self.registration.unregister();
      }).then(() => {
        return self.clients.matchAll();
      }).then(clients => {
        clients.forEach(client => {
          if (client.url && typeof client.navigate === 'function') {
            client.navigate(client.url).catch(() => {});
          }
        });
      })
    );
  });
} else {
  // Normal Web Browser PWA Caching using Network-First strategy
  const CACHE_NAME = 'hello-diary-v4';
  const PRECACHE_ASSETS = [
    './',
    'index.html',
    'manifest.json',
    'images/icon.svg',
    'css/base.css',
    'css/themes.css',
    'css/components.css',
    'css/editor.css',
    'css/animations.css',
    'css/responsive.css',
    'js/crypto.js',
    'js/db.js',
    'js/app.js',
    'js/dev-toggle.js'
  ];

  self.addEventListener('install', event => {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then(cache => cache.addAll(PRECACHE_ASSETS))
        .then(() => self.skipWaiting())
    );
  });

  self.addEventListener('activate', event => {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(name => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
          })
        );
      }).then(() => self.clients.claim())
    );
  });

  self.addEventListener('fetch', event => {
    // Network-first strategy: always try to fetch fresh files from network/server first
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback to cache
          return caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response('Offline resource not cached', { status: 503 });
          });
        })
    );
  });
}
