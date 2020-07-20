
punctuation = /[^a-zA-Z0-9\s:-]/g;

var tappedTwice = false;
  
last_search_results = [];
current_song = 0;
secondary_windows = [];
presentation_key_map = {
  'h'         : [ function() {if(! isSearching()) toggleHelp();},
                  "Show/hide help and key bindings for presentation mode"],
  '?'         : [ function() {if(! isSearching()) toggleHelp();},
                  "Show/hide help and key bindings for presentation mode"],
  'C'         : [ function() {if(! isSearching()) toggleChords();},
                  "Toggle Chords on/off"   ],
  //'p'         : [ togglePresentation, "Enter/exit fullscreen presentation mode"   ],
  'F11'       : [ function(){}, "Enter/exit fullscreen presentation mode"   ],
  'escape'    : [ escapeAction      , "Exit search, help, or presentation mode"   ],
      
  't'         : [ function() {if(! isSearching()) blackScreen(); },
                  "Toggle screen background to/from black" ],
  'f'         : [ function() {if(! isSearching()) whiteScreen(); },
                  "Toggle screen foreground to/from white" ],

  'enter'     : [ function() {if(isSearching()) searchResult(1);},
                  "When in search mode show the first search result"              ],
  '1'         : [ function() {numberHit(1);},
                  "Show the first search result/verse depending on mode"          ],
  '2'         : [ function() {numberHit(2);},
                  "Show the second search result/verse depending on mode"         ],
  '3'         : [ function() {numberHit(3);},
                  "Show the third search result/verse depending on mode"          ],
  '4'         : [ function() {numberHit(4);},
                  "Show the fourth search result/verse depending on mode"         ],
  '5'         : [ function() {numberHit(5);},
                  "Show the fith search result/verse depending on mode"           ],
  '6'         : [ function() {numberHit(6);},
                  "Show the sixth verse"                ],
  '7'         : [ function() {numberHit(7);},
                  "Show the seventh verse"              ],
  '8'         : [ function() {numberHit(8);},
                  "Show the eighth verse"               ],
  '9'         : [ function() {numberHit(9);},
                  "Show the ninth verse"                ],
  '0'         : [ function() {numberHit(10);},
                  "Show the tenth verse"                ],

  'right'     : [ nextChunk         , "Go to the next verse/chunk"                ],
  'down'      : [ nextChunk         , "Go to the next verse/chunk"                ],
  '>'         : [ function() {if(! isSearching()) nextChunk();},
                  "Go to the next verse/chorus if a search is not in progress"    ],
  '.'         : [ function() {if(! isSearching()) nextChunk();},
                  "Go to the next verse/chorus if a search is not in progress"    ],
  'space'     : [ function() {if(! isSearching()) nextChunk();},
                  "Go to the next verse/chorus if a search is not in progress"    ],

  'pagedown'  : [ nextSong,           "Go to the next song"                       ],

  'left'      : [ prevChunk         , "Go to the previous verse/chorus"           ],
  'up'        : [ prevChunk         , "Go to the previous verse/chorus"           ],
  '<'         : [ function (){if(! isSearching()) prevChunk();}, 
                  "Go to the previous verse/chorus if a search is not in progress"],
  ','         : [ function (){if(! isSearching()) prevChunk();},
                  "Go to the previous verse/chorus if a search is not in progress"],

  'c'         : [ function (){if(! isSearching()) gotoChorus();},
                  "Go to the chorus of the current song if a search is not in progress"],  
  'b'         : [ function (){if(! isSearching()) gotoBridge();},
                  "Go to the bridge of the current song if a search is not in progress"],  
  'e'         : [ function (){if(! isSearching()) gotoEnding();},
                  "Go to the ending of the current song if a search is not in progress"],  
  'pageup'    : [ prevSong,           "Go to the previous song"                   ],

  'home'      : [ function (){if(! isSearching()) firstSong();},
                  "Go to the first song in the songbook"      ],
  'end'       : [ function (){if(! isSearching()) lastSong();}, 
                  "Go to the last song in the songbook"       ],

  's'         : [ function() {if(! isSearching()) beginSearch();},
                  "Begin a search if a search is not in progress" ],
  '/'         : [ function() {if(! isSearching()) beginSearch();},
                  "Begin a search if a search is not in progress" ],
}


