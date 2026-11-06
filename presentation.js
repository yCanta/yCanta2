
// Vanilla JS slideToggle helper
function slideToggle(element, duration = 400) {
  if (window.getComputedStyle(element).display === 'none') {
    return slideDown(element, duration);
  } else {
    return slideUp(element, duration);
  }
}

function slideUp(element, duration = 400) {
  element.style.height = element.offsetHeight + 'px';
  element.style.transition = `height ${duration}ms ease-out`;
  element.style.overflow = 'hidden';
  
  setTimeout(() => {
    element.style.height = '0';
  }, 10);
  
  return new Promise(resolve => {
    setTimeout(() => {
      element.style.display = 'none';
      element.style.height = '';
      element.style.transition = '';
      element.style.overflow = ''; // jQuery restored overflow after sliding too
      resolve();
    }, duration);
  });
}

function slideDown(element, duration = 400) {
  element.style.display = 'block';
  element.style.height = ''; // measure the real height, not an inline height: 0
  const height = element.offsetHeight;
  element.style.height = '0';
  element.style.transition = `height ${duration}ms ease-out`;
  element.style.overflow = 'hidden';
  
  setTimeout(() => {
    element.style.height = height + 'px';
  }, 10);
  
  return new Promise(resolve => {
    setTimeout(() => {
      element.style.height = '';
      element.style.transition = '';
      element.style.overflow = ''; // jQuery restored overflow after sliding too
      resolve();
    }, duration);
  });
}

punctuation = /[^a-zA-Z0-9\s:-]/g;

var tappedTwice = false;
const MAX_SEARCH_RESULTS = 5;
  
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
  'Escape'    : [ escapeAction      , "Exit search, help, or presentation mode"   ],
      
  't'         : [ function() {if(! isSearching()) blackScreen(); },
                  "Toggle screen background to/from black" ],
  'f'         : [ function() {if(! isSearching()) whiteScreen(); },
                  "Toggle screen foreground to/from white" ],

  'Enter'     : [ function() {if(isSearching()) searchResult(1);},
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

  'ArrowRight': [ nextChunk         , "Go to the next verse/chunk"                ],
  'ArrowDown' : [ nextChunk         , "Go to the next verse/chunk"                ],
  '>'         : [ function() {if(! isSearching()) nextChunk();},
                  "Go to the next verse/chorus if a search is not in progress"    ],
  '.'         : [ function() {if(! isSearching()) nextChunk();},
                  "Go to the next verse/chorus if a search is not in progress"    ],
  ' '         : [ function() {if(! isSearching()) nextChunk();},
                  "Go to the next verse/chorus if a search is not in progress"    ],

  'PageDown'  : [ nextSong,           "Go to the next song"                       ],

  'ArrowLeft' : [ prevChunk         , "Go to the previous verse/chorus"           ],
  'ArrowUp'   : [ prevChunk         , "Go to the previous verse/chorus"           ],
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
  'PageUp'    : [ prevSong,           "Go to the previous song"                   ],

  'Home'      : [ function (){if(! isSearching()) firstSong();},
                  "Go to the first song in the songbook"      ],
  'End'       : [ function (){if(! isSearching()) lastSong();}, 
                  "Go to the last song in the songbook"       ],

  's'         : [ function() {if(! isSearching()) beginSearch();},
                  "Begin a search if a search is not in progress" ],
  '/'         : [ function() {if(! isSearching()) beginSearch();},
                  "Begin a search if a search is not in progress" ],
}


document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('stitle').forEach(el => el.addEventListener('click', toggleSongVisible));

    document.addEventListener('keydown', processKey);
    document.getElementById('searchinput').addEventListener('beforeinput', processKey);

    document.getElementById('searchbox').addEventListener('blur', endSearch);
    document.querySelector('#searchbox input').value = '';
  
    makeDraggable();

    //toggleHelp();
    //var lib = JsonUrl('lzma'); // JsonUrl is added to the window object
    //lib.decompress($('footer').attr('data')).then(output => {console.log(output)});

    if(!window.songbook) {
      let myString = document.querySelector('footer').getAttribute('data');
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
      
      document.querySelector('#cur_slide .content').innerHTML = '<div style="width: calc(100% - 2rem);position: absolute; top: 40%;"><div style="width: 100%;text-align: center"><h1>Presenting</h1><h2><i id="pres_title">Lorem Ipsum</i></h2></div></div></div>';
      document.getElementById('pres_title').innerHTML = window.songbook.title;
      window.document.title = "yCanta2: Presenting " + window.songbook.title;
    },300);
});

