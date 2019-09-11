 $(function () {

  var $result = $("#result");
  $result[0].style = "margin-left: 2rem;";
  $("#file").on("change", function(evt) {
    // remove content
    $result.html("");
    // be sure to show the results
    $("#result_block").removeClass("hidden").addClass("show");

    // Closure to capture the file information.
    function handleFile(f) {
      var $title = $("<h4>", {
        text : f.name
      });
      var $fileContent = $("<ul>");
      $result.append($title);
      $result.append($fileContent);

      var dateBefore = new Date();
      JSZip.loadAsync(f)
      .then(function(zip) {
        var dateAfter = new Date();

        var file_count = Object.keys(zip.files).length;

        $title.append($("<span>", {
          "class": "small",
          text:" (" + file_count + " files loaded in " + (dateAfter - dateBefore) + "ms)"
        }));
        $title.append($("<div id='progress_bar' style='width:250px; border: 1px solid black'><div style='border-right: 1px solid gray; background-color: white; width:0%;' id='progress'><div style='margin-left:auto; height: 1rem; background-color: yellow; width:0%; border-left: 1px solid gray;' id='red_progress'></div></div></div>"))
        $title.append($("<div id='progress_text' style='font-size:small; white-space:nowrap'></div>"))
        //Import files
        count = 0;
        red_count = 0;
        song_map = {};
        promise_list = [];

        zip.folder('songs/').forEach(function (relativePath, zipEntry) {
          zipEntry.async("string").then(function (song) {
            if(zipEntry.name.match(".*\.(song|son|hym|so1|rnd|poe)$")){
              song = song.replace(/author\>/gi, 'authors\>');
              song = song.replace(/\|/gi, ',');
              
              promise_list.push(Promise.resolve(saveSong('s-new-song', $(song), false)) 
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

                songbook_promise_list.push(Promise.resolve(saveSongbook('sb-new-songbook', $(songbook), false))
                .then(function(results){ //results is the song._id
                  count ++;
                  document.getElementById('progress').style.width = count/file_count*100 +'%';
                  document.getElementById('progress_text').innerHTML = zipEntry.name;
                }));
                console.log(songbook_promise_list);
              }
              else {
                red_count++;
                count++;
                document.getElementById('red_progress').style.width = red_count/file_count*100 +'%';
                document.getElementById('progress_text').innerHTML = zipEntry.name;
                //console.log(zipEntry.name + ' is not a songbook!');
              }
              return 
            });
          });
          //let's us change things when we're done.
          setTimeout(function(){Promise.all(songbook_promise_list).then(function(result){
            document.getElementById('progress_text').innerHTML = 'All docs imported!';
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
    }

    var files = evt.target.files;
    for (var i = 0; i < files.length; i++) {
      handleFile(files[i]);
    }
  });
});