$(document).ready(function(){
    $("stitle").click(toggleSongVisible);

    $(document).keypress({method: 'keypress'}, processKey);  // global key handler
    $(document).keydown({method: 'keydown'}, processKey);   

    $('#searchbox').blur(endSearch); // XXX: need to work on this
    $('#searchbox input').val(''); // initialize to empty
  
    makeDraggable();

    //toggleHelp();
    //var lib = JsonUrl('lzma'); // JsonUrl is added to the window object
    //lib.decompress($('footer').attr('data')).then(output => {console.log(output)});

    if(!window.songbook) {
      let myString = $('footer').attr('data');
      if(myString == undefined) {
        //alert("Couldn't load presentation");
      }
      else {     
        window.songbook = JSON.parse(myString);
      }
    }
    //PREPROCESS THE SONGBOOK OBJECT
    setTimeout(function(){
      let procesed_song = [];
      for(song of window.songbook.songs) {
        // -- REMOVE ALL COMMENTS
        for(var i = song.doc.content.length - 1; i >= 0; i--) {
          if(song.doc.content[i][0].type === 'comment') {
            song.doc.content.splice(i, 1);
          }
        }
        // -- REMOVE ALL EMPTY SONGS
        if(song.doc.content.length != 0) {
          procesed_song.push(song);        
        }
      }
      window.songbook.songs = procesed_song;

      //Put default song
      window.songbook.song_index = window.songbook.songs.length - 1;
      current_song = window.songbook.songs[window.songbook.song_index];
      current_song.chunk_index = current_song.doc.content.length - 1;
      
      $('#cur_slide .content').html('<div style="width: calc(100% - 2rem);position: absolute; top: 40%;"><div style="width: 100%;text-align: center"><h1>Presenting</h1><h2><i id="pres_title">Lorem Ipsum</i></h2></div></div></div>');
      document.getElementById('pres_title').innerHTML = window.songbook.title;
      window.document.title = "yCanta2: Presenting " + window.songbook.title;
    },300);
});

function myEscape(text) { return text.replace('<', '&lt;').replace('>', '&gt;'); }

function openWindow() {
  secondary_windows.push(window.open('presentation.html','_blank', height="200", width="200"))
}

