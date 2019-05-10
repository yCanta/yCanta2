(function() {
  'use strict';
  var db = new PouchDB('yCanta');

  function saveSong(song_ob) {
    var song = {
      _id: new Date().toISOString(),
      title: song_ob,
      content: '?Yolo'
    };
    db.put(song, function callback(err, result) {
      if (!err) {
        console.log('Successfully saved a song!');
      }
    });
  }
})();
