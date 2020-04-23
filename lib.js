String.prototype.count=function(s1) { 
    return (this.length - this.replace(new RegExp(s1,"g"), '').length) / s1.length;
};
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
const copyToClipboard = str => {
  const el = document.createElement('textarea');  // Create a <textarea> element
  el.value = str;                                 // Set its value to the string that you want copied
  el.setAttribute('readonly', '');                // Make it readonly to be tamper-proof
  el.style.position = 'absolute';                 
  el.style.left = '-9999px';                      // Move outside the screen to make it invisible
  document.body.appendChild(el);                  // Append the <textarea> element to the HTML document
  const selected =            
    document.getSelection().rangeCount > 0        // Check if there is any content selected previously
      ? document.getSelection().getRangeAt(0)     // Store selection if found
      : false;                                    // Mark as false to know no selection existed before
  el.select();                                    // Select the <textarea> content
  document.execCommand('copy');                   // Copy - only works as a result of a user action (e.g. click events)
  document.body.removeChild(el);                  // Remove the <textarea> element
  if (selected) {                                 // If a selection existed before copying
    document.getSelection().removeAllRanges();    // Unselect everything on the HTML document
    document.getSelection().addRange(selected);   // Restore the original selection
  }
};
/*!
 * Check if two objects or arrays are equal
 * (c) 2017 Chris Ferdinandi, MIT License, https://gomakethings.com
 * @param  {Object|Array}  value  The first object or array to compare
 * @param  {Object|Array}  other  The second object or array to compare
 * @return {Boolean}              Returns true if they're equal
 */
var isEqual = function (value, other) {
  // Get the value type
  var type = Object.prototype.toString.call(value);
  // If the two objects are not the same type, return false
  if (type !== Object.prototype.toString.call(other)) return false;
  // If items are not an object or array, return false
  if (['[object Array]', '[object Object]'].indexOf(type) < 0) return false;
  // Compare the length of the length of the two items
  var valueLen = type === '[object Array]' ? value.length : Object.keys(value).length;
  var otherLen = type === '[object Array]' ? other.length : Object.keys(other).length;
  if (valueLen !== otherLen) return false;
  // Compare two items
  var compare = function (item1, item2) {
    // Get the object type
    var itemType = Object.prototype.toString.call(item1);
    // If an object or array, compare recursively
    if (['[object Array]', '[object Object]'].indexOf(itemType) >= 0) {
      if (!isEqual(item1, item2)) return false;
    }
    // Otherwise, do a simple comparison
    else {
      // If the two items are not the same type, return false
      if (itemType !== Object.prototype.toString.call(item2)) return false;
      // Else if it's a function, convert to a string and compare
      // Otherwise, just compare
      if (itemType === '[object Function]') {
        if (item1.toString() !== item2.toString()) return false;
      } else {
        if (item1 !== item2) return false;
      }
    }
  };
  // Compare properties
  if (type === '[object Array]') {
    for (var i = 0; i < valueLen; i++) {
      if (compare(value[i], other[i]) === false) return false;
    }
  } else {
    for (var key in value) {
      if (value.hasOwnProperty(key)) {
        if (compare(value[key], other[key]) === false) return false;
      }
    }
  }
  // If nothing failed, return true
  return true;
};

// Warn if overriding existing method
if(Array.prototype.equals)
    console.warn("Overriding existing Array.prototype.equals. Possible causes: New API defines the method, there's a framework conflict or you've got double inclusions in your code.");
// attach the .equals method to Array's prototype to call it on any array
Array.prototype.equals = function (array) {
    // if the other array is a falsy value, return
    if (!array)
        return false;

    // compare lengths - can save a lot of time 
    if (this.length != array.length)
        return false;

    for (var i = 0, l=this.length; i < l; i++) {
        // Check if we have nested arrays
        if (this[i] instanceof Array && array[i] instanceof Array) {
            // recurse into the nested arrays
            if (!this[i].equals(array[i]))
                return false;       
        }           
        else if (this[i] != array[i]) { 
            // Warning - two different object instances will never be equal: {x:20} != {x:20}
            return false;   
        }           
    }       
    return true;
}
// Hide method from for-in loops
Object.defineProperty(Array.prototype, "equals", {enumerable: false});

window.addEventListener("resize", function(){
  window.setTimeout(function(){
    document.activeElement.scrollIntoView({block: 'start'});
  },0);
});
let export_form = {};

let margins = [];
margins['narrow'] = [.5,.5,.5,.5,.5];
margins['wide'] = [1,2,1,2,1];
margins['normal'] = [1,1,1,1,1];

let text = [];
text['default'] = [
  {name: 'booktitle_size', value: '24'},{name: 'booktitle_space',    value:  '26'},
  {name: 'songtitle_size', value: '14'},{name: 'songtitle_space',    value:  '6' },
  {name: 'small_size',     value: '8' },{name: 'small_space',        value:  '8' },
  {name: 'songline_size',  value: '12'},{name: 'songline_space',     value:  '4' },{name: 'resize_percent', value:  '100'},
  {name: 'songchord_size', value: '12'},{name: 'songchord_space',    value:  '1' },
  {name: 'songchunk_b4',   value: '12'},{name: 'song_space_after',   value:  '12'},
  {name: 'copyright_size', value: '8' },{name: 'copyright_space_b4', value:  '3' }
];

text['small'] = [
  {name: 'booktitle_size', value: '18'},{name: 'booktitle_space',    value: '18'},
  {name: 'songtitle_size', value: '12'},{name: 'songtitle_space',    value: '4' },
  {name: 'small_size',     value: '6' },{name: 'small_space',        value: '6' },
  {name: 'songline_size',  value: '10'},{name: 'songline_space',     value: '2' },{name: 'resize_percent', value: '75'},
  {name: 'songchord_size', value: '8' },{name: 'songchord_space',    value: '1' },
  {name: 'songchunk_b4',   value: '10'},{name: 'song_space_after',   value: '10'},
  {name: 'copyright_size', value: '6' },{name: 'copyright_space_b4', value: '2' }
];