function toggleHelp() {
  if($('#help').length == 0) { // help element not created yet -- lets do it
    let content = '<div id="help"><div>'

    content += '<div id="files"><span>Background:</span><input onclick="clearFile(this)" onchange="loadFiles(this);" data="bg-image" type="file" accept="image/*">'+
    '<span>Fixed:</span><input onclick="clearFile(this)" onchange="loadFiles(this);" data="fixed-image" type="file" accept="image/*">'+
    '<span>Foreground:</span><input onclick="clearFile(this)" onchange="loadFiles(this);" data="fg-image" type="file" accept="image/*"></div>'

    content += '<h4>Main Window:</h4>';
    content += '<div class="helpLine"> <select><!--option value="Song">Songs</option--><option value="Verse">Verse</option></select>'
    content += '<label onchange="whiteScreen()" class="switch"><input type="checkbox" id="togBtn"><div data-text="TEXT" class="slider font"></div></label>';
    content += '<label onchange="blackScreen()" class="switch"><input type="checkbox" id="togBtn"><div data-text="BG" class="slider background"></div></label>';
    content += '<label onchange="toggleChords()"><input type="checkbox"> Chords</label>';
    content += '<label onchange=""><input type="checkbox"> Image backgrounds</label></div>';
    content += '<h4>Child Windows: <input type="button" style="margin-right: 1rem;" onclick="openWindow()" value="Add mirrored window"></input><button onclick="" value=""><img style="height: 1rem; vertical-align: middle" src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+Cjxzdmcgd2lkdGg9IjI0cHgiIGhlaWdodD0iMjRweCIgdmlld0JveD0iMCAwIDI0IDI0IiB2ZXJzaW9uPSIxLjEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHhtbG5zOnNrZXRjaD0iaHR0cDovL3d3dy5ib2hlbWlhbmNvZGluZy5jb20vc2tldGNoL25zIj4KICAgIDwhLS0gR2VuZXJhdG9yOiBTa2V0Y2ggMy4yLjIgKDk5ODMpIC0gaHR0cDovL3d3dy5ib2hlbWlhbmNvZGluZy5jb20vc2tldGNoIC0tPgogICAgPHRpdGxlPmljX2Nhc3RfYmxhY2tfMjRkcDwvdGl0bGU+CiAgICA8ZGVzYz5DcmVhdGVkIHdpdGggU2tldGNoLjwvZGVzYz4KICAgIDxkZWZzPjwvZGVmcz4KICAgIDxnIGlkPSJQYWdlLTEiIHN0cm9rZT0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIxIiBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIHNrZXRjaDp0eXBlPSJNU1BhZ2UiPgogICAgICAgIDxnIGlkPSJpY19jYXN0X2JsYWNrXzI0ZHAiIHNrZXRjaDp0eXBlPSJNU0FydGJvYXJkR3JvdXAiPgogICAgICAgICAgICA8ZyBpZD0iaWNfcmVtb3ZlX2NpcmNsZV93aGl0ZV8yNGRwIiBza2V0Y2g6dHlwZT0iTVNMYXllckdyb3VwIj4KICAgICAgICAgICAgICAgIDxwYXRoIGQ9Ik0xLDE4IEwxLDIxIEw0LDIxIEM0LDE5LjM0IDIuNjYsMTggMSwxOCBMMSwxOCBaIE0xLDE0IEwxLDE2IEMzLjc2LDE2IDYsMTguMjQgNiwyMSBMOCwyMSBDOCwxNy4xMyA0Ljg3LDE0IDEsMTQgTDEsMTQgWiBNMSwxMCBMMSwxMiBDNS45NywxMiAxMCwxNi4wMyAxMCwyMSBMMTIsMjEgQzEyLDE0LjkyIDcuMDcsMTAgMSwxMCBMMSwxMCBaIE0yMSwzIEwzLDMgQzEuOSwzIDEsMy45IDEsNSBMMSw4IEwzLDggTDMsNSBMMjEsNSBMMjEsMTkgTDE0LDE5IEwxNCwyMSBMMjEsMjEgQzIyLjEsMjEgMjMsMjAuMSAyMywxOSBMMjMsNSBDMjMsMy45IDIyLjEsMyAyMSwzIEwyMSwzIFoiIGlkPSJjYXN0IiBmaWxsPSIjMDAwMDAwIiBza2V0Y2g6dHlwZT0iTVNTaGFwZUdyb3VwIj48L3BhdGg+CiAgICAgICAgICAgICAgICA8cmVjdCBpZD0iYm91bmRzIiBza2V0Y2g6dHlwZT0iTVNTaGFwZUdyb3VwIiB4PSIwIiB5PSIwIiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiPjwvcmVjdD4KICAgICAgICAgICAgPC9nPgogICAgICAgIDwvZz4KICAgICAgICA8ZyBpZD0iYXNzZXRzIiBza2V0Y2g6dHlwZT0iTVNMYXllckdyb3VwIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjA4LjAwMDAwMCwgLTEwNi4wMDAwMDApIj4KICAgICAgICAgICAgPGcgaWQ9IjY0cHgiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAuMDAwMDAwLCAxMTQuMDAwMDAwKSI+PC9nPgogICAgICAgIDwvZz4KICAgIDwvZz4KPC9zdmc+"></button></h4>'
    content += '<div class="helpLine">1. <select><!--option value="Song">Songs</option--><option value="Verse">Verse</option></select>'
    content += '<label class="switch"><input type="checkbox" id="togBtn"><div data-text="TEXT" class="slider font"></div></label>';
    content += '<label class="switch"><input type="checkbox" id="togBtn"><div data-text="BG" class="slider background"></div></label>';
    content += '<label><input type="checkbox"> Chords</label>';
    content += '<label><input type="checkbox"> Image backgrounds</label></div>';
    var description = undefined;
    /*for(var key in presentation_key_map){
      if(description == myEscape(presentation_key_map[key][1])) { // don't output the description multiple times if it is the same
        content += '<tr><td class="key">'+myEscape(key)+'</td><td class="description"></td></tr>\n';
      }
      else {
        description = myEscape(presentation_key_map[key][1]);
        content += '<tr class="newdescription"><td class="key">'+myEscape(key)+'</td><td class="description">' + description + '</td></tr>\n';
      }
    }*/
    content += '</div></div>'
    $('body').prepend(content);
    $('#help').hide();
  }

  // now certain that all is inited
  $('#help').slideToggle('fast');
}
function toggleChords() {
  if(isSearching()) {
    return;
  }
  else if($("body").hasClass("nochords")){
    $('body').removeClass("nochords")
    scaleText();
  }
  else {
    $('body').addClass("nochords")
    scaleText();
  }
}

