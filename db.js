//initialize global variable.
var db, syncHandler;

var online = false;

function updateOnlineStatus(event) {
  if(event == undefined) {
    event = {};
    event.type = 'windowLoad';
  }
  var condition = navigator.onLine ? "online" : "offline";
  document.documentElement.className = condition;
  online = navigator.onLine;
  console.log("beforeend", "Event: " + event.type + "; Status: " + condition);
}
//Update Online status
window.addEventListener('load', function() {
  function update(event) {
    updateOnlineStatus(event);
  }
  window.addEventListener('online',  update);
  window.addEventListener('offline', update);
});
updateOnlineStatus();

function clearAllDbs() { 
  window.indexedDB.databases().then((r) => {
      for (var i = 0; i < r.length; i++) window.indexedDB.deleteDatabase(r[i].name);
  }).then(() => {
      location.reload();
  });
}
function dbChanges() {
  window.changeHandler = db.changes({
    since: 'now',
    live: true,
    include_docs: true
  }).on('change', function (change) {
    // received a change
    if (change.deleted) {
      // document was deleted
      console.log('deleted: ' + change.doc._id);
    } else {
      // document was added/modified
    }
    //what type?
    //song?
    if(change.doc._id.startsWith('s-')){
      loadRecentSongs();  
      //only load song if it's the one that's up.
      if(window.song._id === change.doc._id && document.body.classList.contains('song')){
        loadSong(change.doc._id);
        notyf.info('Song updated', 'var(--song-color)');
      } else {
        notyf.info(`Song "${change.doc.title}" updated by ${change.doc.editedBy}`,
                   'var(--song-color)',
                   `#${window.songbook._id}&${change.doc._id}`);
      }
      //update all songs in songbooks
      if(window.songbook_list != undefined ){
        window.songbook_list.get('song-id',change.doc._id)
          .forEach(function(song){
            let new_change = mapSongRowToValue(change);
            new_change['song-status'] = song.values()['song-status'];
            song.values(new_change);
          });
      }
      if(window.songbook_edit_togglesongs_list != undefined){
        window.songbook_edit_togglesongs_list.get('song-id',change.doc._id)
          .forEach(function(song){song.values(mapSongRowToValue(change))});
      }
      if(window.songbook._id == 'sb-allSongs') {
        window.songbook._id = '';
        loadSongbook('sb-allSongs');
      }
    }
    //songbook?
    else if(change.doc._id.startsWith('sb-')){
      if(window.songbook._id === change.doc._id && (document.body.classList.contains('songList') || document.body.classList.contains('song'))){
        window.songbook = '';
        loadSongbook(change.doc._id);
        notyf.info('Songbook updated', 'var(--songList-color)');
      } else {
        notyf.info(`Songbook "${change.doc.title}" updated by ${change.doc.editedBy}`,
                   'var(--songList-color)',
                   `#${change.doc._id}`);
      }
      //update the songbook entry in songbooks_list
      if(window.songbooks_list != undefined){
        window.songbooks_list.get('songbook-id',change.doc._id)
          .forEach(function(songbook){songbook.values(mapSongbookRowToValue(change))});
        window.songbooks_list.sort('user-fav', {order: 'desc', sortFunction: sortFavSongbooks});
      }
    }
    else if(change.doc._id.startsWith('c_')){
      let songbook_id = change.doc._id.match(/sb-.*?_/g)[0].replace('_','');
      if(window.songbook._id == songbook_id && window.songbook.showComments){
        let song_id = change.doc._id.match(/s-.*?$/g)[0];
        $('li[data-song-id="'+song_id+'"] .toggle_comment').attr('data-comment-number', change.doc.comments.length);
        let comments = '';
        for(comment of change.doc.comments){
          comments += `<div><b>${comment.user} </b>${new Date(comment.date).toLocaleTimeString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}<pre>${comment.comment}</pre></div>`;
        }
        $('li[data-song-id="'+song_id+'"] .comments').html(comments);
        notyf.info(`Comment added to "${song_id}" by ${change.doc.comments[change.doc.comments.length - 1].user}`,
                   'var(--songList-color)');
      }
    }
    else if(change.doc._id == window.user._id){
      let fav_sbs = change.doc.fav_sbs;
      //jquery remove all favs
      $('#songbooks .list li').each(function(){
        let fav = false;
        if(fav_sbs.indexOf($(this).attr('data-songbook-id')) > -1) {
          fav = true;
        }
        $(this).attr('data-user-fav', fav);
      })
      if(fav_sbs.indexOf(window.songbook._id) > -1) {
        $('#songbook_title').attr('data-user-fav', 'true');
      }
      else {
        $('#songbook_title').attr('data-user-fav', 'false'); 
      }
      window.user = change.doc;
      if(window.songbook._id == 'sb-favoriteSongs') {
        window.songbook._id = '';
        loadSongbook('sb-favoriteSongs');
      }
      updateUser();
      notyf.info(`User Updated "${change.doc.name}"`,
                   'var(--edit-color)');
      window.songbooks_list.reIndex();
      window.songbooks_list.sort('user-fav', {order: 'desc', sortFunction: sortFavSongbooks});
      $('#song song').attr('data-user-fav', (window.user.fav_songs.indexOf($('#song song').attr('data-id'))> -1 ? 'true': 'false'))
    }
    //New default config saved
    else if(change.doc._id.startsWith('cfg-')){
      notyf.inf('Default config saved');
    }
    //else... let it go! for now
    else {
      console.log('changed:',change.doc._id);
    }
  }).on('error', function (err) {
    // handle errors
    console.log('Error in db.changes('+err);
  });
}