text['large'] = [
  {name: 'booktitle_size', value: '36'},{name: 'booktitle_space',    value: '30'},
  {name: 'songtitle_size', value: '18'},{name: 'songtitle_space',    value: '10'},
  {name: 'small_size',     value: '10'},{name: 'small_space',        value: '10'},
  {name: 'songline_size',  value: '14'},{name: 'songline_space',     value: '6' },{name: 'resize_percent', value: '100'},
  {name: 'songchord_size', value: '14'},{name: 'songchord_space',    value: '4' },
  {name: 'songchunk_b4',   value: '14'},{name: 'song_space_after',   value: '14'},
  {name: 'copyright_size', value: '10'},{name: 'copyright_space_b4', value: '4' }
];

let index = [];
index['default'] = [
  {name: 'index_title_size', value: '18'},{name: 'index_title_space', value: '6'},{name: 'index_title_font', value: 'Helvetica'},
  {name: 'index_title_b4',   value: '20'},
  {name: 'index_cat_size',   value: '14'},{name: 'index_cat_space',   value: '6'},{name: 'index_cat_font',   value: 'Helvetica'},
  {name: 'index_cat_b4',     value: '12'},
  {name: 'index_song_size',  value: '12'},{name: 'index_song_space',  value: '4'},{name: 'index_song_font',  value: 'Helvetica'},
  {name: 'index_first_line_size',  value: '11'},{name: 'index_first_line_space',  value: '4'},{name: 'index_first_line_font',  value: 'Helvetica-Oblique'}  
];
index['small'] = [
  {name: 'index_title_size', value: '14'},{name: 'index_title_space', value: '4'},{name: 'index_title_font', value: 'Helvetica'},
  {name: 'index_title_b4',   value: '16'},
  {name: 'index_cat_size',   value: '12'},{name: 'index_cat_space',   value: '4'},{name: 'index_cat_font',   value: 'Helvetica'},
  {name: 'index_cat_b4',     value: '10'},
  {name: 'index_song_size',  value: '10'},{name: 'index_song_space',  value: '2'},{name: 'index_song_font',  value: 'Helvetica'},
  {name: 'index_first_line_size',  value: '9'},{name: 'index_first_line_space',  value: '2'},{name: 'index_first_line_font',  value: 'Helvetica-Oblique'}  
];
index['large'] = [
  {name: 'index_title_size', value: '26'},{name: 'index_title_space', value: '10'},{name: 'index_title_font', value: 'Helvetica'},
  {name: 'index_title_b4',   value: '24'},
  {name: 'index_cat_size',   value: '18'},{name: 'index_cat_space',   value: '10'},{name: 'index_cat_font',   value: 'Helvetica'},
  {name: 'index_cat_b4',     value: '16'},
  {name: 'index_song_size',  value: '16'},{name: 'index_song_space',  value: '8'},{name: 'index_song_font',  value: 'Helvetica'},
  {name: 'index_first_line_size',  value: '14'},{name: 'index_first_line_space',  value: '6'},{name: 'index_first_line_font',  value: 'Helvetica-Oblique'}  
];

let def_configs = [];
def_configs['simple'] = [
  {name: 'paper_orientation',   value: 'portrait'},
  {name: 'paper_size',          value: 'LETTER'},
  {name: 'paper_margin_left',   value: '0.5'},
  {name: 'paper_margin_right',  value: '0.5'},
  {name: 'paper_margin_top',    value: '0.5'},
  {name: 'paper_margin_bottom', value: '0.5'},
  {name: 'column_gutter',       value: '0.5'},
  {name: 'page_layout',         value: 'single-sided'},
  {name: 'paper_margin_gutter', value: '0'},
  {name: 'font_face',           value: 'Helvetica'},
  {name: 'booktitle_size',      value: '36'},
  {name: 'booktitle_space',     value: '12'},
  {name: 'songtitle_size',      value: '18'},
  {name: 'songtitle_space',     value: '6'},
  {name: 'song_space_after',    value: '12'},
  {name: 'songchunk_b4',        value: '12'},
  {name: 'songline_size',       value: '12'},
  {name: 'songline_space',      value: '4'},
  {name: 'songchord_size',      value: '12'},
  {name: 'songchord_space',     value: '1'},
  {name: 'small_size',          value: '8'},
  {name: 'small_space',         value: '8'},
  {name: 'copyright_size',      value: '8'},
  {name: 'copyright_space_b4',  value: '3'},
  {name: 'columns',             value: '1'},
  {name: 'display_chords',      value: 'no'},
  {name: 'index_title_font',    value: 'Helvetica'},
  {name: 'index_title_b4',      value: '20'},
  {name: 'index_title_size',    value: '18'},
  {name: 'index_title_space',   value: '6'},
  {name: 'index_cat_font',      value: 'Helvetica'},
  {name: 'index_cat_b4',        value: '12'},
  {name: 'index_cat_exclude',   value: 'Needs,Duplicate'},
  {name: 'index_cat_size',      value: '14'},
  {name: 'index_cat_space',     value: '6'},
  {name: 'index_song_font',     value: 'Helvetica-Bold'},
  {name: 'index_song_size',     value: '12'},
  {name: 'index_song_space',    value: '4'},
  {name: 'index_first_line_font',  value: 'Helvetica-Oblique'},
  {name: 'index_first_line_size',  value: '11'},
  {name: 'index_first_line_space', value: '4'},
  {name: 'display_index',       value: 'on-new-page'},
  {name: 'scripture_location',  value: 'under-title'}
];
def_configs['3-column'] = [
  {name: 'paper_orientation',   value: 'landscape'},
  {name: 'paper_size',          value: 'LETTER'},
  {name: 'margin',              value: 'narrow'},
  {name: 'page_layout',         value: 'single-sided'},
  {name: 'font_face',           value: 'Helvetica'},
  {name: 'booktitle_size',      value: '36'},
  {name: 'booktitle_space',     value: '12'},
  {name: 'songtitle_size',      value: '18'},
  {name: 'songtitle_space',     value: '6'},
  {name: 'song_space_after',    value: '12'},
  {name: 'songchunk_b4',        value: '12'},
  {name: 'songline_size',       value: '12'},
  {name: 'songline_space',      value: '4'},
  {name: 'songchord_size',      value: '12'},
  {name: 'songchord_space',     value: '1'},
  {name: 'small_size',          value: '8'},
  {name: 'small_space',         value: '8'},
  {name: 'copyright_size',      value: '8'},
  {name: 'copyright_space_b4',  value: '3'},
  {name: 'columns',             value: '3'},
  {name: 'display_chords',      value: 'no'},
  {name: 'index_title_font',    value: 'Helvetica'},
  {name: 'index_title_b4',      value: '20'},
  {name: 'index_title_size',    value: '18'},
  {name: 'index_title_space',   value: '6'},
  {name: 'index_cat_font',      value: 'Helvetica'},
  {name: 'index_cat_b4',        value: '12'},
  {name: 'index_cat_exclude',   value: 'Needs,Duplicate'},
  {name: 'index_cat_size',      value: '14'},
  {name: 'index_cat_space',     value: '6'},
  {name: 'index_song_font',     value: 'Helvetica-Bold'},
  {name: 'index_song_size',     value: '12'},
  {name: 'index_song_space',    value: '4'},
  {name: 'index_first_line_font',  value: 'Helvetica-Oblique'},
  {name: 'index_first_line_size',  value: '11'},
  {name: 'index_first_line_space', value: '4'},
  {name: 'display_index',       value: 'on-new-page'},
  {name: 'scripture_location',  value: 'under-title'}
];

