var db = new PouchDB('yCanta');

function saveSong(song_id) {
  var song_html = $('#song song');
  function loadSongContent(song) {
    song._id          = song_id;
    song._rev         = song_html.attr('data-rev'); //need a _rev if updating a document
    song.title        = song_html.find('stitle').text();
    song.authors      = song_html.find('authors').text().split(',');
    song.scripture_ref= song_html.find('scripture_ref').text().split(',');
    song.introduction = song_html.find('introduction').text();
    song.key          = song_html.find('key').text();
    song.categories   = song_html.find('categories').text().split(',');
    song.cclis        = song_html.find('cclis').text();
    //Compile Song Content, a list of lists.  Chunks and lines
    var chunks = [];
    song_html.find('chunk').each(function(){
      var lines = [];
      $(this).children().each(function(){ //add line contents
        lines.push($(this).html());
      });
      chunks.push([{'type': $(this).attr('type')}, lines]);
    });
    song.content      = chunks;
    song.copyright    = song_html.find('copyright').text();

    db.put(song, function callback(err, result) {
      if (!err) {
        console.log('Successfully saved a song!');
      }
      else {
        console.log(err);
      }
    }).then(function(){
      loadSong(parseHash('s-'));
    });
  }
  //we've got a new song folks!
  if(song_id == undefined) {
    song_id = 's-' /*new Date().toISOString()*/  + song_html.find('stitle').text();
    var song = {_id: song_id};
    loadSongContent(song);
  }
  else {  //existing song hopefully - need to make robust
    db.get(song_id).then(function(song){
      loadSongContent(song);
    }).catch(function (err) {
      console.log(err);
    });  
  }
}

function loadSong(song_id) {
  return new Promise(function(resolve, reject) {
    db.get(song_id).then(function(song){
      window.song_id = song._id;
      var song_html = '<song data-rev="' + song._rev + '" data-id="' + song._id + '">' + '<stitle>' + song.title + '</stitle>' + '<authors>' + song.authors + '</authors>' + '<scripture_ref>' + song.scripture_ref + '</scripture_ref>' + '<introduction>' + song.introduction + '</introduction>' + '<key>' + song.key + '</key>' + '<categories>' + song.categories + '</categories>' + '<cclis>' + song.cclis + '</cclis>';
      song.content.forEach(function(chunk){
        song_html += '<chunk type="' + chunk[0].type + '">';
        chunk[1].forEach(function(line){
          song_html += '<line>' + line + '</line>';
        });
        song_html += '</chunk>';
      });
      song_html +=  '<copyright>' + song.copyright + '</copyright>' +
                  '</song>'
      $('#song .content').html(song_html);
      resolve("song_loaded");
     }).catch(function (err) {
      console.log(err);
      reject('got an error!');
      //should load the songbook and explain what's up.
    });  
  });
}

function loadSongbook(songbook_id) {
  return new Promise(function(resolve, reject) {

    function buildSongbookList (result) {
      var options = {    
        valueNames: [
          { data: ['song-id'] },
          { data: ['song-title'] },
          { data: ['song-authors'] },
          { data: ['song-scripture_ref'] },
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
            'song-scripture_ref':'s:' + row.doc.scripture_ref,
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
      //Creates list.min.js list for viewing the songbook
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
    if(songbook_id == undefined || songbook_id == 'sb-todosCantas') {
      songbook_id = 'sb-todosCantas';
      db.allDocs({
        include_docs: true,
        startkey: 's-',
        endkey: 's-\ufff0',
      }).then(function(result){
        //handle result
        buildSongbookList(result);
        window.songbook_id = songbook_id;
      }).catch(function(err){
        console.log(err);
      })
    }
    else {
      //we need to load the songbook - mostly same as above.
    }
    $('#songbook_title').text('todosCantas');  // Need to change for other songbooks.
    $('#songbook_title').parent().attr('href','#'+songbook_id);
    $('body').attr('class','songList');
    resolve('loaded songbook');
  });
}


var song = {
  _id: 's-aSong.song',
  title: 'Jesu Jesu',
  authors: ['Tom Colvin'],
  scripture_ref: ['1 Cor 1:13'],
  introduction: '',
  key: 'E',
  categories: ["Humility", "Love for Others", "Servanthood", "Children's Songs"],
  cclis: true,
  content: [[{type: 'chorus'},
    ["<c>E</c>Jesu, Jesu,",
    "Fill us with you <c>A</c>love,",
    "Show us how to<c>E</c>serve",
    "The neighbors we<c>B</c> have from <c>E</c>You."]],
    [{type: 'verse'},
    ["<c>E</c>Jesu, Jesu,",
    "Fill us with you <c>A</c>love,",
    "Show us how to<c>E</c>serve",
    "The neighbors we<c>B</c> have from <c>E</c>You."]]
    ],
  copyright: '© 1969 Hope Publishing Company'
};


db.put(song, function callback(err, result) {
      if (!err) {
        console.log('Successfully saved a song!');
      }
      else {
        console.log(err);
      }
    });

