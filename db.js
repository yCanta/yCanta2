var db = new PouchDB('yCanta');

function saveSong(song_id) {
  return new Promise(function(resolve, reject) {
    var song_html = $('#song song');
    function loadSongContent(song) {
      if(song._rev != undefined) {
        song._rev       = song_html.attr('data-rev'); //need a _rev if updating a document
      }
      song.title        = song_html.find('stitle').text();
      song.authors      = song_html.find('authors').text().split(',').map(Function.prototype.call, String.prototype.trim);
      song.scripture_ref= song_html.find('scripture_ref').text().split(',').map(Function.prototype.call, String.prototype.trim);
      song.introduction = song_html.find('introduction').text();
      song.key          = song_html.find('key').text();
      song.categories   = song_html.find('categories').text().split(',').map(Function.prototype.call, String.prototype.trim);
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
        window.location.hash = '#'+window.songbook_id+'&'+song._id;
        resolve('all good!');
      }).catch(function (err) {
        console.log(err);
      });
    }
    //we've got a new song folks!
    if(song_id == 's-new-song') {
      song_id = 's-' + new Date().getTime();  //  + song_html.find('stitle').text().replace(' ','');
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
  });
}

function loadSong(song_id) {
  return new Promise(function(resolve, reject) {
    function createSongHtml(song) {
      window.song_id = song._id;
      var song_html = '<song data-rev="' + song._rev + '" data-id="' + song._id + '">' + 
        '<stitle>' + song.title + '</stitle>' + 
        '<authors><author>' + song.authors.join('</author>, <author>') + '</author></authors>' + 
        '<scripture_ref><scrip_ref>' + song.scripture_ref.join('</scrip_ref>, <scrip_ref>') + '</scrip_ref></scripture_ref>' + 
        '<introduction>' + song.introduction + '</introduction>' + 
        '<key>' + song.key + '</key>' + 
        '<categories><cat>' + song.categories.sort().join('</cat>, <cat>') + '</cat></categories>' + 
        '<cclis>' + song.cclis + '</cclis>';
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
      bindSearch('cat', 'c:');
      bindSearch('author', 'a:');
      bindSearch('scrip_ref', 's:');
      bindSearch('stitle', 't:');
      bindSearch('key', 'k:');
      bindSearch('copyright', 'c:');
      
      resolve("song_loaded");
    }
    if(song_id === 's-new-song'){
      var song = {
        _id: 's-new-song',
        title: '',
        authors: [''],
        scripture_ref: [''],
        introduction: '',
        key: '',
        categories: [""],
        cclis: false,
        content: [[{type: 'verse'},
          [""]]
          ],
        copyright: ''
      };
      createSongHtml(song)
    }
    else {
      db.get(song_id).then(function(song){
          createSongHtml(song);
        }).catch(function (err) {
        console.log(err);
        reject('got an error!');
        //should load the songbook and explain what's up.
      });
    }  
  });
}
function deleteSong(song_id) {
  if (confirm("Are you sure you want to delete this song?")) {
    db.get(window.song_id).then(function (doc) {
      return db.remove(doc);
    }).then(function(){
      window.location.hash='#'+window.songbook_id
    });
    console.log('deleted: '+window.song_id);
    return false
  } else { //we aren't leaving 
    return true
  }
}