export_form.margins = margins;
export_form.text = text;
export_form.def_configs = def_configs;
export_form.index = index;
window.export = export_form;

function set_value_by_id(list) {
  for(item of list) {
    document.getElementById(item.name).value = item.value;
  }
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', {
    scope: './'
  })
  .then((serviceWorker) => {
    console.log('service worker registration successful');
  })
  .catch((err) => {
    console.error('service worker registration failed');
    console.error(err);
  });
} else {
  console.log('service worker unavailable');
}

function scaleRemove(el, time=250) {
  el.style = "transform: scale(1.2,0); background-color: orangered;";
  setTimeout(function(){ el.remove(); }, time);
}

function isChord(line) {
  var fraction = 0.45;
  var count = line.count(' ');

  if((line.length == 0) || !(line.match(/[a-z]/i))) {
    return false;
  }
  else if (line.length <= 4) {  //short chord lines
    return true;
  }
  else if (count/line.length > fraction) { //determines if it's a chord
    return true;
  }
  else { // you're not a chord
    return false;
  }
}
function is_chord_line(line) {
  if(line.search('<c>') != -1) {
    return true;
  }
  else {
    return false;
  }
}
function remove_chords(line){
  return line.replace(/<([^>]+?)([^>]*?)>(.*?)<\/\1>/ig, "");
}
function expand_chord(line){
  var CHORD_SPACE_RATIO = 0.45;
  var tmp = document.createElement('line');
  tmp.innerHTML = line;
  
  var old_line = Array.from(tmp.childNodes);
  line = '';
  var chord_line = '';
  old_line.forEach(function(item){
    if(item.nodeName === 'C'){
      chord_line += item.innerText;
    }
    else if(item.nodeName == '#text'){
      line += item.wholeText;
      if(line.length > chord_line.length) {
        chord_line += ' '.repeat(line.length - chord_line.length);
      }
    }
  });
  
  // Add space to the end of the chord line to make the chord recognized as a chord when reimporting.
  var w = chord_line.count(' ');
  var char = chord_line.length - w;

  var w_ad = parseInt(((CHORD_SPACE_RATIO * char)/(1-CHORD_SPACE_RATIO) - w) + 1);
  if (w_ad > 0) {
    chord_line += ' '.repeat(w_ad);
  }

  var expanded_line = chord_line + '\n' + line.trimEnd();
  return expanded_line;
}
function combine(chord, text) {
  //make text at least as long a chord length
  if (text.length < chord.length) {
    text += ' '.repeat(chord.length - text.length);
  }

  //convert chord to dictionary with [start, chord]
  var chords = {};
  var re = /[\S]+/g;
  while ((match = re.exec(chord)) != null) {
    chords[match.index] = chord.substring(match.index,(match.index + match[0].length));
  }

  //combine
  var line = text;
  var chord_keys = Object.keys(chords);
  chord_keys.sort((a, b) => b - a);
  for (let key in chord_keys) {
    line = line.substring(0,chord_keys[key])+'<c>'+chords[chord_keys[key]] + '</c>' + line.substring(chord_keys[key],line.length);
  }
  return line;
}
function parseHash(part) {
  var parts = location.hash.substr(1).split('&');
  //this is not failsafe
  if(part == 's-') {
    return parts[1];
  }
  else if (part == 'sb-') {
    return parts[0];
  }
  else {
    return parts;
  }
}
function updateAllLinks(whatChanged='all') {
  $('[data-song-edit]').attr('href','#'+window.songbook._id+'&'+window.song._id+'&edit');
  $('[data-song-edit="new"]').attr('href','#'+window.songbook._id+'&s-new-song&edit');
  $('[data-song]').attr('href','#'+window.songbook._id+'&'+window.song._id);
  $('[data-song-export]').attr('href','#'+window.songbook._id+'&'+window.song._id+'&export');
  $('[data-songbook-edit]').attr('href','#'+window.songbook._id+'&edit');
  $('[data-songbook-edit="new"]').attr('href','#sb-new-songbook&edit');
  $('[data-songbook-present]').attr('href', '#'+window.songbook._id+'&present');
  $('[data-songbook]').attr('href','#'+window.songbook._id);
  $('[data-songbook-export]').attr('href','#'+window.songbook._id+'&export');
  $('[data-home]').attr('href','#');

  //add highlighting
  //doesn't happen after it's done rendering the list.js on initial page load.
  $('.song-highlight').removeClass('song-highlight');
  $("[data-song-id='"+window.song._id+"']").addClass("song-highlight");
  $('.songbook-highlight').removeClass('songbook-highlight');
  $("[data-songbook-id='"+window.songbook._id+"']").addClass("songbook-highlight");
}

