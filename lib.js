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
  else {
    return parts
  }
}


$(function () {
  //float menu activation
  $('.float-menu-toggle').siblings().slideToggle('fast');
  $('body').on('click', '.float-menu-toggle', function() {
    $(this).children('.float-menu-icon').toggleClass('icon-rotate');
    $(this).siblings().slideToggle('fast');
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
