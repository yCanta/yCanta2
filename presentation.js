
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
  'w'         : [ function() {if(! isSearching()) toggleWholeSong();},
                  "Show the whole song, or one part at a time (#51)" ],
  'g'         : [ function() {if(! isSearching()) toggleGrid();},
                  "Show a grid of the song's parts, or one part at a time (#51)" ],
  //'p'         : [ togglePresentation, "Enter/exit fullscreen presentation mode"   ],
  'F11'       : [ function(){}, "Enter/exit fullscreen presentation mode"   ],
  'Escape'    : [ escapeAction      , "Exit search, help, or presentation mode"   ],
      
  't'         : [ function() {if(! isSearching()) blackScreen(); },
                  "Toggle screen background to/from black" ],
  'f'         : [ function() {if(! isSearching()) whiteScreen(); },
                  "Toggle screen foreground to/from white" ],

  'Enter'     : [ function() {if(isSearching()) searchResult(1); else if((isFollower() || sharing) && !amDriving()) goLive();},
                  "When in search mode show the first search result; following along, go back to live" ],
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
  ' '         : [ function() {if(! isSearching()) spaceNext();},
                  "Go to the part people sing next (verse, chorus, verse...) if a search is not in progress" ],

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
  'r'         : [ function() {if(! isSearching()) showSongRefs();},
                  "Show the verses of the song's scripture references (#157)" ],
  'l'         : [ function() {if(! isSearching()) toggleReport();},
                  "Show the list of what's been presented (#158)" ],
  '/'         : [ function() {if(! isSearching()) beginSearch();},
                  "Begin a search if a search is not in progress" ],
}


// Ready once the songs are set up; live.html waits for this before handing over what it hears (#51)
let markPresentationReady;
window.presentationReady = new Promise(resolve => { markPresentationReady = resolve; });

document.addEventListener('DOMContentLoaded', function() {
    // The whole page as it starts, with its songs (#53): what "Save for later" downloads and what a mirrored
    // window is made from, so neither needs the site
    window.presentationSource = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    if (document.getElementById('data').getAttribute('data') === 'mirror') return startMirror();
    if (isFollower()) setupFollower(); // following a shared presentation in live.html (#51)
    document.getElementById('slides').addEventListener('click', pickPart);

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
    // Bible verses (#157): the book files are beside the app, which sent their address
    if (typeof Bible !== 'undefined' && window.songbook && window.songbook.bible) {
      Bible.setBase(window.songbook.bible.base);
      Bible.ready().catch(err => console.error('Bible:', err));
    }
    //PREPROCESS THE SONGBOOK OBJECT
    setTimeout(function(){
      // a follower's songs came from the server, so they're cleaned first (#51)
      window.songbook.songs = presentableItems(isFollower() ? liveSongs(window.songbook.songs) : window.songbook.songs);

      //Put default song (none yet: a follower waiting for the set)
      if (window.songbook.songs.length) {
        window.songbook.song_index = window.songbook.songs.length - 1;
        current_song = window.songbook.songs[window.songbook.song_index];
        current_song.chunk_index = current_song.doc.content.length - 1;
      }
      
      document.querySelector('#cur_slide .content').innerHTML = '<div style="width: calc(100% - 2rem);position: absolute; top: 40%;"><div style="width: 100%;text-align: center"><h1>Presenting</h1><h2><i id="pres_title">Lorem Ipsum</i></h2></div></div></div>';
      document.getElementById('pres_title').textContent = window.songbook.title; // text, not page code
      window.document.title = "yCanta2: Presenting " + window.songbook.title;
      markPresentationReady();
    },300);
});

// Comments aren't shown, and a song with nothing else is left out
function presentableSongs(songs) {
  return songs.filter(song => {
    song.doc.content = song.doc.content.filter(chunk => chunk[0].type !== 'comment');
    return song.doc.content.length != 0;
  });
}

// The main page sends the book again when the book or one of its songs changes while it's presented (#147).
// The screen stays on the same song and verse. A song taken out of the book leaves the screen at the same
// place in the book, on the first verse of the song that's there now.
function updateSongbook(json) {
  setTimeout(publishLive); // once the book is updated, followers get it too (#51)
  const data = JSON.parse(json);
  const songs = presentableItems(data.songs);
  if (!window.songbook || !songs.length) return;
  window.songbook.title = data.title;
  window.document.title = "yCanta2: Presenting " + data.title;

  const titleSlide = document.getElementById('pres_title');
  // passages put in during the presentation (#157) stay, after the same song as before
  window.songbook.songs.forEach((song, i) => {
    if (!song.passage || song.reading) return;
    const after = i > 0 ? window.songbook.songs[i - 1].id : null;
    const found = after === null ? -1 : songs.findIndex(other => other.id === after);
    songs.splice(after === null ? 0 : found === -1 ? songs.length : found + 1, 0, song);
  });
  if (current_song && current_song.passage && !current_song.reading) { // on a typed passage: stay on it
    window.songbook.songs = songs;
    window.songbook.song_index = songs.indexOf(current_song);
    return;
  }
  const oldIndex = window.songbook.song_index;
  const oldId = current_song && current_song.id;
  const oldChunk = current_song ? current_song.chunk_index : 0;
  window.songbook.songs = songs;

  if (titleSlide || !current_song) { // still on the "Presenting" screen: next goes to the first song, as at the start
    if (titleSlide) titleSlide.textContent = data.title;
    window.songbook.song_index = songs.length - 1;
    current_song = songs[window.songbook.song_index];
    current_song.chunk_index = current_song.doc.content.length - 1;
    return;
  }
  // the same place if the song is still there (a song can be in a book twice), else the first copy of it
  let index = songs[oldIndex] && songs[oldIndex].id === oldId ? oldIndex : songs.findIndex(song => song.id === oldId);
  const sameSong = index !== -1;
  if (!sameSong) index = Math.min(oldIndex, songs.length - 1);
  window.songbook.song_index = index;
  current_song = songs[index];
  current_song.chunk_index = sameSong ? Math.min(oldChunk, current_song.doc.content.length - 1) : 0;
  if (inPresentation() && !isSearching()) showChunk();
}