function myEscape(text) { return text.replace('<', '&lt;').replace('>', '&gt;'); }

function openWindow() {
  secondary_windows.push(window.open('presentation.html','_blank', height="200", width="200"))
}

function toggleHelp() {
  if(!document.getElementById('help')) { // help element not created yet -- lets do it
    let content = '<div id="help"><div>'

    content += '<div id="files"><span>Background:</span><input onclick="clearFile(this)" onchange="loadFiles(this);" data="bg-image" type="file" accept="image/*">'+
    '<span>Fixed:</span><input onclick="clearFile(this)" onchange="loadFiles(this);" data="fixed-image" type="file" accept="image/*">'+
    '<span>Foreground:</span><input onclick="clearFile(this)" onchange="loadFiles(this);" data="fg-image" type="file" accept="image/*"></div>'

    content += '<h4>Main Window:</h4>';
    content += '<div class="helpLine"> <select><!--option value="Song">Songs</option--><option value="Verse">Verse</option></select>'
    content += '<label onchange="whiteScreen(true)" class="switch"><input type="checkbox" id="fgText"><div data-text="TEXT" class="slider font"></div></label>';
    content += '<label onchange="blackScreen(true)" class="switch"><input type="checkbox" id="bgColor"><div data-text="BG" class="slider background"></div></label>';
    content += '<span><label onchange="toggleChords(true)" style="margin-right: 1rem;"><input id="chngChords" type="checkbox"> Chords</label>';
    content += '<label onchange=""><input type="checkbox"> Image backgrounds</label></span></div>';
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
    document.body.insertAdjacentHTML('afterbegin', content);
    document.getElementById('help').style.display = 'none';
  }

  // now certain that all is inited
  slideToggle(document.getElementById('help'), 200);
}
function hideHelp() {
  const help = document.getElementById('help'); // only exists once help has been opened
  if (help) help.style.display = 'none';
}
function toggleChords(touch=false) {
  if(isSearching()) {
    return;
  }
  else if(document.body.classList.contains("nochords")){
    document.body.classList.remove("nochords");
    scaleText();
  }
  else {
    document.body.classList.add("nochords");
    scaleText();
  }

  if(!touch){
    const chngChords = document.getElementById('chngChords');
    chngChords.checked = !chngChords.checked;
  }
}

function searchDatabase(){
  const text = document.querySelector('#searchbox input').value.trim();
  if(text.length < 2) {
    document.getElementById('searchresults').innerHTML = '';
    return;
  }

  var re = new RegExp('(' + text + ')([^\0\n]*)', 'i');
  var match_object = []
  var total_matches = 0;
  var matches = window.songbook.songs.filter(function(item) { 
      if(total_matches >= MAX_SEARCH_RESULTS){
        return false; // we only show MAX_SEARCH_RESULTS, don't waste time testing regex
      }
      var result = re.test(item.doc.search);
      if(result == true){  //then test to see if we already have this line in the results
        for(var i=0; i<match_object.length; i++) {
          if(item.id == match_object[i].id){
            result = false;
            break;
          }
        }
        match_object.push(item);
        total_matches += 1;
      }
      return result;
  });

  last_search_results = matches;     // save for future reference

  // format for display
  var count = 0;

  var textmatches = matches.map(function(item) {
      let m = re.exec(item.doc.search);
      count += 1;
      let matchline_start = Math.max(
          item.doc.search.substring(0,m.index).lastIndexOf('\n') || 0
        , item.doc.search.substring(0,m.index).lastIndexOf('\0') || 0);
      let matchline_end = m.index + m[1].length + m[2].length;

      return ('<div onclick="javascript:void(searchResult('+(count)+'));">'
        + '<span class="count">['+count+']</span> '
        + '<span class="song">' + item.doc.title + '</span>: '
        + '<span class="matchline">' + item.doc.search.substring(matchline_start, m.index)
        + '<span class="match">' + m[1] + '</span>'
        + item.doc.search.substring(m.index + m[1].length, matchline_end) + '</span></div>');
  });

  document.getElementById('searchresults').innerHTML = textmatches.join('\n');
  const infoSpan = document.querySelector('#searchbox > span.info');
  if(infoSpan) infoSpan.textContent = '  showing ' + textmatches.length + ' of ' + total_matches;

}

