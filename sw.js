// Bump this on every release. A new service worker reloads every file at once; without it, files
// refresh one at a time and a browser can keep running old scripts next to a new index.html.
const CACHE_VERSION = 'v8';
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

// The PDF viewer for export previews: saved in a second step, so the app still installs if it can't be
// (about 3MB). Without it, an export made offline can't be previewed, only downloaded.
var viewerURLs = [
  'pdfjs-2.8.335-dist/web/viewer.html',
  'pdfjs-2.8.335-dist/web/viewer.js',
  'pdfjs-2.8.335-dist/web/viewer.css',
  'pdfjs-2.8.335-dist/web/locale/locale.properties',
  'pdfjs-2.8.335-dist/web/locale/en-US/viewer.properties',
  'pdfjs-2.8.335-dist/build/pdf.js',
  'pdfjs-2.8.335-dist/build/pdf.worker.js',
  'pdfjs-2.8.335-dist/build/pdf.sandbox.js',
  'pdfjs-2.8.335-dist/web/images/annotation-check.svg',
  'pdfjs-2.8.335-dist/web/images/annotation-comment.svg',
  'pdfjs-2.8.335-dist/web/images/annotation-help.svg',
  'pdfjs-2.8.335-dist/web/images/annotation-insert.svg',
  'pdfjs-2.8.335-dist/web/images/annotation-key.svg',
  'pdfjs-2.8.335-dist/web/images/annotation-newparagraph.svg',
  'pdfjs-2.8.335-dist/web/images/annotation-noicon.svg',
  'pdfjs-2.8.335-dist/web/images/annotation-note.svg',
  'pdfjs-2.8.335-dist/web/images/annotation-paragraph.svg',
  'pdfjs-2.8.335-dist/web/images/findbarButton-next.svg',
  'pdfjs-2.8.335-dist/web/images/findbarButton-previous.svg',
  'pdfjs-2.8.335-dist/web/images/grab.cur',
  'pdfjs-2.8.335-dist/web/images/grabbing.cur',
  'pdfjs-2.8.335-dist/web/images/loading-dark.svg',
  'pdfjs-2.8.335-dist/web/images/loading-icon.gif',
  'pdfjs-2.8.335-dist/web/images/loading.svg',
  'pdfjs-2.8.335-dist/web/images/secondaryToolbarButton-documentProperties.svg',
  'pdfjs-2.8.335-dist/web/images/secondaryToolbarButton-firstPage.svg',
  'pdfjs-2.8.335-dist/web/images/secondaryToolbarButton-handTool.svg',
  'pdfjs-2.8.335-dist/web/images/secondaryToolbarButton-lastPage.svg',
  'pdfjs-2.8.335-dist/web/images/secondaryToolbarButton-rotateCcw.svg',
  'pdfjs-2.8.335-dist/web/images/secondaryToolbarButton-rotateCw.svg',
  'pdfjs-2.8.335-dist/web/images/secondaryToolbarButton-scrollHorizontal.svg',
  'pdfjs-2.8.335-dist/web/images/secondaryToolbarButton-scrollVertical.svg',
  'pdfjs-2.8.335-dist/web/images/secondaryToolbarButton-scrollWrapped.svg',
  'pdfjs-2.8.335-dist/web/images/secondaryToolbarButton-selectTool.svg',
  'pdfjs-2.8.335-dist/web/images/secondaryToolbarButton-spreadEven.svg',
  'pdfjs-2.8.335-dist/web/images/secondaryToolbarButton-spreadNone.svg',
  'pdfjs-2.8.335-dist/web/images/secondaryToolbarButton-spreadOdd.svg',
  'pdfjs-2.8.335-dist/web/images/shadow.png',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-bookmark.svg',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-currentOutlineItem.svg',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-download.svg',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-menuArrow.svg',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-openFile.svg',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-pageDown.svg',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-pageUp.svg',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-presentationMode.svg',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-print.svg',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-search.svg',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-secondaryToolbarToggle.svg',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-sidebarToggle.svg',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-viewAttachments.svg',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-viewLayers.svg',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-viewOutline.svg',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-viewThumbnail.svg',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-zoomIn.svg',
  'pdfjs-2.8.335-dist/web/images/toolbarButton-zoomOut.svg',
  'pdfjs-2.8.335-dist/web/images/treeitem-collapsed.svg',
  'pdfjs-2.8.335-dist/web/images/treeitem-expanded.svg',
];

self.addEventListener('install', function(evt) {
  console.log(`Service worker installing (version: ${CACHE_VERSION})`);
  self.skipWaiting(); // Immediately activate new SW
  evt.waitUntil(precache().then(precacheViewer));
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

// Each viewer file on its own: one that fails is fetched (and kept) the next time it's used online
function precacheViewer() {
  return caches.open(CACHE).then(function(cache) {
    return Promise.all(viewerURLs.map(function(url) {
      return cache.add(new Request(url, {cache: 'reload'})).catch(function() {});
    }));
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