function loadSongbook(songbook_id) {
  return new Promise(function(resolve, reject) {

    function buildSongbookList(songs) {
      var options = {    
        valueNames: [
          { data: ['song-id'] },
          { data: ['song-rev'] },
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
      songs.rows.map(function (row) {
        function mapRowToValue(row) {
          return { 'song-id':           row.doc._id,
            'song-rev':                 row.doc._rev,
            'song-title':        't:' + row.doc.title,
            'song-authors':      'a:' + (row.doc.authors != '' ? row.doc.authors.join(' a:') : '!a'),
            'song-scripture_ref':'s:' + row.doc.scripture_ref,
            'song-introduction': 'i:' + row.doc.introduction,
            'song-key':          'k:' + row.doc.key,
            'song-categories':   'c:' + row.doc.categories.join(' c:'),
            'song-copyright':    'c:' + (row.doc.copyright ? row.doc.copyright : '!c'),
            'song-cclis': ((row.doc.cclis!='') ? 'cclis' : '!cclis'),
            'song-content': row.doc.content,
            'link': '#'+songbook_id+'&'+row.doc._id,
            'name': row.doc.title
          }
        }
        if(window.songbook_list != undefined){
          var songIdInList = window.songbook_list.get('song-id',row.doc._id);
          if(songIdInList.length > 0){
            // we need to update if the revision is different.
            var songRevInList = window.songbook_list.get('song-rev', row.doc._rev);
            if(songRevInList < 1){
              songIdInList[0].values(mapRowToValue(row));
            }
            return
          }
        }
        values.push(mapRowToValue(row));
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
        //first delete any songs no longer in the songbook
        var sb_song_ids = result.rows.map(function (row) {
          return row.doc._id
        });
        if(window.songbook_list != undefined){
          window.songbook_list.items.forEach(function(old_song){
            if(!sb_song_ids.includes(old_song.values()['song-id'])){
              window.songbook_list.remove('song-id',old_song.values()['song-id']);
            }
          });
        }
        //then add and update the new ones
        buildSongbookList(result);
        window.songbook_id = songbook_id;
        resolve('loaded songbook');
      }).catch(function(err){
        console.log(err);
      })
    }
    else {
      resolve('loaded songbook');
      //we need to load the songbook - mostly same as above.
    }
    $('#songbook_title').text('todosCantas');  // Need to change for other songbooks.
    $('#songbook_title').parent().attr('href','#'+songbook_id);
    $('body').attr('class','songList');

  });
}


var song = {
  _id: 's-aSong.song',
  title: 'Jesu Jesu',
  authors: ['Tom Colvin', 'yolo'],
  scripture_ref: ['1 Cor 1:13'],
  introduction: '',
  key: 'E',
  categories: ["Humility", "Love for Others", "Servanthood", "Children's Songs"],
  cclis: true,
  content: [[{type: 'chorus'},
    ["<c>E</c>Jesu, Jesu,",
    "Fill us with you <c>A</c>love,",
    "Show us how to <c>E</c>serve",
    "The neighbors we<c>B</c> have from <c>E</c>You."]],
    [{type: 'verse'},
    ["<c>E</c>Jesu, Jesu,",
    "Fill us with you <c>A</c>love,",
    "Show us how to <c>E</c>serve",
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

var categories = {
  _id: 'categories',
  categories: ["Adoration", "Aspiration/Desire", "Assurance", "Atonement", "Awe", "Bereavement", "Brokenness", "Calvary", "Christ as Bridegroom", "Christ as King", "Christ as Lamb", "Christ as Redeemer", "Christ as Savior", "Christ as Shepherd", "Christ as Son", "Christ's Blood", "Christ's Return", "Church as Christ's Body", "Church as Christ's Bride", "Church as God's House", "Cleansing", "Comfort", "Commitment", "Compassion", "Condemnation", "Consecration", "Conviction of Sin", "Courage", "Creation", "Cross", "Dedication/Devotion", "Dependence on God", "Encouragement", "Endurance", "Eternal Life", "Evangelism", "Faith", "Faithfulness", "Fear", "Fear of God", "Fellowship", "Forgiveness", "Freedom", "God as Creator", "God as Father", "God as Refuge", "God's Creation", "God's Faithfulness", "God's Glory", "God's Goodness", "God's Guidance", "God's Harvest", "God's Holiness", "God's Love", "God's Mercy", "God's Power", "God's Presence", "God's Strength", "God's Sufficiency", "God's Timelessness", "God's Victory", "God's Wisdom", "God's Word", "Godly Family", "Grace", "Gratefulness", "Healing", "Heaven", "Holiness", "Holy Spirit", "Hope", "Humility", "Hunger/Thirst for God", "Incarnation", "Invitation", "Jesus as Messiah", "Joy", "Kingdom of God", "Knowing Jesus", "Lordship of Christ", "Love for God", "Love for Jesus", "Love for Others", "Majesty", "Meditation", "Mercy", "Missions", "Mortality", "Neediness", "New Birth", "Obedience", "Oneness in Christ", "Overcoming Sin", "Patience", "Peace", "Persecution", "Praise", "Prayer", "Proclamation", "Provision", "Purity", "Purpose", "Quietness", "Redemption", "Refreshing", "Repentance", "Rest", "Resurrection", "Revival", "Righteousness", "Salvation", "Sanctification", "Security", "Seeking God", "Service", "Servanthood", "Sorrow", "Spiritual Warfare", "Submission to God", "Suffering for Christ", "Surrender", "Temptation", "Trials", "Trust", "Victorious Living", "Waiting on God", "Worship", "-----", "Christmas", "Easter", "Good Friday", "Thanksgiving", "-----", "Baptism", "Birth", "Closing Worship", "Communion", "Death", "Engagement", "Opening Worship", "Wedding", "-----", "Children's Songs", "Rounds", "Scripture Reading", "Scripture Songs", "-----", "Needs Work", "Needs Chord Work", "Needs Categorical Work", "Duplicate", "-----", "Norway", "Secular", "Delete", "Spanish words", "Celebration"]
}
db.put(categories, function callback(err, result) {
  if (!err) {
    console.log('added categories');
  }
  else {
    console.log(err);
  }
});
db.get('age').then(function(age){
  if(age.age < 190711) {
    db.destroy().then(function () {
      // database destroyed
      window.location.reload();
    }).catch(function (err) {
      console.log(err);
    });
  }
  }).catch(function(err){
    db.put({_id: 'age', age: 190711}, function callback(err, result) {
      if (!err) {
        console.log('added age');
      }
      else {
        console.log(err);
      }
    });
  });