function isSearching(){
  return document.getElementById('searchbox').style.display != 'none';
}

function beginSearch(touch=false){
  document.getElementById('searchbox').style.display = 'block';
  if(!touch){
    document.querySelector('#searchbox input').focus();
  }
  document.querySelector('#searchbox input').value = '';
}

function endSearch(){
  const searchbox = document.getElementById('searchbox');
  searchbox.style.display = 'none';
  searchbox.querySelector('input').value = '';
  document.getElementById('searchresults').innerHTML = '';
  const infoSpan = searchbox.querySelector('span.info');
  if(infoSpan) infoSpan.textContent = '';
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
  hideHelp();
  document.body.classList.add("presentation");

  // find the 'current' node if needed
  if(current_song == 0){
    window.songbook.song_index = 0;
    current_song = window.songbook.songs[window.songbook.song_index];
    current_song.chunk_index = 0;
  }
  showChunk('first');
}
function inPresentation(){ return document.body.classList.contains("presentation"); }
function exitPresentation(){ 
  //$("chunk,author,copyright,key,scripture_ref").css({'display':'none'}); // not visible to start -- toggled as needed
  document.body.classList.remove("presentation");
  document.querySelectorAll('stitle').forEach(el => el.style.display = 'block');
  resetText();
}
function scrollTo(domEl){
  window.scroll(0, domEl.getBoundingClientRect().top + window.scrollY);
}
function toggleSongVisible(evt) {
  if(!inPresentation()){
    const elements = this.parentNode.querySelectorAll('chunk,author,copyright,scripture_ref,copyright');
    elements.forEach(el => {
      slideToggle(el, 400); 
    });
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

    document.querySelector('#cur_slide .content').innerHTML = build_chunk(current_song.doc.content[current_song.chunk_index]);

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

    document.querySelector('#pre_slide .content').innerHTML = build_chunk(pre_chunk, pre_song);
    document.querySelector('#post_slide .content').innerHTML = build_chunk(post_chunk, post_song);

    var total = current_song.doc.content.length;
    document.getElementById('slides').style.setProperty('--percent', (((current_song.chunk_index + 1) / total) * 100));
    let progress_text = ''
    for(let chunk_index = 0; chunk_index < total; chunk_index++) {
      progress_text += '<div class="'+current_song.doc.content[chunk_index][0].type.replace(/[^a-z]/g,'');
      if(chunk_index < current_song.chunk_index){
        progress_text += ' before';
      } else if(chunk_index == current_song.chunk_index) {
        progress_text += ' current';
      } else {
        progress_text += ' after';
      }
      progress_text += '"></div>';
    }
    document.getElementById('progress').innerHTML = progress_text;

    scaleText();

    secondary_windows.forEach(win => {
      try {
        const winDoc = win.document;
        winDoc.querySelector('#slides').innerHTML = document.getElementById('cur_slide').outerHTML;
        winDoc.querySelector('#statusbar').innerHTML = document.getElementById('progress').outerHTML;
        win.scaleText();
        winDoc.querySelector('#slides').style.setProperty('--percent', (((current_song.chunk_index + 1) / total) * 100));
      } catch(err) {}
    });
  }
  else {
    const song = chunk.parentNode;
    song.querySelectorAll('chunk').forEach(el => slideToggle(el, 200));
    scrollTo(chunk.parentNode);
  }
}