function searchDatabase(){
  var text = $('#searchbox input').val().replace(/[^a-zA-Z0-9\s:-]/g, '');
  if(jQuery.trim(text).length < 2){
    $('#searchresults').empty();
    return;
  }

  var re = new RegExp(text, 'i');
  var match_object = []
  var matches = window.songbook.songs.filter(function(item) { 
      var result = re.test(item.doc.search);
      if(result == true){  //then test to see if we already have this line in the results
        for(var i=0; i<match_object.length; i++) {
          if(item.id == match_object[i].id){
            result = false;
            break;
          }
        }
        match_object.push(item)
      }
      return result;
  });

  // only keep first 5
  var total_matches = matches.length;
  var matches = matches.slice(0, 5);
  last_search_results = matches;     // save for future reference

  // format for display
  var count = 0;

  var textmatches = matches.map(function(item) {
      let m = re.exec(item.doc.search);
      count += 1;

      return ('<div onclick="javascript:void(searchResult('+(count)+'));">' 
        + '<span class="count">['+count+']</span> ' 
        + '<span class="song">' + item.doc.title + '</span>: ' 
        + '<span class="matchline">' + item.doc.search.substring((item.doc.search.substring(0,m.index).lastIndexOf('\n') || 0), m.index) 
        + '<span class="match">' + m[0] + '</span>' 
        + item.doc.search.substring(m.index + m[0].length, item.doc.search.indexOf('\n', m.index+m[0].length) || item.doc.search.length) + '</span></div>');
  });

  $('#searchresults').html(textmatches.join('\n'));
  $('#searchbox > span.info').text('  showing ' + textmatches.length + ' of ' + total_matches);

}

function isSearching(){
  return $('#searchbox').css('display') != 'none';
}

function beginSearch(){
  $('#searchbox').show();
  $('#searchbox input').focus();
  $('#searchbox input').val('');
}

function endSearch(){
  $('#searchbox').hide();
  $('#searchbox input').val('');
  $('#searchresults').empty();
  $('#searchbox > span.info').empty();
}

function searchResult(n){
  if(n > last_search_results.length){
    return;
  }
  current_song = last_search_results[n - 1];
  for(let i = 0; i < window.songbook.songs.length; i++) {
    if(current_song.id == window.songbook.songs[i].id) {
      window.songbook.song_index = i;
      break;
    }
  }
  current_song = last_search_results[n - 1];
  current_song.chunk_index = 0;
  showChunk('first');
  endSearch();
}