function dbLogin(newDb=false, dbName=false, username=false, pin=false) {
  if(!dbName){
    dbName = $('#db_select :selected').val();
  }
  if(!username){
    username = $('#username').val().trim();
  }
  if(!pin){
    pin = $('#pin').val().trim();
  }
  if(newDb){
    dbName = $('#newDbName').val().trim()+'(local)';
    console.log('New DB');
    //initialize local database;
    db = new PouchDB(dbName);
    
    //create User doc
    let user = {
      _id: 'u-'+username,
      name: username,
      fav_sbs: [],
      fav_songs: []
    }
    window.user = user;
    db.put(user, function callback(err, result) {
      if(!err) {
        console.log('added user: ', username);
      }
      else {
        console.log(err);
      }
    });
    //store user pin in a local doc
    db.put({_id: '_local/u-'+username, pin: pin}, function callback(err, result) {
      if(!err) {
        console.log("added user's pin");
      }
      else {
        console.log(err);
      }
    });
    //initialize list of categories
    var categories = {
      _id: 'categories',
      categories: ["Adoration", "Aspiration/Desire", "Assurance", "Atonement", "Awe", "Bereavement", "Brokenness", "Calvary", "Christ as Bridegroom", "Christ as King", "Christ as Lamb", "Christ as Redeemer", "Christ as Savior", "Christ as Shepherd", "Christ as Son", "Christ's Blood", "Christ's Return", "Church as Christ's Body", "Church as Christ's Bride", "Church as God's House", "Cleansing", "Comfort", "Commitment", "Compassion", "Condemnation", "Consecration", "Conviction of Sin", "Courage", "Creation", "Cross", "Dedication/Devotion", "Dependence on God", "Encouragement", "Endurance", "Eternal Life", "Evangelism", "Faith", "Faithfulness", "Fear", "Fear of God", "Fellowship", "Forgiveness", "Freedom", "God as Creator", "God as Father", "God as Refuge", "God's Creation", "God's Faithfulness", "God's Glory", "God's Goodness", "God's Guidance", "God's Harvest", "God's Holiness", "God's Love", "God's Mercy", "God's Power", "God's Presence", "God's Strength", "God's Sufficiency", "God's Timelessness", "God's Victory", "God's Wisdom", "God's Word", "Godly Family", "Grace", "Gratefulness", "Healing", "Heaven", "Holiness", "Holy Spirit", "Hope", "Humility", "Hunger/Thirst for God", "Incarnation", "Invitation", "Jesus as Messiah", "Joy", "Kingdom of God", "Knowing Jesus", "Lordship of Christ", "Love for God", "Love for Jesus", "Love for Others", "Majesty", "Meditation", "Mercy", "Missions", "Mortality", "Neediness", "New Birth", "Obedience", "Oneness in Christ", "Overcoming Sin", "Patience", "Peace", "Persecution", "Praise", "Prayer", "Proclamation", "Provision", "Purity", "Purpose", "Quietness", "Redemption", "Refreshing", "Repentance", "Rest", "Resurrection", "Revival", "Righteousness", "Salvation", "Sanctification", "Security", "Seeking God", "Service", "Servanthood", "Sorrow", "Spiritual Warfare", "Submission to God", "Suffering for Christ", "Surrender", "Temptation", "Trials", "Trust", "Victorious Living", "Waiting on God", "Worship", "-----", "Christmas", "Easter", "Good Friday", "Thanksgiving", "-----", "Baptism", "Birth", "Closing Worship", "Communion", "Death", "Engagement", "Opening Worship", "Wedding", "-----", "Children's Songs", "Rounds", "Scripture Reading", "Scripture Songs", "-----", "Needs Work", "Needs Chord Work", "Needs Categorical Work", "Duplicate", "-----", "Norway", "Secular", "Delete", "Spanish words", "Celebration"]
    }
    db.put(categories, function callback(err, result) {
      if(!err) {
        console.log('added categories');
      }
      else {
        console.log(err);
      }
    });
    takeNextStep(username,dbName);
  }
  else {
    console.log('Logging in');
    db = new PouchDB(dbName);
    //check if pin matches
    db.get('_local/u-'+username).then(function(userPin){
      if(userPin.pin == pin) {
        console.log('Pin is correct!');
        db.get('u-'+username).then(function(response) {
          window.user = response;
          takeNextStep(username,dbName);
        });
      }
      //if not then close the db
      else {
        console.log('Username or pin was incorrect');
        alert('Username or pin was incorrect');
        dbLogout();
      }
    }).catch(function(err){
      console.log(err);
      alert('Username or pin was incorrect');
      dbLogout();
    });
  }
  function takeNextStep(username, dbName) {  //after login
    //layout the welcome?  maybe this goes in set login state?
    //Update ui when db changes]s
    dbChanges();

    localStorage.setItem('loggedin',JSON.stringify([dbName, username, pin]));
    //check dark mode and set for app
    let darkMode = localStorage.getItem(window.user._id+'darkMode');
    if(darkMode){
      document.getElementById(darkMode+'Radio').checked = true;
    }else {
      document.getElementById('autoRadio').checked = true;
    }
    handleDarkMode();
    //set font size;
    let fontSize = localStorage.getItem(window.user._id+'fontSize');
    if(fontSize){
      document.documentElement.style.fontSize = fontSize+'px';
      document.getElementById('fontSize').value = fontSize;
      document.getElementById('fontSizeOutput').value = fontSize + 'px';
    }

    window.yCantaName = dbName;
    loadRecentSongs();
    initializeSongbooksList();
    setLoginState();
    //initialized
    window.songbook = {};
    window.song = {};
    //wipe login cause we were successfull!
    $('#login :input').each(function(){$(this).val('')});
    return true;
  }

  return false;

  /*let pwd = $('#pwd').val();
  let pin = $('#pin').val();
  if(newDb)
  console.log(dbName, username, pin);
  db = new PouchDB(dbName);

  //We're not online!
  if(!online){
    console.log(dbName, username, pin );
  }
  //we're online!
  else {
    var remoteDb = new PouchDB('https://bc1e4819-c782-4aad-8525-2e2340011ce7-bluemix.cloudantnosqldb.appdomain.cloud/canaanf/', {skip_setup: true});
    
    var ajaxOpts = {
      ajax: {
        headers: {
          Authorization: 'Basic ' + window.btoa(username+':'+pwd)
        }
      }
    };


    remoteDb.logIn(username, pwd, ajaxOpts).then(function (batman) {
      console.log("I'm Batman.", batman);

      return remoteDb.allDocs();

    }).then(function(docs){

      syncHandler = db.sync(remoteDb, {
        live: true,
        retry: true
      }).on('change', function (change) {
        console.log('Synced some stuff');
        // yo, something changed!
      }).on('paused', function (info) {
        // replication was paused, usually because of a lost connection
      }).on('active', function (info) {
        // replication was resumed
      }).on('error', function (err) {
        // totally unhandled error (shouldn't happen)
      });

      console.log(docs);
    });

    console.log(dbName, username, pwd );

  }*/
}