$(function () {
  //float menu activation
  $('body').on('click', '.float-menu-toggle', function() {
    $(this).children('.float-menu-icon').toggleClass('icon-rotate');
    $(this).siblings().toggleClass('uncollapsed');
  });

  //chord toggling
  $('body').on('click', '.toggle-chords', function() {
    $('#song').toggleClass('nochords');
  });

  $('#present').mousedown(function(event) {
    switch (event.which) {
      case 1:
        //alert('Left mouse button pressed');
        window.location = '#'+window.songbook._id+'&present';
        break;
      case 2:
        //alert('Middle mouse button pressed');
        window.location = '#'+window.songbook._id+'&present+new';
        break;
      case 3:
        //alert('Right mouse button pressed');
        window.location = '#'+window.songbook._id+'&present+new';
        break;
      default:
        //alert('You have a strange mouse');
        window.location = '#'+window.songbook._id+'&present';
    }
  });
});

//initial logging of alerts... probably better not to have it be the console ultimately?
if (typeof console  != "undefined") 
    if (typeof console.log != 'undefined')
        console.olog = console.log;
    else
        console.olog = function() {};

/*console.log = function(message) {
    console.olog(message);
    $('#debugDiv').prepend('<p>' + message + '</p>');
};
console.error = console.debug = console.info =  console.log
*/

function toggleFullscreen(el){
  var fullscreen = $(el).closest(".column");
  var full = fullscreen.hasClass('fullscreen');
  console.log(full);

  $('.fullscreen').removeClass('fullscreen');
  if(!full) {
    fullscreen.addClass('fullscreen');
  }
}

function bindSearchToList(list, id){
  list.on('searchComplete', function(){
    $(id + ' .search + span').attr('data-number-visible',list.visibleItems.length);
  });
  $(id + ' .search+span').attr('data-number-visible', $(id + ' .list li').length);
}

function bindToSongEdit() {
  $('#song').on('change', '[type="checkbox"]', function() {
    //add/remove categories as checkboxes are modified
    var cats = $('categories').text().trim();
    if(cats != ''){
      cats = cats.split(',').map(Function.prototype.call, String.prototype.trim);
    }
    else {
      cats = [];
    }
    if(this.checked) {
      $('categories').text(cats.concat($(this).next().text()).sort().join(', '));
    }
    else{
      $('categories').text(cats.filter(cat => cat != $(this).next().text()).sort().join(', '));
    }
  });
  $('#song').on('change', 'select', function(){
    $(this).next().attr('type',$(this).find('option:selected').text());
  });
}

function checkLogin(){
  let good = true;
  let pin = $('#pin').val();
  let username = $('#username').val();

  if(pin.trim() == '' || username.trim() == ''){
    good = false;
    alert('Username or password not entered');
  }

  return good;
}

function checkCreateNew() {
  let dbName = $('#newDbName').val().trim();
  if(dbName.includes('(local)')){
    alert('DB name cannot have "(local)" in the name');
    return
  }
  else {
    dbName += '(local)';
  }
  let pin = $('#pin').val().trim();
  let pin2 = $('#pin2').val().trim();
  let username = $('#username').val();

  return PouchDB.allDbs().then(function (all_dbs) {
    let response = true;

    //checks against existing databases
    if(all_dbs.indexOf(dbName) > -1){
      alert('Database name already taken - try another!');
      response = false;
    }
    else if(pin == '' || username == ''){
      response = false;
      alert('Username or pin are not entered');
    }
    else if(pin != pin2) {
      response = false;
      alert('Pin and confirmation pin are not equal');
    }
    //Go ahead and log in.
    if(response) {
      dbLogin(true);
    }
    else {
      return;
    }
  });
}

function setLoginState() {
  window.loggedin = true;
  $('html').addClass('loggedin');
  $('#title a').html('yCanta: ' + window.yCantaName);
  if(location.hash.indexOf('?')>-1){
    location.hash = location.hash.split('?').slice(1).join('?');
  }
  else {
    location.hash = '#';
  }
}

function setLogoutState() {
  window.loggedin = false;
  $('html').removeClass('loggedin');
  location.hash = '#login';
  window.user = '';
  localStorage.removeItem('loggedin');
  $('#title a').html('yCanta');
}

function mapSongbookRowToValue(row) {
  return { 'songbook-id':           row.doc._id,
    'songbook-rev':                 row.doc._rev,
    'songbook-title':        't:' + row.doc.title,
    'link': '#'+row.doc._id,
    'name': row.doc.title
  };
}
function mapSongRowToValue(row) {
  return { 'song-id':           row.doc._id,
    'song-rev':                 row.doc._rev,
    'song-search':              row.doc.search,
    'link': '#'+window.songbook._id+'&'+row.doc._id,
    'name': row.doc.title
  };
}