function enterPresentation(){
  $('#help').hide();
  $("body").addClass("presentation");

  // find the 'current' node if needed
  if(current_song == 0){
    window.songbook.song_index = 0;
    current_song = window.songbook.songs[window.songbook.song_index];
    current_song.chunk_index = 0;
  }
  showChunk('first');
}
function inPresentation(){ return $("body").hasClass("presentation"); }
function exitPresentation(){ 
  //$("chunk,author,copyright,key,scripture_ref").css({'display':'none'}); // not visible to start -- toggled as needed
  $("body").removeClass("presentation"); 
  $("stitle").css({'display': 'block'});
  resetText();
}
function scrollTo(domEl){
  window.scroll(0, $(domEl).offset().top);
}
function toggleSongVisible(evt) {
  if(!inPresentation()){
    $(this).parent().find('chunk,author,copyright,scripture_ref,copyright').slideToggle("normal");
  }
}
function showChunk(name) {
  if(inPresentation()){
    resetText();

    /*
    depending on chunk name, display and format the chunk
    first, last, 1-9, chorus, ending, bridge

    */
    function build_chunk(chunk, song=null) {
      let content = '';

      if(song == null) {
        song = current_song;
      }

      if(song.chunk_index == 0){ //no previous chunk
        content += '<stitle>'+song.doc.title+'</stitle>'
                 + '<author>'+song.doc.authors.join(', ')+'</author>'
                 + '<scripture_ref>'+song.doc.scripture_ref.join(', ')+'</scripture_ref>'
                 + '<key>'+song.doc.key+'</key>';
      }
      
      let verse_number = 1;
      for(let chunk_index = 0; chunk_index < song.chunk_index; chunk_index++) {
        if(song.doc.content[chunk_index][0].type == 'verse') {
          verse_number += 1;
        }
      }
      content += '<chunk type="' + chunk[0].type + '">';
      if(chunk[0].type == 'verse'){
        content += '<span>'+verse_number+':</span>';
      }
      chunk[1].forEach(function(line){
        content += '<line>' + line + '</line>';
      });
      content += '</chunk>';

      if(song.doc.content.length == song.chunk_index + 1){ //last chunk
        content += '<copyright>'+song.doc.copyright+'</copyright>';
      }
      return content;
    }

    $('#cur_slide .content').html(build_chunk(current_song.doc.content[current_song.chunk_index]));

    //now add the other chunks.
    let pre_chunk;
    let post_chunk;
    let pre_song =  JSON.parse(JSON.stringify(current_song));
    let post_song =  JSON.parse(JSON.stringify(current_song));
    pre_song.chunk_index  -= 1;
    post_song.chunk_index += 1;

    //default, assume it all works!
    pre_chunk = current_song.doc.content[current_song.chunk_index - 1];
    post_chunk = current_song.doc.content[current_song.chunk_index + 1];

    //now check edge cases
    //beginning of a song - need to change pre_chunk and pre_song
    if(current_song.chunk_index == 0) {
      //previous chunk will be an earlier song
      //if beginning of book move to last song
      if(window.songbook.song_index == 0) {
        pre_song = window.songbook.songs[window.songbook.songs.length - 1];
      }
      //go to previous song
      else {
        pre_song = window.songbook.songs[window.songbook.song_index - 1];
      }
      pre_song.chunk_index = pre_song.doc.content.length - 1;
      pre_chunk = pre_song.doc.content[pre_song.chunk_index];
    }
    //we're at the end of the song - need to change post_chunk and post_song
    if(current_song.chunk_index == current_song.doc.content.length - 1) {
      //post chunk will be the next song
      //if end of the book, move to first song
      if(window.songbook.song_index == window.songbook.songs.length - 1){
        post_song = window.songbook.songs[0];
      }
      //move to next song
      else {
        post_song = window.songbook.songs[window.songbook.song_index + 1];
      }
      post_song.chunk_index = 0;
      post_chunk = post_song.doc.content[0];
    }

    $('#pre_slide .content').html(build_chunk(pre_chunk, pre_song));
    $('#post_slide .content').html(build_chunk(post_chunk, post_song));

    var total = current_song.doc.content.length;
    $('#progress').css('width', ''+(((current_song.chunk_index + 1) / total) * 100)+'%'); // set progress bar
    $('#slides').css('--percent', (((current_song.chunk_index + 1) / total) * 100));

    scaleText();

    $.each(secondary_windows, function(index,value) { 
      try{
        $(this.document).find('#slides').html($("#cur_slide").clone());
        this.scaleText();
        $(this.document).find('#progress').css('width', ''+((pos / total) * 100)+'%'); // set progress bar
        $(this.document).find('#slides').css('--percent', (((current_song.chunk_index + 1) / total) * 100));
      }
      catch(err){
      }
    });
  }
  else {
    var song = chunk.parent();
    song.find('chunk').slideToggle("normal");
    scrollTo(chunk.parent());
  }
}

