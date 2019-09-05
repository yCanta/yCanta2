 $(function () {

  var $result = $("#result");
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
      JSZip.loadAsync(f)                                   // 1) read the Blob
      .then(function(zip) {
        var dateAfter = new Date();
        $title.append($("<span>", {
          "class": "small",
          text:" (loaded in " + (dateAfter - dateBefore) + "ms)"
        }));

        zip.forEach(function (relativePath, zipEntry) {  // 2) print entries
          zipEntry.async("string").then(function (song) {
            $fileContent.append($("<li>", {
              text : zipEntry.name
            }));
            if(zipEntry.name.match(".*\.(song|son|hym|so1|rnd|poe)$")){
              saveSong('s-new-song', $(song));            
            }
            else {
              console.log(zipEntry.name + ' is not a song!');
            }
            return 
          });
        });
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