function firstSong(){
  if(! inPresentation()){ // presentation mode only
    return;
  }
  window.songbook.song_index = 0;
  current_song = window.songbook.songs[window.songbook.song_index];
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

function whiteScreen(touch=false){
  if(!touch){
    const fgText = document.getElementById('fgText');
    fgText.checked = !fgText.checked;
  }
  if(document.body.classList.contains('white')){
    document.body.classList.remove('white');
  }
  else {
    document.body.classList.add('white');
  }
}

function blackScreen(touch=false){
  if(!touch){
    const bgColor = document.getElementById('bgColor');
    bgColor.checked = !bgColor.checked;
  }
  if(document.body.classList.contains('black')){
    document.body.classList.remove('black');
  }
  else {
    document.body.classList.add('black');
  }
}

function numberHit(num){
  if(isSearching() & num <= MAX_SEARCH_RESULTS){
    searchResult(num)
  }
  else if(inPresentation()){
    gotoVerse(num)
  }
}


function resetText() {
  const slide = document.querySelector('#cur_slide .content').parentElement;
  slide.style.fontSize = "100%";
}

function scaleText() {
  // reset font to normal size to start
  resetText();
  if(! inPresentation()){
    // do nothing but reset text to 100%
    return;
  }

  document.querySelectorAll('.slide').forEach(slide => {
    const container = slide.querySelector(".content");
    const win_width = window.innerWidth;
    const win_height = window.innerHeight;

    var small     = 50;
    var big       = 1500;
    var percent   = (big + small) / 2;

    function container_height() {
      return slide.scrollHeight;
    }

    function container_width() {
      return slide.scrollWidth;
    }

    var oldWidth  = container_width();
    var oldHeight = container_height();

    //console.log('Starting font', container.css("font-size"));
    //console.log('c:', container_width(), 'w:', win_width);

    while(big - small > 10) { // iterate till we get within 10% of ideal
      container.style.fontSize = percent + "%";

      if(container_width() > win_width || container_height() > win_height){ // too big
        big = percent;
      }
      else {
        small = percent;
      }

      percent = (big + small) / 2;
    }
    container.style.fontSize = (percent - 10) + "%";


    if(container_width() > win_width || container_height() > win_height){ // too big
      container.style.fontSize = small + "%";
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
  hideHelp();
  if(isSearching()){
    endSearch();
  }
  else {
    //exitPresentation();
  }
}

function processKey(e){ 
  //console.log("key: '" + e.key +"'", "originalEvent.key: '" + e.originalEvent.key + "'", e);
  key = e.key;
  if((key == '/' || key == 's') & !isSearching()) { 
    e.preventDefault()
  }

  // TODO: workaround breaks firefox which the INPUT field has focus
  // disabling workaround for now, I think it will work as-is on chrome mobile with a bluetooth keyboard
  // mobile needs a bunch of work before it works well for presentations anyways
  //if(e.target.nodeName =='INPUT') {  //workaround for chrome mobile which decided not implement keydown.
  //  console.log('switching to:', e.data);
  //  key = e.data;
  //}

  //console.log("key: '" + key +"'", e);

  if(key in presentation_key_map){
  //  console.log("Presentation map function: ", presentation_key_map[key])
    presentation_key_map[key][0](); // call the right function
  }
  //else {
  //  console.log("Key '"+key+"' not in presentation map");
  //}

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

  document.body.addEventListener('touchstart', function(e) {
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
        beginSearch(true);
      }
      hideHelp();
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

    document.querySelectorAll('.slide').forEach(el => el.removeAttribute('style'));
    document.getElementById('cur_slide').style.removeProperty('transition');

    if(dist > 100 ){ //make sure that distance isn't just accidental
      const preSlide = document.getElementById('pre_slide');
      preSlide.parentNode.removeChild(preSlide);
      document.getElementById('cur_slide').id = 'pre_slide';
      document.getElementById('post_slide').id = 'cur_slide';
      const newPostSlide = document.createElement('div');
      newPostSlide.id = 'post_slide';
      newPostSlide.className = 'slide';
      newPostSlide.innerHTML = '<div class="content"></div>';
      document.getElementById('cur_slide').insertAdjacentElement('afterend', newPostSlide);

      nextChunk();
      e.preventDefault(); 
    }
    else if(dist < -100){
      const postSlide = document.getElementById('post_slide');
      postSlide.parentNode.removeChild(postSlide);
      document.getElementById('cur_slide').id = 'post_slide';
      document.getElementById('pre_slide').id = 'cur_slide';
      const newPreSlide = document.createElement('div');
      newPreSlide.id = 'pre_slide';
      newPreSlide.className = 'slide';
      newPreSlide.innerHTML = '<div class="content"></div>';
      document.getElementById('cur_slide').insertAdjacentElement('beforebegin', newPreSlide);

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