function dbLogout(){
  if(!confirmWhenEditing()){
    setLogoutState();
    db.close().then(function () {
      console.log('closed db');
    });
  }

  /*

  syncHandler.on('complete', function (info) {
    // replication was canceled!
  });

  syncHandler.cancel(); // <-- this cancels it

  */
}

function loadRecentSongs(days=1000, number=15){
  db.changes({
    include_docs: true,
    startkey: 's-',
    endkey: 's-\ufff0',
    since: 0,
    filter: function (doc) {
      return (doc.edited > (new Date().getTime() - days*24*60*60*1000))*!doc._id.includes('sb');
    }
  }).then(function(result){
    result.results.sort(function(a, b){
      if(a.doc){
        if(a.doc.edited > b.doc.edited) { return -1; }
        if(a.doc.edited < b.doc.edited) { return 1; }
        return 0;
      }
      else {
        return 0;
      }
    });
    let songs = result.results.slice(0, number);
    let ul_list = '', date_hour, old_date_hour;
    for(rec_song of songs) {
      old_date_hour = date_hour;
      date_hour = new Date(rec_song.doc.edited).toLocaleTimeString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit'});
      if(date_hour != old_date_hour){
        ul_list += `<div style="margin-top: 1rem; font-weight: bold;">${date_hour}</div>`
      }
      ul_list += `<li><a class="link" href="#sb-allSongs&${rec_song.doc._id}">${rec_song.doc.title}</a></li>`
    }
    $('.updatedSongs .list').html(ul_list);
  }).catch(function(err){
    console.log(err);
  });
}