function buildSongbookList(songs, target_class='songbook_content', 
                                  template='song-item-template', 
                                  edit=false) {
  var options = {    
    valueNames: [
      { data: ['song-id'] },
      { data: ['song-rev'] },
      { data: ['song-search'] },
      { name: 'link', attr: 'href'},
      'name'
    ],
    item: template
  };
  var values = [];   
  var i;
  for (i = 0; i < songs.length; i++) { 
    //I tried to use saved_list as a standin variable for the window object we save below - it never worked out so I'm using this clunky bit of code here.
    let save_list;
    if(edit != true) {
      saved_list = window.songbook_list;
    }
    else {
      saved_list = window.songbook_edit_togglesongs_list;
    }

    if(saved_list != undefined){
      var songIdInList = saved_list.get('song-id',songs[i].doc._id);
      if(songIdInList.length > 0){
        // we need to update if the revision is different.
        var songRevInList = saved_list.get('song-rev', songs[i].doc._rev);
        if(songRevInList < 1){
          songIdInList[0].values(mapSongRowToValue(songs[i]));
          console.log('heya!');
        }
        return;
      }
    }
    values.push(mapSongRowToValue(songs[i]));
  }
  db.get('categories').then(function(categories){
    $('#category_filter select').html('<option value=""></option><option value="c:!c">No Category</option>'+categories.categories.map(cat => '<option value="c:'+cat+'">'+cat+'</option>').join("")); //Construct the options for the drop down from this list.
  });

  //Creates list.min.js list for viewing the songbook
  if(edit != true) {
    window.songbook_list = new List(target_class, options, values);
    bindSearchToList(window.songbook_list, '#songbook_content');
    $('#songbook_content input').trigger('change')[0].dispatchEvent(new KeyboardEvent("keyup"));
  }
  else{
    window.songbook_edit_togglesongs_list = new List(target_class, options, values);
    bindSearchToList(window.songbook_edit_togglesongs_list, '#songListEdit');
  }
  return;
}
function dataxInBookUpdate(song, remove=false){
  var songA = $('#songListEdit li[data-song-id="'+$(song).attr('data-song-id')+'"]');
  var number=null;
  if(remove){
    number = parseInt(songA.attr('data-xInBook'))-1;
  }
  else if(songA.attr('data-xInBook') === undefined) {
    number = 1;
  }
  else {
    number = parseInt(songA.attr('data-xInBook'))+1;
  }
  
  if(number===0){
    songA.removeAttr('data-xInBook');
  }
  else {
    songA.attr('data-xInBook',  number);
  }
}
function bind_songbook_edit(song){
  $(song).children().removeAttr('href');
  song.setAttribute('draggable', 'true');  // Enable columns to be draggable.
  song.addEventListener('dragstart', dragStart, false);
  song.addEventListener('dragenter', dragEnter, false);
  song.addEventListener('dragover', dragOver, false);
  song.addEventListener('dragleave', dragLeave, false);
  song.addEventListener('drop', dragDrop, false);
  song.addEventListener('dragend', dragEnd, false);
}
function bind_chunk_edit(chunk){
  chunk.setAttribute('draggable', 'true');  // Enable columns to be draggable.
  chunk.addEventListener('dragstart', function(event){dragStart(event,'.wrap');}, false);
  chunk.addEventListener('dragenter', function(event){dragEnter(event,'.wrap');}, false);
  chunk.addEventListener('dragover', dragOver, false);
  chunk.addEventListener('dragleave', function(event){dragLeave(event,'.wrap');}, false);
  chunk.addEventListener('drop', function(event){dragDrop(event,'.wrap');}, false);
  chunk.addEventListener('dragend', function(event){dragEnd(event,'.wrap');}, false);
  $(chunk).children().hover(
    function(){chunk.setAttribute('draggable', 'false');},
    function(){chunk.setAttribute('draggable', 'true');}
  );
}

function editSongbook() {
  let buttons = '<div class="edit_buttons"><button data-songbook class="btn" style="background-color: lightgray;" onclick="saveSongbook(parseHash(\'sb-\'));">Save</button>';
  buttons += '<button data-songbook class="btn" style="background-color: lightgray;" onclick="window.editing=false; window.songbook._id=\'\'; window.location.hash=$(this).attr(\'href\'); $(\'.edit_buttons\').remove();">Cancel</button>';
  buttons += '<button data-songbook class="btn" style="background-color: lightgray;" onclick="window.editing=false; location.reload()">Reset</button></div>';
  $('#songbook_content').prepend(buttons).append(buttons);
  $('#songbook_content .search').val('')[0].dispatchEvent(new KeyboardEvent('keyup'));
  updateAllLinks();

  $('#songList #songbook_title').attr('contenteditable', 'true');
  $('#songList #songbook_content input.search').parent().addClass('disabled-hidden')[0].disabled=true;
  $('#songList #songbook_content nav').addClass('disabled-hidden');    

  //load all the songs into song adder
  db.allDocs({
    include_docs: true,
    startkey: 's-',
    endkey: 's-\ufff0',
  }).then(function(result){
    window.editing = true;
    //this cleanwipe might not be performant!
    if(window.songbook_edit_togglesongs_list != undefined){
      window.songbook_edit_togglesongs_list.clear();
    }
    return buildSongbookList(result.rows.sort(function(a, b){
          if(a.doc.title < b.doc.title) { return -1; }
          if(a.doc.title > b.doc.title) { return 1; }
          return 0;
        }), 
      'songbook_edit_togglesongs', 
      'song-item-template-edit', 
      true);
  }).then(function(result) {
    $('.song-highlight').removeClass('song-highlight');
    //remove all counts
    $('[data-xInBook]').removeAttr('data-xInBook');
    //bind events to the songbook list
    [].forEach.call(document.querySelectorAll('#songList #songbook_content ul li'), function (song) {
      bind_songbook_edit(song);
      dataxInBookUpdate(song);
      $(song).find('a').after('<button>&#128465;</button>');
      $(song).find('button')[0].addEventListener('click', function( e ) {
        dataxInBookUpdate(song, true);
        scaleRemove(song);
      });
    });
    [].forEach.call(document.querySelectorAll('#songList #songbook_edit_togglesongs ul li'), function (song) {
      bind_songbook_edit(song);
      song.addEventListener('click', function( e ) {
        var copySong = $(e.target).closest('li')[0].cloneNode(true);
        bind_songbook_edit(copySong);
        dataxInBookUpdate(copySong);
        $(copySong).find('a').after('<button>&#128465;</button>');
        $(copySong).find('button')[0].addEventListener('click', function( e ) {
          dataxInBookUpdate(copySong, true);
          scaleRemove(copySong);
        });
        $('#songbook_content .list').append(copySong);
        $('#songbook_content .list li:last-child')[0].scrollIntoView();
      });
    });
    $('#songList ul.list').each(function(){
      this.addEventListener('drop', dragDrop, false);
      this.addEventListener('dragover', dragOver, false);
    });
    
    $('#songList #songbook_title').parent().removeAttr('href');

  }).catch(function(err){
    console.log(err);
  });
}

