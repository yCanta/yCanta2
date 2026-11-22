function startHandlingFiles(){
  try {
    var files = document.getElementById('file').files;  // we can have multiple files selected.
    for (var i = 0; i < files.length; i++) {
      handleFile(files[i]);
    }
  } catch(err) {
    alert(err);
  }
}
async function handleFile(f) {
  let result = '';
  if(f.name.endsWith('zip')) {
    result = await importSongV1(f);
  }
  else if(f.name.endsWith('json')){
    result = await importSongV2(f);
  }
  else {
    document.getElementById('result').textContent = `"${f.name}" isn't a file yCanta can import: choose a .zip of yCanta 1 songs or a .json file from an export.`;
  }
  return result;
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
  changeHandler.cancel();
  const result = document.getElementById('result');
  // remove content
  result.innerHTML = '';
  const title = document.createElement('h4');
  title.textContent = f.name;
  result.appendChild(title);

  JSZip.loadAsync(f)
  .then(function(zip) {
    window.import= {};
    window.import.file_count = Object.keys(zip.files).length;

    const span = document.createElement('span');
    span.className = 'small';
    span.textContent = ` (${window.import.file_count} files loaded . . . starting import)`;
    title.appendChild(span);
    let progress =  "<div id='progress_bar' style='width:min(100%, 400px); height: 1rem; border: 1px solid black; background: linear-gradient(to right, white 0);'>"+
                    "</div>";
    const progressText = document.createElement('div');
    progressText.id = 'progress_text';
    progressText.style.cssText = 'width:min(100%, 400px); max-width: 80vw; font-size:small; white-space:nowrap; overflow: hidden;';
    title.insertAdjacentElement('afterend', progressText);
    title.insertAdjacentElement('afterend', document.createElement('div')).innerHTML = progress;
    //Import files
    window.import.n_songs = 0;
    window.import.n_songs2 = 0;
    window.import.n_songbooks = 0;
    window.import.n_songbooks2 = 0;
    window.import.n_other = 0;
    window.import.failed = []; // names of songs and songbooks that couldn't be saved
    window.import.skipped = 0; // files that aren't songs or songbooks (folders don't count)
    window.import.commentFiles = 0; // a songbook's comments: not brought in (see below)

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
              
              //parse as HTML like the old $(song) did, so entities like &nbsp; don't break it
              Promise.resolve(saveSong('i'+CRC32.str(zipEntry.name.replace('songs/',''),0), new DOMParser().parseFromString(song, 'text/html').body, false))
              .then(function(results){ //results is the song._id
                window.import.n_songs ++;
                song_map[relativePath] = results;
                updateProgress();
                window.import.progressText.innerHTML = zipEntry.name;
                resolve('done');
              })
              .catch(function(err){ //don't let one bad song stop the whole import
                console.error('Could not import ' + zipEntry.name, err);
                window.import.n_other++;
                window.import.failed.push(zipEntry.name.replace('songs/', ''));
                updateProgress();
                resolve('done');
              });
            }
            else {
              console.log(zipEntry.name + ' is not a song!');
              window.import.n_other++;
              if (!zipEntry.dir) window.import.skipped++;
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

                // Strict XML fails on a BOM, &nbsp; or a bare &; fall back to lenient HTML parsing like the old $(songbook)
                songbook = songbook.replace(/^﻿/, '');
                let songbookDoc = new DOMParser().parseFromString(songbook, 'text/xml');
                if (songbookDoc.querySelector('parsererror')) {
                  songbookDoc = new DOMParser().parseFromString(songbook, 'text/html');
                }
                Promise.resolve(saveSongbook('i'+CRC32.str(zipEntry.name.replace('songbooks/',''),0), songbookDoc, false))
                .then(function(results){ //results is the songbook._id
                  window.import.n_songbooks++;
                  updateProgress();
                  window.import.progressText.innerHTML = zipEntry.name;
                  resolve('done');
                })
                .catch(function(err){ //don't let one bad songbook stop the whole import
                  console.error('Could not import ' + zipEntry.name, err);
                  window.import.n_other++;
                  window.import.failed.push(zipEntry.name.replace('songbooks/', ''));
                  updateProgress();
                  resolve('done');
                });
              }
              //Comments -- CRASHES iOS / SAFARI due to positive look behind.
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
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = comment;
                    return {
                      date: new Date(comment.match(/(?<=\()(.*?)(?=\):)/g)[0]).getTime(),
                      user: tempDiv.querySelector('b').textContent,
                      comment: tempDiv.querySelector('pre').textContent
                    }
                  });
                  comments_list.push({_id: id, comments: comments});
                }
                db.bulkDocs(comments_list);
                songbook_with_comments.push('sb-i'+CRC32.str(zipEntry.name.replace('songbooks/','').replace('.comment','.xml'),0));
                resolve('done');
              }*/
              else {
                window.import.n_other++;
                if (zipEntry.name.endsWith('.comment')) window.import.commentFiles++;
                else if (!zipEntry.dir) window.import.skipped++;
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
        // What happened, as the JSON import says it: what came in, what couldn't be saved, what was left out
        const i = window.import;
        const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
        const lines = [`Imported ${plural(i.n_songs, 'song')} and ${plural(i.n_songbooks, 'songbook')}.`];
        if (i.failed.length) lines.push(`Couldn't save ${plural(i.failed.length, 'file')}: ${i.failed.join(', ')}.`);
        if (i.commentFiles) lines.push(`Comments aren't brought in from a yCanta 1 file (${plural(i.commentFiles, 'songbook')} had them).`);
        if (i.skipped) lines.push(`Left out ${plural(i.skipped, 'file')} that ${i.skipped === 1 ? "isn't a song or songbook" : "aren't songs or songbooks"}.`);
        i.progressText.style.whiteSpace = 'normal';
        i.progressText.textContent = lines.join(' ');
        for(sb_id of songbook_with_comments){
          db.get(sb_id).then(function(result) {
            result.showComments = true;
            return saveWithHistory(result);
          }).then(function(result){
            console.log(result);
          }).catch(function(err){
            reportDbError(err, 'turn on comments for an imported songbook');
          });
        }
        initializeSongbooksList();
        dbChanges();
        loadRecentSongs();
      });
    });
  }, function (e) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger';
    alertDiv.textContent = "Error reading " + f.name + ": " + e.message;
    result.appendChild(alertDiv);
    dbChanges();
    loadRecentSongs();
  });
  return 'toga';
}
async function importSongV2(f){
  changeHandler.cancel();
  const result = document.getElementById('result');
  // remove content
  result.innerHTML = '';
  const title = document.createElement('h4');
  title.textContent = f.name;
  result.appendChild(title);

  let progress =  "<div id='progress_bar' style='width:min(100%, 400px); height: 1rem; border: 1px solid black; background: linear-gradient(to right, white 0);'>"+
                  "</div>";
  const progressText = document.createElement('div');
  progressText.id = 'progress_text';
  progressText.style.cssText = 'width:min(100%, 400px); max-width: 80vw; font-size:small; white-space:nowrap; overflow: hidden;';
  title.insertAdjacentElement('afterend', progressText);
  title.insertAdjacentElement('afterend', document.createElement('div')).innerHTML = progress;
  //Import files    
  window.import = {};
  window.import.n_songs = 0;
  window.import.n_songs2 = 0;
  window.import.n_songbooks = 0;
  window.import.n_songbooks2 = 0;
  window.import.n_other = 0;

  window.import.progressBar = document.getElementById('progress_bar');
  window.import.progressText = document.getElementById('progress_text');

  // A line under the progress bar: what's happening, or what went wrong
  const say = text => { progressText.textContent = text; };
  window.import.comments = 0;
  window.import.commentsSkipped = 0;

  reader = new FileReader();
  reader.onerror = () => say("Couldn't read this file.");
  reader.readAsText(f);

  reader.onloadend = function(){
    if (reader.error) return;
    let fileObject;
    try {
      fileObject = JSON.parse(reader.result);
    } catch (err) {
      return say("This isn't a JSON file yCanta can read. Choose a file from an export's JSON file button.");
    }
    const id = typeof fileObject?._id === 'string' ? fileObject._id : '';
    //if song do song import
    if(id.startsWith('s-')){
      console.log('Loaded song: '+fileObject.title);
      importSong(fileObject);
    }
    //else if songbook do process
    else if(id.startsWith('sb-') && Array.isArray(fileObject.songs)){
      console.log('Loaded songbook: '+fileObject.title);
      importSongbook(fileObject);
    }
    else {
      say("This JSON file isn't a yCanta song or songbook. Choose a file from an export's JSON file button.");
    }
  }

  // What happened, once everything is in: brought in, kept as it was here, failed
  function summary(what) {
    const i = window.import;
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const lines = [`Imported ${what}.`];
    const added = i.n_songs + i.n_songbooks, kept = i.n_songs2 + i.n_songbooks2;
    if (added) lines.push(`Added or updated: ${plural(added, 'item')}.`);
    if (kept) lines.push(`Kept as they were here: ${plural(kept, 'item')} (the copy here is as new or newer, or belongs to someone else).`);
    if (i.n_other) lines.push(`Couldn't save: ${plural(i.n_other, 'item')}.`);
    if (i.comments) lines.push(`Comment threads brought in: ${i.comments}.`);
    if (i.commentsSkipped) lines.push(`Comment threads left out: ${i.commentsSkipped} (only editors can bring in other people's comments).`);
    progressText.style.whiteSpace = 'normal';
    say(lines.join(' '));
  }

  async function importSong(fileObject){
    let song = fileObject;
    window.import.file_count = 1;

    delete song._rev
    //import song
    Promise.resolve(uploadIfNewer(song)).then(function(result){
      console.log('done!', result);
      summary(`"${song.title}"`);
    });
  }

  async function importSongbook(fileObject){
    // songs only: a book's readings (#157) are in its own list, not here
    let songs = fileObject.songs.filter(song => song && !song.reading).map(song => song.doc).filter(Boolean);
    window.import.file_count = songs.length + 1;
    //first import the songs
    let promiseList = [];
    songs.forEach(function(song){
      delete song._rev
      promiseList.push(uploadIfNewer(song));
    });

    //then import the songbook
    let songbook = fileObject;
    const oldId = songbook._id;
    const threads = Array.isArray(songbook.comments) ? songbook.comments : [];
    delete songbook.songs;
    delete songbook.comments;
    delete songbook._rev;
    if(songbook._id == 'sb-allSongs' || songbook._id == 'sb-favoriteSongs'){
      songbook._id = 'sb-'+new Date().getTime().toString();
      songbook.title = 'Import '+songbook.title;
      songbook.addedBy = window.user._id;
      songbook.editedBy = window.user._id;
      songbook.added = new Date().getTime();
      songbook.edited = new Date().getTime();
    }
    promiseList.push(uploadIfNewer(songbook));
    // and its comment threads, under the book's id here
    threads.forEach(thread => {
      if (typeof thread?._id !== 'string' || !thread._id.startsWith(`c_${oldId}_`) || !Array.isArray(thread.comments)) return;
      promiseList.push(importComments({ ...thread, _id: `c_${songbook._id}_` + thread._id.slice(`c_${oldId}_`.length) }));
    });
    Promise.all(promiseList).then(function(results){
      console.log('done!', results.length);
      summary(`"${songbook.title}"`);
      initializeSongbooksList();
      dbChanges();
      loadRecentSongs();
    });
  }

  // A comment thread: added to the one here, if there is one (the comments it doesn't have yet, after its own,
  // so nothing already here changes). Only editors may write other people's comments (the save rules).
  async function importComments(thread) {
    if (!window.church?.editor) { window.import.commentsSkipped++; return; }
    const key = c => `${c?.user}\0${c?.date}\0${c?.comment}`;
    try {
      let existing = null;
      try { existing = await db.get(thread._id); } catch (err) { if (err.status !== 404) throw err; }
      if (!existing) {
        await db.put({ _id: thread._id, comments: thread.comments });
        window.import.comments++;
        return;
      }
      const have = new Set((existing.comments || []).map(key));
      const added = thread.comments.filter(c => !have.has(key(c)));
      if (added.length) {
        await db.put({ ...existing, comments: [...(existing.comments || []), ...added] });
        window.import.comments++;
      }
    } catch (err) {
      console.log(err);
      window.import.n_other++;
    }
  }

  // Who a song or songbook is credited to. Editors and church admins keep the original credit. Everyone
  // else may only save what they added (the server's save rules), so their imports are credited to them.
  function creditImport(doc, existing) {
    if (window.church?.editor || !/^(s|sb)-/.test(doc._id)) return;
    const me = window.user._id;
    doc.addedBy = existing ? existing.addedBy : me;
    doc.editedBy = me;
    if (typeof doc.search === 'string') { // the song search text includes who added and edited it
      // written the way saveSong writes it, "!addedBy" when nobody is named
      const name = (id, label) => (id || '').slice(2).replace(/\s+/g, ' ') || `!${label}`;
      doc.search = doc.search
        .replace(/addedBy:[^\0]*\0/, `addedBy:${name(doc.addedBy, 'addedBy')}\0`)
        .replace(/editedBy:[^\0]*\0/, `editedBy:${name(doc.editedBy, 'editedBy')}\0`);
    }
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

      creditImport(doc);
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
          if(doc.edited>exist_doc.edited && !canEdit(exist_doc)){
            // someone else's song: only an editor may replace it, so keep the one already here
            resolve('n_'+doc_type+'s2');
            window.import['n_'+doc_type+'s2']++;
            updateProgress();
            console.log("the existing " + doc_type + " belongs to someone else, so it stays as it is");
          }
          else if(doc.edited>exist_doc.edited){
            doc._rev = exist_doc._rev;
            creditImport(doc, exist_doc);

            console.log('this '+doc_type+' is newer!');
            saveWithHistory(doc).then(result => [null, result], err => [err]).then(function([err, result]) {
              if (!err) {
                console.log('imported: ', doc.title);
                document.getElementById('progress_text').textContent = 'imported: ' + doc.title;
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