function myEscape(text) { return text.replace('<', '&lt;').replace('>', '&gt;'); }
function escapeText(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- Bible verses on screen (#157). bible.js finds the verses; here they become a passage that's shown like
// a song: its title (the reference) on the first slide, the translation's credit on the last, and each
// slide as many whole verses as fit at a readable size. A passage goes in after the song on screen and stays
// in the order until the presentation closes. Typed in the search box ("John 3:16-18", "Ps 23"), or the
// song's own scripture references with r.
const BIBLE_SMALLEST = 1 / 16; // a slide's text is never smaller than this much of the screen's height
let passageCount = 0;

function bibleTranslation() {
  return (window.songbook && window.songbook.bible && window.songbook.bible.translation) || 'BSB';
}

// The reference in the search box, if it is one: { text, label, translation }. Not after "s:": that searches
// the songs' scripture references, as it always has, and its numbers pick a song.
function bibleRefIn(text) {
  if (typeof Bible === 'undefined' || /^\s*s\s*:/i.test(text)) return null;
  const found = Bible.parse(text);
  if (found.error) return null;
  return { text, label: found.label, translation: bibleTranslation() };
}

// Is a reference being typed, so a number goes on it instead of picking a search result? A book's name and
// then a space ("John ", "1 Jn 4:"). Not a book's name alone: plenty of words searched for are one too ("he",
// "is", "song", "mark"), and their number picks a result. Not "s:" (see bibleRefIn).
function typingReference() {
  const text = document.querySelector('#searchbox input').value;
  if (typeof Bible === 'undefined' || !Bible.startsWithBook(text)) return false;
  return /\s$|\d/.test(text.replace(/^\s*\d\s*/, '')); // (not the 1 of "1 John")
}

// Show a passage: put it in after the song on screen (or in place of a passage on screen) and go to it
async function showPassage(refText) {
  let passage;
  try {
    passage = await Bible.passage(refText, bibleTranslation());
  } catch (err) {
    showBibleProblem(err.message || String(err));
    return;
  }
  if (!passage.verses.length) {
    showBibleProblem("Those verses aren't in this translation.");
    return;
  }
  if (!inPresentation()) { // picked on the "Presenting" slide: the presentation starts here (and is measured as one)
    hideHelp();
    document.body.classList.add('presentation');
  }
  const item = passageItem('bible-' + (++passageCount), passage);
  const songs = window.songbook.songs;
  const onTitleSlide = !!document.getElementById('pres_title') || !current_song;
  let at = onTitleSlide ? 0 : window.songbook.song_index + 1;
  const typedOnScreen = !onTitleSlide && current_song && current_song.passage && !current_song.reading;
  if (typedOnScreen) at = window.songbook.song_index; // a typed passage replaces a typed passage (not a book's reading)
  if (typedOnScreen) songs.splice(at, 1);
  songs.splice(at, 0, item);
  window.songbook.song_index = at;
  current_song = item;
  current_song.chunk_index = 0;
  showChunk('passage');
}

// A passage shown like a song: the reference as its title, the translation's credit as its copyright, its
// slides packed for this screen. Its title is what the search box finds.
function passageItem(id, passage, reading = false) {
  const item = {
    id,
    passage,
    reading, // one of the book's readings, not typed during the presentation
    doc: { title: escapeText(passage.label), authors: [''], scripture_ref: [''], key: '', search: 't:' + passage.label,
      copyright: escapeText(passage.translation.credit), content: [] },
  };
  packPassage(item);
  return item;
}

// The book's readings come from the main page as verses (it has the Bible files): they become passages here
function presentableItems(songs) {
  return presentableSongs(songs.map(song => (song.reading ? passageItem(song.id, song.passage, true) : song)));
}

function showBibleProblem(message) {
  beginSearch();
  const results = document.getElementById('searchresults');
  results.innerHTML = '<div class="match">' + escapeText(message) + '</div>';
}

// One verse on a slide: its number small, its text (poetry keeps its lines)
function verseLine(v, showChapter) {
  return '<line><vn>' + (showChapter ? v.chapter + ':' : '') + v.verse + '</vn> ' + escapeText(v.text) + '</line>';
}

// The passage's slides: as many whole verses on each as fit at a readable size on this screen
function packPassage(item) {
  const verses = item.passage.verses;
  const multiChapter = new Set(verses.map(v => v.book + v.chapter)).size > 1;
  const lines = verses.map((v, i) => verseLine(v, multiChapter && (i === 0 || v.chapter !== verses[i - 1].chapter)));
  const smallest = window.innerHeight * BIBLE_SMALLEST;
  const content = [];
  let i = 0;
  while (i < lines.length) {
    let n = 1;
    while (i + n < lines.length && fittedSize(item, lines.slice(i, i + n + 1), i === 0, i + n + 1 === lines.length) >= smallest) n++;
    content.push([{ type: 'bible' }, lines.slice(i, i + n)]);
    i += n;
  }
  item.doc.content = content;
  item.packedFor = window.innerWidth + 'x' + window.innerHeight;
}

// How big a slide's verse text would be (px), fitted to the screen the way scaleText fits a slide
function fittedSize(item, lines, first, last) {
  let slide = document.getElementById('measure_slide');
  if (!slide) {
    slide = document.createElement('div');
    slide.id = 'measure_slide';
    slide.className = 'slide';
    slide.style.visibility = 'hidden';
    slide.style.zIndex = '-1';
    slide.innerHTML = '<div class="content"></div>';
    document.getElementById('slides').appendChild(slide);
  }
  const content = slide.querySelector('.content');
  content.innerHTML = (first ? '<stitle>' + item.doc.title + '</stitle>' : '')
    + '<chunk type="bible">' + lines.join('') + '</chunk>'
    + (last ? '<copyright>' + item.doc.copyright + '</copyright>' : '');
  const fits = () => slide.scrollWidth <= window.innerWidth && slide.scrollHeight <= window.innerHeight;
  let small = 50, big = 1500, percent = (big + small) / 2;
  while (big - small > 10) {
    content.style.fontSize = percent + '%';
    if (fits()) small = percent; else big = percent;
    percent = (big + small) / 2;
  }
  content.style.fontSize = (percent - 10) + '%';
  return parseFloat(getComputedStyle(content.querySelector('line')).fontSize) || 0;
}

// The screen changed size (full screen, another window): the passages are packed again for it, staying on
// the verse that was first on screen
window.addEventListener('resize', () => {
  clearTimeout(window.repackTimer);
  window.repackTimer = setTimeout(() => {
    const size = window.innerWidth + 'x' + window.innerHeight;
    (window.songbook && window.songbook.songs || []).filter(song => song.passage && song.packedFor !== size).forEach(item => {
      const firstLine = item === current_song ? item.doc.content[item.chunk_index][1][0] : null;
      packPassage(item);
      if (firstLine) {
        const verseNumber = firstLine.replace(/<vn>(?:\d+:)?(\d+)<\/vn>.*/, '$1');
        item.chunk_index = Math.max(0, item.doc.content.findIndex(chunk => chunk[1].some(line => line.replace(/<vn>(?:\d+:)?(\d+)<\/vn>.*/, '$1') === verseNumber)));
        if (inPresentation() && !isSearching()) showChunk('passage');
      }
    });
  }, 300);
});

// r: the song on screen's own scripture references, as a passage
function showSongRefs() {
  if (!inPresentation() || !current_song || current_song.passage) return;
  const refs = (current_song.doc.scripture_ref || []).map(ref => String(ref).replace(/&amp;/g, '&')).filter(ref => ref.trim());
  if (!refs.length) return;
  showPassage(refs.join('; '));
}

// ---- What was presented (#158): each song's and passage's time on screen, and which of its slides were
// shown. One counts when it was on screen REPORT_SECONDS in all and REPORT_SHARE of its slides were shown,
// so a wrong song flicked past doesn't count and a song sung only in part does. The presenter can tick or
// untick any of them in the list (l, or the help's button). When the presentation closes, the main window
// gets the list: it offers to show it and logs it.
const REPORT_SECONDS = 45;
const REPORT_SHARE = 0.3;
const presented = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), start: null, items: new Map(), onScreen: null, sent: false };

function plainText(html) {
  // a template's contents are inert: no picture loads and no code runs while the text is read (a div would
  // run an <img onerror>, even off the page)
  const el = document.createElement('template');
  el.innerHTML = String(html ?? '');
  return el.content.textContent;
}

// The slide on screen changed (showChunk): the last one's time is added up, and this one's starts
function trackSlide() {
  const now = Date.now();
  stopTracking(now);
  if (!inPresentation() || !current_song || !current_song.doc) return;
  const key = current_song.passage ? 'bible:' + current_song.passage.label : current_song.id;
  let item = presented.items.get(key);
  if (!item) {
    const ccli = String(current_song.doc.cclis ?? '').trim();
    item = {
      id: key,
      kind: current_song.passage ? 'passage' : 'song',
      title: plainText(current_song.doc.title),
      ccli: current_song.passage ? current_song.passage.translation.id : (/^\d+$/.test(ccli) ? ccli : ''),
      ms: 0, shown: new Set(), first: now, pick: null,
    };
    presented.items.set(key, item);
  }
  item.total = current_song.doc.content.length; // (a passage is packed again when the screen changes size)
  item.shown.add(current_song.chunk_index);
  presented.start = presented.start || now;
  presented.onScreen = { item, since: now };
  renderReport();
}
function stopTracking(now = Date.now()) {
  if (!presented.onScreen) return;
  presented.onScreen.item.ms += now - presented.onScreen.since;
  presented.onScreen = null;
}

