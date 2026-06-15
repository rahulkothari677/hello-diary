const CACHE_NAME = 'hello-diary-v1';
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

// Install Event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Pre-caching core shell assets...');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  
  // Cache-first strategy for static assets and theme images
  if (
    PRECACHE_ASSETS.includes(requestUrl.pathname.replace(/^\//, '')) || 
    requestUrl.pathname.includes('/images/themes/') ||
    event.request.destination === 'image' ||
    event.request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(event.request).then(networkResponse => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          
          return networkResponse;
        }).catch(() => {
          // Offline fallback
          return new Response('Offline resource not cached', { status: 503 });
        });
      })
    );
  } else {
    // Network-first for other requests (e.g. external fonts/APIs if any)
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
  }
});