function editSong() {
  let buttons = '<div><button data-song class="btn" style="background-color: lightgray;" onclick="prepSaveSong($(this))">Save</button>';
  buttons += '<button data-song class="btn" style="background-color: lightgray;" onclick="window.editing=false; window.location.hash=$(this).attr(\'href\');">Cancel</button>';
  buttons += '<button data-song class="btn" style="background-color: lightgray;" onclick="window.editing=false; location.reload()">Reset</button></div>';
  $('song').before(buttons).append(buttons);

  $('chunk').each(function(index){
    var content = [];
    $(this).children('line').each(function(index){
      if(is_chord_line($(this).html())){
        content.push(expand_chord($(this).html()));
      }
      else {
        content.push($(this).html());
      }
    });
    $(this).html(content.join('\n')).addClass('pre');
    var type = $(this).attr('type');
    $(this).wrap('<div class="wrap"></div>').parent().prepend('<select name="types" size="1"><option value="verse">Verse</option><option value="chorus">Chorus</option><optgroup label="Misc"><option value="pre-chorus">Pre-Chorus</option><option value="final chorus">Final Chorus</option><option value="bridge">Bridge</option><option value="ending">Ending</option><option value="no label">No Label</option><option value="indented no label">Indented No Label</option><option value="comment">Comment</option></optgroup></select>');
    $(this).parent().find('select').val(type.toLowerCase());
    bind_chunk_edit($(this).closest('.wrap')[0]);
  });

  $('#song authors').html($('#song author').map(function(){return $(this).text();}).get().join(', '));
  $('#song categories').html($('#song cat').map(function(){return $(this).text();}).get().join(', '));
  $('#song scripture_ref').html($('#song cat').map(function(){return $(this).text();}).get().join(', '));
  $('#song').first('.subcolumn').find('stitle,authors,scripture_ref,introduction,key,chunk,copyright').toTextarea({
    allowHTML: false,//allow HTML formatting with CTRL+b, CTRL+i, etc.
    allowImg: false,//allow drag and drop images
    doubleEnter: true,//make a single line so it will only expand horizontally
    singleLine: false,//make a single line so it will only expand horizontally
    pastePlainText: false,//paste text without styling as source
    placeholder: false//a placeholder when no text is entered. This can also be set by a placeholder="..." or data-placeholder="..." attribute
  });
  $('#song categories').addClass('contenteditable-disabled').prop('tabindex',"0")
    .on('click', function(){
      $('#song-edit').toggleClass('sidebar-open').find('.search').focus();
    });
  window.editing = true;

  //load categories
  db.get('categories').then(function(categories) {
    var options = {valueNames: ['name'], item: 'category-template'};
    var values = [];   
    categories.categories.map(function (cat) {
      if(window.categories_list != undefined){
        var catInList = window.categories_list.get('name',cat);
        if(catInList.length > 0){
          return;
        }
      }
      values.push({ 'name': cat});
    });
    window.categories_list = new List('categories', options, values);
    bindSearchToList(window.categories_list, '#categories');
    //set checkboxes
    $('#song [type="checkbox"]').prop("checked", false);
    $('categories').text().split(',').forEach(function(cat){
      if(cat.trim()!= ''){
        $('label span:contains("'+cat.trim()+'")').prev().prop("checked", true);
      }
    });
    $('#song .title_link').removeAttr('href');

  }).catch(function (err) {
    console.log(err);
    reject('got an error while working on categories');
    //should load the songbook and explain what's up.
  });  
}
function prepSaveSong(element) {
  if($('stitle').text().trim() == ''){
    alert('Please add a title before you save');
    return
  }
  else{
    window.editing=false;
  }
  return new Promise(function(resolve, reject) {
    $('#song').first('.subcolumn').find('song').children().attr('contenteditable', 'false');
    $('song chunk').each(function(index){
      var lines = $(this).html().split('\n');
      var prev_is_chord = false;
      var content = '';
      $(lines).each(function(index){
        if(prev_is_chord){
          content += '<line>'+combine(lines[index-1],this)+'</line>';
          prev_is_chord = false;
        }
        else if(isChord(this)){
          prev_is_chord = true;
        }
        else if(this.length > 0){  //we have a line
          content += '<line>'+this+'</line>';
        }
      });
      $(this).html(content);
    });
    resolve('song is prepped for saving');
  }).then(function() {
    return saveSong(parseHash('s-'));
  }).then(function() {
    window.location.hash=$(element).attr('href'); 
  }).catch(function (err) {
    console.log(err);
  });
}
function prepExport(){
  document.getElementById('pdf_progress').style.width = 0 +'%';
  document.getElementById('pdf_progress_text').innerHTML = 0 +'%';
  document.querySelector('iframe').src = "";
  $('#display_chords').trigger('change');
  db.allDocs({
    include_docs: true,
    startkey: 'cfg-'+window.exportObject._id,
    endkey: 'cfg-'+window.exportObject._id+'\ufff0',
  }).then(function(result){
    let innerhtml = '';
    let user_id_cfg = 'cfg-'+window.exportObject._id+'USER'; //must keep in sync with db.js
    result.rows.map(function (row) {
      if(row.doc._id == user_id_cfg) {
        innerhtml = "<option id='user_export_pref' value='"+JSON.stringify(row.doc.cfg)+"'>"+row.doc.title+"</option>" + innerhtml;
      }
      else {
        innerhtml += "<option value='"+JSON.stringify(row.doc.cfg)+"'>"+row.doc.title+"</option>";
      }
    });

    let opts = window.export.def_configs;
    for(opt in opts) {
      innerhtml += "<option value='"+JSON.stringify(opts[opt])+"'>"+opt+"</option>";
    }
    innerhtml += "<option value='[]'>Custom</option>";
    $('#format').html(innerhtml).trigger('change');
  });

}
function export_form_summary_update() {
  document.getElementById('format').value = JSON.stringify([]);
  for(option of $('#format option')) {
    let opts = [];
    let values = JSON.parse(option.value);
    if(isEqual(values,[])){
      continue // this is empty!
    }
    for(item of values) {
      opts.push({name: item.name, value: document.getElementById(item.name).value});
    }
    if(isEqual(opts, values)){
      document.getElementById('format').value = JSON.stringify(values);
      break // we've found a match
    }
  }

  $('#page_icon').html('<span class="col"></span>'.repeat($('#columns').val()));
  document.getElementById('page_icon').className = document.getElementById('page_layout').value.replace('-','_');
  document.getElementById('page_icon').classList.add(document.getElementById('paper_orientation').value);
  let margin_icon = document.getElementById('margin_icon');
  let margins = [document.getElementById('paper_margin_top').value,
                 document.getElementById('paper_margin_right').value,
                 document.getElementById('paper_margin_bottom').value,
                 document.getElementById('paper_margin_left').value,
                 document.getElementById('column_gutter').value]

  let margin_name;
  if(margins.equals(window.export.margins['normal'])){
    margin_name = 'normal';
  }
  else if(margins.equals(window.export.margins['narrow'])){
    margin_name = 'narrow';
  }
  else if(margins.equals(window.export.margins['wide'])){
    margin_name = 'wide';
  }
  else {
    margin_name = 'custom';
  }
  document.getElementById('margin').value = margin_name;
  margin_icon.className = margin_name;
  margin_icon.classList.add(document.getElementById('paper_orientation').value);
  document.getElementById('margin_summary').innerHTML = margin_name;
  document.getElementById('margin_summary_nums').innerHTML = margins[3] + "\"";
  document.getElementById('margin_gutter').innerHTML = "Gutter: " + document.getElementById('paper_margin_gutter').value + "\"";
  document.getElementById('page_size_summary').innerHTML = document.getElementById('paper_size').value;

  document.getElementById('font_summary').innerHTML = document.getElementById('font_face').value;

  let text = [];
  for(item of window.export.text['default']) {
    text.push({name: item.name, value: document.getElementById(item.name).value});
  }
  let text_name;
  if(isEqual(text, window.export.text['default'])){
    text_name = 'default';
  }
  else if(isEqual(text, window.export.text['small'])){
    text_name = 'small';
  }
  else if(isEqual(text, window.export.text['large'])){
    text_name = 'large';
  }
  else {
    text_name = 'custom';
  }
  document.getElementById('text').value = text_name;
  document.getElementById('text_summary').innerHTML = text_name;
  let song_title_format = document.getElementById('songtitle_format').value.replace('${num}', '1') + 'Arise';
  if(document.getElementById('scripture_location').value == 'in-title'){
    song_title_format += ' (Jude 1)';
  }
  document.getElementById('song_title_summary').innerHTML = song_title_format;
  document.getElementById('ccli_summary').innerHTML = 'CCLI: ' + (document.getElementById('ccli').value || 'none');
  let print_summary = '';
  if(document.getElementById('print_a').checked){
    print_summary += '👍';
  }
  if(document.getElementById('print_n').checked){
    print_summary += '⏱️';
  }
  if(document.getElementById('print_r').checked){
    print_summary += '👎';
  }
  if(print_summary == ''){
    print_summary = 'all';
  }
  document.getElementById('print_summary').innerHTML = 'Print: ' + print_summary;
  document.getElementById('chords_summary').innerHTML = 'Chords: ' + document.getElementById('display_chords').value;

  document.getElementById('alphabetical_summary').innerHTML = 'Index: ' + document.getElementById('display_index').options[document.getElementById('display_index').selectedIndex].text;
  document.getElementById('category_summary').innerHTML = 'Category: ' + document.getElementById('display_cat_index').options[document.getElementById('display_cat_index').selectedIndex].text;
  document.getElementById('scripture_summary').innerHTML = 'Scripture: ' + document.getElementById('display_scrip_index').options[document.getElementById('display_scrip_index').selectedIndex].text;
  let index = [];
  for(item of window.export.index['default']) {
    index.push({name: item.name, value:document.getElementById(item.name).value});
  }

  let index_name;
  if(isEqual(index, window.export.index['default'])){
    index_name = 'default';
  }
  else if(isEqual(index, window.export.index['small'])){
    index_name = 'small';
  }
  else if(isEqual(index, window.export.index['large'])){
    index_name = 'large';
  }
  else {
    index_name = 'custom';
  }
  document.getElementById('index').value = index_name;
  document.getElementById('index_summary').innerHTML = index_name;

  if($('#auto_refresh').is(":checked")){
    makePDF(window.exportObject, document.querySelector('iframe'))
  }
}