// The list so far, in the order they were first shown: { id, book, start, end, items: [{ id, kind, title,
// ccli, seconds, shown, total, auto, counted }] }. auto: it passed the rule; counted: what the presenter left
// ticked (the rule unless they changed it).
function presentationReport() {
  const now = Date.now();
  const live = presented.onScreen;
  const items = [...presented.items.values()].sort((a, b) => a.first - b.first).map(item => {
    const seconds = Math.round((item.ms + (live && live.item === item ? now - live.since : 0)) / 1000);
    const shown = Math.min(item.shown.size, item.total);
    const auto = seconds >= REPORT_SECONDS && shown / item.total >= REPORT_SHARE;
    return { id: item.id, kind: item.kind, title: item.title, ccli: item.ccli, seconds, shown, total: item.total,
      auto, counted: item.pick ?? auto };
  });
  return { id: presented.id, book: window.songbook ? plainText(window.songbook.title) : '', start: presented.start, end: now, items };
}

function clockTime(seconds) {
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
function timeOfDay(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// The list as text to paste, counted ones only: "Come, Thou Fount (CCLI 1234)", "Psalm 95:1–7 (BSB)"
function reportText(report) {
  const head = report.book + ', ' + new Date(report.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    + ', ' + timeOfDay(report.start) + ' to ' + timeOfDay(report.end);
  return [head].concat(report.items.filter(it => it.counted)
    .map(it => it.title + (it.ccli ? (it.kind === 'song' ? ' (CCLI ' + it.ccli + ')' : ' (' + it.ccli + ')') : ''))).join('\n');
}

// The list over the slides (l): counted ones, then the ones shown only briefly, each with a box to tick
function toggleReport() {
  if (document.getElementById('report')) return hideReport();
  hideHelp();
  const box = document.createElement('div');
  box.id = 'report';
  box.innerHTML = '<div></div>';
  box.addEventListener('change', e => {
    const item = presented.items.get(e.target.dataset.id);
    if (item) item.pick = e.target.checked;
  });
  box.addEventListener('click', e => {
    if (e.target.closest('[data-close]') || e.target === box) hideReport();
    if (e.target.closest('[data-copy]')) copyReport(e.target.closest('[data-copy]'));
  });
  document.body.prepend(box);
  renderReport();
}
function hideReport() {
  const box = document.getElementById('report');
  if (box) box.remove();
}
function renderReport() {
  const box = document.getElementById('report');
  if (!box) return;
  const report = presentationReport();
  const row = it => '<tr><td><input type="checkbox" data-id="' + escapeText(it.id) + '"' + (it.counted ? ' checked' : '') + '></td>'
    + '<td>' + (it.kind === 'passage' ? '📖 ' : '') + escapeText(it.title) + '</td><td>' + escapeText(it.ccli) + '</td>'
    + '<td>' + clockTime(it.seconds) + '</td><td>' + it.shown + ' of ' + it.total + '</td></tr>';
  const table = items => '<table class="report-list"><tr class="report-head"><td></td><td>Song or scripture</td><td>CCLI #</td><td>On screen</td><td>Slides</td></tr>'
    + items.map(row).join('') + '</table>';
  const counted = report.items.filter(it => it.auto), brief = report.items.filter(it => !it.auto);
  box.firstChild.innerHTML = '<h4>Presented so far</h4>'
    + '<p class="report-note">' + escapeText(report.book) + (report.start ? ', ' + timeOfDay(report.start) + ' to ' + timeOfDay(report.end) : '')
    + '. One counts when it was on screen ' + REPORT_SECONDS + ' seconds and ' + Math.round(REPORT_SHARE * 100) + '% of its slides were shown.</p>'
    + (report.items.length ? '' : '<p>Nothing has been shown yet.</p>')
    + (counted.length ? table(counted) : '')
    + (brief.length ? '<p class="report-note">Shown briefly, not counted:</p>' + table(brief) : '')
    + '<p class="report-buttons"><button type="button" class="btn" data-close>Close</button><button type="button" class="btn" data-copy>Copy list</button></p>';
}
async function copyReport(button) {
  const text = reportText(presentationReport());
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) { // the presentation window may not be allowed the clipboard: the old way
    const area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  button.textContent = 'Copied';
  setTimeout(() => { button.textContent = 'Copy list'; }, 1500);
}

// The presentation is closing: the main window gets the list, once
function endReport() {
  if (presented.sent || !presented.items.size) return;
  presented.sent = true;
  stopTracking();
  try {
    const host = window.opener || (window.parent !== window ? window.parent : null);
    if (host && typeof host.presentationEnded === 'function') host.presentationEnded(JSON.stringify(presentationReport()));
  } catch (err) {
    console.error('Presentation report:', err);
  }
}
window.addEventListener('pagehide', endReport);

// ---- Mirrored windows and "Save for later" (#53). Both are made from this page as it started
// (presentationSource), so they work the same in the app and from a saved file, with no site needed.

// A mirrored window: this page in mirror mode, showing whatever slide is on screen here
function openWindow() {
  const win = window.open('', '_blank', 'popup,width=640,height=360');
  if (!win) return;
  const page = new DOMParser().parseFromString(window.presentationSource, 'text/html');
  page.getElementById('data').setAttribute('data', 'mirror');
  win.document.write('<!DOCTYPE html>\n' + page.documentElement.outerHTML);
  win.document.close();
  secondary_windows.push(win);
  setTimeout(() => updateMirror(win), 300);
}
// The slide on screen here, in a mirrored window
function updateMirror(win) {
  try {
    if (!inPresentation()) return;
    const winDoc = win.document;
    // the part, or the whole song if that window shows whole songs (its own choice, #51)
    const whole = winDoc.body.classList.contains('wholesong');
    winDoc.querySelector('#slides').innerHTML = '<div id="cur_slide" class="slide"><div class="content">'
      + (whole ? wholeSongHtml() : part_slide_html) + '</div></div>';
    winDoc.querySelector('#statusbar').innerHTML = document.getElementById('progress').outerHTML;
    win.scaleText();
    const total = current_song.doc.content.length;
    winDoc.querySelector('#slides').style.setProperty('--percent', (((current_song.chunk_index + 1) / total) * 100));
  } catch(err) {}
}
// This page as a mirror (#51): it shows the slide the window that opened it sends. Its own keys change only
// how this window looks, as in yCanta 1 (chords for the band here, none for the room there). They never move
// the main window.
function isMirror() { return document.getElementById('data').getAttribute('data') === 'mirror'; }
const mirror_key_map = {
  'C': toggleChords,
  'w': toggleWholeSong,
  't': blackScreen,
  'f': whiteScreen,
  'h': toggleHelp,
  '?': toggleHelp,
  'Escape': hideHelp,
};
function startMirror() {
  document.body.classList.add('presentation', 'nomarker'); // a mirror is often the room's screen: no arrow unless asked for
  window.document.title = 'yCanta2: Mirror';
  document.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('#help') && (e.key == ' ' || e.key == 'Enter')) return;
    if (e.key in mirror_key_map) mirror_key_map[e.key]();
  });
  window.addEventListener('resize', scaleText); // moved to the projector or made full screen: fit the slide again
}

// ---- Sharing with other devices (#51). The app's live.js talks to the server; this page says what to send
// (the driver) or shows what it hears (a follower, in live.html).

// A part's name for people following along: "Verse 2", "Chorus"
function partName(song, index) {
  if (song.passage) return 'part ' + (index + 1);
  const type = song.doc.content[index][0].type;
  if (type !== 'verse') return type.replace(/(^|[ -])[a-z]/g, letter => letter.toUpperCase());
  return 'Verse ' + song.doc.content.slice(0, index + 1).filter(chunk => chunk[0].type === 'verse').length;
}