function firstSong(){
  if(! inPresentation()){ // presentation mode only
    return;
  }
  window.songbook.song_index = 0;
  current_song = window.songbook.song_index;
  current_song.chunk_index = 0;
  showChunk('first_song');
}

function lastSong(){
  if(! inPresentation()){ // presentation mode only
    return;
  }
  window.songbook.song_index = window.songbook.songs.length - 1;
  current_song = window.songbook.songs[window.songbook.song_index];
  current_song.chunk_index = 0;
  showChunk('last_song');
}


function nextSong(){
  if(! inPresentation()){ // presentation mode only
    return;
  }
  for(let i = 0; i <= window.songbook.songs.length; i++) {
    if(window.songbook.songs[i].id == current_song.id) {
      if(i == window.songbook.songs.length - 1) {
        window.songbook.song_index = 0;
        current_song = window.songbook.songs[window.songbook.song_index];
      }
      else {
        window.songbook.song_index = i + 1;
        current_song = window.songbook.songs[window.songbook.song_index];
      }
      break
    }
  }
  current_song.chunk_index = 0;
  showChunk('next_song');
}

function nextChunk(){
  if(! inPresentation()){ // presentation mode only
    return;
  }
  if(current_song.chunk_index == current_song.doc.content.length - 1) {
    nextSong();
  }
  else {
    current_song.chunk_index += 1;
    showChunk('next_chunk');  
  }
}

function prevSong(last=false){
  if(! inPresentation()){ // presentation mode only
    return;
  }
  for(let i = 0; i <= window.songbook.songs.length; i++) {
    if(window.songbook.songs[i].id == current_song.id) {
      if(i == 0) {
        window.songbook.song_index = window.songbook.songs.length - 1;
        current_song = window.songbook.songs[window.songbook.song_index];
      }
      else {
        window.songbook.song_index = i - 1;
        current_song = window.songbook.songs[window.songbook.song_index];
      }
      break
    }
  }
  if(last) {
    current_song.chunk_index = current_song.doc.content.length - 1;
  }
  else {
    current_song.chunk_index = 0;
  }
  showChunk('prev_song');
}

function prevChunk(){
  if(!inPresentation()){ // presentation mode only
    return;
  }
  if(current_song.chunk_index == 0) {
    prevSong(true);
  }
  else {
    current_song.chunk_index -= 1;
    showChunk('prev_chunk');  
  }
}

function gotoChorus(){
  if(! inPresentation()){ // presentation mode only
    return;
  }
  // First we look for a chorus type AFTER the current chunk and take the first one
  for(let i = current_song.chunk_index + 1; i <= current_song.doc.content.length; i++){
    if(i == current_song.doc.content.length) {
      i = 0;
    }
    if(['pre-chorus','chorus','final chorus'].indexOf(current_song.doc.content[i][0].type) > -1){
      current_song.chunk_index = i;
      return showChunk('chorus');
    }
    if(i == current_song.chunk_index) {
      break; // there is no chorus
    }
  }
}

function gotoBridge(){
  if(! inPresentation()){ // presentation mode only
    return;
  }  // First we look for a chorus type AFTER the current chunk and take the first one
  for(let i = current_song.chunk_index + 1; i < current_song.doc.content.length; i++){
    if(current_song.doc.content[i][0].type == 'bridge'){
      current_song.chunk_index = i;
      return showChunk('bridge');
    }
    if(i == current_song.doc.content.length - 1) {
      i = 0;
    }
    if(i == current_song.chunk_index) {
      break; // there is no bridge
    }
  }
}

function gotoEnding(){
  if(! inPresentation()){ // presentation mode only
    return;
  }
  for(let i = current_song.chunk_index + 1; i < current_song.doc.content.length; i++){
    if(current_song.doc.content[i][0].type == 'ending'){
      current_song.chunk_index = i;
      return showChunk('ending');
    }
    if(i == current_song.doc.content.length - 1) {
      i = 0;
    }
    if(i == current_song.chunk_index) {
      break; // there is no ending
    }
  }
}

