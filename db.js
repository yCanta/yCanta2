var db = new PouchDB('yCanta');

function saveSong(song_id) {
  var song_html = $('#song song');
  if(song_id == undefined) {
    song_id = /*new Date().toISOString()*/ 's-' + song_html.find('stitle').text();
  }
  
  var song = {
    _id: song_id,
    _rev: song_html.attr('data-rev'), //need a _rev if updating a document
    title: song_html.find('stitle').text(),
    authors: song_html.find('author').text(),
    scripture: song_html.find('scripture_ref').text(),
    introduction: song_html.find('introduction').text(),
    key: song_html.find('key').text(),
    categories: song_html.find('categories').text(),
    cclis: song_html.find('cclis').text(),
    content: song_html.find('chunk').text(),
  };

  db.put(song, function callback(err, result) {
    if (!err) {
      console.log('Successfully saved a song!');
    }
    else {
      console.log(err);
    }
  });
}

function loadSong(song_id) {

}

function loadSongbook(songbook_id) {
  function buildSongbookList (result) {
    var songbook = document.createDocumentFragment();
      //title
      var title = document.createElement('h3');
      title.innerHTML = 'todosCantas';
      songbook.appendChild(title);

      var songs_list = document.createElement('ol');
      result.rows.map(function (row) {
        var song = document.createElement('li');
        var link = document.createElement('a');
        link.innerHTML = row.doc.title;
        link.href = '#' + songbook_id + '&' + row.doc._id;
        link.dataset.rev = row.doc._rev;
        song.appendChild(link);
        songs_list.appendChild(song);
        return;
      });
      songbook.appendChild(songs_list);

      var songbook_content = document.getElementById("songbook_content");
      songbook_content.innerHTML = '';
      songbook_content.append(songbook);
      console.log(songbook);
    return 
  }
  if(songbook_id == undefined) {
    songbook_id = 'sb-todosCantas';
    db.allDocs({
      include_docs: true,
      startkey: 's-',
      endkey: 's-\ufff0',
    }).then(function(result){
      //handle result
      buildSongbookList(result);
    }).catch(function(err){
      console.log(err);
    })
  }
  else {
    //we need to load the songbook 
  }
  $('body').attr('class','songList');
}

