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
  notyf.info('Config copied to your clipboard', 'var(--export-color)');
  blueHighlight(document.getElementById('export_copy'));
};
function pasteFromClipboard() {
  navigator.clipboard.readText().then(text => {
    set_value_by_id(JSON.parse(text)); $('#paper_margin_top').trigger('change');
  }).catch(err => {
    console.error('Failed to read clipboard contents: ', err);
  }); 
  blueHighlight(document.getElementById('export_paste'));
  notyf.info('Config pasted from your clipboard', 'var(--export-color)');
}
function blueHighlight(highlightElement){
  highlightElement.classList.add('bluehighlight'); 
  setTimeout(function(){ highlightElement.classList.remove('bluehighlight')}, 300);
}
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

var notyf = new Notyf({
  duration: 5000,
  position: {x: 'left', y: 'bottom'},
  types: [{
      type: 'info',
      background: 'var(--songbookList-color)',
      icon: false
    },{
      type: 'success',
      background: 'var(--song-color)',
      icon: false
    }]
});

notyf.info = function(message, color='var(--songbookList-color)', url=false){
  if(url){
    notyf.open({
      type: 'info',
      message: message,
      background: color
    }).on('click', ({target, event}) => {
      window.location.href = url;
    });
  } else {
    notyf.open({
      type: 'info',
      message: message,
      background: color
    });
  }
}

var dysmyssable = new Notyf({
  duration: 0,
  position: {x: 'center', y: 'top'},
  types: [{
      type: 'info',
      background: 'var(--songbookList-color)',
      icon: true
    }],
  dismissible: true
});

dysmyssable.info = function(message, color='var(--songbookList-color)', url=false){
  if(url){
    dysmyssable.open({
      type: 'info',
      message: message,
      background: color
    }).on('click', ({target, event}) => {
      window.location.hash = url;
    });
  } else {
    dysmyssable.open({
      type: 'info',
      message: message,
      background: color
    });
  }
}

window.addEventListener("resize", function(){
  window.setTimeout(function(){
    document.activeElement.scrollIntoView({block: 'start'});
  },0);
});
let export_form = {};

let margins = [];
margins['narrow'] = [.5,.5,.5,.5,.5,0];
margins['wide'] = [1,2,1,2,1,1];
margins['normal'] = [1,1,1,1,1,1];

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
  {name: 'index_title_size', value: '18'},{name: 'index_title_space', value: '6'},{name: 'index_title_font', value: 'Times-Roman'},
  {name: 'index_title_b4',   value: '20'},
  {name: 'index_cat_size',   value: '14'},{name: 'index_cat_space',   value: '6'},{name: 'index_cat_font',   value: 'Times-Roman'},
  {name: 'index_cat_b4',     value: '12'},
  {name: 'index_song_size',  value: '12'},{name: 'index_song_space',  value: '4'},{name: 'index_song_font',  value: 'Times-Roman'},
  {name: 'index_first_line_size',  value: '11'},{name: 'index_first_line_space',  value: '4'},{name: 'index_first_line_font',  value: 'Times-Italic'},
  {name: 'index_cat_exclude',   value: 'Needs,Duplicate'}
];
index['small'] = [
  {name: 'index_title_size', value: '14'},{name: 'index_title_space', value: '4'},{name: 'index_title_font', value: 'Times-Roman'},
  {name: 'index_title_b4',   value: '16'},
  {name: 'index_cat_size',   value: '12'},{name: 'index_cat_space',   value: '4'},{name: 'index_cat_font',   value: 'Times-Roman'},
  {name: 'index_cat_b4',     value: '10'},
  {name: 'index_song_size',  value: '10'},{name: 'index_song_space',  value: '2'},{name: 'index_song_font',  value: 'Times-Roman'},
  {name: 'index_first_line_size',  value: '9'},{name: 'index_first_line_space',  value: '2'},{name: 'index_first_line_font',  value: 'Times-Italic'},
  {name: 'index_cat_exclude',   value: 'Needs,Duplicate'}
];
index['large'] = [
  {name: 'index_title_size', value: '26'},{name: 'index_title_space', value: '10'},{name: 'index_title_font', value: 'Times-Roman'},
  {name: 'index_title_b4',   value: '24'},
  {name: 'index_cat_size',   value: '18'},{name: 'index_cat_space',   value: '10'},{name: 'index_cat_font',   value: 'Times-Roman'},
  {name: 'index_cat_b4',     value: '16'},
  {name: 'index_song_size',  value: '16'},{name: 'index_song_space',  value: '8'},{name: 'index_song_font',  value: 'Times-Roman'},
  {name: 'index_first_line_size',  value: '14'},{name: 'index_first_line_space',  value: '6'},{name: 'index_first_line_font',  value: 'Times-Italic'},
  {name: 'index_cat_exclude',   value: 'Needs,Duplicate'}
];

let def_configs = [];
def_configs['1-column'] = [
  {name: 'font_face',           value: 'Times-Roman'}, // Text Options
  {name: 'display_chords',      value: 'no'},
  {name: 'start_song_on_new_page', value: false},
  {name: 'hide_booktitle',      value: 'yes'},
  {name: 'songtitle_format',    value: '${num} '},
  {name: 'scripture_location',  value: 'under-title'},
  {name: 'text',                value: 'default' },
  {name: 'columns',             value: '1'},           // Page Options
  {name: 'page_layout',         value: 'single-sided'},
  {name: 'paper_orientation',   value: 'portrait'},
  {name: 'paper_size',          value: 'LETTER'},
  {name: 'margin',              value: 'normal'},
  {name: 'paper_margin_gutter', value: '1'},
  {name: 'display_index',       value: 'no-index'},    // Index Options
  {name: 'include_first_line',  value: false},
  {name: 'display_cat_index',   value: 'no-index'},
  {name: 'display_scrip_index', value: 'no-index'},
  {name: 'index',               value: 'default'}
];
def_configs['2-column'] = [
  {name: 'font_face',           value: 'Times-Roman'}, // Text Options
  {name: 'display_chords',      value: 'no'},
  {name: 'start_song_on_new_page', value: false},
  {name: 'hide_booktitle',      value: 'yes'},
  {name: 'songtitle_format',    value: '${num} '},
  {name: 'scripture_location',  value: 'under-title'},
  {name: 'text',                value: 'default' },
  {name: 'columns',             value: '2'},           // Page Options
  {name: 'page_layout',         value: 'single-sided'},
  {name: 'paper_orientation',   value: 'portrait'},
  {name: 'paper_size',          value: 'LETTER'},
  {name: 'margin',              value: 'narrow'},
  {name: 'display_index',       value: 'no-index'},    // Index Options
  {name: 'include_first_line',  value: false},
  {name: 'display_cat_index',   value: 'no-index'},
  {name: 'display_scrip_index', value: 'no-index'},
  {name: 'index',               value: 'default'}
];
def_configs['3-column'] = [
  {name: 'font_face',           value: 'Times-Roman'}, // Text Options
  {name: 'display_chords',      value: 'no'},
  {name: 'start_song_on_new_page', value: false},
  {name: 'hide_booktitle',      value: 'yes'},
  {name: 'songtitle_format',    value: '${num} '},
  {name: 'scripture_location',  value: 'under-title'},
  {name: 'text',                value: 'default' },
  {name: 'columns',             value: '3'},           // Page Options
  {name: 'page_layout',         value: 'single-sided'},
  {name: 'paper_orientation',   value: 'landscape'},
  {name: 'paper_size',          value: 'LETTER'},
  {name: 'margin',              value: 'narrow'},
  {name: 'display_index',       value: 'no-index'},    // Index Options
  {name: 'include_first_line',  value: false},
  {name: 'display_cat_index',   value: 'no-index'},
  {name: 'display_scrip_index', value: 'no-index'},
  {name: 'index',               value: 'default'}
];

export_form.margins = margins;
export_form.text = text;
export_form.def_configs = def_configs;
export_form.index = index;
window.export = export_form;

