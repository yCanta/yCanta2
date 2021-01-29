var cacheName = 'ycanta-cache-1.1';
var prefetchedURLs = [
  'jquery-3.5.1.min.js',
  'pouchdb.min.js',
  'pouchdb.memory.min.js',
  'pouchdb.authentication.min.js',
  'pdfkit.standalone.js',
  'blob-stream.js',
  'list.min.js'
  /*'db.js',
  'lib.js',
  'sw.js',
  'pdfformatter.js',
  'import.js',
  'sortable.js',
  'jquery.myTransposer.js',
  'jquery.toTextarea.js',
  'jquery.myTransposer.css',
  'presentation.js',
  'presentation.html',
  'style.css',
  '2html.css',
  'index.html',
  'favicon.png',
  'icon.png',
  'icon512.png'*/
];
const l = console.log

self.addEventListener('install', function(event) {
  l('install evt')

  event.waitUntil(
    caches.open(cacheName).then((cache) => {

      return Promise.all(prefetchedURLs.map((url) => {
        return fetch(url).then(res => {
          if (res.status >= 400) throw Error('request failed: ' + url + ' failed with status: ' + res.statusText)
          return cache.put(url, res)
        })
      }))

    }).catch((err) => {
      //...
      l(err
)    })
    //...
  )
});


self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(res) {
      if (res) {
        l('Resource found in Cache Storage')
        return res;
      }

      return fetch(event.request).then(function(res) {
        return res;
      }).catch(function(err) {
        l(err);
      });
    }));
});