function initializeSongbooksList(){
  db.allDocs({
    include_docs: true,
    startkey: 'sb-',
    endkey: 'sb-\ufff0',
  }).then(function(result){
    //first delete all songbooks in list
    if(window.songbooks_list != undefined){
      window.songbooks_list.clear();
    }
    //then add and update the new ones
    function buildSongbooksList(songbooks) {
      let user_sb_favs = window.user.fav_sbs;
      var options = {    
        valueNames: [
          { data: ['songbook-id'] },
          { data: ['songbook-rev'] },
          { data: ['songbook-title'] },
          { data: ['user-fav'] },
          //{ data: ['songbook-authors'] },
          //{ data: ['songbook-categories'] },
          //{ data: ['songbooks-songs'] },
          //{ data: ['songbook-copyright'] },
          { name: 'link', attr: 'href'},
          'name'
        ],
        item: 'songbook-item-template'
      };
      var values = [{'songbook-id': 'sb-allSongs',
                     'songbook-rev': 'n/a',
                     'songbook-title': 't:All Songs',
                     'user-fav': 'false',
                     'link': '#sb-allSongs',
                     'name': 'All Songs'},/*];
                     console.log(window.user.fav_songs.length);
      if(window.user.fav_songs.length > 0){
        values.push(*/{'songbook-id': 'sb-favoriteSongs',
                     'songbook-rev': 'n/a',
                     'songbook-title': 't:Favorite Songs',
                     'user-fav': 'false',
                     'link': '#sb-favoriteSongs',
                     'name': 'Favorite Songs'}];//);
      //}
      songbooks.map(function(row) {
        if(window.songbooks_list != undefined){
          var songbookIdInList = window.songbooks_list.get('songbook-id',row.doc._id);
          if(songbookIdInList.length > 0){
            // we need to update if the revision is different.
            var songbookRevInList = window.songbooks_list.get('songbook-rev', row.doc._rev);
            if(songbookRevInList < 1){
              let sb_vals = mapSongbookRowToValue(row);
              sb_vals['user-fav'] = (user_sb_favs.indexOf(row.doc._id) == -1 ? 'false' : 'true');
              songbookIdInList[0].values(sb_vals);
            }
            return
          }
        }
        let sb_vals = mapSongbookRowToValue(row); 
        sb_vals['user-fav'] = (user_sb_favs.indexOf(row.doc._id) == -1 ? 'false' : 'true');
        values.push(sb_vals);
      });
      //Creates list.min.js list for viewing all the songbooks
      window.songbooks_list = new List('songbooks', options, values);
      window.songbooks_list.sort('user-fav', {order: 'desc', sortFunction: sortFavSongbooks});
      bindSearchToList(window.songbooks_list, '#songbooks');
      return 
    }
    buildSongbooksList(result.rows);
  }).catch(function(err){
    console.log(err);
  });
}
function saveSong(song_id, song_html=$('#song song'), change_url=true) {
  return new Promise(function(resolve, reject) {
    var new_song = false;
    function loadSongContent(song) {
      if(song._rev != undefined) {
        song._rev       = song_html.attr('data-rev'); //need a _rev if updating a document
      }
      var stitle = song_html.find('stitle').text().trim();
      if (stitle == "" || stitle == undefined){
        stitle = "New Song";
      }
      let regex = /(https?:\/\/)?(?:www\.)?(youtu(?:\.be\/([-\w]+)|be\.com\/watch\?v=([-\w]+)))\w/g;
      song.title        = stitle;
      song.authors      = song_html.find('authors').text().replace(/\|/g,',').split(',').map(Function.prototype.call, String.prototype.trim);
      song.scripture_ref= song_html.find('scripture_ref').text().split(',').map(Function.prototype.call, String.prototype.trim);
      song.introduction = song_html.find('introduction').text();
      song.key          = song_html.find('key').text();
      song.categories   = song_html.find('categories').text().split(',').map(Function.prototype.call, String.prototype.trim);
      song.cclis        = song_html.find('cclis').text();
      song.yt           = (regex.test(song_html.find('line').text()) ? song_html.find('line').text().match(regex).length : '');
      song.chords       = (song_html.find('c').length > 0 ? 'chords' : '');

      if(song.cclis & isNaN(song.cclis)){
        song.cclis = 'on';
      }
      //Compile Song Content, a list of lists.  Chunks and lines
      var chunks = [];
      song_html.find('chunk').each(function(){
        var lines = [];
        $(this).children().each(function(){ //add line contents
          if($(this).html().trim().length != 0) {
            lines.push($(this).html().replace(/\n/g, ""));
          }
        });
        chunks.push([{'type': $(this).attr('type').toLowerCase()}, lines]);
      });
      song.content      = chunks;
      song.copyright    = song_html.find('copyright').text();

  //Put together Search field.
      let punctuation = /[^a-zA-Z0-9\s:-]/g;
      let duplicateWhitespace = /\s{2,}/g;

      function formatArray(array, letter){
        return (array != '' ? array.join(' '+letter+':') : '!'+letter).replace(duplicateWhitespace, ' ');
      }
      function formatText(text, letter){
        return (text != '' ? text : '!'+letter).replace(duplicateWhitespace, ' ');
      }
      function formatNumber(number, letter){
        return (number != '' ? letter + number : '!'+letter).replace(duplicateWhitespace, ' ');
      }
      function formatSongContent(content){
        var song_content = '';

        var i, j;
        for (i = 0; i < content.length; i++) {
          //we are ignoring comments for now
          if(content[i][0].type != 'comment') {
            for (j = 0; j < content[i][1].length; j++ ) {
              let new_line = escapeRegExp(
                remove_chords(content[i][1][j])
                .replace(duplicateWhitespace,' ')
                .replace(punctuation,'')
                .trim() + '\n'
              );
              if(song_content.search(new_line) === -1) {
                //this content is not in the search, add it!
                song_content += new_line;
              }
            }
          }
        }
        return song_content;
      }
      song.search =  't:' + song.title + '\0'
                   + 'a:' + formatArray(song.authors, 'a') + '\0'
                   + 's:' + formatArray(song.scripture_ref, 's') + '\0'
                   + 'i:' + formatText(song.introduction, 'i') + '\0'
                   + 'k:' + formatText(song.key, 'k') + '\0'
                   + 'c:' + formatArray(song.categories, 'c') + '\0'
                   + 'cp:' + formatText(song.copyright, 'cp') + '\0'
                   + 'yt:' + formatNumber(song.yt, 'yt') + '\0'
                   + 'cclis:' + formatNumber(song.cclis, 'cclis') + '\0'
                   + 'chords:' + formatText(song.chords, 'chords') + '\0'
                   + formatSongContent(song.content); + '\0'

      console.log(song)

      db.put(song, function callback(err, result) {
        if (!err) {
          console.log('saved: ', song.title);
        }
      }).then(function(){
        if(change_url){
          window.location.hash = '#'+window.songbook._id+'&'+song._id;
        }
        resolve(song._id);
      }).catch(function (err) {
        //I think we can get rid of this import hack now that we're not changing song_id
        if(new_song){
          song._id += Math.random().toString(36).substring(7).substring(0,2);  
          console.log(song._id);
          db.put(song, function callback(err, result){
            if (!err) {
              console.log('saved song really quickly! ', song.title);
            }
          });
        }
        console.log(err, song.title);
        resolve(song._id);
      });
    }
    //we've got a new song folks!
    if(song_id == 's-new-song') {
      new_song = true;
      let time = new Date().getTime();
      song_id = 's-' + time;
      let song = {_id: song_id, added: time, addedBy: window.user.name, edited: time, editedBy: window.user.name};
      loadSongContent(song);
      addSongToSongbook(song._id);
    }
    //we've got a non standard songurl, let's clean it up.
    else if(!song_id.startsWith('s-')){
      let time = new Date().getTime();
      song_id = 's-' + song_id;
      let song = {_id: song_id, added: time, addedBy: window.user.name, edited: time, editedBy: window.user.name};
      loadSongContent(song);
    }
    else {  //existing song hopefully - need to make robust
      db.get(song_id).then(function(song){
        song.edited = new Date().getTime();
        song.editedBy = window.user.name;
        loadSongContent(song);
      }).catch(function (err) {
        console.log(err);
        resolve(song._id);
      });  
    }
  });
}