//Making things work with touch coolness
function makeDraggable(dragCaptureEl, dragEl, dragAction, dragSide='right') {
  let startx = 0;
  let starty = 0;
  let dist = 0;
  let disty = 0;
  let width = 0;
  let height = 0;

  dragCaptureEl.addEventListener('touchstart', function(e){
    document.documentElement.classList.add('no-overscroll');
    var touchobj = e.changedTouches[0]; // reference first touch point (ie: first finger)
    startx = parseInt(touchobj.clientX);
    starty = parseInt(touchobj.clientY);
    width = dragEl.offsetWidth; // get x position of touch point relative to left edge of browser
    height = dragEl.offsetHeight; // get x position of touch point relative to left edge of browser

    // only do stuff if in right place
    if (dragSide == 'right'){
      if ((window.editing || e.target.closest('#export')) && startx > dragCaptureEl.offsetLeft + dragCaptureEl.offsetWidth - width - 32 && startx < dragCaptureEl.offsetLeft + dragCaptureEl.offsetWidth - width + 32) { 
        dragEl.style.transition = 'all 0s';
        //e.preventDefault();
      }
      else {
        startx = false;
      }
    }
    else if (dragSide == 'top'){
      if((starty > height) && (starty < height + 100)) { 
        dragEl.style.transition = 'all 0s';
        //e.preventDefault();
      }
      else {
        startx = false;
      }
    }
  }, {passive: true});

  dragCaptureEl.addEventListener('touchmove', function(e){
    if(startx){
      var touchobj = e.changedTouches[0]; // reference first touch point for this event
      var dist = parseInt(touchobj.clientX) - startx;
      var disty = parseInt(touchobj.clientY) - starty;

      if (dragSide == 'right'){
        dragEl.style.flex = '0 0 '+ parseInt((width-dist)) + 'px';
        e.preventDefault();
      }
      else if (dragSide == 'top'){
        dragEl.style.flex = '0 0 '+ parseInt((height+disty)) + 'px';
        e.preventDefault();   
      }
    }
  }, false);

  dragCaptureEl.addEventListener('touchend', function(e){
    document.documentElement.classList.remove('no-overscroll');
    dragEl.style.removeProperty('flex');
    dragEl.style.removeProperty('transition');
    var touchobj = e.changedTouches[0]; // reference first touch point for this event
    var dist = Math.abs(parseInt(touchobj.clientX) - startx);
    var disty = Math.abs(parseInt(touchobj.clientY) - starty);
    
    if (startx && dragSide == 'right' && dist > 100 ){ //make sure that distance isn't just accidental
      dragAction(dragEl, 'sidebar-open');
      e.preventDefault(); 
    }
    else if (startx && dragSide == 'top' && disty > 200 ){
      dragAction();
      e.preventDefault();
    }
  }, false); 
}

