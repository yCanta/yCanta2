 $(function () {

  $("#file").on("change", function(evt) {
    // Closure to capture the file information.
    async function handleFile(f) {

      console.log(f, f.type);
      let result = '';

      if(f.type.search('zip')> -1) {
        result = await importSongV1(f);
      }
      else if(f.name.endsWith('json')){
        result = await importSongV2(f);
      }
      else {
        console.log('not a recognized file');
      }
    }

    var files = evt.target.files;
    for (var i = 0; i < files.length; i++) {
      handleFile(files[i]);
    }
  });
});

async function importSongV1(f){
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
    var dateAfter = new Date();

    var file_count = Object.keys(zip.files).length;

    $title.append($("<span>", {
      "class": "small",
      text:" (" + file_count + " files loaded in " + (dateAfter - dateBefore) + "ms)"
    }));
    $title.append($("<div id='progress_bar' style='width:min(100%, 400px); border: 1px solid black'><div style='border-right: 1px solid gray; background-color: white; width:0%;' id='progress'><div style='margin-left:auto; height: 1rem; background-color: yellow; width:0%; border-left: 1px solid gray;' id='red_progress'></div></div></div>"))
    $title.append($("<div id='progress_text' style='width:min(100%, 400px); font-size:small; white-space:nowrap; overflow: hidden;'></div>"))
    //Import files
    count = 0;
    red_count = 0;
    song_map = {};
    promise_list = [];

    zip.folder('songs/').forEach(function (relativePath, zipEntry) {
      //For each zip entry save it using it's original song name
      //What do we do if it's already in the app?
        //ignore it, but letm me know.
      zipEntry.async("string").then(function (song) {
        if(zipEntry.name.match(".*\.(song|son|hym|so1|rnd|poe)$")){
          song = song.replace(/author\>/gi, 'authors\>'); //we pluralized author in new version
          song = song.replace(/\|/gi, ',');  //Replace all the pipes with ,'s
          
          promise_list.push(Promise.resolve(saveSong('i'+CRC32.str(zipEntry.name.replace('songs/',''),0), $(song), false))
          .then(function(results){ //results is the song._id
            count ++;
            song_map[relativePath] = results;
            document.getElementById('progress').style.width = count/file_count*100 +'%';
            document.getElementById('progress_text').innerHTML = zipEntry.name;
          }));
        }
        else {
          console.log(zipEntry.name + ' is not a song!');
          red_count++;
          count++;
          document.getElementById('red_progress').style.width = red_count/file_count*100 +'%';
          document.getElementById('progress').style.width = count/file_count*100 +'%';
          document.getElementById('progress_text').innerHTML = zipEntry.name;
        }
        return 
      });
    });
    
    var songbook_promise_list = [];
    //timeout is to give enough time to queue all the promises
    setTimeout(function(){Promise.all(promise_list).then(function(result){
      console.log(Object.keys(song_map).length + ' songs loaded');
      //Import songbooks
      zip.folder('songbooks/').forEach(function (relativePath, zipEntry) {
        zipEntry.async("string").then(function (songbook) {
          if(zipEntry.name.match(".*\.(xml)$")){
            for (const [key, value] of Object.entries(song_map)) {
              songbook = songbook.replace('songs/'+key, value);
            }

            songbook_promise_list.push(Promise.resolve(saveSongbook('i'+CRC32.str(zipEntry.name.replace('songbooks/',''),0), $(songbook), false))
            .then(function(results){ //results is the song._id
              count ++;
              document.getElementById('progress').style.width = count/file_count*100 +'%';
              document.getElementById('progress_text').innerHTML = zipEntry.name;
            }));
          }
          else {
            red_count++;
            count++;
            document.getElementById('red_progress').style.width = red_count/file_count*100 +'%';
            document.getElementById('progress').style.width = count/file_count*100 +'%';
            document.getElementById('progress_text').innerHTML = zipEntry.name;
            //console.log(zipEntry.name + ' is not a songbook!');
          }
          return 
        });
      });
      //let's us change things when we're done.
      setTimeout(function(){Promise.all(songbook_promise_list).then(function(result){
        return document.getElementById('progress_text').innerHTML = 'All docs imported!';
        }).then(function(result){
          setTimeout(function(){
            document.location.hash = "#songbooks";                
          }, 1500);
        });
      }, 2000);
    })},  3000);
    //we are assuming total process time is less than 45sec
    setTimeout(function(){
      $result.html("");
      $result[0].style='';
    }, 45000)

  }, function (e) {
    $result.append($("<div>", {
      "class" : "alert alert-danger",
      text : "Error reading " + f.name + ": " + e.message
    }));
  });
  return 'toga';
}
async function importSongV2(f){
  console.log(f.name, 'V2');
  return 'yoda';
}