function gotoVerse(num){
  if(! inPresentation()){
    return;
  }
  let verse_count = 0;
  for(let i = 0; i < current_song.doc.content.length; i++){
    if(current_song.doc.content[i][0].type == 'verse'){
      verse_count += 1;
      if(verse_count == num) {
        current_song.chunk_index = i;
        return showChunk('verse');
      }
    }
  }
}

function whiteScreen(){
  var body = $('body');
  //if(body.hasClass('white')){

  if(body.hasClass('white')){
    body.removeClass('white');
  }
  else {
    body.addClass('white');
  }
}

function blackScreen(){
  var body = $('body');
  //if(body.hasClass('white')){

  if(body.hasClass('black')){
    body.removeClass('black');
  }
  else {
    body.addClass('black');
  }
}

function numberHit(num){
  if(isSearching() & num <= 5){
    searchResult(num)
  }
  else if(inPresentation()){
    gotoVerse(num)
  }
}

function keyEventToString(e) {
  var key = undefined;
                
  if(e.data.method == "keydown"){
    switch(e.keyCode){
      case 27 : key = 'escape'; break;
      case 33 : key = 'pageup'; break;
      case 34 : key = 'pagedown'; break;
      case 35 : key = 'end'; break;
      case 36 : key = 'home'; break;
      case 37 : key = 'left'; break;
      case 38 : key = 'up'; break;
      case 39 : key = 'right'; break;
      case 40 : key = 'down'; break;
      case 122: key = 'F11'; break;
      default : e.stopPropagation(); return; break;
    }
  }
  else if(e.which == 13) { // enter -- want as a string no newline char which can be \n \r ...
    key = 'enter';
  }
  else if(String.fromCharCode(e.which) == ' '){ // write out a space human readably
    key = 'space';
  }
  else{
    key = String.fromCharCode(e.which);
  }
  // this is to prevent keys from showing up in the input dialog in chrome and opera
  if((e.which == 47 || e.which == 115)& ! isSearching()) { 
    e.preventDefault()
  }
  return key;
}

function resetText() {
  $("#cur_slide .content").parent().css("font-size", "100%");
}

function scaleText() {
  // reset font to normal size to start
  resetText();
  if(! inPresentation()){
    // do nothing but reset text to 100%
    return;
  }

  $('.slide').each(function(){
    let slide = $(this);
    var container = $(this).children(".content");
    var container_dom = container.get(0); // always only 1 because we use ID selector
    var win       = $(window);
    var win_width = win.width();
    var win_height= win.height();

    var small     = 50;
    var big       = 1500;
    var percent   = (big + small) / 2;

    function container_height() {
      return slide[0].scrollHeight;
    }

    function container_width() {
      return slide[0].scrollWidth;
    }

    var oldWidth  = container_width();
    var oldHeight = container_height();

    //console.log('Starting font', container.css("font-size"));
    //console.log('c:', container_width(), 'w:', win_width);

    while(big - small > 10) { // iterate till we get within 10% of ideal
      container.css("font-size", ""+percent+"%");

      if(container_width() > win_width || container_height() > win_height){ // too big
        big = percent;
      }
      else {
        small = percent;
      }

      percent = (big + small) / 2;
    }
    container.css("font-size", ""+(percent - 10) +"%");


    if(container_width() > win_width || container_height() > win_height){ // too big
      container.css("font-size", ""+small+"%");
    }

    //console.log('Ending font', container.css("font-size"));
    //console.log('c:', container_width(), container, 'w:', $(window).width());

  });
}

function togglePresentation() {
  if(isSearching()) {
    return;
  }
  else if(inPresentation()){
    exitPresentation();
  }
  else {
    enterPresentation();
  }
}

function escapeAction() {
  $('#help').hide();
  if(isSearching()){
    endSearch();
  }
  else {
    //exitPresentation();
  }
}