function sayHi(message) {
  window.alert(message);
}
function dragToggleClass(el, toggleClass) {
  $(el).toggleClass(toggleClass);
}
window.addEventListener('load', function(){
  makeDraggable(document.getElementById('song'),
                document.getElementById('song-edit'),
                dragToggleClass);
}, false);
window.addEventListener('load', function(){
  makeDraggable(document.getElementById('songList'),
                document.getElementById('songListEdit'),
                dragToggleClass);
}, false);
window.addEventListener('load', function(){
  makeDraggable(document.getElementById('export'),
                document.getElementById('exportPreview'),
                dragToggleClass);
}, false);
window.addEventListener('load', function(){
  makeDraggable(document.getElementById('songbookList'),
                document.getElementById('header'),
                function(){if(!confirmWhenEditing()) {window.location.hash = '';}}, 'top');
}, false);
window.addEventListener('load', function(){
  makeDraggable(document.getElementById('songList'),
                document.getElementById('songbookList'),
                function(){if(!confirmWhenEditing()) {window.location.hash = '#songbooks';}}, 'top');
}, false);
window.addEventListener('load', function(){
  makeDraggable(document.getElementById('song'),
                document.getElementById('songList'),
                function(){if(!confirmWhenEditing()) {window.location.hash = '#'+window.songbook._id;}}, 'top');
}, false);
window.addEventListener('load', function(){
  makeDraggable(document.getElementById('export'),
                document.getElementById('song'),
                function(){if(!confirmWhenEditing()) {window.location.hash = window.location.hash.replace('&export','');}}, 'top');
}, false);


function bindSearch(element, search_prefix) {
  $('body').on('click', element, function() {
    if(window.editing || $('body').hasClass('export')) {
      return;
    }
    $('#songbook_content .search').val(search_prefix+$(this).text())[0]
      .dispatchEvent(new KeyboardEvent("keyup"));
  });
}

function confirmWhenEditing() {
  if(window.editing){
    if (confirm("If you leave this page you will lose your unsaved changes!")) {
      window.editing=false; //It's ok to lose changes
      return false;
    } else { //we aren't leaving 
      return true;
    }
  }
}

//fun little function for counting syllables.  Need to create breaks in the line instead... if we were to use this for Chord positioning.
function count(word) {
  word = word.toLowerCase(); 
  word = word.replace(/(?:[^laeiouy]|ed|[^laeiouy]e)$/, ''); 
  word = word.replace(/^y/, ''); 
  //return word.match(/[aeiouy]{1,2}/g).length; 
  var syl = word.match(/[aeiouy]{1,2}/g);
  console.log(syl);
  if(syl) {
    //console.log(syl);
    return syl.length;
  }
}
