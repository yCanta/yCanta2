// Bump this on every release. A new service worker reloads every file at once; without it, files
// refresh one at a time and a browser can keep running old scripts next to a new index.html.
const CACHE_VERSION = 'v5';
const CACHE = `cache-and-update-${CACHE_VERSION}`;

var prefetchedURLs = [
  './', // the start page, so an offline launch works
  'pouchdb.min.js',
  'pouchdb.memory.min.js',
  'pouchdb.upsert.min.js',
  'analytics.js',
  'pdfkit.standalone.js',
  'blob-stream.js',
  'db.js',
  'lib.js',
  'sw.js',
  'myTransposer.js',
  'toTextarea.js',
  'list.min.js',
  'import.js',
  'jszip.min.js',
  'mark.min.js',
  'notyf.min.js',
  'pdfformatter.js',
  'pouchdb.authentication.min.js',
  'index.html',
  'presentation.html',
  'presentation.js',
  'sortable.js',
  'notyf.min.css',
  'style.css',
  'myTransposer.css',
  '2html.css',
  'apple-touch-icon.png',
  'browserconfig.xml',
  'favicon-mask.png',
  'favicon.png',
  'icon.png',
  'icon512.png',
  'manifest.webmanifest',
  'mstile-150x150.png',
  'safari-pinned-tab.svg'
];

self.addEventListener('install', function(evt) {
  console.log(`Service worker installing (version: ${CACHE_VERSION})`);
  self.skipWaiting(); // Immediately activate new SW
  evt.waitUntil(precache());
});

self.addEventListener('fetch', function(evt) {
  // Skip caching for non-GET requests (e.g., PouchDB syncs)
  if (evt.request.method !== 'GET') {
    return evt.respondWith(fetch(evt.request));
  }
  // Only cache the app's own files. Database requests (cross-origin, or /couch/ on this host)
  // must hit the network, or ignoreSearch would hand sync stale _changes results.
  // The server save rules (/database/validate.js) must be fresh too, or "Install or update the save
  // rules" would install an old copy.
  const url = new URL(evt.request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/couch/') || url.pathname.includes('/database/')) {
    return;
  }

  evt.respondWith(
    fromCache(evt.request).catch(() => fetch(evt.request))
  );
  evt.waitUntil(update(evt.request));
});

function precache() {
  return caches.open(CACHE).then(function(cache) {
    // Force a network reload to bypass browser cache for new file structures
    return cache.addAll(prefetchedURLs.map(url => new Request(url, {cache: 'reload'})));
  });
}

function fromCache(request) {
  return caches.open(CACHE).then(function(cache) {
    return cache.match(request, {ignoreSearch: true}).then(function(matching) {
      return matching || Promise.reject('no-match');
    });
  });
}

function update(request) {
  if (request.method !== 'GET') return Promise.resolve();
  
  return caches.open(CACHE).then(function(cache) {
    return fetch(request).then(function(response) {
      // ✅ FIX: Clone the response so it can be consumed by cache.put AND the network layer safely
      if (response.ok) {
        return cache.put(request, response.clone()).then(() => response);
      }
      return response;
    }).catch(() => {
      // If network fetch fails, suppress error to keep using the cache seamlessly
    });
  });
}

// Clean up old caches and claim clients
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          // Dynamic Fix: Clears out ANY old cache that doesn't match our current cache name
          if (cacheName !== CACHE) {
            console.log(`Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      ).then(() => {
        console.log('Claiming clients for new service worker');
        return self.clients.claim();
      });
    })
  );
});
