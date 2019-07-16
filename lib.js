String.prototype.count=function(s1) { 
    return (this.length - this.replace(new RegExp(s1,"g"), '').length) / s1.length;
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
      chord_line += ' '.repeat(line.length - chord_line.length);
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
  chord_keys.sort((a, b) => b - a)
  for (key in chord_keys) {
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
    return parts
  }
}
function updateAllLinks(whichView='all') {
  $('[data-song-edit]').attr('href','#'+window.songbook_id+'&'+window.song_id+'&edit');
  $('[data-song-edit="new"]').attr('href','#'+window.songbook_id+'&s-new-song&edit');
  $('[data-song]').attr('href','#'+window.songbook_id+'&'+window.song_id);
  $('[data-songbook-edit]').attr('href','#'+window.songbook_id+'&edit');
  $('[data-songbook]').attr('href','#'+window.songbook_id);
}


$(function () {
  //float menu activation
  $('body').on('click', '.float-menu-toggle', function() {
    $(this).children('.float-menu-icon').toggleClass('icon-rotate');
    $(this).siblings().toggleClass('uncollapsed');
  });
  //float menu close on click
  /*$('body').on('click', '.float-menu-item:not(:last-child)', function() {
    $(this).closest('.float-menu').find('.float-menu-toggle').siblings().slideToggle('fast');
  });*/

  //chord toggling
  $('body').on('click', '.toggle-chords', function() {
    $('#song').toggleClass('nochords');
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

bindToEdit = function() {
  $('#song').on('change', '[type="checkbox"]', function() {
    //add/remove categories as checkboxes are modified
    var cats = $('categories').text().trim()
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

editSong = function () {
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
    $(this).parent().find('select').val(type);
  });

  $('#song authors').html($('#song author').map(function(){return $(this).text()}).get().join(', '));
  $('#song categories').html($('#song cat').map(function(){return $(this).text()}).get().join(', '));
  $('#song scripture_ref').html($('#song cat').map(function(){return $(this).text()}).get().join(', '));
  $('#song').first('.subcolumn').find('stitle,authors,scripture_ref,introduction,key,chunk,copyright').toTextarea({
    allowHTML: false,//allow HTML formatting with CTRL+b, CTRL+i, etc.
    allowImg: false,//allow drag and drop images
    doubleEnter: true,//make a single line so it will only expand horizontally
    singleLine: false,//make a single line so it will only expand horizontally
    pastePlainText: false,//paste text without styling as source
    placeholder: false//a placeholder when no text is entered. This can also be set by a placeholder="..." or data-placeholder="..." attribute
  });
  $('#song categories').addClass('contenteditable-disabled').prop('tabindex',"0")
    .on('click', function(){$('#song-edit').toggleClass('sidebar-open')
    .find('.search').focus()});
  window.editing = true;

  //load categories
  db.get('categories').then(function(categories) {
    var options = {valueNames: ['name'], item: 'category-template'};
    var values = [];   
    categories.categories.map(function (cat) {
      if(window.categories_list != undefined){
        var catInList = window.categories_list.get('name',cat);
        if(catInList.length > 0){
          return
        }
      }
      values.push({ 'name': cat});
    });
    window.categories_list = new List('categories', options, values);
    //set checkboxes
    $('#song [type="checkbox"]').prop("checked", false);
    $('categories').text().split(',').forEach(function(cat){
      if(cat.trim()!= ''){
        $('label span:contains("'+cat.trim()+'")').prev().prop("checked", true);
      }
    });
  }).catch(function (err) {
    console.log(err);
    reject('got an error while working on categories');
    //should load the songbook and explain what's up.
  });  
}
prepSaveSong = function (element) {
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
        else{  //we have a line
          content += '<line>'+this+'</line>';
        }
      })
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
};
//Making things work with touch coolness
function makeDraggable(dragCaptureEl, dragEl, dragSide, dragAction) {
  var box1 = document.getElementById('song');
  var move = document.getElementById('song-edit');
  var startx = 0;
  var starty = 0;
  var dist = 0;
  var disty = 0;
  var width = 0;

  box1.addEventListener('touchstart', function(e){
    var touchobj = e.changedTouches[0]; // reference first touch point (ie: first finger)
    startx = parseInt(touchobj.clientX);
    starty = parseInt(touchobj.clientY);
    width = $(move).width(); // get x position of touch point relative to left edge of browser

    // only do stuff if in right place
    if(window.editing && startx > box1.offsetLeft + box1.offsetWidth - width - 32) { 
      move.style.transition = 'all 0s';
      //e.preventDefault();
    }
    else {
      startx = false;
    }
  }, {passive: true});

  box1.addEventListener('touchmove', function(e){
    if(startx){
      var touchobj = e.changedTouches[0]; // reference first touch point for this event
      var dist = parseInt(touchobj.clientX) - startx;
      var disty = parseInt(touchobj.clientY) - starty;
      // change distance if dist > disty
      if (Math.abs(dist) > 40 ) {
        if(Math.abs(disty) > Math.abs(dist)) {
          startx=false;
        }
        move.style.flex = '0 0 '+ parseInt((width-dist)) + 'px';
        e.preventDefault();   
      }
    }
  }, false);

  box1.addEventListener('touchend', function(e){
    move.style.removeProperty('flex');
    move.style.removeProperty('transition');
    var touchobj = e.changedTouches[0]; // reference first touch point for this event
    var dist = Math.abs(parseInt(touchobj.clientX) - startx);

    if(startx && dist > 100 ){ //make sure that distance isn't just accidental
      dragAction($('#song-edit'), 'sidebar-open');
      e.preventDefault(); 
    }
  }, false); 
};

function sayHi(message) {
  window.alert(message);
}
function dragToggleClass(el, toggleClass) {
  $(el).toggleClass(toggleClass);
}
window.addEventListener('load', function(){
  makeDraggable('','Hi!','', dragToggleClass);
}, false);

function bindSearch(element, search_prefix) {
  $('body').on('click', element, function() {
    if(window.editing){
      return
    }
    $('#songbook_content .search').val(search_prefix+$(this).text())[0]
      .dispatchEvent(new KeyboardEvent("keyup"));
  });
}

function confirmWhenEditing() {
  if(window.editing){
    if (confirm("If you leave this page you will lose your unsaved changes!")) {
      window.editing=false; //It's ok to lose changes
      return false
    } else { //we aren't leaving 
      return true
    }
  }
}

//fun little function for counting syllables.  Need to create breaks in the line instead... if we were to use this for Chord positioning.
var count = function(word) {
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
