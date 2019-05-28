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
function combine(chord, text) {
  //make text at least as long a chord length
  //chord = unicode(chord, 'utf-8') - do we need this?
  if (text.length < chord.length) {
    text += ' '.repeat(chord.length - text.length);
  }

  //convert chord to dictionary with [start, chord]
  var chords = {};
  var re = /[\S]+/g;
  while ((match = re.exec(chord)) != null) {
    //console.log("match found at " + match.index + match);
    chords[match.index] = chord.substring(match.index,(match.index + match[0].length));
  }

  //combine
  //line = unicode(xml.sax.saxutils.escape(text), 'utf-8') -not sure about needing this?
  var line = text;

  var chord_keys = Object.keys(chords);
  chord_keys.sort((a, b) => b - a)
  for (key in chord_keys) {
    //line = line[:offset] + '<c>' + chords[offset] + '</c>' + line[offset:]
    line = line.substring(0,chord_keys[key])+'<c>'+chords[chord_keys[key]] + '</c>' + line.substring(chord_keys[key],line.length);
  }
  return line //.encode('utf-8')
}


$(function () {
  //float menu activation
  $('.float-menu-toggle').siblings().slideToggle('fast');
  $('body').on('click', '.float-menu-toggle', function() {
    $(this).children('.float-menu-icon').toggleClass('icon-rotate');
    $(this).siblings().slideToggle('fast');
  });
  /*$('body').on('click', '.float-menu-item:not(:last-child)', function() {
    $(this).closest('.float-menu').find('.float-menu-toggle').siblings().slideToggle('fast');
  });*/

  //chord toggling
  $('body').on('click', '.toggle-chords', function() {
    $('#song').toggleClass('nochords');
  });
  combine('Am   C      D     Em                                                    C', 'the quickest and fastest route is west');
});