function loadSong(song_id) {
  return new Promise(function(resolve, reject) {
    function createSongHtml(song, deleted = false) {
      window.song = song;
      if(deleted) {
        $('#song').addClass('deleted');
      }
      else {
        $('#song').removeClass('deleted');
      }
      var song_html = '<song data-rev="' + song._rev + '" data-id="' + song._id + '" data-user-fav="'+(window.user.fav_songs.indexOf(song._id) > -1 ? 'true' : 'false')+'">' + 
        '<stitle><a data-song class="title_link">' + song.title + '</a><span onclick="event.stopPropagation(); toggleFavSong($(this).closest(\'song\').attr(\'data-id\'))"></span><info style="margin-left: .7rem;" onclick="event.stopPropagation(); loadInfo();"></info></stitle>' +  
        '<authors><author>' + song.authors.join('</author>, <author>') + '</author></authors>' + 
        '<scripture_ref><scrip_ref>' + song.scripture_ref.join('</scrip_ref>, <scrip_ref>') + '</scrip_ref></scripture_ref>' + 
        '<introduction>' + song.introduction + '</introduction>' + 
        '<key>' + song.key + '</key>' + 
        '<categories><cat>' + song.categories.sort().join('</cat>, <cat>') + '</cat></categories>' + 
        '<cclis>' + (song.cclis != false ? 'CCLIS' + (!isNaN(song.cclis) ? ': '+song.cclis: '') : '') + '</cclis>';
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
      let regex = /(https?:\/\/)?(?:www\.)?(youtu(?:\.be\/([-\w]+)|be\.com\/watch\?v=([-\w]+)))\w/g;
      //add hrefs to comments
      $('song chunk[type="comment"]').each(function(){
        $(this).html($(this).html().replace(/(((http|https|ftp):\/\/)*[\w?=&.\/-;#~%-]+\.[\w?=&.\/-;#~%-]+(?![\w\s?&.\/;#~%"=-]*>))/g, '<a href="$1" target="_blank">$1</a> '));
      });
      //set youtube_links
      ($("song line").text().match(regex) != null ? window.youtube_links = [...$("song line").text().match(regex)] : window.youtube_links = []);
      if(window.youtube_links.length > 0) {
        $('#song key').before('<button class="btn" style="padding: 5px 8px; margin-top: 0; background-color:var(--highlight-color);" onclick="loadSongPlayer();">▶</button>')
      }
      resolve("song_loaded");

      $('#song key').transpose();
      if(document.getElementById('dialog').style.display=="block" && document.getElementById('dialog').getAttribute('data-use')=="info") {loadInfo()}
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
        //Let's load up a deleted song.
        if(err.reason == 'deleted'){
          db.get(song_id, {revs: true, open_revs: "all"})
          .then(function(result){
            db.get(song_id,{rev:(result[0].ok._revisions.start - 1)+'-'+result[0].ok._revisions.ids[1]})
            .then(function(song){
              createSongHtml(song, true);
            });
          });
        }
        else {
          console.log(err);
          reject('got an error!');
        }
        //should load the song and explain what's up.
      });
    }  
  });
}
async function deleteSong(song_id) {
  let sbs = await songInSongbooks(song_id);
  if (confirm("Are you sure you want to delete song:\n -" + window.song.title + "?\n\nIt is in the following songbooks:\n -" + sbs.map(sb => sb.doc.title).join('\n -') )) {
    db.get(window.song._id).then(function (doc) {
      return db.remove(doc);
    }).then(function(){
      window.location.hash='#'+window.songbook._id;
    });
    console.log('deleted: '+window.song.title);
    return false
  } else { //we aren't leaving 
    return true
  }
}
function deleteSongbook(songbook_id) {
  console.log(songbook_id);
  if (confirm("Are you sure you want to delete songbook:\n\n" + window.songbook.title + "?")) {
    db.get(window.songbook._id).then(function (doc) {
      return db.remove(doc);
    }).then(function(){
      initializeSongbooksList();
      window.location.hash='#songbooks'
    });
    console.log('deleted: '+window.songbook._id);
    return false
  } else { //we aren't leaving 
    return true
  }
}

function saveSongbook(songbook_id, songbook_html=$('#songbook_content'), change_url=true) {
  if($('#songbook_title').text().trim() == ''){
    alert('Please add a title before you save');
    return
  }
  else{
    window.editing=false;
  }
  var new_songbook = false;
  return new Promise(function(resolve, reject) {
    function loadSongbookContent(songbook) {
      if(songbook._rev != undefined) {
        songbook._rev = songbook_html.find('#songbook_title').attr('data-rev'); //need a _rev if updating a document
      }
      if (songbook_html.find('#songbook_title').length > 0){
        songbook.title  = songbook_html.find('#songbook_title').text().trim();
        (songbook_html.hasClass('showStatus') ? songbook.showStatus = true : songbook.showStatus = false);
        (songbook_html.hasClass('showComments') ? songbook.showComments = true : songbook.showComments = false);
      }
      else{
        songbook.title = songbook_html.find('title').text().trim(); //V1 Import
      }
      if (songbook.title == "" || songbook.title == undefined){
        songbook.title = "New Songbook";
      }

      //Compile Songbook songrefs, a list of lists
      var songs = [];
      if(songbook_html.find('.list li').length > 0){
        songbook_html.find('.list li').each(function(){
          let song_id = $(this).attr('data-song-id');
          if(song_id == 'section') {
            songs.push({id: song_id, title: $(this).children("a").text()});
          }
          else{
            songs.push({id: song_id, status: $(this).attr('data-song-status'), key: 'Am'});
          }
        });
      }
      else {  //Saving a V1 songref
        songbook_html.find('songref, section').each(function(){
          if(this.nodeName.toLowerCase() == "section"){
            songs.push({id: "section", title: $(this).attr('title')});
          }
          else {
            songs.push({id: $(this).attr('ref'), status: $(this).attr('status'), key: 'Am'});
            if($(this).attr('status') != 'n'){
              songbook.showStatus = true;
            }
          }
        });
      }
      songbook.songrefs = songs;

      db.put(songbook, function callback(err, result) {
        if (!err) {
          window.songbook = songbook;
          console.log('saved: '+ songbook.title);
        }
        else {
          console.log(err);
        }
      }).then(function(){
        if(change_url){
          window.location.hash = '#'+window.songbook._id;
          $('.edit_buttons').remove();
          initializeSongbooksList();
        }
        resolve('all good!');
      }).catch(function (err) {
        console.log(err);
        if(new_songbook){
          songbook._id += Math.random().toString(36).substring(7).substring(0,2);  
          console.log(songbook._id);
          db.put(songbook, function callback(err, result){
            if (!err) {
              console.log('saved songbook really quickly! ', songbook.title);
            }
          });
        }
        resolve('not all good!');
      });
    }
    //we've got a new songbook folks!
    if(songbook_id == 'sb-new-songbook') {
      new_songbook = true;
      let time = new Date().getTime();
      songbook_id = 'sb-' + time;
      var songbook = {_id: songbook_id, added: time, addedBy: window.user.name, edited: time, editedBy: window.user.name};
      loadSongbookContent(songbook);
    }
    //we've got a non-standard songbook_id
    else if(!songbook_id.startsWith('sb-')){
      let time = new Date().getTime();
      songbook_id = 'sb-' + songbook_id;
      var songbook = {_id: songbook_id, added: time, addedBy: window.user.name, edited: time, editedBy: window.user.name};
      loadSongbookContent(songbook); 
    }
    else {  //existing songbook hopefully - need to make robust 
      db.get(songbook_id).then(function(songbook){
        songbook.edited = new Date().getTime();
        songbook.editedBy = window.user.name;
        loadSongbookContent(songbook);
      }).catch(function (err) {
        console.log(err);
        resolve('not all good!');
      });  
    }
  });
}

function loadSongbook(songbook_id) {
  var dateBefore = new Date();

  return new Promise(function(resolve, reject) {
    if(songbook_id == window.songbook._id){
      resolve('songbook already loaded');
    }
    else if(songbook_id == undefined || songbook_id == 'sb-allSongs' || songbook_id == 'sb-favoriteSongs') {
      let options;
      if(songbook_id == 'sb-favoriteSongs') {
        window.songbook.title = "Favorite Songs";
        options = {
          include_docs: true,
          keys: window.user.fav_songs, //we need error handling for missing ids
        }
      }
      else {
        songbook_id = 'sb-allSongs';
        window.songbook.title = "All Songs";
        options = {
          include_docs: true,
          startkey: 's-',
          endkey: 's-\ufff0',
        }  
      }
      window.songbook._id = songbook_id;  
      window.songbook._rev = '';
       
      db.allDocs(options).then(function(result){
        var sb_song_ids = result.rows.map(function (row) {
          return row.id
        });

        //first delete any songs no longer in the songbook
        if(window.songbook_list != undefined){
          /*window.songbook_list.items.forEach(function(old_song){
            if(!sb_song_ids.includes(old_song.values()['song-id'])){
              window.songbook_list.remove('song-id',old_song.values()['song-id']);
            }
          });*/
          //^may be faster than the full wipe, but I need to figure out how to update urls
          window.songbook_list.clear();
        }
        //Sort then add and update the new ones
        result.rows.sort(function(a, b){
          if(a.doc){
            if(a.doc.title < b.doc.title) { return -1; }
            if(a.doc.title > b.doc.title) { return 1; }
            return 0;
          }
          else {
            return 0;
          }
        });
        window.songbook.songrefs = result.rows.map(function (row) {
          return {id: row.id, status: 'n'};
        });
        buildSongbookList(result.rows);
        $('#songbook_title').removeAttr('contenteditable');
        $('#songbook_content .search').parent().removeAttr('disabled');
        $('#songbook_content').removeClass('showStatus'); 
        $('#songbook_content').removeClass('showComments'); 
        $('.disabled-hidden').removeClass('disabled-hidden');
        $('#songbook_title').html('<i>'+window.songbook.title+'</i>').removeAttr('data-rev').attr('data-songbook-id', songbook_id);
        $('#songList .float-menu').addClass('special');
        var dateAfter = new Date();
        console.log(dateAfter-dateBefore);
        resolve('loaded songbook');
      }).catch(function(err){
        console.log(err);
      });
    }
    else if(songbook_id === 'sb-new-songbook'){
      if(window.songbook_list != undefined) {
        window.songbook_list.clear();
      }
      $('#songbook_title').removeAttr('contenteditable');
      $('#songbook_content .search').parent().removeAttr('disabled');
      $('#songbook_content').removeClass('showStatus'); 
      $('#songbook_content').removeClass('showComments'); 
      $('.disabled-hidden').removeClass('disabled-hidden');
      $('#songbook_title').text('').removeAttr('data-rev');
      resolve('loaded songbook');
    }
    else {
      db.get(songbook_id).then(function(result){
        var sb_song_ids = result.songrefs.map(function (row) {
          return row.id
        });
        if(window.songbook_list != undefined){
          window.songbook_list.clear();
        }
        db.allDocs({
          include_docs: true,
          keys: sb_song_ids, //we need error handling for missing ids
        }).then(function (song_ref_result) {
          let songbook_build = [];
          for(item of result.songrefs){
            if(item.id=="section"){
              songbook_build.push(item);
            }
            else {
              let to_push = song_ref_result.rows.filter(obj => obj.id === item.id)[0];
              to_push.status = item.status;
              songbook_build.push(to_push);
            }
          }
          buildSongbookList(songbook_build);
          //Load comments
          if(window.songbook.showComments && location.hash.search('edit') == -1){
            loadSongbookComments();
          }
        }).catch(function (err) {
          console.log(err);
        });
        window.songbook = result;
        $('#songbook_title').removeAttr('contenteditable');
        $('#songbook_content .search').parent().removeAttr('disabled');
        $('.disabled-hidden').removeClass('disabled-hidden');
        (window.songbook.showStatus ? $('#songbook_content').addClass('showStatus') : $('#songbook_content').removeClass('showStatus'));
        (window.songbook.showComments ? $('#songbook_content').addClass('showComments') : $('#songbook_content').removeClass('showComments'));
        $('#songbook_title').html(result.title).attr('data-rev',result._rev).attr('data-songbook-id',result._id).nextAll().remove();
        $('#songbook_title').parent().append('<span onclick="event.stopPropagation(); toggleFavSongbook(\''+result._id+'\')"></span>'+
          '<info style="margin-left: .7rem;" onclick="event.stopPropagation(); loadInfo(false);"></info>');
        if(document.getElementById('dialog').style.display=="block" && !parseHash('s-') && document.getElementById('dialog').getAttribute('data-use')=="info"){  //prevents info view flicker when you click on songbooks in song info view.
          loadInfo(false);
        }
        var dateAfter = new Date();
        console.log(dateAfter-dateBefore);
        if(window.user.fav_sbs.indexOf(window.songbook._id) > -1) {
          $('#songbook_title').attr('data-user-fav', 'true');
        }
        else {
          $('#songbook_title').attr('data-user-fav', 'false'); 
        }
        resolve('loaded songbook');
      }).catch(function(err){
        console.log(err);
      });
    }
    if((songbook_id != 'sb-allSongs') && (songbook_id != 'sb-favoriteSongs')){
      $('#songList .float-menu').removeClass('special');
    }
  });
}

function loadSongbookComments() {
  let options = {
    include_docs: true,
    startkey: 'c_'+window.songbook._id,
    endkey: 'c_'+window.songbook._id+'\ufff0',
  }  
  db.allDocs(options).then(function(result){
    let songs_with_comments = result.rows.map(item => item.doc);
    $('#songbook_content .list li:not([data-song-id="section"])').append('<div class="commentsContainer"><div class="comments"></div><textarea class="comment" style="width:100%"></textarea><button class="btn" onclick="addComment(this)">Add comment</button></div>');
    $('#songbook_content .list li:not([data-song-id="section"]) a').after('<button class="toggle_comment" onclick="$(this).next(\'.commentsContainer\').toggle();">💬</button>')
    for(song of songs_with_comments) {
      let song_id = song._id.match(/s-.*/g)[0];
      let comments = [];
      for(comment of song.comments){
        comments.push(`<div><b>${comment.user} </b>${new Date(comment.date).toLocaleTimeString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}<pre>${comment.comment}</pre></div>`);
      }
      $('li[data-song-id="'+song_id+'"] .comments').append(comments.join(''));
      $('li[data-song-id="'+song_id+'"] .toggle_comment').attr('data-comment-number', comments.length);
    }
  }).catch(function(err){
    console.log(err);
  });
}
function addComment(element) {
  let commentText = $(element).prev('textarea').val().trim();
  if(commentText == ""){
    alert('Please add some text! :)');
    return;
  }
  else {
    let comment_object = {date: new Date().getTime(), user: window.user._id, comment: commentText};
    let comment_id = 'c_'+window.songbook._id+'_'+$(element).closest('li').attr('data-song-id');
    db.get(comment_id).then(function(comment){
      comment.comments.push(comment_object);
      db.put(comment).then(function(result){
        if(result.ok != true) {
          console.log(result);
        }
      });
      $(element).prev('textarea').val('');
    }).catch(function(err){
      if(err.status = 404){
        db.put({_id: comment_id, comments: [comment_object]}).then(function(result){
          $(element).prev('textarea').val('');
        }).catch(function(err){
          console.log(err);
        });
      }else{
        console.log(err);
      }
    });
  }
}

function addSongToSongbook(song_id, songbook_id=window.songbook._id) {
  if(songbook_id == undefined) {
    return
  }

  if(songbook_id == 'sb-favoriteSongs') {
    toggleFavSong(song_id);
  }
  else if(songbook_id == 'sb-allSongs') {
    // do nothing because the db.changes function should update the allSongs songbook
  }
  else {
    db.get(songbook_id).then(function(songbook){
      songbook.songrefs.push({
        "id": song_id,
        "status":"n",
        "key":"Am",
        "comments":[
          "Hi"
        ]
      });
      db.put(songbook).then(function(result) {
        console.log('Successfully added song to '+songbook.title+'!');
      });
    }).catch(function(err){
      console.log(err);
    });
  }
}

function loadRawDbObject(rawDb_id, element_drop, onclick) {
  console.log(rawDb_id);
  if(rawDb_id != 'categories' && rawDb_id != window.user._id){
    alert('yo! Stop it!');
    return;
  }
  db.get(rawDb_id).then(function(json_object){
    const keys = Object.keys(json_object);

    let html_string = '<div id="rawObRoot" data-id="'+json_object['_id']+'" data-rev="'+json_object['_rev']+'"><h3>Editing: '+json_object['_id']+'</h3></div>';

    keys.forEach((key, index) => {
      if(key != '_id' && key != '_rev'){
        let key_content;
        let key_content_type = typeof(json_object[key]);
        //Array in the key, then
        if(Array.isArray(json_object[key])) {
          key_content = json_object[key].join('\n');
          key_content_type = 'array';
        }
        else if(key_content_type == "string" || key_content_type == "number") {
          key_content = json_object[key];
        }
        html_string += `<fieldset class="key" data-name="${key}"><legend>${key}</legend><pre class="key_content" data-content-type="${key_content_type}">${key_content}</pre></fieldset>`;
      }
    });
    html_string += '<button class="btn" onclick="'+onclick+'" style="background-color: var(--background-color);">Cancel</button><button class="btn" onclick="saveRawDbObject($(\'#'+element_drop[0].id+'\'));" style="background-color: var(--background-color);">Save</button>'

    element_drop.html(html_string);
    $('.key_content').toTextarea({
    allowHTML: false,//allow HTML formatting with CTRL+b, CTRL+i, etc.
    allowImg: false,//allow drag and drop images
    doubleEnter: false,//have double enter create a second field
    singleLine: false,//make a single line so it will only expand horizontally
    pastePlainText: true,//paste text without styling as source
    placeholder: false//a placeholder when no text is entered. This can also be set by a placeholder="..." or data-placeholder="..." attribute
  });
  }).catch(function (err) {
    console.log(err);
    reject('got an error!');
  });
}
function saveRawDbObject(html) {
  let json_object = {};
  json_object._id = html.find('#rawObRoot').attr('data-id');
  json_object._rev = html.find('#rawObRoot').attr('data-rev');

  if(json_object._id != 'categories' && json_object._id != window.user._id){
    alert('yo! Stop it!');
    return;
  }

  let keys = html.find('.key')
  
  for(i = 0; i < keys.length; i++){
    let key_content = $(keys[i]).find('.key_content').text();
    let key_content_type = $(keys[i]).find('.key_content').attr('data-content-type');
    console.log(key_content_type);
    if(key_content_type == 'array'){
      key_content = key_content.split('\n');
    }
    json_object[keys[i].getAttribute('data-name')] = key_content;
  }

  db.put(json_object).then(function(result) {
    console.log('Successfully updated: ', result);
  }).catch(function(result){
    console.log("Error - couldn't make it work", result);
  });
  html.html('');
}

function saveExportDefault() {
  let opts = $('#export_form').serializeArray();
  $('#user_export_pref').attr('value',JSON.stringify(opts));
  $('#format').trigger('change');
  let cfg = {
    _id: 'cfg-'+window.exportObject._id+window.user._id, //must keep in sync with lib.js
    title: 'Default: '+window.user.name,
    cfg: opts
  }
  db.get(cfg._id).then(function(_doc) {
    console.log('updating');
    cfg._rev = _doc._rev;
    return db.put(cfg);
  }).catch( function (error) {
    console.log('adding');
    $('#format').html("<option id='user_export_pref' value='"+JSON.stringify(cfg.cfg)+"'>"+cfg.title+"</option>" + $('#format').html());
    return db.put(cfg);
  }).then(function(info){
    console.log("id of record: " + info.id);
  });
}
function toggleFavSongbook(id){
  db.get(window.user._id).then(function(user){
    let i = -1;
    try {
      i = user.fav_sbs.indexOf(id);
    }
    catch {
      //fav_sbs doesn't exist
      user.fav_sbs = [];
    }
    if(i == -1) {
      user.fav_sbs.push(id);
    }
    else {
      user.fav_sbs.splice(i,1);
    }
    db.put(user).then(function(result) {
      console.log('Successfully updated fav songbooks!');
    });
  }).catch(function(err){
    console.log(err);
  });
}
function toggleFavSong(id) {
  db.get(window.user._id).then(function(user){
    let i = -1;
    try {
      i = user.fav_songs.indexOf(id);
    }
    catch {
      //fav_sbs doesn't exist
      user.fav_songs = [];
    }
    if(i == -1) {
      user.fav_songs.push(id);
    }
    else {
      user.fav_songs.splice(i,1);
    }
    db.put(user).then(function(result) {
      console.log('Successfully updated fav songs!');
    });
  }).catch(function(err){
    console.log(err);
  });
}