function set_value_by_id(list) {
  for(item of list) {
    let element = document.getElementById(item.name);
    if(element.type == 'checkbox'){
      element.checked = item.value;
    }
    else{
      element.value = item.value;
    }
    if(['margin','text','index'].includes(item.name)){
      $('#'+item.name).trigger('change'); //trigger specifics
    }
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
  //this is not failsafe
  if(part == 's-') {
    return location.hash.match(/(s-.*?)(\?|\&|$)/)[1];
  }
  else if (part == 'sb-') {
    return location.hash.match(/(sb-.*?)(\?|\&|$)/)[1];
  }
  else {
    return parts;
  }
}
function sortFavSongbooks(a,b){
  //console.log(a);
  if(a._values['songbook-id'] == 'sb-allSongs'){
    return 2;
  }
  else if(b._values['songbook-id'] == 'sb-allSongs'){
    return -2;
  }
  else if(a._values['songbook-id'] == 'sb-favoriteSongs'){
    return 1;
  }
  else if(b._values['songbook-id'] == 'sb-favoriteSongs'){
    return -1;
  }
  else if(a._values['user-fav'] == b._values['user-fav']){
    if(a._values['songbook-title'] > b._values['songbook-title']) {
      return -1;
    }
    if(a._values['songbook-title'] < b._values['songbook-title']) {
      return 1;
    }
    return 0
  }
  else if(a._values['user-fav'] > b._values['user-fav']) {
    return 1;
  }
  else {
    return -1;
  }
}
function updateAllLinks(whatChanged='all') {
  let songbook_id = window.songbook._id || 'sb-allSongs';
  let song_id = window.song._id;
  $('[data-song-edit]').attr('href',`#${formatSbID(songbook_id)}&${song_id}?edit`);
  $('[data-song-edit="new"]').attr('href',`#${formatSbID(songbook_id)}&s-new-song?edit`);
  $('[data-song]').attr('href','#'+formatSbID(songbook_id)+'&'+song_id);
  $('[data-song-export]').attr('href','#'+formatSbID(songbook_id)+'&'+song_id+'?export');
  $('[data-songbook-edit]').attr('href','#'+songbook_id+'?edit');
  $('[data-songbook-edit="new"]').attr('href','#sb-new-songbook?edit');
  $('[data-songbook-present]').attr('href', '#'+songbook_id+'?present');
  $('[data-songbook]').attr('href','#'+songbook_id);
  $('[data-songbook-export]').attr('href','#'+songbook_id+'?export');
  $('[data-home]').attr('href','#');

  //add highlighting
  //doesn't happen after it's done rendering the list.js on initial page load
  //Also not working in info click views.
  $('.song-highlight').removeClass('song-highlight');
  $("[data-song-id='"+song_id+"']").addClass("song-highlight");
  $('.songbook-highlight').removeClass('songbook-highlight');
  $("[data-songbook-id='"+songbook_id+"']").addClass("songbook-highlight");
}

function formatSbID(songbook_id) {
  return songbook_id + (window.songbookEditing ? '?edit' : '');
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

  $('#songList').on('mousedown','#present', function() {
    switch (event.which) {
      case 1:
        //alert('Left mouse button pressed');
        window.location = '#'+window.songbook._id+'?present';
        break;
      case 2:
        //alert('Middle mouse button pressed');
        window.location = '#'+window.songbook._id+'?present+new';
        break;
      case 3:
        //alert('Right mouse button pressed');
        window.location = '#'+window.songbook._id+'?present+new';
        break;
      default:
        //alert('You have a strange mouse');
        window.location = '#'+window.songbook._id+'?present';
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

  $('.fullscreen').removeClass('fullscreen');
  if(!full) {
    fullscreen.addClass('fullscreen');
    $('main').addClass('fullscreen');
  }
}
function highlightText(){
  let text = document.querySelector('#songList .search').value
  text = (text.indexOf(`"`)<0 ? `"${text}"` : text).match(/(?:"[^"]*"|\S+)/g).map(word => word.replace(/^"|"$/g, '').replace(/^.*?:/g,''));
  if(!document.getElementById('song').classList.contains('edit')){
    instance.unmark().mark(text, {
      "exclude": [
          "c"
      ],
      "ignorePunctuation": ":;.,-–—‒_(){}[]!'\"+=".split(""),
      "acrossElements": true,
      "separateWordSearch": false
    });
  }
}
function bindSearchToList(list, id){
  if(list == window.songbook_list){
    list.on('searchComplete', function(){
      let songPlacement = window.songbook_list.visibleItems.findIndex(el => el._values['song-id'] == window.song._id) + 1;
      $(id + ' .search + span').attr('data-number-visible',`${songPlacement ? songPlacement+'/' : ''}${list.visibleItems.length}`);
      highlightText();
    });  
    let songPlacement = window.songbook_list.visibleItems.findIndex(el => el._values['song-id'] == window.song._id) + 1;
    $(id + ' .search + span').attr('data-number-visible', `${songPlacement ? songPlacement+'/' : ''}${$(id + ' .list li').length}`);
  }
  else {
    list.on('searchComplete', function(){
      $(id + ' .search + span').attr('data-number-visible',list.visibleItems.length);
    });  
    $(id + ' .search + span').attr('data-number-visible', $(id + ' .list li').length);
  }
}

function bindToSongEdit() {
  $('#song #categories').on('change', '[type="checkbox"]', function() {
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
  let db_name = $('#db_select :selected').val();
  let good = true;
  let pin = $('#pin').val();
  let pwd = $('#pwd').val();
  let username = $('#username').val();

  if(db_name.endsWith('(local)') && (pin.trim() == '' || username.trim() == '')){
    good = false;
    alert('Username or pin not entered');
  }
  else if(db_name.endsWith('(remote)') && (pwd.trim() == '' || username.trim() == '')){
    good = false;
    alert('Username or pwd not entered');
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

  let response = true;

  let databases = JSON.parse(localStorage.getItem('databases'));
  if(databases && databases[dbName]) {
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
    dbLogin('create_local');
  }
  else {
    return;
  }
}
function parseUrl(url, username=false, pwd=false){
  //browser parts of an a element ['href','protocol','host','hostname','port','pathname','search','hash']
  let a = document.createElement('a');
  a.href = url;

  if(username){ //we want to add username/pwd
    if(a['host']!=''){
      url = `${a['protocol']}//${username}:${pwd}@${a['host']}${a['pathname']}`;
    } else { //no protocol included
      url = `http://${username}:${pwd}@${remote_url}`;
    }
  }
  else {  //we want to strip out the username/pwd
    if(a['host']!=''){
      url = `${a['protocol']}//${a['host']}${a['pathname']}`;
    } else { //no protocol included
      url = `http://${remote_url}`;
    }
  }
  return url;
}

function addDBtoLocalStorage(dbName, type, remote_url=false){
  //UPDATE LOCAL STORAGE DATABASES
  let new_db = {};
  new_db.name = dbName;
  new_db.type = type;
  if(remote_url){
    new_db.url = parseUrl(remote_url);
  }
  let databases = JSON.parse(localStorage.getItem('databases'));
  if(!databases){databases = {};}
  databases[dbName] = new_db;
  localStorage.setItem('databases',JSON.stringify(databases));
}
function removeDbfromLocalStorage(dbName){
  let databases = JSON.parse(localStorage.getItem('databases'));
  delete databases[dbName];
  localStorage.setItem('databases',JSON.stringify(databases)); 
}

async function updateUser(){
  let name = window.user.name.trim();
  //Username in header area
  let html = '';
  for(word of name.split(/\W+/)){
    html += `${word[0]}<span class="closing">${word.substring(1)} </span>`;
  }
  $('#username_d').html(html);
  //User Profile information in Settings.
  html = `<h3>${name}</h3>`;

  let sbs = window.user.fav_sbs.filter(sb => sb.length != 0);
  html += '<h4>Favorite Songbooks</h4><ul>';
  if(sbs.length){
    try {
      var result = await db.allDocs({include_docs: true, keys: sbs});
    } catch (err) {
      console.log(err);
    }
    for(sb of result.rows.sort((a, b) => a.doc.title.localeCompare(b.doc.title))){
      html += `<li><a class="link" href="#${sb.doc._id}">${sb.doc.title}</a></li>`;
    }
  } else {html+='<li>None yet!</li>';}
  html += '</ul>';
  let songs = window.user.fav_songs.filter(song => song.length != 0);
  html += '<h4>Favorite Songs</h4><ul>';
  if(songs.length){
    try {
      var result = await db.allDocs({include_docs: true, keys: songs});
    } catch (err) {
      console.log(err);
    }
    for(fav_song of result.rows.sort((a, b) => (a.doc && b.doc ? a.doc.title.localeCompare(b.doc.title) : true))){
      if(fav_song.doc) {
        html += `<li><a class="link" href="#sb-favoriteSongs&${fav_song.doc._id}">${fav_song.doc.title}</a></li>`;
      }
      else {
        html += `<li><a class="link" href="#sb-favoriteSongs&${fav_song.id}">[deleted song]</a></li>`;
      }
    }
  } else {html+='<li>None yet!</li>';}
  html += '</ul>';
  html += `<h4>Permissions</h4><ul>${Object.keys(window.roles).filter(role => role.startsWith(window.dbName)).join(', ').replaceAll(window.dbName+"-","").toUpperCase()}</ul>`;
  html += `<button onclick="loadRawDbObject(window.user._id,$('#user_content'),'updateUser();');" class="btn"><span class="mirror">&#9998;</span> Edit</button>`
  html += `<button onclick="change${document.documentElement.classList.contains('_admin')?'Admin':'User'}Password('${user._id.replace('u-','')}')" class="btn">↻ Password</button>`
  document.getElementById('user_content').innerHTML = html;
}
async function loadCategories(){
  let html = `<h3>Ordered List <a href="#" onclick="loadRawDbObject('categories',$('#category_content'),'loadCategories();');" class="mirror admin">&#9998;</a></h3>`;

  try {
    var result = await db.get('categories');
  } catch (err) {
    console.log(err);
  }
  html += '<ul>';
  for(cat of result.categories){
    html += `<li><a href="#sb-allSongs" onclick="searchSBfor(this.text)">${cat}</a></li>`;
  }
  html += '</ul>';
  document.getElementById('category_content').innerHTML = html;
}

async function getAllUsers(purpose = false){
  let loggedIn = JSON.parse(localStorage.getItem('loggedin'));
  let username = loggedIn.username;
  let password = loggedIn.pwd;
  var myHeaders = new Headers();
  myHeaders.append("Accept", "application/json");
  myHeaders.append("Content-Type", "application/json");
  myHeaders.append('Authorization', 'Basic ' + btoa(username + ':' + password));

  var requestOptions = {
    method: 'GET',
    headers: myHeaders,
    redirect: 'follow'
  };
  try { 
    let url = remoteDb.getUsersDatabaseUrl().replace('_users','');
    let admin_response = await fetch(url+"_node/couchdb@127.0.0.1/_config", requestOptions);
    let admin = await admin_response.text();
    admin = JSON.parse(admin);
    let response = await fetch(url+"/_users/_all_docs?include_docs=true&startkey=\"org.couchdb.user:\"", requestOptions)
    let non_admin = await response.text();
    non_admin = JSON.parse(non_admin);
    let security = await fetch(url+window.dbName+"/_security", requestOptions);
    security = await security.text();
    security = JSON.parse(security)
    
    let users = non_admin.rows.filter(user => user.doc.roles.filter(role => security.members.roles.includes(role)).length > 0);
    if(purpose == 'adminSignup') { //only when creating an admin do we care that there is no existing username
      users = non_admin.rows;
    }
    function adminFilter(admin) {
      return non_admin.rows.some(user => user.doc.name === admin && user.doc.roles.includes(window.dbName + "-admin"));
    }
    let admins = Object.keys(admin.admins).filter(adminFilter);  //need to filter this against the users table list for those that have the dbname in an admin role.
    if(purpose) { //if there is any purpose other than display (default = false) then we want to check against all admins
      admins = Object.keys(admin.admins);
    }

    return {"admins": admins, "users": users};
  }
  catch(error) {
    console.log(error)
    console.log(error.message);
    return error;
  }
}

function canEdit(doc){
  let result = false;
  try {
    if(window.roles._admin){
      result = true;
    }
    else if(window.roles[window.dbName+"-editor"]){
      result = true;
    }
    else if(doc.addedBy.trim() == window.user._id.trim()){
      result = true;
    }
    if(doc._id == 'sb-allSongs' || doc._id == 'sb-favoriteSongs'){ //docs that are just not editable.
      result = false;
    }
  }
  catch(error) {
    console.log(error.message);
  }
  return result;
}

async function loadAllUsers(){
  html = '';
  if(remoteDb){
    let users = await getAllUsers();

    if(users instanceof Error) {
      alert(users.message);
      return;
    }
    let editorName = window.dbName+"-editor";
    html = '<b>Admins <button class="circle" onclick="addAdminUser();">+</button></b><ul>'
    html += users.admins.map(admin => `<li><span style="width: 30%; display:inline-block;">${admin}</span>
                         <label title="All admins are editors"><input type="checkbox" checked disabled> Editor</label><button onclick="changeAdminPassword('${admin}')">↻ Password</button>
                         <button onclick="deleteAdminUser('${admin}')">🗑 Delete<button></li>`).join('');
    html += '</ul><h4>Users <button class="circle" onclick="addUser();">+</button></h4><ul>'
    html += users.users.filter(user => user.doc.roles.indexOf(editorName) > -1)
                       .map(user => `<li><span style="width: 30%; display:inline-block;">${user.doc.name}</span>
                        <label><input type="checkbox" checked onclick="event.preventDefault(); toggleUserEditor('${user.doc.name}')"> Editor</label><button onclick="changeUserPassword('${user.doc.name}')">↻ Password</button>
                        <button onclick="deleteUser('${user.doc.name}')">🗑 Remove<button></li>`).join('');
    html += users.users.filter(user => user.doc.roles.indexOf(editorName) == -1)
                       .map(user => `<li><span style="width: 30%; display:inline-block;">${user.doc.name}</span>
                        <label><input type="checkbox" onclick="event.preventDefault(); toggleUserEditor('${user.doc.name}', true)"> Editor</label><button onclick="changeUserPassword('${user.doc.name}')">↻ Password</button>
                        <button onclick="deleteUser('${user.doc.name}')">🗑 Remove<button></li>`).join('');
    html += '</ul>'
  }
  else {
    console.log('RemoteDB does not exist');
  }
  document.getElementById('all_users').innerHTML = html;
}
function searchSBfor(text){
  $('#songbook_header .search').val(`"c:${text}"`)[0].dispatchEvent(new KeyboardEvent('keyup'));
}

function handleDarkMode(){
  let value = document.querySelector('input[name="darkmode"]:checked').value;
  switch(value) {
    case 'dark':
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      break;
    case 'light':
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      break;
    case 'auto':
      document.getElementById('autoRadio').checked = true;
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.remove('light');
  }
  //save value to system/user prefs.  
  localStorage.setItem(window.user._id+'darkMode',value);
}
function goToSettings(){
  document.getElementById('appSettings').classList.remove('closed');
  setTimeout(function() {scrollIntoViewIfNeed(document.getElementById('appSettings'))},300);
}
function setLoginState() {
  window.loggedin = true;
  updateUser();
  $('html').addClass('loggedin');
  $('#title a').html(`${capEachWord(window.db.name.split('(')[0], "_")}<sup style="font-size: .8rem; font-weight: normal; color: var(--songList-color);"> ${window.db.name.match(/\((.*?)\)/)[1].toUpperCase()}</sup>`);
  if(location.hash.startsWith('#login?')){
    location.hash = location.hash.split('?').slice(1).join('?');
  }
  if(location.hash.startsWith('#login')){
    location.hash = '#';
  }
  setTimeout(function(){
    document.body.classList.remove('loading');
  }, 20);
  //Update ui when db changes]s
  loadRecentSongs();
  initializeSongbooksList();
  loadUsersObject(); //list of all users stored for reference;
}

function setLogoutState() {
  window.loggedin = false;
  document.documentElement.className = '';
  location.hash = '#login';
  window.user = '';
  window.roles = '';
  localStorage.removeItem('loggedin');
  $('#title a').html('yCanta');
  $('#dialog').hide();
  document.getElementById('all_users').innerHTML = '';
  document.getElementById('adminSettings').classList.add('closed');
}

function mapSongbookRowToValue(row) {
  return { 'songbook-id':           row.doc._id,
    'songbook-rev':                 row.doc._rev,
    'songbook-title':        't:' + row.doc.title + '\0' 
  + 'addedBy:' + row.doc.addedBy.slice(2) + '\0'
  + 'editedBy:' + row.doc.editedBy.slice(2) + '\0',
    'link': '#'+row.doc._id,
    'name': row.doc.title
  };
}
function mapSongRowToValue(row) {
  let id, rev, search, status, title, deleted;
  deleted = false;
  if(row.status === undefined){  status = "";}
  else {status = row.status;}
  try { 
    if(row.deleted || row.value.deleted){ deleted = true;}
  }
  catch {}

  if(row.id=="section"){
    id = row.id;
    search = row.title;
    title = row.title;
  }
  else if(deleted){
    deleted = true;
    id = row.id;
    try {
      rev = row.value.rev;
    }
    catch {
      rev = row.doc._id;
    } 
    search = "";
    status = status;
    title = "Deleted";
  }
  else {
    id = row.doc._id;
    rev = row.doc._rev;
    search = row.doc.search;
    status = status;
    title = row.doc.title;
  }
  return { 'song-id':           id,
    'song-rev':                 rev,
    'song-search':              search,
    'song-status':              status,
    'song-deleted':             deleted,
    'link': '#'+window.songbook._id+'&'+id,
    'name': title
  };
}

function setSongbookInfo(songbook){
  $('#songbook_title').removeAttr('contenteditable');
  $('#sb_buttonsRight').remove();
  $('#songbook_content .search').parent().removeAttr('disabled');
  $('#songbook_content').removeClass('showStatus'); 
  $('#songbook_content').removeClass('showComments'); 
  (songbook.showStatus ? $('#songbook_content').addClass('showStatus') : $('#songbook_content').removeClass('showStatus'));
  (songbook.showComments ? $('#songbook_content').addClass('showComments') : $('#songbook_content').removeClass('showComments'));
  $('.disabled-hidden').removeClass('disabled-hidden');
  let title_text = (songbook._id == 'sb-allSongs' || songbook._id == 'sb-favoriteSongs' ? `<i>${songbook.title}</i>` : songbook.title);
  $('#songbook_title').html(title_text).attr('data-rev',songbook._rev).attr('data-songbook-id', songbook._id).nextAll().remove();
  if(songbook._id != 'sb-allSongs' && songbook._id != 'sb-favoriteSongs'){
    $('#songbook_header .title').append('<span class="buttonsRight" id="sb_buttonsRight"><span class="star" onclick="event.stopPropagation(); toggleFavorite(\''+songbook._id+'\',\'fav_sbs\')"></span>'+
      '<info style="margin-left: .7rem;" onclick="event.stopPropagation(); loadInfo(false);"></info></span>');
  }
  if(document.getElementById('dialog').style.display=="block" && !parseHash('s-') && document.getElementById('dialog').getAttribute('data-use')=="info"){  //prevents info view flicker when you click on songbooks in song info view.
    loadInfo(false);
  }

  //Float menu
  let editable = canEdit(songbook);
  let float_menu = `${(songbook._id == 'sb-allSongs' ? '<a data-song-edit="new" class="float-menu-item"><span class="float-menu-icon">+</span>Add Song</a>' : '')}
  ${(editable ? '<button data-home onclick="deleteSongbook(window.songbook._id)" class="float-menu-item delete"><span class="float-menu-icon">&#128465;</span>Delete</button>' : '')}
  <button data-songbook-present class="float-menu-item" id="present"><span class="float-menu-icon">&#128253;</span>Present</button>
  <a data-songbook-export class="float-menu-item"><span class="float-menu-icon">&#128424;</span>Export</a>
  ${(editable ? '<a data-songbook-edit class="float-menu-item"><span class="float-menu-icon">&#9998;</span>Edit</a>' : '')}
  <span class="float-menu-item  float-menu-toggle"><button type="button" class="float-menu-icon">+</button></span>`;

  $('#songList .float-menu').html(float_menu);
}

function buildSongbookList(songs, target_class='songbook_content', 
                                  template='song-item-template', 
                                  edit=false) {
  var options = {    
    valueNames: [
      { data: ['song-id'] },
      { data: ['song-rev'] },
      { data: ['song-search'] },
      { data: ['song-status'] },
      { data: ['song-deleted'] },
      { name: 'link', attr: 'href'},
      'name'
    ],
    item: template
  };
  var values = [];   
  var i;
  for (i = 0; i < songs.length; i++) { 
    //I tried to use saved_list as a standin variable for the window object we save below - it never worked out so I'm using this clunky bit of code here.
    let saved_list;
    if(edit != true) {
      saved_list = window.songbook_list;
    }
    else {
      saved_list = window.songbook_edit_togglesongs_list;
    }

    if(saved_list != undefined){
      var songIdInList = saved_list.get('song-id',songs[i].id);
      if(songIdInList.length > 0){
        // we need to update if the revision is different.
        var songRevInList = saved_list.get('song-rev', songs[i].value.rev);
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
    $('#songbook_header input').trigger('change')[0].dispatchEvent(new KeyboardEvent("keyup"));
  }
  else{
    window.songbook_edit_togglesongs_list = new List(target_class, options, values);
    bindSearchToList(window.songbook_edit_togglesongs_list, '#songListEdit');
  }
  updateAllLinks();
  return;
}
function dataxInBookUpdate(song, remove=false){
  let song_id = $(song).attr('data-song-id');
  if(song_id == 'section'){ //Skip the section header count
    return;
  }
  var songA = $('#songListEdit li[data-song-id="'+song_id+'"]');
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
function editHash(e) {
  e.preventDefault();
  if(window.innerWidth <= 1150 && !document.body.classList.contains('song') && e.target.closest('#songbook_edit_togglesongs')) {
    return;  //we're not popping open edit song from the add song window.
  }
  location.hash = e.target.href.replace(/^.*#/,'').replace(window.songbook._id, window.songbook._id+'?edit');
}
function bind_songbook_edit(song){
  song.addEventListener('click', editHash, false);

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
}
function add_edit_pencil(song){
  $(song).find('a').after('<button class="edit_pencil">✏️</button>');
  $(song).find('button')[0].addEventListener('click', function( e ) {
    let input = prompt("New Name for Section:");
    if(input=== null || input == ""){
      return;
    }
    $(e.target).parent().children('a').text(input);
  });
}
function cycleStatus(e) {
  if($(e).attr('data-song-status')=='n'){
    $(e).attr('data-song-status','a');
  }
  else if($(e).attr('data-song-status')=='a'){
    $(e).attr('data-song-status','r');
  }
  else if($(e).attr('data-song-status')=='r'){
    $(e).attr('data-song-status','n');
  }
}

function cancelSongbook(el) {
  window.songbookEditing = false; 
  let t = confirmWhenEditing();
  if(!t) {
    window.songbook._id= ''; 
    window.location.hash=$(el).attr('href');
    window.songEditing = false; 
  }
  else {
    window.songbookEditing = true;
  }
}
function resetSongbook() {
  window.songbookEditing = false; 
  let t = confirmWhenEditing();
  if(!t) {
    window.songEditing = false; 
    location.reload();
  }
  else {
    window.songbookEditing = true;
  }
}

function editSongbook() {
  let buttons = '<div class="edit_buttons"><button data-songbook class="btn" style="background-color: var(--edit-color);" onclick="saveSongbook(parseHash(\'sb-\'));">Save</button>';
  buttons += '<button data-songbook class="btn" style="background-color: var(--edit-color);" onclick="cancelSongbook(this);">Cancel</button>';
  buttons += '<button data-songbook class="btn" style="background-color: var(--edit-color);" onclick="resetSongbook();">Reset</button></div>';
  $('#songbook_content').prepend(buttons).append(buttons);
  $('#songbook_content .search').val('')[0].dispatchEvent(new KeyboardEvent('keyup'));
  updateAllLinks();

  $('#songList #songbook_title').attr('contenteditable', 'true');
  $('#songList #songbook_content input.search').parent().addClass('disabled-hidden')[0].disabled=true;
  $('#songList #songbook_content nav').addClass('disabled-hidden');
  $('#songbook_header').append('<span class="edit_buttons">Song Status: <label id="showStatusID" class="switch" onchange="(this.firstElementChild.checked ? ($(\'#songbook_content\').addClass(\'showStatus\'), window.songbook.showStatus=true) : ($(\'#songbook_content\').removeClass(\'showStatus\'), window.songbook.showStatus=false) );"><input type="checkbox" id="statusON"' + (window.songbook.showStatus ? 'checked': '') +'><div class="slider"></div></label> ' +
                              'Comments: <label class="switch" onchange="(this.firstElementChild.checked ? ($(\'#songbook_content\').addClass(\'showComments\'), window.songbook.showComments=true) : ($(\'#songbook_content\').removeClass(\'showComments\'), window.songbook.showComments=false) );"><input type="checkbox" id="commentsON"' + (window.songbook.showComments ? 'checked': '') + '><div class="slider"></div></label></span>');
  $('.commentsContainer, .toggle_comment').remove();
  //load all the songs into song adder
  db.allDocs({
    include_docs: true,
    startkey: 's-',
    endkey: 's-\ufff0',
  }).then(function(result){
    window.songbookEditing = true;
    //this cleanwipe might not be performant!
    if(window.songbook_edit_togglesongs_list != undefined){
      window.songbook_edit_togglesongs_list.clear();
    }
    let list = result.rows.sort(function(a, b){
      if(a.doc.title < b.doc.title) { return -1; }
      if(a.doc.title > b.doc.title) { return 1; }
      return 0;
    });
    list.unshift({"id":"section","title":"New Section","search":"new section"});

    return buildSongbookList(list, 
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
      if($(song).attr('data-song-id')=="section"){
        add_edit_pencil(song);
      }
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
        if($(copySong).attr('data-song-id')=="section"){
          add_edit_pencil(copySong);
        }
        $(copySong).find('a').after('<button>&#128465;</button>');
        $(copySong).find('button')[0].addEventListener('click', function( e ) {
          dataxInBookUpdate(copySong, true);
          scaleRemove(copySong);
        });
        $(copySong).attr('data-song-status','n')[0].addEventListener('click', function(e) {
          if(window.songbookEditing && window.songbook.showStatus && e.offsetX < 20){
            e.preventDefault();
            cycleStatus(this);
          }
        });
        $('#songbook_content .list').append(copySong);
        scrollIntoViewIfNeed(copySong);
        copySong.classList.add('highlightBg');
        setTimeout(function(){copySong.classList.remove('highlightBg')},3000);
      });
    });
    $('#songList ul.list').each(function(){
      this.addEventListener('drop', dragDrop, false);
      this.addEventListener('dragover', dragOver, false);
    });
    $('#songbook_content li').each(function(){
      this.addEventListener('click', function(e) {
        if(window.songbookEditing && window.songbook.showStatus && e.offsetX < 20){
          e.preventDefault();
          cycleStatus(this);
        }
      })
    })
    $('#songList #songbook_title').parent().removeAttr('href');
  }).catch(function(err){
    console.log(err);
  });
}

async function editSong() {
  await loadSong(window.song._id);
  let buttons = '<div class="edit_buttons"><button data-song class="btn" style="background-color: var(--edit-color);" onclick="prepSaveSong($(this))">Save</button>';
  buttons += `<button data-song${(window.song._id == 's-new-song' ? 'book' : '')} class="btn" style="background-color: var(--edit-color);" onclick="window.songEditing=false; delete window.song; window.location.hash=$(this).attr(\'href\');">Cancel</button>`;
  buttons += '<button data-song class="btn" style="background-color: var(--edit-color);" onclick="window.songEditing=false; location.reload()">Reset</button></div>';
  $('song').prepend(buttons).append(buttons);

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
  $('#song scripture_ref').html($('#song scrip_ref').map(function(){return $(this).text();}).get().join(', '));
  $('#song').first('.subcolumn').find('stitle .title_link,authors,scripture_ref,introduction,key,chunk,copyright,cclis').toTextarea({
    allowHTML: false,//allow HTML formatting with CTRL+b, CTRL+i, etc.
    allowImg: false,//allow drag and drop images
    doubleEnter: true,//have double enter create a second field
    singleLine: false,//make a single line so it will only expand horizontally
    pastePlainText: true,//paste text without styling as source
    placeholder: false//a placeholder when no text is entered. This can also be set by a placeholder="..." or data-placeholder="..." attribute
  });
  $('#song categories').addClass('contenteditable-disabled').prop('tabindex',"0")
    .on('click', function(){
      $('#song-edit').toggleClass('sidebar-open')
      setTimeout(() => {
        document.getElementById('song-edit').querySelector('.search').focus();
      }, 400);
    });
  let cclis_text = $('cclis').text().replace('CCLI Song #: ', '');
  $('#song cclis').wrap('<div style="margin-bottom: 1rem;"></div>')
  $('#song cclis').before('<label>CCLIS: <input id="cclis_checkbox" onchange="$(\'cclis\').toggle();"'+(cclis_text ? 'checked' : '')+' type="checkbox"></input> </label>');  
  if(cclis_text){
    $('cclis').show();
    if(isNaN(cclis_text.replace('CCLIS: ',''))){
      cclis_text = '';
    }
    $('cclis').text(cclis_text);
  }
  else {
    $('cclis').hide();
  }

  window.songEditing = true;

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
    $('#categories [type="checkbox"]').prop("checked", false);
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

  updateAllLinks();
}
function prepSaveSong(element) {
  if($('stitle').text().trim() == ''){
    alert('Please add a title before you save');
    return;
  }
  else{
    window.songEditing=false;
  }
  return new Promise(function(resolve, reject) {
    $('#song song').hide();
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
    if($('#cclis_checkbox')[0].checked){
      if(!$('cclis').text()){
        $('cclis').text('on');
      }
    }
    else {
      $('cclis').text('');
    }
    resolve('song is prepped for saving');
  }).then(function() {
    let id = window.song._id;
    delete window.song;
    return saveSong(id);
  }).catch(function (err) {
    console.log(err);
  });
}
async function prepExport(){
  document.getElementById('pdf_progress').style.width = '0%';
  document.getElementById('pdf_progress_text').innerHTML = '0%';

  $('#display_chords').trigger('change');

  $('#pdf')[0].src = "pdfjs-2.8.335-dist/web/viewer.html?file=";
 
  //webworker stuff
  if(typeof(window.pdfFormatter) == 'undefined') {
    window.pdfFormatter = await new Worker('pdfformatter.js');
    pdfFormatter.onmessage = function(e) {
      if(e.data[0] == 'pdf'){
        document.getElementById('downloadPDF').innerHTML = `<a class="btn" href="${e.data[1]}" style="margin-top:0; " target='_blank' download="${window.exportObject.title}.pdf">Download ⭳</button>`;
        document.getElementById('pdf').contentWindow.yourMethod(e.data[1]);
        console.log('Message received from worker');
        logData('exported', window.exportObject._id + ": " + JSON.stringify(read_config_form()));
      }
      else if(e.data[0] == 'progress'){
        window.document.getElementById('pdf_progress').style.width = e.data[1];
        window.document.getElementById('pdf_progress_text').innerHTML = e.data[1];
      }
    }
  }
  db.allDocs({
    include_docs: true,
    startkey: 'cfg-'+window.exportObject._id,
    endkey: 'cfg-'+window.exportObject._id+'\ufff0',
  }).then(function(result){
    let innerhtml = '';
    let user_id_cfg = 'cfg-'+window.exportObject._id+window.user._id; //must keep in sync with db.js
    document.getElementById('cfg_buttons').innerHTML = '';
    result.rows.map(function (row) {
      if(row.doc._id.match(user_id_cfg)) {
        if(row.doc._id != user_id_cfg){
          document.getElementById('cfg_buttons').insertAdjacentHTML("beforeend",`<button class="btn" onclick="blueHighlight(this);"><span onclick="saveExport('${encodeURIComponent(row.doc.name || 'Default').replace(/'/g, "\\\'")}');">Save as ${(row.doc.name || 'Default')}</span><span class="export_close" onclick="event.preventDefault(); deleteExportCfg('${row.doc._id}');">×</span></button>`);
        }
        innerhtml = `<option value='${JSON.stringify(row.doc.cfg)}'>Your ${(row.doc.name || 'Default')}</option>` + innerhtml;
      }
      else {
        innerhtml += `<option value='${JSON.stringify(row.doc.cfg)}'>${window.users[row.doc._id.match(/u\-.*/)[0]]}'s ${(row.doc.name || 'Default')}</option>`;
      }
    });
    document.getElementById('cfg_buttons').insertAdjacentHTML("afterbegin",`<button class="btn" onclick="blueHighlight(this);"><span onclick="saveExport('');">Save as Default</span></button>`);

    let opts = window.export.def_configs;
    for(opt in opts) {
      innerhtml += "<option value='"+JSON.stringify(opts[opt])+"'>"+opt+"</option>";
    }
    innerhtml += "<option value='[]'>Custom</option>";
    $('#format').html(innerhtml);
    $('#font_face').trigger('change')
    if(window.songbook.showStatus){
      $('#export').addClass('showStatus');
    }
    else { 
      $('#export').removeClass('showStatus'); 
    }
  });
}
let timeout;
function export_form_summary_update() {
  document.getElementById('format').value = JSON.stringify([]);
  for(option of $('#format option')) {
    let opts = [];
    let values = JSON.parse(option.value);
    if(isEqual(values,[])){
      continue // this is empty!
    }
    for(item of values) {
      let element = document.getElementById(item.name);
      opts.push({name: item.name, value: (element.type =='checkbox' ? element.checked : element.value)});
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
                 document.getElementById('column_gutter').value,
                 document.getElementById('paper_margin_gutter').value]

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
    print_summary += '✓';
  }
  if(document.getElementById('print_n').checked){
    print_summary += '~';
  }
  if(document.getElementById('print_r').checked){
    print_summary += '✗';
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
    clearTimeout(timeout);
    timeout = setTimeout(() => {pdfFormatter.postMessage([window.exportObject,read_config_form()])}, 200); //hack to prevent multiple sends to the formatter
  }
}
function read_config_form(){
  let opts = $('#export_form').serializeArray();
  let new_opts = {};
  for(let opt of opts) {
    new_opts[opt.name] = opt.value;
  }
  return new_opts;
}
function getTranslate3d (el) {
  var values = window.getComputedStyle(el).transform.split(/\w+\(|\);?/);
  if (!values[1] || !values[1].length) {
      return [];
  }
  return values[1].split(/,\s?/g);
}

//Making things work with touch coolness
function makeDraggable(dragEl, dragAction, dragSide='right') {
  let startx = 0;
  let starty = 0;
  let dist = 0;
  let disty = 0;
  let width = 0;
  let height = 0;
  let active;

  dragEl.addEventListener('touchstart', function(e){
    //document.documentElement.classList.add('no-overscroll');
    var touchobj = e.changedTouches[0]; // reference first touch point (ie: first finger)
    startx = parseInt(touchobj.clientX);
    starty = parseInt(touchobj.clientY);
    width = getTranslate3d(dragEl)[4]; // get original translateX value
    height = getTranslate3d(dragEl)[5]
    active = document.getElementsByClassName('active')[0];
    dragTop = false;
    slideout = false;
    slideoutEl = (!document.body.classList.contains('song') && document.body.classList.contains('export') ? dragEl.previousElementSibling.previousElementSibling : dragEl.previousElementSibling);
    slideback = false;
    navigate = false;

    // only do stuff if in right place
    if(dragSide == 'right' && screen.width < 640){
      if((window.songEditing && e.target.closest('#song')) || (window.songbookEditing && e.target.closest('#songList')) || e.target.closest('#export')) { 
        dragEl.style.transition = 'all 0s';
        //e.preventDefault();
      }
      else {
        startx = false;
      }
    }
    else if(dragSide == 'top' && screen.width < 640){
      if(starty < remToPx(7.5)) { 
        if(active == dragEl){
          active = 0;
        }
        else {
          active.style.transition = 'all 0s';
        }
        dragEl.style.transition = 'all 0s';
        dragTop = true;
        //e.preventDefault();
      }
      else if(!window.songEditing && !window.songbookEditing) {
        if(dragEl.classList.contains('slidout')){
          slideback = true;
          dragEl.style.transition = 'all 0s';
        }
        else if(startx < screen.width/5) {
          //possible slide out going on
          slideout = true;
          slideoutEl.style.transition = 'all 0s';
        }
        else if(screen.width * .25 < startx && startx < screen.width *.75 && document.body.classList.contains('song') && e.target.closest('.sidebar-open') == null) {
          navigate = true;
          dragEl.getElementsByClassName('row')[0].style.transition = 'transform 0s';
        }
        else {
          startx = false;
        }
      }
      else {
        startx = false;
      }
    }
    else {
      startx = false;
    }
  }, {passive: true});

  dragEl.addEventListener('touchmove', function(e){
    if(startx){
      var touchobj = e.changedTouches[0]; // reference first touch point for this event
      var dist = parseInt(width) + parseInt((touchobj.clientX) - startx);
      var disty = Math.max(parseInt(height) + parseInt((touchobj.clientY) - starty), 0);

      if (dragSide == 'right'){
        dragEl.style.transform = 'translate3d('+ Math.max(parseInt(dist),0) + 'px, 0, 0)';
      }
      else if (dragSide == 'top'){
        if(slideout){
          if(dist > 25) {
            slideoutEl.style.transform = 'translate3d('+ -(parseInt(dist)-25)*4 + 'px, 0, 0)';
          }
        }
        else if(slideback){
          if(dist < -25) {
            dragEl.classList.remove('slidout');
            dragEl.style.transform = 'translate3d('+ (parseInt(dist)+25)*4 + 'px, 8rem, 0)';
            dragEl.style.width = 'min(80%, 300px)';
            dragEl.style.height = 'calc(100vh - 8rem)'
            if(dist < -100) {
              dragEl.style['z-index'] = '2';
            } else {
              dragEl.style['z-index'] = '7';
            }
          }
        }
        else if(navigate){
          if(Math.abs(dist) > 50) {
            dragEl.getElementsByClassName('row')[0].style.transform = 'translate3d('+ (dist) + 'px, 0, 0)';
            dragEl.getElementsByClassName('row')[0].style.opacity = '0.5';
          }
        }
        else {
          dragEl.style.transform = 'translate3d(0,'+ parseInt(disty) + 'px, 0)';
          if(active){
            active.style.transform = 'translate3d(0, calc('+ parseInt(disty) + 'px + 4rem), 0)';
          }
          e.preventDefault();   
        }
      }
    }
  }, false);

  dragEl.addEventListener('touchend', function(e){
    if(startx){
      var touchobj = e.changedTouches[0]; // reference first touch point for this event
      var dist = parseInt(touchobj.clientX) - startx;
      var disty = Math.abs(parseInt(touchobj.clientY) - starty);
      if (startx && dragSide == 'right' && Math.abs(dist) > 50 ){ //make sure that distance isn't just accidental
        dragAction(dragEl, 'sidebar-open');
        e.preventDefault(); 
      }
      else if (slideback){
        if(dist < -100) {
          e.preventDefault();
        }
        else {
          dragEl.classList.add('slidout');
        }
        dragEl.removeAttribute('style');
      }
      else if (slideout) {
        if( dist > 100) {
          e.preventDefault();
          slideoutEl.classList.add('slidout');
        }
        slideoutEl.removeAttribute('style');
      }
      else if (navigate) {
        if(Math.abs(dist) > 100) {
          e.preventDefault();
          let currentSong = document.querySelector("#songbook_content [data-song-id='"+window.song._id+"']");
          if(currentSong && dist > 0 && currentSong.previousElementSibling) {
            dragEl.getElementsByClassName('row')[0].style.transform = 'translate3d(-100%, 0, 0)';
            location.hash = '#'+formatSbID(window.songbook._id)+'&'+
                                currentSong.previousElementSibling.getAttribute('data-song-id'); 
          }
          else if(currentSong && dist < 0 && currentSong.nextElementSibling) {
            dragEl.getElementsByClassName('row')[0].style.transform = 'translate3d(100%, 0, 0)';
            location.hash = '#'+formatSbID(window.songbook._id)+'&'+
                                currentSong.nextElementSibling.getAttribute('data-song-id'); 
          }
          else {
            location.hash = '#'+formatSbID(window.songbook._id);
          }
        }
        setTimeout(function(){dragEl.getElementsByClassName('row')[0].removeAttribute('style')},30);
      }
      else if (dragTop && disty > 200 ){
        dragAction();
        e.preventDefault();
        return; // don't fix layout just yet - we'll do that after hashchange.
      }
    }
    if(active) {
      active.style.removeProperty('transform');
      active.style.removeProperty('transition');
    }
    dragEl.style.removeProperty('transform');
    dragEl.style.removeProperty('transition');
  }, false); 
}

function dragToggleClass(el, toggleClass) {
  $(el).toggleClass(toggleClass);
}
window.addEventListener('load', function(){
  makeDraggable(document.getElementById('song-edit'), dragToggleClass);
  makeDraggable(document.getElementById('songListEdit'), dragToggleClass);
  makeDraggable(document.getElementById('exportPreview'), dragToggleClass);

  makeDraggable(document.getElementById('songbookList'), 
    function(){window.location.hash = '';}, 'top');
  makeDraggable(document.getElementById('songList'),
    function(){window.location.hash = '#songbooks';}, 'top');
  makeDraggable(document.getElementById('song'),
    function(){window.location.hash = '#'+formatSbID(window.songbook._id);}, 'top');
  makeDraggable(document.getElementById('export'),
    function(){window.location.hash = window.location.hash.replace('?export','');}, 'top');
}, false);


function bindSearch(element, search_prefix) {
  $('body').on('click', element, function() {
    if(window.songEditing ||window.songbookEditing || $('body').hasClass('export')) {
      return;
    }
    $('#songbook_content .search').val(`"${search_prefix+$(this).text()}"`)[0]
      .dispatchEvent(new KeyboardEvent("keyup"));
  });
}

function confirmWhenEditing(oldHashList, newHashList) {
  let confirmEditing = []; //length 0 = false;
  if(!window.songEditing && !window.songbookEditing) {
    return false;
  }
  if(window.songEditing){
    //check to be sure that oldHashList[1] and newHashList[1] are the same.
    if(oldHashList){ //on fresh page load there is no oldhashlist
      if(oldHashList[1]){ //did we have a song before?
        if(oldHashList[1][1] == 'edit'){ //yes? ok, were we editing it?
          confirmEditing.push(`songEditing`);
        }
      }
    }
    else {
      confirmEditing.push('songEditing');
    }
  }
  if(window.songbookEditing){
    //check to be sure that oldHashList[0] and newHashList[0] are the same.
    if(oldHashList){ //on fresh page load there is no oldhashlist
      if(oldHashList[0]){ //did we have a songbook before?
        if(oldHashList[0][1] == 'edit'){ //yes? were we editing it?
          if(oldHashList[0].join() != newHashList[0].join()) {//is this a different songbook/edit config?
            confirmEditing.push(`songbookEditing`);
          }
        }
      }
    }
    else {
      confirmEditing.push('songbookEditing');
    }
  }
  if(confirmEditing.length) {
    let queryList = [];
    if(confirmEditing.indexOf('songEditing') > -1){
      queryList.push('Song: '+$('stitle a').text());
    }
    if(confirmEditing.indexOf('songbookEditing') > -1){
      queryList.push('Songbook: '+$('#songbook_title').text());
    }
    if(confirm("If you leave this page you may lose changes to \n - "+queryList.join('\n- '))) {
      for(con of confirmEditing) {
        window[con] = false;
        if(con == 'songEditing'){
          window.song._id = '';
        }
        else if(con == 'songbookEditing') {
          window.songbook._id = '';
        }
      }
      return false;
    } else { //we aren't leaving 
      //reset the style elements on all columns
      $('.column').removeAttr('style');
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

async function songInSongbooks(song_id){
  let result = await db.allDocs({
    include_docs: true,
    startkey: 'sb-',
    endkey: 'sb-\ufff0',
  });
  return result.rows.filter(sb => sb.doc.songrefs.map(ref => ref.id).indexOf(song_id) > -1);  
}

// Define a function to format the date with desired format
function formatDate(date) {
  return new Date(date).toLocaleTimeString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function loadInfo(song=true) {
  document.getElementById('dialog').setAttribute('data-use','info');
  if(song){
    $('#dialog h5').text('Song');
    let song_id = window.song._id;
    let revs = window.song._revs_info.map(rev => rev.rev);
    let rev_num = revs.indexOf(window.song_rev);
    let content = `<small>Added by: ${window.users[window.song.addedBy] || window.song.addedBy}<br>${formatDate(window.song.added)}</small><br />
      <small>Edited by: ${window.users[window.song.editedBy] || window.song.editedBy.slice(2)}<br>${formatDate(window.song.edited)}</small><br />
      
      <div style="display: flex; align-items: center; justify-content: space-between;">
      <button onclick="prevSongRev();" style="width:1.75rem" class="${(rev_num != revs.length - 1 ? 'btn btn-tiny': '')}">${( rev_num != revs.length - 1 ? '<<': '')}</button>
      <small>Edit ${window.song._revs_info.length - rev_num} / ${window.song._revs_info.length}</small>
      <button onclick="nextSongRev();" style="width:1.75rem" class="${(rev_num != 0 ? 'btn btn-tiny': 'btn-tiny')}">${( rev_num != 0 ? '>>': '')}</button></div>`;
  
    let sbs = await songInSongbooks(song_id);
    if(sbs.length > 0){
      content += '<div class="left"><br /><b>Used in:</b><br />' + sbs.map(sb => '<a href="#'+sb.doc._id+'&'+window.song._id+'">'+sb.doc.title+'</a>').join('<br />') + '</div>';
    }
    else {
      content += '<div class="left"><br /><b>Not used in any songbook</b></div>';
    }
    document.querySelector('#dialog .content').innerHTML = content;
    document.querySelector('#dialog .title').innerHTML = window.song.title;
    $('#dialog').slideDown('fast');
  }
  else{
    $('#dialog h5').text('Songbook');
    let content = `<small>Added: ${window.users[window.songbook.addedBy] || window.songbook.addedBy}, ${formatDate(window.songbook.added)}</small><br />
      <small>Edited: ${window.users[window.songbook.editedBy] || window.songbook.editedBy}, ${formatDate(window.songbook.edited)}</small><br />
      <small>${(window.songbook._rev.split('-')[0] - 1)} previous edits</small>`;
    document.querySelector('#dialog .content').innerHTML = content;
    document.querySelector('#dialog .title').innerHTML = window.songbook.title;
    $('#dialog').slideDown('fast');
  }
}

function prevSongRev() {
  let prevRev = window.song._revs_info.map(rev => rev.rev).indexOf(window.song_rev) + 1;
  loadSong(window.song._id, window.song._revs_info[prevRev].rev);
}
function nextSongRev() {
  let nextRev = window.song._revs_info.map(rev => rev.rev).indexOf(window.song_rev) - 1;
  loadSong(window.song._id, window.song._revs_info[nextRev].rev);
}

function loadSongPlayer(){
  let yt_script_el = document.getElementById('yt_script');
  if(!yt_script_el) {       //Load up youtube needed elements.
    var tag = document.createElement('script');
    tag.id = 'yt_script';
    tag.src = "https://www.youtube.com/iframe_api";
    var firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);  
    tag.addEventListener('load', function() {
      setTimeout(function(){
        try{
          setItUp();
        }
        catch{
          console.log('second try')
          setTimeout(function(){setItUp();},1000);
        };  //setTimeout seems to be needed for new YT.Player() to be ready
      },20);
    });
  }
  else { 
    setItUp();
  }
  function setItUp(){
    $('#dialog h5').text('Playing');
    document.getElementById('dialog').setAttribute('data-use','player');
    document.querySelector('#dialog .title').innerHTML = window.song.title;
    let song_id = window.song._id;
    let content = '<br><br><div id="player"></div>';
    content += '<span id="playlistnumber" style="margin: 1rem .5rem 1rem .5rem;"></span>'+
               '<button class="btn emoji" onclick="window.player.previousVideo()">⏮<button>'+
               '<button id="play" class="btn emoji" onclick="toggleVideo();">▶<button>'+
               '<button class="btn emoji" onclick="window.player.nextVideo()">⏭<button>'+
               '<button id="loop" class="btn emoji" onclick="toggleLoop();">🔁</button>'
    document.querySelector('#dialog .content').innerHTML = content;
    $('#dialog').slideDown('fast');
    window.player = new YT.Player('player', {
      height: '',
      width: '100%',
      //videoId: id,
      host: 'http://www.youtube-nocookie.com',
      playerVars: { 'autoplay': 0, 'controls': 1 },
      events: {
        'onReady': onPlayerReady,
        'onStateChange': onPlayerStateChange
      }
    });
  }
}

function makeUserNameDraggable(){
  let container = document.getElementById('username_d').parentElement;
  let dragItem = container.parentElement;

  let active = false;
  let currentY;
  let initialY;
  let yOffset = 0;

  container.addEventListener("touchstart", dragStart, false);
  container.addEventListener("touchend", dragEnd, false);
  container.addEventListener("touchmove", drag, false);

  function dragStart(e) {
    yOffset = 0;
    active = false;

    if (e.type === "touchstart") {
      initialY = e.touches[0].clientY - yOffset;
    } else {
      initialY = e.clientY - yOffset;
    }
    dragItem.style.transition = "none";
  }

  function dragEnd(e) {
    if(Math.abs(yOffset)> 30){
      window.location.hash = '#';
    }
    dragItem.style.removeProperty("transition");
    dragItem.style.removeProperty("transform");
  }

  function drag(e) {
    if(window.location.hash == ''){
      return;
    }
    e.preventDefault();
  
    if (e.type === "touchmove") {
      currentY = e.touches[0].clientY - initialY;
    } else {
      currentY = e.clientY - initialY;
    }
    yOffset = currentY;

    if(active) {
      setTranslate(currentY, dragItem);
    }
    if(!active && Math.abs(yOffset) > 10) {
      active = true;
    }
  }

  function setTranslate(yPos, el) {
    el.style.transform = "translate3d(0px, " + yPos + "px, 0)";
  }
}
makeUserNameDraggable();

function onPlayerReady(event) {
  let ids = window.youtube_links.map(link => link.match(/(be\/|v\=)([-\w]+)\S/)[0].replace('be/','').replace('v=',''));
  window.player.cuePlaylist(ids);
  window.player.loop = false;
}
function onPlayerStateChange(event){
  $('#playlistnumber').text((window.player.getPlaylistIndex()+1).toString()+'/'+window.player.getPlaylist().length.toString());
  switch(window.player.getPlayerState()){
    case 1:  //playing 
      $('#dialog #play').text('⏸');
      break;
    case -1:  //unstarted
    case 0:   //ended
    case 2:   //paused
    case 5:   //queued
      $('#dialog #play').text('▶');
      break;
    default:
      //console.log("Can't help ya...",window.player.getPlayerState());
  }
}
function toggleLoop(){
  switch(window.player.loop) {
    case true: 
      window.player.loop = false;
      $('#loop').removeClass('looping');
      break;
    case false: 
      window.player.loop = true;
      $('#loop').addClass('looping');
      break;
  }
  window.player.setLoop(window.player.loop);

}
function pauseVideo() {
  try {
    window.player.pauseVideo();
  } 
  catch(error) {
    console.log(error);
  }
}
function playVideo() {
  window.player.playVideo();
}
function toggleVideo() {
  switch(window.player.getPlayerState()){
    case 1:  //playing 
      pauseVideo();
      break;
    case -1:  //unstarted
    case 0:   //ended
    case 2:   //paused
    case 5:   //queued
      playVideo();
      break;
    default:
      console.log("Can't help ya...",window.player.getPlayerState());
  }
}
//Keep the video playing even when it goes into the background.  -- I don't think this is doing anything.
var hidden, visibilityChange; 
if (typeof document.hidden !== "undefined") {  
  hidden = "hidden";
  visibilityChange = "visibilitychange";
} else if (typeof document.msHidden !== "undefined") {
  hidden = "msHidden";
  visibilityChange = "msvisibilitychange";
} else if (typeof document.webkitHidden !== "undefined") {
  hidden = "webkitHidden";
  visibilityChange = "webkitvisibilitychange";
}

function handleVisibilityChange() {
  if (document[hidden] && $('#dialog')[0].style.display != 'none') {
    window.player.play();
  }
}

if (typeof document.addEventListener === "undefined" || hidden === undefined) {
  console.log("Your browser doesn't support playing music in background");
} else {
  document.addEventListener(visibilityChange, handleVisibilityChange, false);
}

/* crc32.js (C) 2014-present SheetJS -- http://sheetjs.com */
/* vim: set ts=2: */
/*exported CRC32 */
var CRC32;
(function (factory) {
  /*jshint ignore:start */
  /*eslint-disable */
  if(typeof DO_NOT_EXPORT_CRC === 'undefined') {
    if('object' === typeof exports) {
      factory(exports);
    } else if ('function' === typeof define && define.amd) {
      define(function () {
        var module = {};
        factory(module);
        return module;
      });
    } else {
      factory(CRC32 = {});
    }
  } else {
    factory(CRC32 = {});
  }
  /*eslint-enable */
  /*jshint ignore:end */
}(function(CRC32) {
CRC32.version = '1.2.0';
/* see perf/crc32table.js */
/*global Int32Array */
function signed_crc_table() {
  var c = 0, table = new Array(256);

  for(var n =0; n != 256; ++n){
    c = n;
    c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
    c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
    c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
    c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
    c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
    c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
    c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
    c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
    table[n] = c;
  }

  return typeof Int32Array !== 'undefined' ? new Int32Array(table) : table;
}

var T = signed_crc_table();

//got rid of functions for buffering and bit strings that used to be here.

function crc32_str(str, seed) {
  var C = seed ^ -1;
  for(var i = 0, L=str.length, c, d; i < L;) {
    c = str.charCodeAt(i++);
    if(c < 0x80) {
      C = (C>>>8) ^ T[(C ^ c)&0xFF];
    } else if(c < 0x800) {
      C = (C>>>8) ^ T[(C ^ (192|((c>>6)&31)))&0xFF];
      C = (C>>>8) ^ T[(C ^ (128|(c&63)))&0xFF];
    } else if(c >= 0xD800 && c < 0xE000) {
      c = (c&1023)+64; d = str.charCodeAt(i++)&1023;
      C = (C>>>8) ^ T[(C ^ (240|((c>>8)&7)))&0xFF];
      C = (C>>>8) ^ T[(C ^ (128|((c>>2)&63)))&0xFF];
      C = (C>>>8) ^ T[(C ^ (128|((d>>6)&15)|((c&3)<<4)))&0xFF];
      C = (C>>>8) ^ T[(C ^ (128|(d&63)))&0xFF];
    } else {
      C = (C>>>8) ^ T[(C ^ (224|((c>>12)&15)))&0xFF];
      C = (C>>>8) ^ T[(C ^ (128|((c>>6)&63)))&0xFF];
      C = (C>>>8) ^ T[(C ^ (128|(c&63)))&0xFF];
    }
  }
  return C ^ -1;
}
CRC32.table = T;
// $FlowIgnore
CRC32.str = crc32_str;
}));

//https://stackoverflow.com/questions/13405129/javascript-create-and-save-file
function download(data, filename, type) {
  var file = new Blob([data], {type: type});
  if (window.navigator.msSaveOrOpenBlob) {// IE10+
    window.navigator.msSaveOrOpenBlob(file, filename);
  }
  else { // Others
    var a = document.createElement("a"), 
        url = URL.createObjectURL(file);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function() {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);  
    }, 0); 
  }
}

//TOOLTIP CODE
$(function() {
  var targets = $( '[rel~=tooltip]' ), 
    target  = false,
    tooltip = false,
    title   = false;

  targets.bind( 'mouseenter', function() {
    target  = $( this );
    tip     = target.attr( 'title' );
    tooltip = $( '<div id="tooltip"></div>' );

    if( !tip || tip == '' ) {
      return false;
    }

    target.removeAttr( 'title' );
    tooltip.css( 'opacity', 0 )
           .html( tip )
           .appendTo( 'body' );

    function init_tooltip() {
      if( $( window ).width() < tooltip.outerWidth() * 1.5 ) {
        tooltip.css( 'max-width', $( window ).width() / 2 );
      }
      else {
        tooltip.css( 'max-width', 340 );
      }

      var pos_left = target.offset().left + ( target.outerWidth() / 2 ) - ( tooltip.outerWidth() / 2 );
      var pos_top  = target.offset().top - tooltip.outerHeight() - 20;

      if( pos_left < 0 )
      {
        pos_left = target.offset().left + target.outerWidth() / 2 - 20;
        tooltip.addClass( 'left' );
      }
      else {
        tooltip.removeClass( 'left' );
      }

      if( pos_left + tooltip.outerWidth() > $( window ).width() ) {
        pos_left = target.offset().left - tooltip.outerWidth() + target.outerWidth() / 2 + 20;
        tooltip.addClass( 'right' );
      }
      else {
        tooltip.removeClass( 'right' );
      }

      if( pos_top < 0 ) {
        var pos_top  = target.offset().top + target.outerHeight();
        tooltip.addClass( 'top' );
      }
      else {
        tooltip.removeClass( 'top' );
      }

      tooltip.css( { left: pos_left, top: pos_top } ).animate( { top: '+=10', opacity: 1 }, 50 );
    };

    init_tooltip();
    $( window ).resize( init_tooltip );

    function remove_tooltip() {
      tooltip.animate( { top: '-=10', opacity: 0 }, 50, function() {
        $( this ).remove();
      });

      target.attr( 'title', tip );
    };

    target.bind( 'mouseleave', remove_tooltip );
    tooltip.bind( 'click', remove_tooltip );
  });
});

function scrollIntoViewIfNeed(el, partiallyVisible = true, behavior = "smooth") {
  const rect = el.getBoundingClientRect();
  const isVisible = partiallyVisible
    ? rect.top < window.innerHeight && rect.bottom >= 0 // Partially visible
    : rect.top >= 0 && rect.bottom <= window.innerHeight; // Completely visible

  if (!isVisible) {
    el.scrollIntoView({
      behavior: behavior,
      block: "center",
    });
  }
}

function remToPx(rem) {    
    return rem * parseFloat(getComputedStyle(document.documentElement).fontSize);
}

function checkColor() {
  let color = window.getComputedStyle(document.elementFromPoint(1,1)).getPropertyValue('--highlight-color');
  document.querySelector("meta[name=theme-color]").setAttribute("content", color);
}

if(window.innerWidth < 640) {
  setInterval(checkColor, 20);
}
else {
  checkColor();
}
function capEachWord(toCapitalize, dividingChar = " ") {
  return toCapitalize.split(dividingChar).map(word => word[0].toUpperCase()+word.substr(1)).join(" ");
}
function getBasicAuthHeader(username, password) {
  return 'Basic ' + window.btoa(username + ':' + password); // Consider hashing password
}
function requestAccess() {
  let selectEl = document.getElementById('db_select');
  let db_name = selectEl.options[ selectEl.selectedIndex ].text;
  let emailLink = `mailto:${'info.ycanta'}@${'gmail.com'}?subject=Requesting yCanta access${(db_name ? ' to '+ db_name : '')}&body=My name is: %0D%0A%0D%0AI'd like access to: ${db_name}`;
  window.open(emailLink,'_blank');
}