// -- Who drives the screens: the person sharing (the presentation in the app), unless they handed them to a
// signed-in leader following along. Whoever doesn't drive follows; their own moves are their own until they
// go back to live. The driver's Linked switch: off, they look ahead without moving the other screens.
let sharing = false, sharedSignature = '', shareProblem = '', linked = true, leadersHere = [], ownerFollow = null;
// Suggested songs: the person sharing turns them on (off to start); followers see it in the set (liveSuggest)
let suggestionsOn = false, liveSuggest = false, suggestionsHere = [], sugNotes = {};
let liveNow = null, following = true, liveMoving = false, wasDriving = false;
// After this page hands the screens over, takes them back or gives them back, updates written before that may
// still arrive; they're ignored until one names the new driver (or a few seconds pass, if the write failed)
let expectDriver = null;
function expectDriverTab(tab) {
  const expecting = { tab, until: Date.now() + 5000 };
  expectDriver = expecting;
}
function liveHost() {
  try { return window.parent !== window && window.parent.Live && window.parent.remoteDb ? window.parent : null; }
  catch (err) { return null; }
}
// live.js, in the app or in live.html
function liveApi() {
  try { return window.parent !== window && window.parent.Live ? window.parent.Live : null; }
  catch (err) { return null; }
}
function canShare() { return !isMirror() && !isFollower() && !!liveHost(); }
function myName() { const live = liveApi(); return live ? live.me : null; }
function myTab() { const live = liveApi(); return live ? live.tab : null; }
// The screens follow one page: this one, or another (a leader's tablet, even one signed in as the same person)
function amDriving() {
  if (isFollower()) return !!(liveNow && liveNow.driverTab && liveNow.driverTab === myTab());
  if (!sharing) return true;
  return !liveNow || !liveNow.driverTab || liveNow.driverTab === myTab();
}
// The leader the person sharing handed the screens to, if any
function handedTo() { return !isFollower() && sharing && !amDriving() ? liveNow.driver : null; }
function liveFields() {
  return {
    index: window.songbook.song_index, id: current_song.id, part: current_song.chunk_index,
    title: plainText(current_song.doc.title), partName: partName(current_song, current_song.chunk_index),
  };
}
// What followers get: the songs as shown here. A passage goes as its verses, so each screen fits them its own way.
function liveSet() {
  return {
    title: window.songbook.title,
    bible: window.songbook.bible || null,
    suggest: suggestionsOn,
    songs: window.songbook.songs.map(song => song.passage ? { id: song.id, passage: song.passage, reading: true } : {
      id: song.id,
      doc: { title: song.doc.title, authors: song.doc.authors, scripture_ref: song.doc.scripture_ref, key: song.doc.key,
        copyright: song.doc.copyright, content: song.doc.content },
    }),
  };
}
function setSignature() {
  return window.songbook.title + '|' + suggestionsOn + '|' + window.songbook.songs.map(song => song.id + ':' + (song.value ? song.value.rev : '')).join(',');
}
async function startShare() {
  const host = liveHost();
  if (!host) return;
  shareProblem = '';
  host.Live.onProblem = err => { shareProblem = "Other devices may be behind: " + err.message; renderShare(); };
  try {
    host.Live.setServer(host.remoteDb.name);
    const code = await host.Live.start(liveSet());
    sharing = true;
    liveNow = null;
    linked = true;
    wasDriving = true;
    following = true;
    sharedSignature = setSignature();
    publishLive();
    setupLiveBar();
    // hear the leaders following along, and the screens' moves while a leader drives
    ownerFollow = await host.Live.follow(code, {
      onNow: followNow,
      onLeaders: list => { leadersHere = list.filter(leader => leader.tab && leader.tab !== myTab()); renderShare(); },
      onSuggestions: followSuggestions,
    });
  } catch (err) {
    shareProblem = "Couldn't start sharing: " + err.message;
  }
  renderShare();
}
function stopShare() {
  if (!sharing) return;
  sharing = false;
  liveNow = null;
  if (ownerFollow) ownerFollow.stop();
  ownerFollow = null;
  const host = liveHost();
  if (host) host.Live.stop();
  suggestionsHere = [];
  renderShare();
  renderLiveBar();
  renderSuggestions();
}
window.addEventListener('pagehide', stopShare);
// Called after every slide change: if this screen drives, the other screens get the slide, and the songs
// again if they changed (#147)
function publishLive() {
  const live = liveApi();
  if (!live || !(sharing || isFollower())) return;
  if (sharing) { // the songs are the sharer's to send, driving or not
    const signature = setSignature();
    if (signature !== sharedSignature) {
      sharedSignature = signature;
      live.updateSet(liveSet());
    }
  }
  if (!amDriving() || !linked || !current_song || document.getElementById('pres_title')) return; // not driving or linked, or on "Presenting"
  live.publish(liveFields());
}
function setLinked(on) {
  linked = on;
  const box = document.getElementById('chngLinked');
  if (box) box.checked = on;
  if (on) publishLive(); // the other screens catch up to this one
  renderLiveBar();
}
// The person sharing hands the screens to a leader following along, and takes them back
function handOver(name, tab) {
  const live = liveApi();
  if (!live || !sharing || !tab || !current_song || document.getElementById('pres_title')) return;
  live.handOver(name, tab, liveFields());
  expectDriverTab(tab);
  liveNow = { ...(liveNow || {}), ...liveFields(), driver: name, driverTab: tab };
  wasDriving = false;
  following = true;
  renderShare();
  renderLiveBar();
}
function takeBack() {
  const live = liveApi();
  if (!live || !sharing || !current_song) return;
  live.takeBack(liveFields());
  expectDriverTab(myTab());
  liveNow = { ...(liveNow || {}), ...liveFields(), driver: myName(), driverTab: myTab() };
  wasDriving = true;
  following = true;
  setLinked(true);
  renderShare();
}
// A leader gives the screens back
function giveBack() {
  const live = liveApi();
  if (!live || !isFollower() || !amDriving()) return;
  live.giveBack(liveFields());
  expectDriverTab(liveNow.ownerTab);
  liveNow = { ...liveNow, ...liveFields(), driver: liveNow.owner, driverTab: liveNow.ownerTab };
  wasDriving = false;
  following = true;
  renderLiveBar();
}
// The follow-along page, with the server in it (the page may be on another site than the server, like GitHub Pages)
function shareLink(code) {
  const link = new URL('live.html', window.parent.location.href);
  link.search = '?server=' + encodeURIComponent(liveHost().Live.server);
  link.hash = code;
  return link.href;
}
function renderShare() {
  const box = document.getElementById('share');
  if (!box) return;
  const host = liveHost();
  if (sharing && host && host.Live.code) {
    const link = shareLink(host.Live.code);
    const handed = handedTo();
    box.innerHTML = '<div class="share-code" title="The code to type on the other device">' + escapeText(host.Live.code) + '</div>'
      + '<span class="help-note">On the other device open <a target="_blank" rel="noopener" href="' + escapeText(link) + '">' + escapeText(link.replace(/[?#].*/, '')) + '</a> and type this code. Each device picks its own look.</span>'
      + '<button type="button" class="btn" onclick="stopShare()">Stop sharing</button>'
      + '<label class="share-line" title="Off: look ahead here without moving the other screens"><input type="checkbox" id="chngLinked"'
      + (linked ? ' checked' : '') + (handed ? ' disabled' : '') + ' onchange="setLinked(this.checked)"> Linked: the other screens follow this one</label>'
      + '<label class="share-line" title="Anyone following can send a song; you and signed-in leaders say yes or not now"><input type="checkbox" id="chngSuggest"'
      + (suggestionsOn ? ' checked' : '') + ' onchange="setSuggestions(this.checked)"> Let people following suggest songs</label>';
    if (handed) {
      box.innerHTML += '<p class="share-line">' + escapeText(handed) + (handed === myName() ? ' (another device)' : '') + ' is leading the screens; this one follows. '
        + '<button type="button" class="btn" onclick="takeBack()">Take back</button></p>';
    } else if (leadersHere.length) {
      box.innerHTML += '<p class="share-line">Leaders following: ' + leadersHere.map(leader => '<span class="leader">'
        + escapeText(leader.name) + (leader.name === myName() ? ' (another device)' : '')
        + ' <button type="button" class="btn" data-name="' + escapeText(leader.name) + '" data-tab="' + escapeText(leader.tab)
        + '" onclick="handOver(this.dataset.name, this.dataset.tab)">Let them lead</button></span>').join(' ') + '</p>';
    } else {
      box.innerHTML += '<p class="share-line help-note">A leader signed in to yCanta on their own device shows up here once they follow along, and you can let them lead the screens.</p>';
    }
  } else {
    box.innerHTML = '<button type="button" class="btn" onclick="startShare()">Share with other devices</button>'
      + '<span class="help-note">A TV, leaders\' tablets, or phones follow along with a code.</span>';
  }
  if (shareProblem) box.insertAdjacentHTML('beforeend', '<p class="share-problem">' + escapeText(shareProblem) + '</p>');
}

// -- Following: a follower in live.html, which hands it the set and each change; or the person sharing while a
// leader drives
function isFollower() {
  const data = document.getElementById('data');
  return !!data && data.getAttribute('data-follow') === '1';
}
// The songs come from the server, where anyone signed in could have written them, so nothing in them is
// page code: text stays text, and a line keeps only its chords
function liveText(html) { return escapeText(plainText(String(html ?? ''))); }
function liveLine(html) {
  const holder = document.createElement('template');
  holder.innerHTML = String(html ?? '');
  return Array.from(holder.content.childNodes, node => node.nodeName === 'C' ? '<c>' + escapeText(node.textContent) + '</c>' : escapeText(node.textContent)).join('');
}
function liveSongs(songs) {
  return (Array.isArray(songs) ? songs : []).map(song => {
    if (song.passage) return { id: String(song.id), passage: song.passage, reading: true };
    const doc = song.doc || {};
    const list = value => (Array.isArray(value) ? value : []).map(liveText);
    return {
      id: String(song.id),
      doc: {
        title: liveText(doc.title), authors: list(doc.authors), scripture_ref: list(doc.scripture_ref), key: liveText(doc.key),
        copyright: liveText(doc.copyright),
        content: (Array.isArray(doc.content) ? doc.content : []).map(chunk => [
          { type: String((chunk[0] || {}).type || 'verse').replace(/[^a-z -]/gi, '') },
          (Array.isArray(chunk[1]) ? chunk[1] : []).map(liveLine),
        ]),
      },
    };
  });
}
function followSet(set) {
  liveSuggest = !!set.suggest;
  window.songbook.title = liveText(set.title);
  window.document.title = 'yCanta2: ' + plainText(set.title);
  const titleSlide = document.getElementById('pres_title');
  if (titleSlide) titleSlide.textContent = plainText(set.title);
  const here = current_song && current_song.id;
  window.songbook.songs = presentableItems(liveSongs(set.songs));
  if (following && liveNow && !amDriving()) return goLive();
  // wandering or driving: stay on the same song if it's still there
  const index = Math.max(0, window.songbook.songs.findIndex(song => song.id === here));
  window.songbook.song_index = index;
  current_song = window.songbook.songs[index];
  if (current_song) current_song.chunk_index = Math.min(current_song.chunk_index || 0, current_song.doc.content.length - 1);
  renderLiveBar();
}
function followNow(now) {
  if (expectDriver) {
    if (now && now.driverTab !== expectDriver.tab && Date.now() < expectDriver.until) return; // an older update
    expectDriver = null;
  }
  const songChanged = liveNow && now && liveNow.id !== now.id;
  liveNow = now;
  if (amDriving()) {
    if (!wasDriving) { // just handed the screens: start from what they show
      wasDriving = true;
      const live = liveApi();
      if (isFollower() && live) live.drive(String(now._id).slice(4), now);
      linked = true;
      goLive();
    }
    renderLiveBar();
    renderShare();
    return;
  }
  if (wasDriving) { // the screens were taken back, or given back
    wasDriving = false;
    following = true;
    const live = liveApi();
    if (isFollower() && live) live.stopDriving();
  }
  if (following) goLive();
  else renderLiveBar(songChanged);
  renderShare();
}
// Back to whatever the driver has on screen
function goLive() {
  following = true;
  const songs = window.songbook && window.songbook.songs;
  if (liveNow && songs && songs.length) {
    const index = songs[liveNow.index] && songs[liveNow.index].id === liveNow.id ? liveNow.index : songs.findIndex(song => song.id === liveNow.id);
    if (index !== -1) {
      window.songbook.song_index = index;
      current_song = songs[index];
      current_song.chunk_index = Math.max(0, Math.min(Number(liveNow.part) || 0, current_song.doc.content.length - 1));
      liveMoving = true;
      try { showChunk('live'); } finally { liveMoving = false; }
    }
  }
  renderLiveBar();
}
// A screen that follows and moves on its own stops following until it goes back to live
function noteFollowerMove() {
  if (liveMoving) return;
  if ((isFollower() || sharing) && !amDriving() && following) {
    following = false;
    renderLiveBar();
  }
}
function setupFollower() {
  document.body.classList.add('follower');
  setupLiveBar();
}
function setupLiveBar() {
  if (document.getElementById('liveBar')) return renderLiveBar();
  document.body.insertAdjacentHTML('beforeend', '<div id="liveBar"><button type="button" id="livePill"></button>'
    + '<button type="button" id="liveExtra" hidden></button>'
    + '<button type="button" id="liveSuggest" onclick="openSuggest()" hidden>Suggest a song</button>'
    + '<button type="button" id="liveSettings" onclick="toggleHelp()" title="This screen\'s look, and the keys">?</button></div>');
  renderLiveBar();
}
// The small bar at the top: Live, or where the screens are; Linked or not for whoever drives; Give back / Take back.
// The person sharing sees it only when it says something (a projector shouldn't show it), or on a touch screen.
function renderLiveBar(nudge = false) {
  const bar = document.getElementById('liveBar');
  if (!bar) return;
  const pill = document.getElementById('livePill'), extra = document.getElementById('liveExtra');
  const driving = amDriving();
  const touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  bar.hidden = !isFollower() && (!sharing || (driving && linked && !touch));
  pill.classList.toggle('wandering', driving ? !linked : !following);
  extra.hidden = true;
  document.getElementById('liveSuggest').hidden = !(isFollower() && liveSuggest);
  renderSuggestions();
  if (driving) {
    pill.textContent = linked ? 'Linked: the screens follow you' : 'Not linked  ·  Link';
    pill.title = linked ? 'Tap to look ahead without moving the other screens' : 'Tap to send what you have to the other screens';
    pill.onclick = () => setLinked(!linked);
    if (isFollower()) { extra.hidden = false; extra.textContent = 'Give back'; extra.onclick = giveBack; }
  } else {
    pill.onclick = () => goLive();
    const who = !isFollower() && liveNow && liveNow.driver ? liveNow.driver + (liveNow.driver === myName() ? ' (another device)' : '') + ' leads' : '';
    if (following) {
      pill.textContent = liveNow ? 'Live' + (who ? ': ' + who : '') : 'Waiting for the first song';
      pill.title = 'Following along. Move on your own any time, then tap here to come back.';
    } else {
      pill.textContent = (liveNow ? 'Now: ' + liveNow.title + ', ' + liveNow.partName : 'Not started') + '  ·  Back to live';
      pill.title = 'Go to what the screens show';
    }
    if (!isFollower() && sharing) { extra.hidden = false; extra.textContent = 'Take back'; extra.onclick = takeBack; }
  }
  if (nudge) { // the screens moved to another song while this one was elsewhere
    pill.classList.remove('nudge');
    void pill.offsetWidth;
    pill.classList.add('nudge');
  }
}

// ---- Suggested songs (#51). Anyone following sends one (when the person sharing turned them on); the person
// sharing and signed-in leaders see a small card and answer it once: yes or not now. On the sharer's page, a yes
// can be added right after the song on screen, found by name in the church's songs.
function setSuggestions(on) {
  suggestionsOn = on;
  publishLive(); // followers get the change with the set
  renderSuggestions();
}
function followSuggestions(list) {
  suggestionsHere = Array.isArray(list) ? list : [];
  renderSuggestions();
}
// Who sees the card: the person sharing, and leaders signed in on their own device
function seesSuggestions() {
  return sharing ? suggestionsOn : (isFollower() && liveSuggest && !!myName());
}
function renderSuggestions() {
  let card = document.getElementById('sugCard');
  const open = seesSuggestions() ? suggestionsHere.filter(sug => sug.status !== 'no') : [];
  if (!open.length) { if (card) card.hidden = true; return; }
  if (!card) {
    document.body.insertAdjacentHTML('beforeend', '<div id="sugCard" role="status"></div>');
    card = document.getElementById('sugCard');
  }
  card.hidden = false;
  const button = (label, call, id) => '<button type="button" class="btn" data-id="' + escapeText(id) + '" onclick="' + call + '">' + label + '</button>';
  card.innerHTML = open.map(sug => {
    let html = '<div class="sug"><span class="sug-song">' + escapeText(sug.text) + '</span>' + (sug.name ? ' from ' + escapeText(sug.name) : '') + '<br>';
    if (sug.status === 'new') {
      html += button('Yes', "answerSuggestion(this.dataset.id, 'yes')", sug.id) + button('Not now', "answerSuggestion(this.dataset.id, 'no')", sug.id);
    } else {
      html += 'Yes from ' + escapeText(sug.by);
      if (sharing) html += '<br>' + button('Add next', 'addSuggested(this.dataset.id)', sug.id) + button('Done', 'liveApi().dismiss(this.dataset.id)', sug.id);
    }
    if (sugNotes[sug.id]) html += '<br>' + escapeText(sugNotes[sug.id]);
    return html + '</div>';
  }).join('');
}
async function answerSuggestion(id, status) {
  const live = liveApi();
  if (!live) return;
  try {
    if (!(await live.answer(id, status))) sugNotes[id] = 'Someone answered first.';
  } catch (err) {
    sugNotes[id] = "Couldn't answer: " + err.message;
  }
  renderSuggestions();
}
// The sharer adds a yes right after the song on screen, if the church has a song by that name
async function addSuggested(id) {
  const sug = suggestionsHere.find(item => item.id === id);
  const host = liveHost();
  if (!sug || !host || !host.db) return;
  try {
    const plain = title => title.toLowerCase().replace(/\s+/g, ' ').trim();
    const want = plain(sug.text);
    const rows = (await host.db.allDocs({ startkey: 's-', endkey: 's-￰', include_docs: true })).rows
      .filter(row => row.doc && typeof row.doc.title === 'string' && !row.doc.deleted);
    const found = rows.find(row => plain(row.doc.title) === want) || rows.find(row => plain(row.doc.title).includes(want));
    if (!found) { sugNotes[id] = 'Not in your songs. Add it in yCanta, or pick another.'; renderSuggestions(); return; }
    const item = presentableItems([{ id: found.id, key: found.id, value: { rev: found.doc._rev }, doc: host.displaySong(found.doc) }])[0];
    if (!item) { sugNotes[id] = 'That song has nothing to show.'; renderSuggestions(); return; }
    const onTitle = !!document.getElementById('pres_title');
    window.songbook.songs.splice(onTitle ? 0 : window.songbook.song_index + 1, 0, item);
    if (onTitle) window.songbook.song_index = window.songbook.songs.length - 1; // the first Next still goes to the first song
    publishLive(); // followers get the new list
    if (inPresentation() && !onTitle) { liveMoving = true; try { showChunk('added'); } finally { liveMoving = false; } } // the arrow and the next song
    await liveApi().dismiss(id);
  } catch (err) {
    sugNotes[id] = "Couldn't add it: " + err.message;
    renderSuggestions();
  }
}
// The form a follower sends a song with
function openSuggest() {
  let box = document.getElementById('suggestBox');
  if (!box) {
    document.body.insertAdjacentHTML('beforeend', '<div id="suggestBox"><div><h4>Suggest a song</h4>'
      + '<p>The leaders see it and can add it. You can always suggest one out loud too.</p>'
      + '<input id="sugText" maxlength="120" placeholder="Song name" autocomplete="off">'
      + '<input id="sugName" maxlength="40" placeholder="Your name (if you like)" autocomplete="name">'
      + '<p><button type="button" class="btn" onclick="sendSuggestion()">Send</button><button type="button" class="btn" onclick="closeSuggest()">Cancel</button></p>'
      + '<p id="sugMsg" role="status"></p></div></div>');
    box = document.getElementById('suggestBox');
    box.addEventListener('keydown', e => { if (e.key === 'Enter') sendSuggestion(); if (e.key === 'Escape') closeSuggest(); });
  }
  box.hidden = false;
  document.getElementById('sugMsg').textContent = '';
  document.getElementById('sugText').focus();
}
function closeSuggest() {
  const box = document.getElementById('suggestBox');
  if (box) box.hidden = true;
}
async function sendSuggestion() {
  const text = document.getElementById('sugText').value.trim();
  const msg = document.getElementById('sugMsg');
  if (!text) { msg.textContent = 'Type a song name first.'; return; }
  try {
    await liveApi().suggest(window.liveCode, text, document.getElementById('sugName').value);
    document.getElementById('sugText').value = '';
    msg.textContent = 'Sent. Thanks!';
    setTimeout(closeSuggest, 1500);
  } catch (err) {
    msg.textContent = "Couldn't send it: " + err.message;
  }
}

// Save for later: this presentation as one file, to open offline in any browser or to email
function savePresentation() {
  const title = (window.songbook ? plainText(window.songbook.title) : '') || 'yCanta';
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([window.presentationSource], { type: 'text/html' }));
  link.download = title.replace(/[\\/:*?"<>|]+/g, ' ').trim() + ' presentation.html';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

// The setup panel (h or ?): how this screen looks, other screens, and the keys (#51). A mirror's panel has
// only its own look, since its slides come from the main window; a follower's has its own look too.
function toggleHelp() {
  if(!document.getElementById('help')) { // help element not created yet -- lets do it
    const mirror = isMirror();
    const follower = isFollower();
    // checked to match the screen as it is now (keys can change it before the panel is ever opened)
    const on = name => document.body.classList.contains(name) ? ' checked' : '';
    let content = '<div id="help"><div>';
    if (!mirror && !follower) content += '<p class="help-top"><button type="button" class="btn" onclick="savePresentation()" title="Download this presentation as one file, to open offline or email">Save for later</button>'
      + '<button type="button" class="btn" onclick="toggleReport()">Presented so far</button></p>'; // (#53, #158)

    content += '<h4>' + (mirror ? 'This window' : 'This screen') + '</h4>';
    content += '<div class="helpLine">'
      + '<label onchange="whiteScreen(true)" class="switch"><input type="checkbox" id="fgText"' + on('white') + '><div data-text="TEXT" class="slider font"></div></label>'
      + '<label onchange="blackScreen(true)" class="switch"><input type="checkbox" id="bgColor"' + on('black') + '><div data-text="BG" class="slider background"></div></label>'
      + '<label onchange="toggleChords(true)"><input id="chngChords" type="checkbox"' + (document.body.classList.contains('nochords') ? '' : ' checked') + '> Chords</label>'
      + '<label onchange="toggleMarker()" title="A small arrow on the progress bar over the part Space goes to"><input id="chngMarker" type="checkbox"' + (document.body.classList.contains('nomarker') ? '' : ' checked') + '> Next-part arrow</label>'
      + '</div>';
    // What this screen shows. Whole song and Grid suit a leader's own screen: click a part there to show it on
    // the mirror or the other screens, which can stay on one part at a time.
    const view = currentView();
    const choice = (value, label, title) => '<label title="' + title + '"><input type="radio" name="showView" value="' + value + '"'
      + (view === value ? ' checked' : '') + ' onchange="setView(this.value)"> ' + label + '</label>';
    content += '<div class="helpLine view-line">Show: ' + choice('part', 'One part', 'One part at a time, as big as fits')
      + choice('whole', 'Whole song', 'Every part of the song, the one being sung clear. Click a part to show it.')
      + (mirror ? '' : choice('grid', 'Grid', 'A card for each part. Click one to show it.')) + '</div>';
    if (!mirror && !follower) content += '<p class="help-note">Whole song and Grid are for your own screen. Open a mirror or share for the room\'s screen; it shows one part at a time unless you change it there.</p>';
    content += '<div id="files"><span>Background picture:</span><input onclick="clearFile(this)" onchange="loadFiles(this);" data="bg-image" type="file" accept="image/*">'
      + '<span>Still picture:</span><input onclick="clearFile(this)" onchange="loadFiles(this);" data="fixed-image" type="file" accept="image/*">'
      + '<span>Front picture:</span><input onclick="clearFile(this)" onchange="loadFiles(this);" data="fg-image" type="file" accept="image/*"></div>';

    if (!mirror && !follower) {
      content += '<h4>Other screens</h4>';
      content += '<div class="screen-row"><button type="button" class="btn" onclick="openWindow()">Open a mirror</button>'
        + '<span class="help-note">A second window on this computer, for a projector or the band. Its own C, t and f keys change only it.</span></div>';
      if (canShare()) content += '<div class="screen-row" id="share"></div>';
    }

    // The keys worth knowing, in plain words
    const keys = mirror ? [
      ['w', 'Whole song, or one part at a time'],
      ['t / f', 'Black background / white text, on or off'],
      ['C (capital)', 'Chords on or off'],
      ['h or ?', 'This panel'],
      ['Esc', 'Close this panel'],
    ] : [
      ['Space', 'The part people sing next: verse, chorus, verse... (the small arrow shows where)'],
      ['→ ↓', 'Next part, in the order the song is written'],
      ['← ↑', 'Back a part'],
      ...(follower ? [['Moving on your own', 'Stops following until you go back to live']] : []),
      ['Page Down / Page Up', 'Next / previous song'],
      ['Home / End', 'First / last song'],
      ['1 to 9, 0', 'Go to that verse of the song (0 is 10)'],
      ['c, b, e', 'Go to the chorus, bridge, or ending'],
      ['s or /', 'Search the songs; then 1 to 5 or Enter picks one'],
      ...(follower ? [['Enter or the Live button', 'Follow the leader again']] : [
        ['s, then John 3:16', 'Show Bible verses: type the reference, then Enter'],
        ['r', "Show the verses this song's scripture references name"],
      ]),
      ['t / f', 'Black background / white text, on or off'],
      ['C (capital)', 'Chords on or off'],
      ['w', 'Whole song, or one part at a time'],
      ['g', 'Grid of the parts, or one part at a time'],
      ['Click a part', 'In the whole song or the grid: show that part'],
      ...(follower ? [] : [['l', "The list of what's been presented, to copy"]]),
      ['h or ?', 'This panel'],
      ['Esc', 'Close search, this panel, or the list'],
    ];
    content += '<h4>Keys</h4><table class="keys">'
      + keys.map(([key, what]) => '<tr><td class="key">' + escapeText(key) + '</td><td class="description">' + escapeText(what) + '</td></tr>').join('')
      + '</table>';
    content += '</div></div>';
    document.body.insertAdjacentHTML('afterbegin', content);
    document.getElementById('help').style.display = 'none';
    renderShare();
  }

  // now certain that all is inited
  slideToggle(document.getElementById('help'), 200);
}
function toggleMarker() {
  document.body.classList.toggle('nomarker');
}

// ---- Whole song (#51): any screen can show every part of the song on screen, the one being sung clear and
// the rest faded, and the part Space goes to marked. Handy for leaders on tablets. Moving still goes part by
// part. (yCanta 1 had this as "Song mode".)
let part_slide_html = ''; // the part on screen, as one slide: what a mirror showing parts gets
function wholeSongHtml(song = current_song) {
  if (!song || !song.doc) return '';
  const target = song === current_song ? spaceTarget(song) : null;
  let verse = 0;
  let html = '<stitle>' + song.doc.title + '</stitle>'
    + '<author>' + song.doc.authors.join(', ') + '</author>'
    + '<key>' + song.doc.key + '</key>';
  song.doc.content.forEach((chunk, i) => {
    const mark = i === song.chunk_index ? ' class="current"' : i === target ? ' class="space-next"' : '';
    html += '<chunk type="' + chunk[0].type + '"' + mark + ' data-part="' + i + '">';
    if (chunk[0].type === 'verse') html += '<span>' + (++verse) + ':</span>';
    chunk[1].forEach(line => { html += '<line>' + line + '</line>'; });
    html += '</chunk>';
  });
  return html + '<copyright>' + song.doc.copyright + '</copyright>';
}
function currentView() {
  return document.body.classList.contains('gridview') ? 'grid' : document.body.classList.contains('wholesong') ? 'whole' : 'part';
}
// One part, the whole song, or a grid of the song's parts (a mirror: no grid)
function setView(view) {
  if (view === 'grid' && isMirror()) view = 'part';
  document.body.classList.toggle('wholesong', view === 'whole');
  document.body.classList.toggle('gridview', view === 'grid');
  document.querySelectorAll('input[name="showView"]').forEach(box => { box.checked = box.value === view; });
  if (isMirror()) { try { window.opener.updateMirror(window); } catch (err) { /* the main window is gone */ } }
  else if (current_song && !document.getElementById('pres_title')) { liveMoving = true; try { showChunk('view'); } finally { liveMoving = false; } }
}
function toggleWholeSong() { setView(currentView() === 'whole' ? 'part' : 'whole'); }
function toggleGrid() { setView(currentView() === 'grid' ? 'part' : 'grid'); }

// ---- Grid (#51): a card for each part of the song, the one on screen outlined and the one Space goes to
// dashed, then a card for the next song. Click one to show it.
function gridHtml(song = current_song) {
  if (!song || !song.doc) return '';
  const target = spaceTarget(song);
  let html = '<div class="grid-head"><stitle>' + song.doc.title + '</stitle></div><div class="grid">';
  song.doc.content.forEach((chunk, i) => {
    html += '<div class="grid-card' + (i === song.chunk_index ? ' current' : '') + (i === target ? ' space-next' : '') + '" data-part="' + i + '">'
      + '<span class="grid-label">' + escapeText(partName(song, i)) + '</span>'
      + chunk[1].map(line => '<line>' + line + '</line>').join('') + '</div>';
  });
  const songs = window.songbook.songs;
  const next = songs[(window.songbook.song_index + 1) % songs.length];
  if (next && next.doc) {
    html += '<div class="grid-card grid-next' + (target === null ? ' space-next' : '') + '" data-next-song="1">'
      + '<span class="grid-label">Next song</span><line>' + next.doc.title + '</line></div>';
  }
  return html + '</div>';
}
// A click on a part in the whole song or the grid shows that part (on the mirrors and other screens too)
function pickPart(event) {
  const card = event.target.closest && event.target.closest('[data-part], [data-next-song]');
  if (!card || !current_song || !inPresentation()) return;
  if (card.dataset.nextSong) return nextSong();
  const part = Number(card.dataset.part);
  if (!(part >= 0 && part < current_song.doc.content.length)) return;
  current_song.chunk_index = part;
  showChunk('picked');
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
    if (chngChords) chngChords.checked = !chngChords.checked;
  }
}

function searchDatabase(){
  const text = document.querySelector('#searchbox input').value.trim();
  if(text.length < 2) {
    document.getElementById('searchresults').innerHTML = '';
    return;
  }

  // Escape the text, so typing ( or [ searches for it instead of throwing
  var re = new RegExp('(' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')([^\0\n]*)', 'i');
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

  // A Bible reference ("John 3:16-18", "Ps 23") is the first result: its verses, then the songs that cite it (#157)
  const ref = bibleRefIn(text);
  if (ref) {
    matches = [{ bibleRef: ref.text }].concat(matches.slice(0, MAX_SEARCH_RESULTS - 1));
  }
  last_search_results = matches;     // save for future reference

  // format for display
  var count = 0;

  var textmatches = matches.map(function(item) {
      count += 1;
      if (item.bibleRef) {
        return '<div onclick="javascript:void(searchResult(' + count + '));">'
          + '<span class="count">[' + count + ']</span> '
          + '<span class="song">' + escapeText(ref.label) + '</span>: '
          + '<span class="matchline">' + escapeText(ref.translation) + '</span></div>';
      }
      let m = re.exec(item.doc.search);
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

  // A reference that's started but not right yet ("John 3:99"): say why, above any songs found
  if (!ref && /\d/.test(text) && typingReference() && typeof Bible !== 'undefined') { // not while the book is being typed
    const problem = Bible.parse(text).error;
    if (problem) textmatches.unshift('<div class="count">' + escapeText(problem) + '</div>');
  }
  document.getElementById('searchresults').innerHTML = textmatches.join('\n');
  const infoSpan = document.querySelector('#searchbox > span.info');
  if(infoSpan) infoSpan.textContent = '  showing ' + textmatches.length + ' of ' + total_matches;

}

function isSearching(){
  const searchbox = document.getElementById('searchbox'); // a mirror has none: its status bar is the main window's
  return !!searchbox && searchbox.style.display != 'none';
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
  if (last_search_results[n - 1].bibleRef) {
    showPassage(last_search_results[n - 1].bibleRef);
    endSearch();
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
    noteSung();

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

    part_slide_html = build_chunk(current_song.doc.content[current_song.chunk_index]);
    const view = currentView();
    document.querySelector('#cur_slide .content').innerHTML = view === 'whole' ? wholeSongHtml() : view === 'grid' ? gridHtml() : part_slide_html;

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
    const space_target = spaceTarget(); // the part Space goes to gets a small marker (#51)
    for(let chunk_index = 0; chunk_index < total; chunk_index++) {
      progress_text += '<div class="'+current_song.doc.content[chunk_index][0].type.replace(/[^a-z]/g,'');
      if(chunk_index < current_song.chunk_index){
        progress_text += ' before';
      } else if(chunk_index == current_song.chunk_index) {
        progress_text += ' current';
      } else {
        progress_text += ' after';
      }
      if (chunk_index === space_target) progress_text += ' space-next';
      progress_text += '"></div>';
    }
    const progress = document.getElementById('progress');
    progress.innerHTML = progress_text;
    progress.classList.toggle('space-next-song', space_target === null); // Space goes on to the next song

    scaleText();
    trackSlide(); // what was presented (#158)

    secondary_windows = secondary_windows.filter(win => !win.closed);
    secondary_windows.forEach(updateMirror);
    noteFollowerMove(); // (#51)
    publishLive();
  }
  else {
    const song = chunk.parentNode;
    song.querySelectorAll('chunk').forEach(el => slideToggle(el, 200));
    scrollTo(chunk.parentNode);
  }
}

// ---- Space goes to the part people sing next (#51): verse, chorus, verse, chorus... The arrow keys still go
// in the order the song is written. Each song keeps track of the parts sung since it came on screen.
let last_shown_song = null;
function noteSung() {
  if (!current_song || !current_song.doc) return;
  if (last_shown_song !== current_song) { current_song.sung = new Set(); last_shown_song = current_song; }
  current_song.sung.add(current_song.chunk_index);
}
// The part Space goes to in this song, or null for the next song
function spaceTarget(song = current_song) {
  if (!song || !song.doc || !Array.isArray(song.doc.content)) return null;
  const types = song.doc.content.map(chunk => chunk[0].type);
  const here = song.chunk_index;
  const next = here + 1 < types.length ? here + 1 : null;
  if (song.passage) return next; // Bible verses: in order
  const sung = song.sung || new Set([here]);
  const choral = type => type === 'chorus' || type === 'pre-chorus';
  const chorus = types.indexOf('chorus');
  const chorusStart = chorus > 0 && types[chorus - 1] === 'pre-chorus' ? chorus - 1 : chorus; // with its pre-chorus
  // the first part not sung yet after the last verse-like part sung (so a part skipped on purpose stays skipped)
  const nextUnsung = () => {
    let from = 0;
    sung.forEach(i => { if (!choral(types[i]) && i + 1 > from) from = i + 1; });
    for (let i = from; i < types.length; i++) if (!sung.has(i) && !choral(types[i])) return i;
    return null;
  };
  const type = types[here];
  if (type === 'verse') {
    if (next !== null && (choral(types[next]) || types[next] === 'final chorus')) return next;
    if (chorusStart >= 0 && chorusStart < here) return chorusStart; // the chorus came earlier: sing it again
    return next;
  }
  if (type === 'pre-chorus') return next !== null && types[next] === 'chorus' ? next : (chorus >= 0 ? chorus : next);
  if (type === 'chorus') return nextUnsung();
  if (next !== null && !sung.has(next)) return next; // bridge, ending, final chorus, no label...: as written
  if (type === 'bridge' && chorusStart >= 0) return chorusStart; // nothing after the bridge: the chorus again
  return nextUnsung();
}
function spaceNext() {
  if (!inPresentation() || !current_song || !current_song.doc) return;
  if (document.getElementById('pres_title')) return nextChunk(); // the "Presenting" screen: the first song
  const target = spaceTarget();
  if (target === null) return nextSong();
  current_song.chunk_index = target;
  showChunk('space');
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
    if (fgText) fgText.checked = !fgText.checked; // the help panel (and this box) may not exist yet
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
    if (bgColor) bgColor.checked = !bgColor.checked;
  }
  if(document.body.classList.contains('black')){
    document.body.classList.remove('black');
  }
  else {
    document.body.classList.add('black');
  }
}

function numberHit(num){
  if(isSearching() && typingReference()){
    return; // the number is part of a reference being typed ("John 3:16"), not a pick
  }
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
  if (document.body.classList.contains('gridview')) return; // the grid keeps its size and scrolls (#51)
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
  hideReport();
  if(isSearching()){
    endSearch();
  }
  else {
    //exitPresentation();
  }
}

function processKey(e){
  if (e.target && e.target.closest && e.target.closest('#suggestBox')) return; // typing a suggestion, not keys 
  //console.log("key: '" + e.key +"'", "originalEvent.key: '" + e.originalEvent.key + "'", e);
  key = e.key;
  // Space or Enter on a box or button in the list or the help works it, and doesn't change the slide
  if ((key == ' ' || key == 'Enter') && e.target.closest && e.target.closest('#report, #help')) {
    return;
  }
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
    if (document.body.classList.contains('gridview')) { startx = 0; return; } // the grid scrolls (#51)
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
