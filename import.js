function startHandlingFiles(){
  alert('hi2');
  try {
    alert('hi');
    async function handleFile(f) {
      let result = '';

      if(f.name.endsWith('zip')) {
        alert('name ends with zip');
        result = await importSongV1(f);
      }
      else if(f.name.endsWith('json')){
        alert('name ends with json');
        result = await importSongV2(f);
      }
      else {
        alert('not recognized file');
        console.log('not a recognized file');
      }
      return result;
    }
    alert('hi3');
    var files = document.getElementById('file').files;  // we can have multiple files selected.
    alert('got files list')
    for (var i = 0; i < files.length; i++) {
      alert('each file')
      handleFile(files[i]);
    }
  } catch(err) {
    alert(JSON.stringify(err));
  }
}
function updateProgress(){
  let i = window.import;
  i.progressBar.style.background = 'linear-gradient(to right, '+
    'var(--song-color) '     +i.n_songs/i.file_count*100+'%,'+
    'var(--edit-color) '     +i.n_songs/i.file_count*100+'%,'+
    'var(--edit-color) '     +(i.n_songs+i.n_songs2)/i.file_count*100+'%,'+
    'var(--songList-color) ' +(i.n_songs+i.n_songs2)/i.file_count*100+'%,'+
    'var(--songList-color) ' +(i.n_songs+i.n_songs2+i.n_songbooks)/i.file_count*100+'%,'+
    'var(--edit-color) '     +(i.n_songs+i.n_songs2+i.n_songbooks)/i.file_count*100+'%,'+
    'var(--edit-color) '     +(i.n_songs+i.n_songs2+i.n_songbooks+i.n_songbooks2)/i.file_count*100+'%,'+
    'var(--songbookList-color) ' +(i.n_songs+i.n_songs2+i.n_songbooks+i.n_songbooks2)/i.file_count*100+'%,'+
    'var(--songbookList-color) ' +(i.n_songs+i.n_songs2+i.n_songbooks+i.n_songbooks2+i.n_other)/i.file_count*100+'%,'+
    'var(--edit-color) 0)';
  window.import = i;
}
async function importSongV1(f){
  alert("we're in the V1 import function")
  changeHandler.cancel();
  alert("canceled changeHandler");
  var $result = $("#result");
  // remove content
  $result.html("");
  var $title = $("<h4>", {
    text : f.name
  });
  $result.append($title);

  var dateBefore = new Date();

  JSZip.loadAsync(f)
  .then(function(zip) {
    alert("inside JSZIP");
    var dateAfter = new Date();
    window.import= {};
    window.import.file_count = Object.keys(zip.files).length;

    $title.append($("<span>", {
      "class": "small",
      text:" (" + window.import.file_count + " files imported in " + (dateAfter - dateBefore) + "ms)"
    }));
    let progress =  "<div id='progress_bar' style='width:min(100%, 400px); height: 1rem; border: 1px solid black; background: linear-gradient(to right, white 0);'>"+
                    "</div>";
    $title.after($("<div id='progress_text' style='width:min(100%, 400px); max-width: 80vw; font-size:small; white-space:nowrap; overflow: hidden;'></div>"));
    $title.after($(progress));
    //Import files
    window.import.n_songs = 0;
    window.import.n_songs2 = 0;
    window.import.n_songbooks = 0;
    window.import.n_songbooks2 = 0;
    window.import.n_other = 0;

    song_map = {};
    promise_list = [];
    window.import.progressBar = document.getElementById('progress_bar');
    window.import.progressText = document.getElementById('progress_text');

    let num_songs = zip.folder('songs/').length;

    zip.folder('songs/').forEach(function (relativePath, zipEntry) {
      //For each zip entry save it using it's original song name
      //What do we do if it's already in the app?
        //ignore it, but let me know - not yet done.
      promise_list.push(
        new Promise(function(resolve, reject) {
          zipEntry.async("string").then(function (song) {
            if(zipEntry.name.match(".*\.(song|son|hym|so1|rnd|poe)$")){
              song = song.replace(/author\>/gi, 'authors\>'); //we pluralized author in new version
              song = song.replace(/\<[^>]+?\/\>/gi, ''); //empty tags...
              song = song.replace(/\|/gi, ',');  //Replace all the pipes with ,'s
              
              Promise.resolve(saveSong('i'+CRC32.str(zipEntry.name.replace('songs/',''),0), $(song), false))
              .then(function(results){ //results is the song._id
                window.import.n_songs ++;
                song_map[relativePath] = results;
                updateProgress();
                window.import.progressText.innerHTML = zipEntry.name;
                resolve('done');
              });
            }
            else {
              console.log(zipEntry.name + ' is not a song!');
              window.import.n_other++;
              updateProgress();
              window.import.progressText.innerHTML = zipEntry.name;
              resolve('done');
            }
          })
        })
      );
    });

    var songbook_promise_list = [];
    var songbook_with_comments = [];
    Promise.all(promise_list).then(function(result){
      console.log(Object.keys(song_map).length + ' songs loaded');
      //Import songbooks
      zip.folder('songbooks/').forEach(function (relativePath, zipEntry) {
        songbook_promise_list.push(
          new Promise(function(resolve, reject) {
            zipEntry.async("string").then(function (songbook) {
              if(zipEntry.name.match(".*\.(xml)$")){
                for (const [key, value] of Object.entries(song_map)) {
                  songbook = songbook.replace('songs/'+key, value);
                }

                Promise.resolve(saveSongbook('i'+CRC32.str(zipEntry.name.replace('songbooks/',''),0), $(songbook), false))
                .then(function(results){ //results is the song._id
                  window.import.n_songbooks++;
                  updateProgress();
                  window.import.progressText.innerHTML = zipEntry.name;
                  resolve('done');
                });
              }
              //Comments
              /*else if(zipEntry.name.endsWith('.comment') && songbook != ""){
                comments_list = [];
                let songs = songbook.split('\n');
                for(song of songs){
                  if(song.trim().length < 10){ //too short to be anything useful
                    continue
                  }
                  let song_path = song.match(/'(.*?)'/)[0].replace("'songs/","").replace("'","");
                  //{id: c_songbook.song , comments: [{date: , user: , comment: }]}
                  let id = 'c_'+'sb-i'+CRC32.str(zipEntry.name.replace('songbooks/','').replace('.comment','.xml'),0)+'_s-i'+CRC32.str(song_path,0)
                  let comments = song.match(/<div\b(?:|(?:(?!<\/?div).))*<\/div>/g).map(function(comment) {
                    console.log(comment);
                    return {date: new Date(comment.match(/(?<=\()(.*?)(?=\):)/g)[0]).getTime(), user: $(comment).find('b').text(), comment: $(comment).find('pre').text()}
                  });
                  comments_list.push({_id: id, comments: comments});
                }
                db.bulkDocs(comments_list);
                songbook_with_comments.push('sb-i'+CRC32.str(zipEntry.name.replace('songbooks/','').replace('.comment','.xml'),0));
                resolve('done');
              }*/
              else {
                window.import.n_other++;
                updateProgress();
                window.import.progressText.innerHTML = zipEntry.name;
                console.log(zipEntry.name + ' is not a songbook!');
                resolve('done');
              }
            })
          })
        );
      });
      //let's us change things when we're done.
      Promise.all(songbook_promise_list).then(function(result){
        document.getElementById('progress_text').innerHTML = 'All docs imported!';
        for(sb_id of songbook_with_comments){
          db.get(sb_id).then(function(result) {
            result.showComments = true;
            db.put(result).then(function(result){
              console.log(result);
            });
          }).catch(function(err){
            console.log(err);
          });
        }
        initializeSongbooksList();
        dbChanges();
        loadRecentSongs();
      });
    });
  }, function (e) {
    $result.append($("<div>", {
      "class" : "alert alert-danger",
      text : "Error reading " + f.name + ": " + e.message
    }));
    dbChanges();
    loadRecentSongs();
  });
  return 'toga';
}
async function importSongV2(f){
  var $result = $("#result");
  // remove content
  $result.html("");
  var $title = $("<h4>", {
    text : f.name
  });
  $result.append($title);

  let progress =  "<div id='progress_bar' style='width:min(100%, 400px); height: 1rem; border: 1px solid black; background: linear-gradient(to right, white 0);'>"+
                  "</div>";
  $title.after($("<div id='progress_text' style='width:min(100%, 400px); max-width: 80vw; font-size:small; white-space:nowrap; overflow: hidden;'></div>"));
  $title.after($(progress));
  //Import files    
  window.import = {};
  window.import.n_songs = 0;
  window.import.n_songs2 = 0;
  window.import.n_songbooks = 0;
  window.import.n_songbooks2 = 0;
  window.import.n_other = 0;

  window.import.progressBar = document.getElementById('progress_bar');
  window.import.progressText = document.getElementById('progress_text');

  reader = new FileReader();
  reader.readAsText(f);
  
  reader.onloadend = function(){
    let fileObject = JSON.parse(reader.result);
    //if song do song import
    if(fileObject._id.startsWith('s-')){
      console.log('Loaded song: '+fileObject.title);
      importSong(fileObject);
    }
    //else if songbook do process 
    else if(fileObject._id.startsWith('sb-')){
      console.log('Loaded songbook: '+fileObject.title);
      importSongbook(fileObject);
    }
    else {
      console.log("I don't know this file structure...");
    }
  }

  async function importSong(fileObject){
    let song = fileObject;
    window.import.file_count = 1;

    delete song._rev
    //import song
    Promise.resolve(uploadIfNewer(song)).then(function(result){
      console.log('done!', result);
      document.getElementById('progress_text').innerHTML = 'All docs imported!';
    });
  }

  async function importSongbook(fileObject){
    let songs = fileObject.songs.map(song => song.doc);
    window.import.file_count = songs.length + 1;
    //first import the songs   
    let promiseList = [];
    songs.forEach(function(song){
      delete song._rev
      promiseList.push(uploadIfNewer(song));
    });

    //then import the songbook
    let songbook = fileObject;
    delete songbook.songs;
    delete songbook._rev;
    if(songbook._id == 'sb-allSongs'||songbook._id == 'sb-favoriteSongs'){
      songbook._id = 'sb-'+new Date().getTime().toString();
      songbook.title = 'Import '+songbook.title;
    }
    promiseList.push(uploadIfNewer(songbook));
    Promise.all(promiseList).then(function(results){
      console.log('done!', results.length);
      initializeSongbooksList();
      document.getElementById('progress_text').innerHTML = 'All docs imported!';
    });
  }

  function uploadIfNewer(doc){
    return new Promise(function(resolve, reject) {
      let doc_type = 'doc';
      if(doc._id.startsWith('sb-')){
        doc_type = 'songbook';
      }
      else if(doc._id.startsWith('s-')) {
        doc_type = 'song';
      }

      db.put(doc, function callback(err, result) {
        if (!err) {
          console.log('imported: ', doc.title);
          resolve('n_'+doc_type+'s');
          window.import['n_'+doc_type+'s']++;
          updateProgress();
        } 
      }).catch(function (err) {
        console.log('hmmm '+doc_type+' already exists');
        //let's check to see if ours is newer
        db.get(doc._id).then(function(exist_doc){
          if(doc.edited>exist_doc.edited){
            doc._rev = exist_doc._rev;

            console.log('this '+doc_type+' is newer!');
            db.put(doc, function callback(err, result) {
              if (!err) {
                console.log('imported: ', doc.title);
                document.getElementById('progress_text').innerHTML = 'imported: ', doc.title;
                resolve('n_'+doc_type+'s');
                window.import['n_'+doc_type+'s']++;
                updateProgress();
              } 
              else {
                console.log(err);
                resolve('n_other');
                window.import['n_other']++;
                updateProgress();
              }
            });
          }
          else {
            resolve('n_'+doc_type+'s2');
            window.import['n_'+doc_type+'s2']++;
            updateProgress();
            console.log('the existing '+ doc_type + ' is better than yours');
          }
        }).catch(function (err) {
          console.log(err);
          resolve('n_other');
          window.import['n_other']++;
          updateProgress();
        });  
      });
    });
  }
}