function processKey(e){ 
  key = keyEventToString(e);

  console.log("key: " + key, e);

  if(key in presentation_key_map){
    presentation_key_map[key][0](); // call the right function
  }

  if(isSearching()){ 
    setTimeout(searchDatabase, 10);
  } 
}

function makeDraggable() {
  let startx = 0;
  let starty = 0;
  let dist = 0;
  let disty = 0;
  let width = 0;
  let height = 0;

  $('body')[0].addEventListener('touchstart', function(e) {
    //e.preventDefault();   
    var touchobj = e.changedTouches[0]; // reference first touch point (ie: first finger)
    startx = parseInt(touchobj.clientX);
    starty = parseInt(touchobj.clientY);
    width = document.getElementById('cur_slide').offsetWidth; // get x position of touch point relative to left edge of browser
    height = document.getElementById('cur_slide').offsetHeight; // get x position of touch point relative to left edge of browser

    if(!tappedTwice) {
      tappedTwice = true;
      setTimeout( function() { tappedTwice = false; }, 300 );
      return false;
    }
    //action on double tap goes below
    if(tappedTwice) {
      if(isSearching()){
        endSearch();
      }
      else {
        beginSearch();
      }
      $('#help').hide();
    }

  }, {passive: false});

  document.getElementById('slides').addEventListener('touchmove', function(e){
    e.preventDefault();   

    if(startx){
      var touchobj = e.changedTouches[0]; // reference first touch point for this event
      var dist = parseInt(touchobj.clientX) - startx;
      var disty = parseInt(touchobj.clientY) - starty;
      let cur_slide = document.getElementById('cur_slide');
      let pre_slide = document.getElementById('pre_slide');
      let post_slide = document.getElementById('post_slide');

      cur_slide.style.transform = 'translateX('+dist+'px)';
      cur_slide.style.transition = '0s';
      pre_slide.style.transform = 'translateX(calc('+dist+'px - 100%))'; // + 'translateY('+ (25 - dist/16) + '%) rotateZ(-' + (22.5 - dist/16) + 'deg)';
      pre_slide.style.transition = '0s';
      post_slide.style.transform = 'translateX(calc('+dist+'px + 100%))'; // +  'translateY('+ (25 + dist/16) + '%) rotateZ(' + (22.5 + dist/16)+'deg)';
      post_slide.style.transition = '0s';
    }
  }, false);

  document.getElementById('slides').addEventListener('touchend', function(e){
    var touchobj = e.changedTouches[0]; // reference first touch point for this event
    var dist = startx - parseInt(touchobj.clientX);
    var disty = Math.abs(parseInt(touchobj.clientY) - starty);

    $('.slide').removeAttr('style');
    document.getElementById('cur_slide').style.removeProperty('transition');

    if(dist > 100 ){ //make sure that distance isn't just accidental
      $('#pre_slide').remove();
      $('#cur_slide').attr('id', 'pre_slide');
      $('#post_slide').attr('id', 'cur_slide');
      $('#cur_slide').after('<div id="post_slide" class="slide"><div class="content"></div></div>');

      nextChunk();
      e.preventDefault(); 
    }
    else if(dist < -100){
      $('#post_slide').remove();
      $('#cur_slide').attr('id', 'post_slide');
      $('#pre_slide').attr('id', 'cur_slide');
      $('#cur_slide').before('<div id="pre_slide" class="slide"><div class="content"></div></div>');

      prevChunk();
      e.preventDefault();
    }
  }, false); 
}

function loadFiles(el) {
  var files = el.files;
  function readAndPlace(file) {
    // Make sure `file.name` matches our extensions criteria
    if ( /\.(jpe?g|png|gif|svg)$/i.test(file.name) ) {
      var reader = new FileReader();
      reader.addEventListener("load", function () {
        document.documentElement.style.setProperty('--'+el.getAttribute('data'), "url("+this.result+")");
      }, false);

      reader.readAsDataURL(file);
    }
    else {
      alert('sorry, not a valid image file')
    }

  }
  if (files) {
    [].forEach.call(files, readAndPlace);
  }
}
function clearFile(el) {
  document.documentElement.style.setProperty('--'+el.getAttribute('data'), "url('')");
  el.value=null; 
}
