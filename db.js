var db = new PouchDB('yCanta');

function saveSong(song_id) {
  var song_html = $('#song song');
  if(song_id == undefined) {
    song_id = 's-' /*new Date().toISOString()*/  + song_html.find('stitle').text();
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
    var options = {    
      valueNames: [
        { data: ['song-id'] },
        { data: ['song-title'] },
        { data: ['song-authors'] },
        { data: ['song-scripture'] },
        { data: ['song-introduction'] },
        { data: ['song-key'] },
        { data: ['song-categories'] },
        { data: ['song-cclis'] },
        { data: ['song-content'] },
        { data: ['song-copyright'] },
        { name: 'link', attr: 'href'},
        'name'
      ],
      item: 'song-item-template'
    };
    var values = [];   
    result.rows.map(function (row) {
      if(window.songbook_list != undefined){
        if(window.songbook_list.get(row.doc._id)){
          console.log("Skipping it!");
          return
        }
        else {
          console.log("We've got a new one!");
        }
      }
      values.push(
        { 'song-id': row.doc._id,
          'song-title':        't:' + row.doc.title,
          'song-authors':      'a:' + (row.doc.authors != '' ? row.doc.authors : '!a'),
          'song-scripture':    's:' + row.doc.scripture,
          'song-introduction': 'i:' + row.doc.introduction,
          'song-key':          'k:' + row.doc.key,
          'song-categories':   'c:' + row.doc.categories,
          'song-copyright':    'c:' + (row.doc.copyright ? row.doc.copyright : '!c'),
          'song-cclis': ((row.doc.cclis!='') ? 'cclis' : '!cclis'),
          'song-content': row.doc.content,
          'link': '#'+songbook_id+'&'+row.doc._id,
          'name': row.doc.title
      });
    });
    window.songbook_list = new List('songbook_content', options, values);
    /*
    var songbook = document.createDocumentFragment();
      var title = document.createElement('h3');
      title.innerHTML = 'todosCantas';
      songbook.appendChild(title);

      var songbook_content = document.getElementById("songbook_content");
      songbook_content.innerHTML = '';
      songbook_content.append(songbook);*/
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
    //we need to load the songbook - mostly same as above.
  }
  $('#songbook_title').text('todosCantas');  // Need to change for other songbooks.
  $('body').attr('class','songList');
}

