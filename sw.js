var CACHE = 'cache-and-update';
var prefetchedURLs = [
  'jquery-3.5.1.min.js',
  'pouchdb.min.js',
  'pdfkit.standalone.js',
  'blob-stream.js'
  'db.js',
  'lib.js',
  'sw.js',
  'jquery.myTransposer.js',
  'jquery.toTextarea.js',
  'list.min.js',
  'import.js',
  'list.min.js',
  'jszip.min.js',
  'notyf.min.js',
  'pdfformatter.js',
  'pouchdb.authentication.min.js',
  'index.html',
  'presentation.html',
  'presentation.js',
  'sortable.js',
  'notyf.min.css',
  'style.css',
  'jquery.myTransposer.css',
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
  console.log('The service worker is being installed.');
  evt.waitUntil(precache());
});

self.addEventListener('fetch', function(evt) {
  console.log('The service worker is serving the asset.');
  evt.respondWith(fromCache(evt.request));
  evt.waitUntil(update(evt.request));
});

function precache() {
  return caches.open(CACHE).then(function (cache) {
    return cache.addAll(prefetchedURLs);
  });
}

function fromCache(request) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(request).then(function (matching) {
      return matching || fetch(request); //Promise.reject('no-match');
    });
  });
}

function update(request) {
  return caches.open(CACHE).then(function (cache) {
    return fetch(request).then(function (response) {
      return cache.put(request, response);
    });
  });
}
