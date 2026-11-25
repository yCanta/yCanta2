
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
  'j'         : [ function() {if(! isSearching() && sharing) toggleJoin();},
                  "While sharing: show or hide the QR code on the screens (#51)" ],
  'g'         : [ function() {if(! isSearching()) toggleGrid();},
                  "Show a grid of the song's parts, or one part at a time (#51)" ],
  //'p'         : [ togglePresentation, "Enter/exit fullscreen presentation mode"   ],
  'F11'       : [ function(){}, "Enter/exit fullscreen presentation mode"   ],
  'Escape'    : [ escapeAction      , "Close search or help; twice to leave the presentation"   ],
      
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
    // The whole page as it starts, with its songs (#53): what "Download" saves and what a mirrored
    // window is made from, so neither needs the site
    window.presentationSource = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    watchTheme(); // the panels take the app's theme colors (#51)
    if (document.getElementById('data').getAttribute('data') === 'mirror') return startMirror();
    if (isFollower()) setupFollower(); // following a shared presentation in live.html (#51)
    else { setupMenuButton(); loadPictures(); }
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

// The few of yCanta's icons (#95) a presentation shows. Drawn right here, not taken from icons.svg, because a
// presentation can be downloaded and opened as one file with nothing beside it. Same drawings as icons.svg.
const PRES_ICONS = {
  book: '<path d="M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2zM12 6v14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
};
function presIcon(name) {
  return '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"'
    + ' stroke-linecap="round" stroke-linejoin="round">' + PRES_ICONS[name] + '</svg>';
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
    // offline, the same plain words as the song page, not "Failed to fetch" (UX audit #23)
    showBibleProblem(navigator.onLine ? (err.message || String(err)) : "These verses aren't saved on this device yet. Connect to the internet to load them.");
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
const presented = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), start: null, items: new Map(), onScreen: null, sent: false,
  used: new Set() }; // which features were used, for analytics: 'whole song', 'grid', 'mirror', 'shared'...
function noteUse(what) { presented.used.add(what); }
// What was used, as a short list for analytics: the features used along the way, plus the pictures in use
// and their motion as the presentation ends
function usedList() {
  const list = [...presented.used];
  // the backgrounds on this screen and the open mirrors
  const shown = new Set([screenBg || '', ...openMirrors().map(win => { try { return mirrorBackground(win); } catch (err) { return ''; } })]);
  const pictures = { back: 'background', still: 'still picture', front: 'front picture' };
  if (shown.has('picture')) Object.keys(pictures).forEach(which => { if (pictureBlobs[which]) list.push(pictures[which]); });
  shown.forEach(choice => { if (ART[choice]) list.push('drawing ' + choice); });
  if ([...shown].some(choice => choice)) list.push('motion ' + ['off', 'gentle', 'lively'][motionLevel]);
  return list;
}

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
  return { id: presented.id, book: window.songbook ? plainText(window.songbook.title) : '', start: presented.start, end: now, items, used: usedList() };
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
    + '<td>' + (it.kind === 'passage' ? presIcon('book') + ' ' : '') + escapeText(it.title) + '</td><td>' + escapeText(it.ccli) + '</td>'
    + '<td>' + clockTime(it.seconds) + '</td><td>' + it.shown + ' of ' + it.total + '</td></tr>';
  const table = items => '<table class="report-list"><tr class="report-head"><td></td><td>Song or scripture</td><td>CCLI #</td><td>On screen</td><td>Slides</td></tr>'
    + items.map(row).join('') + '</table>';
  const counted = report.items.filter(it => it.auto), brief = report.items.filter(it => !it.auto);
  box.firstChild.innerHTML = '<h4>Presentation Stats</h4>'
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

// ---- Mirrored windows and "Download" (#53). Both are made from this page as it started
// (presentationSource), so they work the same in the app and from a saved file, with no site needed.

// A problem with something in Help & Settings, said in red in its own row, under the button or file box that
// failed (one style for errors, UX audit #24: never the browser's alert box). It goes after 10 seconds.
function panelProblem(row, message) {
  if (!row) return;
  let note = row.querySelector('.panel-problem');
  if (!note) {
    note = document.createElement('span');
    note.className = 'help-note panel-problem';
    note.setAttribute('role', 'alert');
    row.appendChild(note);
  }
  note.textContent = message;
  clearTimeout(note.timer);
  note.timer = setTimeout(() => note.remove(), 10000);
}

// A mirrored window: this page in mirror mode, showing whatever slide is on screen here
function openWindow() {
  const win = window.open('', '_blank', 'popup,width=640,height=360');
  if (!win) {
    panelProblem(document.querySelector('#help [onclick="openWindow()"]')?.closest('.screen-row'),
      'Your browser blocked the mirror window. Allow pop-ups for this site (in the address bar), then try again.');
    return;
  }
  const page = new DOMParser().parseFromString(window.presentationSource, 'text/html');
  page.getElementById('data').setAttribute('data', 'mirror');
  win.document.write('<!DOCTYPE html>\n' + page.documentElement.outerHTML);
  win.document.close();
  secondary_windows.push(win);
  noteUse('mirror');
  setTimeout(() => { updateMirror(win); renderMirrors(); }, 300);
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
    const card = winDoc.getElementById('joinCard');
    if (card) card.remove();
    if (sharing && joinShown) winDoc.body.insertAdjacentHTML('beforeend', joinCardHtml());
    // where the presentation is, for the mirror's background light and zoom; and its pictures, the first time
    win.mirrorProgress = songPlace();
    if (!win.picturesShown) { win.picturesShown = true; win.mirrorMotion = motionLevel; pictureMirror(win); }
    if (win.startBackdrop) win.startBackdrop();
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
  window.addEventListener('pagehide', () => { try { window.opener.setTimeout(window.opener.renderMirrors, 200); } catch (err) { /* the main window is gone */ } });
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
// The join card (QR code and code) on the screens: the sharer shows it; followers get it with the set
let joinShown = false, liveJoin = false;
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
    join: joinShown,
    art: sharedArt(), // the built-in drawing on the main screen, if any (#133)
    songs: window.songbook.songs.map(song => song.passage ? { id: song.id, passage: song.passage, reading: true } : {
      id: song.id,
      doc: { title: song.doc.title, authors: song.doc.authors, scripture_ref: song.doc.scripture_ref, key: song.doc.key,
        copyright: song.doc.copyright, content: song.doc.content },
    }),
  };
}
function setSignature() {
  return window.songbook.title + '|' + suggestionsOn + '|' + joinShown + '|' + sharedArt() + '|' + window.songbook.songs.map(song => song.id + ':' + (song.value ? song.value.rev : '')).join(',');
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
    noteUse('shared');
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
  joinShown = false;
  renderJoin();
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
  const server = liveHost().Live.server;
  if (server !== new URL('couch/', link.origin + '/').href) link.search = '?server=' + encodeURIComponent(server);
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
    box.innerHTML = '<div class="share-unit"><div class="share-qr" title="Scan to follow along">' + qrSvg(link) + '</div>'
      + '<div class="share-info"><div class="share-code" title="The code to type on the other device">' + escapeText(host.Live.code) + '</div>'
      + '<span class="help-note">Scan it, or open <a target="_blank" rel="noopener" href="' + escapeText(link) + '">' + escapeText(link.replace(/[?#].*/, '').replace(/^https?:\/\//, '')) + '</a> and type the code. Each device picks its own look.</span>'
      + '<button type="button" class="btn btn-stop" onclick="stopShare()">Stop sharing</button></div></div>'
      + '<div class="switches stacked">'
      + switchHtml('chngJoin', 'Show the QR code on the screens (j)', joinShown, 'setJoin(this.checked)', 'A card with the QR code and the code, on this screen, the mirrors and the screens following')
      + switchHtml('chngLinked', 'Linked: the other screens follow this one', linked, 'setLinked(this.checked)', 'Off: look ahead here without moving the other screens', !!handed)
      + switchHtml('chngSuggest', 'Let people following suggest songs', suggestionsOn, 'setSuggestions(this.checked)', 'Anyone following can send a song; you and signed-in leaders say yes or not now')
      + '</div>';
    if (handed) {
      box.innerHTML += '<p class="share-line">' + escapeText(handed) + (handed === myName() ? ' (another device)' : '') + ' is leading the screens; this one follows. '
        + '<button type="button" class="btn" onclick="takeBack()">Take back</button></p>';
    } else if (leadersHere.length) {
      box.innerHTML += '<p class="share-line">Leaders following: ' + leadersHere.map(leader => '<span class="leader">'
        + escapeText(leader.name) + (leader.name === myName() ? ' (another device)' : '')
        + ' <button type="button" class="btn" data-name="' + escapeText(leader.name) + '" data-tab="' + escapeText(leader.tab)
        + '" onclick="handOver(this.dataset.name, this.dataset.tab)">Let them lead</button></span>').join(' ') + '</p>';
    }
  } else {
    box.innerHTML = '<div class="screen-row"><button type="button" class="btn" onclick="startShare()">Share with other devices</button>'
      + '<span class="help-note">A TV, leaders\' tablets, or phones follow along with a code or a QR code. Leaders signed in on their own device can be handed the screens.</span></div>';
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
  liveJoin = !!set.join;
  leaderArt = typeof set.art === 'string' ? set.art : ''; // the drawing on the main screen of the person sharing (#133)
  applyArt(followBg === 'same' ? leaderArt : followBg); // or this phone's own choice
  renderJoin();
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
  document.body.classList.toggle('has-livebar', !bar.hidden);
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

// ---- The join card (#51): a QR code and the code, in a corner of the screens, so people in the room can follow
// along on their phones. The sharer turns it on (j, or the share panel); mirrors and followers show it too.
function qrSvg(text) {
  const make = window.qrcode || (window.parent !== window && window.parent.qrcode);
  if (typeof make !== 'function') return '';
  const qr = make(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
function setJoin(on) {
  if (!sharing) return;
  joinShown = on;
  const box = document.getElementById('chngJoin');
  if (box) box.checked = on;
  renderJoin();
  publishLive(); // followers get it with the set
  secondary_windows.filter(win => !win.closed).forEach(updateMirror);
}
function toggleJoin() { setJoin(!joinShown); }
// What the card says: here, the sharer's link; on a follower, its own page with the code
function joinCardHtml() {
  let link = '', code = '';
  if (sharing) {
    const host = liveHost();
    code = host && host.Live.code;
    if (code) link = shareLink(code);
  } else if (isFollower() && window.liveCode) {
    code = window.liveCode;
    link = window.parent.location.href.replace(/#.*$/, '') + '#' + code;
  }
  if (!link) return '';
  const page = link.replace(/[?#].*$/, '').replace(/^https?:\/\//, '');
  return '<div id="joinCard"><div class="join-qr">' + qrSvg(link) + '</div><div class="join-text">Follow along on your phone'
    + '<span class="join-code">' + escapeText(code) + '</span><span class="join-page">' + escapeText(page) + '</span></div></div>';
}
function renderJoin() {
  const old = document.getElementById('joinCard');
  if (old) old.remove();
  if ((sharing && joinShown) || (isFollower() && liveJoin)) document.body.insertAdjacentHTML('beforeend', joinCardHtml());
}

// ---- Suggested songs (#51). Anyone following sends one (when the person sharing turned them on); the person
// sharing and signed-in leaders see a small card and answer it once: yes or not now. A yes from any of them is
// added right after the song on screen by the sharer's page, found by name in the church's songs. Saying yes
// never moves the screen.
function setSuggestions(on) {
  suggestionsOn = on;
  if (on) noteUse('suggestions on');
  publishLive(); // followers get the change with the set
  renderSuggestions();
}
const sugAdding = new Set(); // yeses this page has started adding, so each is added once
function followSuggestions(list) {
  suggestionsHere = Array.isArray(list) ? list : [];
  renderSuggestions();
  // The sharer's page adds each yes as up next, whoever said it
  if (sharing) suggestionsHere.filter(sug => sug.status === 'yes' && !sugAdding.has(sug.id)).forEach(sug => {
    sugAdding.add(sug.id);
    addSuggested(sug.id);
  });
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
      // A yes is added on its own; the card stays only if it couldn't be (not in the songs, or an error)
      html += 'Yes from ' + escapeText(sug.by) + (sharing && !sugNotes[sug.id] ? ', adding it next' : '');
      if (sharing && sugNotes[sug.id]) html += '<br>' + button('Try again', 'addSuggested(this.dataset.id)', sug.id) + button('Done', 'liveApi().dismiss(this.dataset.id)', sug.id);
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
  delete sugNotes[id]; // trying again
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
    noteUse('suggestion added');
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
    box.addEventListener('click', e => { if (e.target === box) closeSuggest(); }); // a click outside the form closes it
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

// Download: this presentation as one file, to open offline in any browser or to email
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

// Help & Settings (h or ?): screens and sharing, this screen's look, backgrounds, and the keys (#51). A mirror's
// panel has only its own look, since its slides come from the main window; a follower's has its look and keys.
function switchHtml(id, label, checked, onchange, title = '', disabled = false) {
  return '<label class="switch"' + (title ? ' title="' + escapeText(title) + '"' : '') + '><input type="checkbox" id="' + id + '"'
    + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + ' onchange="' + onchange + '"><span class="switch-track"></span>' + label + '</label>';
}
function keysOpen() { try { return localStorage.getItem('yCantaKeysOpen') === '1'; } catch (err) { return false; } }
function toggleHelp() {
  if(!document.getElementById('help')) { // help element not created yet -- lets do it
    const mirror = isMirror();
    const follower = isFollower();
    const main = !mirror && !follower;
    const on = name => document.body.classList.contains(name); // set to match the screen as it is now
    let content = '<div id="help"><div>';
    content += '<div class="help-head"><h3>' + (mirror ? 'This window' : 'Help & Settings') + '</h3>'
      + (main ? '<button type="button" class="btn" onclick="savePresentation()" title="Download this presentation as one file, to open offline or email">Download</button>'
        + '<button type="button" class="btn" onclick="toggleReport()">Presentation Stats</button>' : '') // (#53, #158)
      + (canLeave() ? '<button type="button" class="btn" onclick="openAppHelp()" title="yCanta\'s Help, on presenting">Help</button>'
        + '<button type="button" class="btn" onclick="leavePresentation()" title="Back to the songbook (Esc twice)">Leave</button>' : '')
      + '<button type="button" class="help-close" onclick="hideHelp()" aria-label="Close" title="Close (Esc)">' + presIcon('close') + '</button></div>';

    // This screen first: what it shows sets everything else on it
    content += '<section><h4>' + (mirror ? 'Look' : 'This screen') + '</h4>';
    const view = currentView();
    const choice = (value, label, title) => '<label title="' + title + '"><input type="radio" name="showView" value="' + value + '"'
      + (view === value ? ' checked' : '') + ' onchange="setView(this.value)">' + label + '</label>';
    content += '<div class="segmented" role="radiogroup" aria-label="Show">' + choice('part', 'One part', 'One part at a time, as big as fits (w and g go back to it)')
      + choice('whole', 'Whole song', 'Every part of the song, the one on screen outlined. Click a part to show it. (w)')
      + (mirror ? '' : choice('grid', 'Grid', 'The whole book, the song on screen open. Click a part to show it. (g)')) + '</div>';
    // said out loud, not only in the choices' hover tips (a touch screen never shows those)
    if (main) content += '<p class="help-note">Whole song and Grid are for your own screen: the mirror and the other screens keep showing one part at a time. The part on screen is outlined; the arrow marks where Space goes next.</p>';
    content += '<div class="switches">'
      + switchHtml('fgText', 'White text', on('white'), 'whiteScreen(true)', 'f')
      + switchHtml('bgColor', 'Black background', on('black'), 'blackScreen(true)', 't')
      + switchHtml('chngChords', 'Chords', !on('nochords'), 'toggleChords(true)', 'C (capital)')
      + switchHtml('chngMarker', 'Next-part arrow', !on('nomarker'), 'toggleMarker()', 'A small arrow on the part Space goes to')
      + '</div>';
    // This screen's background: a drawing, the pictures, or nothing. Each mirror picks its own (Screens &
    // Sharing), and a phone following can show the leader's drawing or its own.
    if (main || follower) {
      const current = follower ? followBg : (screenBg || '');
      const bgOption = (value, label) => '<label><input type="radio" name="screenBg" value="' + value + '"' + (current === value ? ' checked' : '')
        + ' onchange="setBackground(this.value)">' + label + '</label>';
      content += '<div class="picture-row bg-row"><span>Background</span><span class="segmented">'
        + (follower ? bgOption('same', "Leader's") : '') + bgOption('', 'None') + (main ? bgOption('picture', 'Picture') : '')
        + Object.keys(ART).map(name => bgOption(name, ART[name].label)).join('') + '</span>'
        + '<span class="help-note">' + (main
          ? 'Behind the words on this screen. A drawing draws itself in as the song goes on; Picture uses the pictures below. Each mirror picks its own under Screens & Sharing.'
          : 'The person sharing picks one for their screen. This phone can show that, or its own.') + '</span></div>';
    }
    if (main) {
      const picture = (which, label, note) => '<div class="picture-row" id="picture-' + which + '"><span>' + label + '</span>'
        + '<span class="picture-pick"><input type="file" accept="image/*" onchange="pickPicture(\'' + which + '\', this)">'
        + '<span class="picture-state"></span><button type="button" class="btn picture-remove" onclick="clearPicture(\'' + which + '\')" hidden>Remove</button></span>'
        + '<span class="help-note">' + note + '</span></div>';
      const motionChoice = (value, label) => '<label><input type="radio" name="motion" value="' + value + '"' + (motionLevel === value ? ' checked' : '')
        + ' onchange="setMotion(this.value)">' + label + '</label>';
      // open to start when a drawing or a picture is in use, so it's easy to see what's on and change it
      const inUse = !!(screenBg || pictureBlobs.back || pictureBlobs.still || pictureBlobs.front);
      content += '<details id="helpBackgrounds"' + (inUse ? ' open' : '') + '><summary>Backgrounds</summary>'
        + picture('back', 'Background picture', 'Behind the words. It drifts slowly, and moves left to right as the song goes on. Remembered on this device.')
        + '<div class="picture-row"><span>Motion</span><span class="segmented">' + motionChoice(0, 'Off') + motionChoice(1, 'Gentle') + motionChoice(2, 'Lively') + '</span>'
        + '<span class="help-note">For the pictures and the drawings, on every screen.</span></div>'
        + '<details class="more"' + (pictureBlobs.still || pictureBlobs.front ? ' open' : '') + '><summary>More</summary>'
        + picture('still', 'Still picture', 'Behind the words; it stays put.')
        + picture('front', 'Front picture', 'Over the words, so use one with see-through parts (a frame, light leaks).')
        + '</details></details>';
    }
    content += '</section>';

    if (main) {
      content += '<section><h4>Screens & Sharing</h4>'
        + '<div class="screen-row"><button type="button" class="btn" onclick="openWindow()">Open a mirror</button>'
        + '<span class="help-note">A second window on this computer, for a projector or the band: drag it to that screen and press F11 for full screen. Set its look here, so the room never sees a panel.</span></div>'
        + '<div id="mirrorList"></div>'
        + (canShare() ? '<div id="share"></div>' : '')
        + '</section>';
    }

    // The keys worth knowing, each drawn as a keycap
    const keys = mirror ? [
      [['w'], 'Whole song, or one part'],
      [['C'], 'Chords on or off (capital C)'],
      [['t'], 'Black background'], [['f'], 'White text'],
      [['h', '?'], 'This panel'], [['Esc'], 'Close this panel'],
    ] : [
      [['Space'], 'The part people sing next: verse, chorus, verse…'],
      [['→', '↓'], 'Next part, as written'],
      [['←', '↑'], 'Back a part'],
      [['PgDn', 'PgUp'], 'Next / previous song'],
      [['Home', 'End'], 'First / last song'],
      [['1–9', '0'], 'That verse (0 is 10)'],
      [['c'], 'The chorus; the final chorus once every verse is sung'],
      [['b', 'e'], 'The bridge / the ending'],
      [['s', '/'], 'Search; then 1–5 or Enter picks one'],
      ...(follower ? [[['Enter'], 'Back to live, after moving on your own']] : [
        [['s'], 'then John 3:16 and Enter: Bible verses'],
        [['r'], "The verses this song's scripture references name"],
      ]),
      [['w'], 'Whole song, or one part'],
      [['g'], 'Grid, or one part'],
      [['C'], 'Chords on or off (capital C)'],
      [['t'], 'Black background'], [['f'], 'White text'],
      ...(follower ? [] : [[['j'], 'While sharing: the QR code on the screens'], [['l'], 'Presentation Stats']]),
      [['h', '?'], 'This panel'],
      [['Esc'], 'Close search, this panel, or the stats' + (canLeave() ? '; press it twice to leave' : '')],
    ];
    content += '<details id="helpKeys"' + (keysOpen() ? ' open' : '') + '><summary>Keys</summary><div class="keys">'
      + keys.map(([caps, what]) => '<div><span class="caps">' + caps.map(cap => '<kbd>' + escapeText(cap) + '</kbd>').join('')
        + '</span><span>' + escapeText(what) + '</span></div>').join('')
      + '</div>'
      // What the thin bar at the bottom means (UX audit #27): its colors are the progress bar's own
      + '<p class="bar-legend">The thin bar at the bottom is the song, one piece per part: '
      + [['verse', 'verse'], ['chorus', 'chorus'], ['bridge', 'bridge'], ['ending', 'ending'], ['other', 'other']]
        .map(([cls, label]) => '<span class="swatch ' + cls + '"></span>' + label).join(', ')
      + '. The bright piece is the part on screen, and the small arrow is where Space goes next.</p>'
      + '</details>';
    content += '</div></div>';
    document.body.insertAdjacentHTML('afterbegin', content);
    const help = document.getElementById('help');
    help.style.display = 'none';
    help.addEventListener('click', e => { if (e.target === help) hideHelp(); }); // a click outside the panel closes it
    document.getElementById('helpKeys').addEventListener('toggle', e => { // remembered for next time
      try { localStorage.setItem('yCantaKeysOpen', e.target.open ? '1' : '0'); } catch (err) { /* private window */ }
    });
    renderShare();
    renderPictures();
  }
  renderMirrors(); // the mirrors as they are now

  // now certain that all is inited
  slideToggle(document.getElementById('help'), 200);
}

// ---- The Menu button (#51): always there in Whole song and Grid. In One part it's a hint that peeks out: at the
// start (until a couple of seconds after the first move, or 45 seconds), then for a few seconds after the mouse
// moves or the screen is tapped once, so a phone or tablet can always reach the menu.
let menuPeekTimer = null, menuHintAtStart = true;
function setupMenuButton() {
  // Leave (#5 of the UX audit): a way out that needs no keyboard and no browser Back button, in an installed app too
  const leave = canLeave() ? '<button type="button" id="leaveButton" onclick="leavePresentation()" title="Back to the songbook (Esc twice)">' + presIcon('close') + ' Leave</button>' : '';
  document.body.insertAdjacentHTML('beforeend', '<div id="cornerButtons">' + leave
    + '<button type="button" id="menuButton" onclick="toggleHelp()" title="Help & Settings (h)">' + presIcon('menu') + ' Menu</button></div>');
  document.body.classList.toggle('can-leave', !!leave);
  cornerButtons().forEach(b => b.classList.add('start'));
  peekMenu(45000);
  let lastPeek = 0;
  document.addEventListener('mousemove', () => {
    if (menuHintAtStart || Date.now() - lastPeek < 500) return;
    lastPeek = Date.now();
    peekMenu(3000);
  });
  // a single tap that didn't move (a swipe changes the slide; a double tap opens the search)
  let tapAt = null;
  document.addEventListener('touchstart', e => { tapAt = e.touches.length === 1 ? [e.touches[0].clientX, e.touches[0].clientY] : null; }, { passive: true });
  document.addEventListener('touchend', e => {
    const t = e.changedTouches[0];
    if (tapAt && t && Math.abs(t.clientX - tapAt[0]) < 10 && Math.abs(t.clientY - tapAt[1]) < 10) peekMenu(4000);
    tapAt = null;
  }, { passive: true });
}
const cornerButtons = () => ['leaveButton', 'menuButton'].map(id => document.getElementById(id)).filter(Boolean);
function peekMenu(ms) {
  const buttons = cornerButtons();
  if (!buttons.length) return;
  buttons.forEach(b => { b.classList.add('peek'); b.classList.remove('fade'); });
  clearTimeout(menuPeekTimer);
  menuPeekTimer = setTimeout(() => {
    buttons.forEach(b => b.classList.add('fade'));
    menuPeekTimer = setTimeout(() => buttons.forEach(b => b.classList.remove('peek', 'fade', 'start')), 800);
  }, ms);
}
// the presentation got going: the start hint fades soon
function menuHintDone() {
  if (!menuHintAtStart) return;
  menuHintAtStart = false;
  peekMenu(2000);
}

// ---- The app's theme (#51): the panels take the app's colors, and change when its theme does. A mirror takes
// them from the window that opened it; a follower from live.html; a downloaded file keeps the light ones.
const THEME_VARS = ['--background-color', '--background-color-rgb', '--text-color', '--light-text-color', '--box-shadow-var',
  '--btn-shadow-var', '--btn-color', '--btn-edge', '--song-color'];
function themeSource() {
  try { if (window.parent !== window && window.parent.document) return window.parent.document; } catch (err) { /* another site */ }
  try { if (window.opener && window.opener.document) return window.opener.document; } catch (err) { /* closed */ }
  return null;
}
function syncTheme() {
  const source = themeSource();
  if (!source) return;
  const values = source.defaultView.getComputedStyle(source.documentElement);
  THEME_VARS.forEach(name => {
    const value = values.getPropertyValue(name).trim();
    if (value) document.documentElement.style.setProperty(name, value);
  });
}
function watchTheme() {
  syncTheme();
  const source = themeSource();
  if (source) new source.defaultView.MutationObserver(syncTheme).observe(source.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setTimeout(syncTheme, 50));
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
    chunk[1].forEach(line => { html += '<line dir="' + lineDir(line) + '">' + line + '</line>'; }); // right to left where it's Arabic (#90)
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
  if (view !== 'part' && !isMirror()) noteUse(view === 'whole' ? 'whole song' : 'grid');
  document.body.classList.toggle('wholesong', view === 'whole');
  document.body.classList.toggle('gridview', view === 'grid');
  document.querySelectorAll('input[name="showView"]').forEach(box => { box.checked = box.value === view; });
  if (isMirror()) { try { window.opener.updateMirror(window); } catch (err) { /* the main window is gone */ } }
  else if (current_song && !document.getElementById('pres_title')) { liveMoving = true; try { showChunk('view'); } finally { liveMoving = false; } }
}
function toggleWholeSong() { setView(currentView() === 'whole' ? 'part' : 'whole'); }
function toggleGrid() { setView(currentView() === 'grid' ? 'part' : 'grid'); }

// ---- Grid (#51): the whole book. The song on screen is open, a card for each part: the one on screen outlined,
// a small triangle on the one Space goes to. Every other song is a row that opens to show its parts; clicking a
// part anywhere shows it.
const grid_open = new Set(); // songs opened in the grid, besides the one on screen
function gridHtml() {
  const songs = window.songbook.songs;
  const here = window.songbook.song_index;
  const target = spaceTarget(current_song);
  const nextSong = (here + 1) % songs.length;
  let html = '';
  songs.forEach((song, s) => {
    if (!song || !song.doc) return;
    const onScreen = s === here && !document.getElementById('pres_title');
    // the next song opens on its own when Space goes there next, to show what comes
    const upNext = target === null && s === nextSong && !document.getElementById('pres_title');
    const open = onScreen || upNext || grid_open.has(s);
    html += '<div class="grid-song' + (onScreen ? ' on-screen' : '') + '">'
      + '<div class="grid-song-head' + (upNext && !song.doc.content.length ? ' space-next' : '') + '" data-open-song="' + s + '">'
      + '<span class="grid-toggle' + (open ? ' open' : '') + '"></span><stitle>' + song.doc.title + '</stitle>'
      + '<span class="grid-count">' + song.doc.content.length + (song.doc.content.length === 1 ? ' part' : ' parts') + '</span></div>';
    if (open) {
      html += '<div class="grid">' + song.doc.content.map((chunk, i) => '<div class="grid-card'
        + (onScreen && i === song.chunk_index ? ' current' : '') + ((onScreen && i === target) || (upNext && i === 0) ? ' space-next' : '')
        + '" data-song="' + s + '" data-part="' + i + '"><span class="grid-label">' + escapeText(partName(song, i)) + '</span>'
        + chunk[1].map(line => '<line dir="' + lineDir(line) + '">' + line + '</line>').join('') + '</div>').join('') + '</div>';
    }
    html += '</div>';
  });
  return html;
}
// Draw the grid. A song that opens slides open and one that closes slides shut, instead of jumping: when Space
// moves on, or a song's row is clicked. (Only from a grid already showing: switching to Grid just draws it.)
const GRID_SLIDE_MS = 250;
function drawGrid(content) {
  const songOf = el => el.querySelector('[data-open-song]')?.dataset.openSong;
  const wasGrid = !!content.querySelector('.grid-song');
  const before = new Map();
  content.querySelectorAll('.grid-song').forEach(el => { const g = el.querySelector(':scope > .grid'); if (g) before.set(songOf(el), g); });
  content.innerHTML = gridHtml();
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!wasGrid || calm || !Element.prototype.animate) return false;
  const slide = (grid, open) => {
    const height = grid.offsetHeight + 'px';
    const shut = { height: '0px', opacity: 0, marginTop: '0px', marginBottom: '0px' };
    const full = { height, opacity: 1 };
    grid.style.overflow = 'hidden';
    return grid.animate(open ? [shut, full] : [full, shut], { duration: GRID_SLIDE_MS, easing: 'ease-in-out', fill: open ? 'none' : 'forwards' });
  };
  let moved = false;
  content.querySelectorAll('.grid-song').forEach(el => {
    const s = songOf(el), grid = el.querySelector(':scope > .grid');
    if (grid && !before.has(s)) {
      moved = true;
      slide(grid, true).onfinish = () => grid.style.removeProperty('overflow');
    } else if (!grid && before.has(s)) {
      // the old parts, back for a moment to slide shut: no outline, no marker, not clickable
      const ghost = before.get(s);
      ghost.classList.add('grid-closing');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.querySelectorAll('.current, .space-next').forEach(c => c.classList.remove('current', 'space-next'));
      ghost.querySelectorAll('[data-part]').forEach(c => c.removeAttribute('data-part'));
      el.appendChild(ghost);
      moved = true;
      slide(ghost, false).onfinish = () => ghost.remove();
    }
  });
  return moved; // the caller waits for the slide before scrolling the part on screen into view
}
// After the grid is drawn: the part on screen in view
function scrollGrid() {
  const card = document.querySelector('#cur_slide .grid-card.current') || document.querySelector('#cur_slide .grid-song.on-screen');
  const next = document.querySelector('#cur_slide .grid-card.space-next');
  if (next) next.scrollIntoView({ block: 'nearest' }); // what comes next, then the part on screen (it wins if both don't fit)
  if (card) card.scrollIntoView({ block: 'nearest' });
}
// A click in the whole song or the grid: a part shows that part (on the mirrors and other screens too); a
// song's row in the grid opens or closes it, without changing the screen
function pickPart(event) {
  const target = event.target.closest && event.target.closest('[data-part], [data-open-song]');
  if (!target || !current_song || !inPresentation()) return;
  const songs = window.songbook.songs;
  if (target.dataset.openSong !== undefined) {
    const s = Number(target.dataset.openSong);
    if (s === window.songbook.song_index && !document.getElementById('pres_title')) return; // the song on screen stays open
    if (grid_open.has(s)) grid_open.delete(s); else grid_open.add(s);
    drawGrid(document.querySelector('#cur_slide .content'));
    return;
  }
  const s = target.dataset.song !== undefined ? Number(target.dataset.song) : window.songbook.song_index;
  const part = Number(target.dataset.part);
  if (!songs[s] || !(part >= 0 && part < songs[s].doc.content.length)) return;
  if (s !== window.songbook.song_index) {
    grid_open.delete(s); // it's the song on screen now, open anyway
    window.songbook.song_index = s;
    current_song = songs[s];
  }
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

// Which way a song line reads (#90): right to left when its first letter, not counting chords, is Arabic
// (or Hebrew), else "auto". A copy of lib.js lineDir: this window doesn't load lib.js.
const RTL_LETTER = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;
function lineDir(line) {
  const first = String(line == null ? '' : line).replace(/<c>.*?<\/c>/gi, '').replace(/<[^>]*>/g, '').replace(/&[#\w]+;/g, ' ').match(/\p{L}/u);
  return first && RTL_LETTER.test(first[0]) ? 'rtl' : 'auto';
}

function searchDatabase(){
  const text = document.querySelector('#searchbox input').value.trim();
  if(text.length < 2) {
    document.getElementById('searchresults').innerHTML = '';
    return;
  }

  // Accents don't matter, as in the app's lists: "cancion" finds "canción" (#90). The song's search text is
  // taken apart (NFD: "ó" is "o" and its accent), and each letter typed may have accents after it in the
  // song. Arabic goes the way Arabic search usually works, the same as the app's lists (lib.js
  // stripAccents): its vowel marks, shadda, sukun, tanween, the small alef, tatweel and hamza or madda over
  // a letter don't matter (so ا also finds أ إ آ, و finds ؤ, ي finds ئ), ا finds ٱ, ه finds ة and ي finds ى.
  // Hindi vowel signs still have to match. Each piece is escaped, so typing ( or [ searches for it instead
  // of throwing.
  const MARKS = '[\\u0300-\\u036f\\u0610-\\u061a\\u0640\\u064b-\\u065f\\u0670\\u06d6-\\u06dc\\u06df-\\u06e8\\u06ea-\\u06ed]*';
  const SAME_LETTER = { 'ا': '[اٱ]', 'ه': '[هة]', 'ي': '[يى]' }; // ا ه ي
  const typed = text.normalize('NFD').replace(new RegExp(MARKS, 'g'), '')
    .replace(/ٱ/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  const pattern = Array.from(typed).map(ch => (SAME_LETTER[ch] || ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) + MARKS).join('');
  var re = new RegExp('(' + pattern + ')([^\0\n]*)', 'i');
  const searchText = item => (item.searchNFD ??= String((item.doc && item.doc.search) || '').normalize('NFD')); // (a follower's songs have none)
  var match_object = []
  var total_matches = 0;
  var matches = window.songbook.songs.filter(function(item) {
      if(total_matches >= MAX_SEARCH_RESULTS){
        return false; // we only show MAX_SEARCH_RESULTS, don't waste time testing regex
      }
      if (!item.doc) return false; // a reading
      var result = re.test(searchText(item));
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
          + '<span class="matchline">' + escapeText((Bible.translations().find(t => t.id === ref.translation) || {}).name || ref.translation)
          + ' (' + escapeText(ref.translation) + ')</span></div>'; // "Berean Standard Bible (BSB)", not just BSB
      }
      const search = searchText(item);
      let m = re.exec(search);
      let matchline_start = Math.max(
          search.substring(0,m.index).lastIndexOf('\n') || 0
        , search.substring(0,m.index).lastIndexOf('\0') || 0);
      let matchline_end = m.index + m[1].length + m[2].length;
      const piece = (from, to) => search.substring(from, to).normalize('NFC'); // put back together: "ó" again

      return ('<div onclick="javascript:void(searchResult('+(count)+'));">'
        + '<span class="count">['+count+']</span> '
        + '<span class="song">' + item.doc.title + '</span>: '
        + '<span class="matchline" dir="auto">' + piece(matchline_start, m.index)
        + '<span class="match">' + piece(m.index, m.index + m[1].length) + '</span>'
        + piece(m.index + m[1].length, matchline_end) + '</span></div>');
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
        // the song's details sit together so calm words can move them to a corner
        content += '<stitle>'+song.doc.title+'</stitle><div class="song-info">'
                 + '<author>'+song.doc.authors.join(', ')+'</author>'
                 + '<scripture_ref>'+song.doc.scripture_ref.join(', ')+'</scripture_ref>'
                 + '<key>'+song.doc.key+'</key></div>';
      }
      
      let verse_number = 1;
      for(let chunk_index = 0; chunk_index < song.chunk_index; chunk_index++) {
        if(song.doc.content[chunk_index][0].type == 'verse') {
          verse_number += 1;
        }
      }
      content += '<chunk type="' + chunk[0].type + '">';
      if(chunk[0].type == 'verse'){
        content += '<span data-verse="'+verse_number+'">'+verse_number+':</span>';
      }
      chunk[1].forEach(function(line){
        content += '<line dir="' + lineDir(line) + '">' + line + '</line>'; // an Arabic line reads right to left (#90)
      });
      content += '</chunk>';

      if(song.doc.content.length == song.chunk_index + 1){ //last chunk
        content += '<copyright>'+song.doc.copyright+'</copyright>';
      }
      return content;
    }

    part_slide_html = build_chunk(current_song.doc.content[current_song.chunk_index]);
    const view = currentView();
    const slideContent = document.querySelector('#cur_slide .content');
    if (view === 'grid') setTimeout(scrollGrid, drawGrid(slideContent) ? GRID_SLIDE_MS + 20 : 0);
    else slideContent.innerHTML = view === 'whole' ? wholeSongHtml() : part_slide_html;

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
    if (name !== 'view' && name !== 'live') menuHintDone();
  }
  else {
    const song = chunk.parentNode;
    song.querySelectorAll('chunk').forEach(el => slideToggle(el, 200));
    scrollTo(chunk.parentNode);
  }
}

// ---- Space goes to the part people sing next (#51): verse, chorus, verse, chorus... The arrow keys still go
// in the order the song is written. Each song keeps track of the parts sung since it came on screen, in order.
let last_shown_song = null;
function noteSung() {
  if (!current_song || !current_song.doc) return;
  if (last_shown_song !== current_song) { current_song.sung = new Set(); current_song.sungOrder = []; last_shown_song = current_song; }
  current_song.sung.add(current_song.chunk_index);
  current_song.sungOrder.push(current_song.chunk_index);
}
const choralType = type => type === 'chorus' || type === 'pre-chorus';
// The chorus that goes with a part: the nearest one written above it (a song can have more than one), else the
// first one; with its pre-chorus if one is written right before it. -1 if the song has none.
function chorusFor(types, here) {
  let chorus = -1;
  for (let i = Math.min(here, types.length - 1); i >= 0 && chorus < 0; i--) if (types[i] === 'chorus') chorus = i;
  if (chorus < 0) chorus = types.indexOf('chorus');
  return chorus > 0 && types[chorus - 1] === 'pre-chorus' ? chorus - 1 : chorus;
}
// The part Space goes to in this song, or null for the next song
function spaceTarget(song = current_song) {
  if (!song || !song.doc || !Array.isArray(song.doc.content)) return null;
  const types = song.doc.content.map(chunk => chunk[0].type);
  const here = song.chunk_index;
  const next = here + 1 < types.length ? here + 1 : null;
  if (song.passage) return next; // Bible verses: in order
  const sung = song.sung || new Set([here]);
  const order = song.sungOrder || [here];
  // the first part not sung yet after the last verse-like part sung (so a part skipped on purpose stays skipped)
  const nextUnsung = () => {
    let from = 0;
    sung.forEach(i => { if (!choralType(types[i]) && i + 1 > from) from = i + 1; });
    for (let i = from; i < types.length; i++) if (!sung.has(i) && !choralType(types[i])) return i;
    return null;
  };
  const type = types[here];
  if (type === 'verse') {
    if (next !== null && (choralType(types[next]) || types[next] === 'final chorus')) return next; // written right after it
    const chorus = chorusFor(types, here);
    if (chorus < 0 || chorus > here) return next; // no chorus yet
    // As many verses go before each chorus as the song has before its first one (verse, verse, chorus: two),
    // and the chorus comes anyway when no verse follows
    const first = types.findIndex(choralType);
    const perChorus = Math.max(1, types.slice(0, first).filter(t => t === 'verse').length);
    let verses = 0;
    for (let i = order.length - 1; i >= 0 && types[order[i]] === 'verse'; i--) verses++;
    if (verses >= perChorus || next === null || types[next] !== 'verse') return chorus;
    return next;
  }
  if (type === 'pre-chorus') { // its chorus: the next one written after it
    const chorus = types.indexOf('chorus', here);
    return chorus >= 0 ? chorus : next;
  }
  if (type === 'chorus') return nextUnsung();
  if (next !== null && !sung.has(next)) return next; // bridge, ending, final chorus, no label...: as written
  if (type === 'bridge') { const chorus = chorusFor(types, here); if (chorus >= 0) return chorus; } // nothing after the bridge: its chorus
  return nextUnsung();
}
// Where c goes: the chorus that goes with this part (with its pre-chorus), or the final chorus once every verse
// has been sung. -1 if the song has no chorus of any kind.
function chorusTarget(song = current_song) {
  if (!song || !song.doc || !Array.isArray(song.doc.content)) return -1;
  const types = song.doc.content.map(chunk => chunk[0].type);
  const sung = song.sung || new Set([song.chunk_index]);
  const finalChorus = types.indexOf('final chorus');
  const versesDone = types.every((type, i) => type !== 'verse' || sung.has(i));
  if (finalChorus >= 0 && versesDone) return finalChorus;
  const chorus = chorusFor(types, song.chunk_index);
  return chorus >= 0 ? chorus : finalChorus;
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
  const target = chorusTarget();
  if (target < 0) return; // there is no chorus
  current_song.chunk_index = target;
  showChunk('chorus');
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

  // Calm words: with a background, the words are smaller, stop at a set size and sit in the middle
  const calm = document.body.classList.contains('calm-words') && !document.body.classList.contains('wholesong');
  document.querySelectorAll('.slide').forEach(slide => {
    const container = slide.querySelector(".content");
    container.style.marginTop = '';
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

    if (calm) {
      // a fifth smaller than filling the screen, and a line of words at most a tenth of the screen tall;
      // then the words go to the middle
      const cap = window.innerHeight * .1, px = parseFloat(getComputedStyle(container).fontSize) * .82;
      container.style.fontSize = (parseFloat(container.style.fontSize) * .82 * Math.min(1, cap / px)) + '%';
      const pad = parseFloat(getComputedStyle(slide).paddingTop) || 0;
      container.style.marginTop = Math.max(0, (slide.clientHeight - container.offsetHeight) / 2 - pad) + 'px';
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

// Esc closes what's open. With nothing open it leaves the presentation, but only on a second Esc within a few
// seconds, so one stray key never takes the words off the screen in a service.
let leaveArmedAt = 0;
function escapeAction() {
  const help = document.getElementById('help'), suggest = document.getElementById('suggestBox');
  const open = (help && help.style.display !== 'none') || !!document.getElementById('report') || isSearching()
    || (suggest && !suggest.hidden);
  hideHelp();
  hideReport();
  if(isSearching()){
    endSearch();
  }
  if (open || !canLeave()) return;
  if (Date.now() - leaveArmedAt < 2500) { leavePresentation(); return; }
  leaveArmedAt = Date.now();
  showLeaveHint();
}
// Leaving: back to the songbook in the app. Only a presentation opened in the app's page can (not a mirror, a
// phone following, or a saved file).
function canLeave() {
  try { return window.parent !== window && /\?present/.test(window.parent.location.hash); } catch (err) { return false; }
}
// yCanta's own Help, on presenting: it opens over the presentation in the app's page, which holds it
function openAppHelp() {
  hideHelp();
  try { window.parent.openHelp('present'); } catch (err) { /* not in the app's page */ }
}
function leavePresentation() {
  if (!canLeave()) return;
  window.parent.location.hash = window.parent.location.hash.replace(/\?present.*$/, '');
}
function showLeaveHint() {
  let hint = document.getElementById('leaveHint');
  if (!hint) {
    document.body.insertAdjacentHTML('beforeend', '<div id="leaveHint" role="status">Press Esc again to leave</div>');
    hint = document.getElementById('leaveHint');
  }
  hint.classList.add('show');
  clearTimeout(showLeaveHint.timer);
  showLeaveHint.timer = setTimeout(() => hint.classList.remove('show'), 2500);
}

const MOVE_KEYS = new Set([' ', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'PageDown', 'PageUp', '>', '.', '<', ',', 'Home', 'End', 'c', 'b', 'e',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Enter']);
const SCROLL_KEYS = new Set([' ', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End']);
function processKey(e){
  if (e.target && e.target.closest && e.target.closest('#suggestBox')) return; // typing a suggestion, not keys
  // A held key counts as one press (#51): holding an arrow or Space used to run on through the songs
  if (e.repeat && !isSearching() && MOVE_KEYS.has(e.key)) { e.preventDefault(); return; } 
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
    // The key moves the slides, so the browser mustn't also scroll: in Grid, Space scrolled the page down a
    // screen as well as moving to the next part
    if (SCROLL_KEYS.has(key) && !isSearching()) e.preventDefault();
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

// ---- Backgrounds (#51). A picture is shrunk once to about this screen's size and held as a short file link
// (a giant text copy of it in a style setting made every slide change slow). Pictures are remembered on this
// device. Mirrors show the main window's pictures unless set to none (from the main window's panel).
//   back  the background: drifts slowly all the time, and moves left to right through each song
//   still a picture that stays put
//   front a picture over the words (use one with see-through parts); it moves a little more, for depth
// Progress through the song moves the pictures left to right on a soft spring whose rest point slides slowly
// during each part, so nothing jumps or speeds up at the moment a part changes.
const PICTURES = ['back', 'still', 'front'];
const pictureBlobs = {}, pictureUrls = {};
let motionLevel = 1; // 0 off, 1 gentle, 2 lively
try { const saved = localStorage.getItem('yCantaMotion'); if (saved !== null) motionLevel = Number(saved) || 0; } catch (err) { /* private window */ }

function pictureStore(mode, work) {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return resolve(null);
    const open = indexedDB.open('yCantaPresentation', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('pictures');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('pictures', mode);
      const request = work(tx.objectStore('pictures'));
      tx.oncomplete = () => { open.result.close(); resolve(request && request.result); };
      tx.onerror = () => { open.result.close(); reject(tx.error); };
    };
  });
}
// Shrink a picture once to about this screen's size: a full phone photo is far bigger than any screen needs
async function shrinkPicture(file, which) {
  const bitmap = await createImageBitmap(file);
  const most = Math.min(2560, Math.round(Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1) * 1.2));
  const scale = Math.min(1, most / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close && bitmap.close();
  // the front picture keeps its see-through parts
  return new Promise(resolve => canvas.toBlob(resolve, which === 'front' ? 'image/png' : 'image/jpeg', 0.88));
}
async function pickPicture(which, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    const blob = file.type === 'image/svg+xml' ? file : await shrinkPicture(file, which); // an SVG is small and sharp as it is
    pictureBlobs[which] = blob;
    pictureStore('readwrite', store => store.put(blob, which)).catch(err => console.error('Backgrounds:', err));
  } catch (err) {
    panelProblem(input.closest('.picture-row'), "Couldn't use that picture: " + err.message);
  }
  input.value = '';
  if (!screenBg) setBackground('picture'); // a picture just added shows here, unless a drawing is picked
  applyPictures();
}
function clearPicture(which) {
  delete pictureBlobs[which];
  pictureStore('readwrite', store => store.delete(which)).catch(() => {});
  applyPictures();
}
// The remembered pictures, when the presentation starts
async function loadPictures() {
  try {
    for (const which of PICTURES) {
      const blob = await pictureStore('readonly', store => store.get(which));
      if (blob) pictureBlobs[which] = blob;
    }
  } catch (err) { /* no storage here (a downloaded file, a private window) */ }
  if (screenBg === null) screenBg = PICTURES.some(which => pictureBlobs[which]) ? 'picture' : ''; // as it was before
  document.querySelectorAll('input[name="screenBg"]').forEach(box => { box.checked = box.value === screenBg; });
  applyPictures();
}
function applyPictures() {
  PICTURES.forEach(which => {
    const had = pictureUrls[which];
    pictureUrls[which] = pictureBlobs[which] ? URL.createObjectURL(pictureBlobs[which]) : '';
    if (had) setTimeout(() => URL.revokeObjectURL(had), 5000); // mirrors switch to the new one first
  });
  if (!isFollower()) showBackground(window, screenBg || '');
  secondary_windows.filter(win => !win.closed).forEach(pictureMirror);
  renderPictures();
}
// A screen's background: the pictures, a drawing, or nothing; on this page or a mirror's
function showBackground(win, choice) {
  showPictures(win.document, choice === 'picture' ? pictureUrls : {});
  if (win.applyArt) win.applyArt(ART[choice] ? choice : '');
}
function mirrorBackground(win) { return win.mirrorBg === undefined || win.mirrorBg === 'same' ? (screenBg || '') : win.mirrorBg; }
// Put pictures on a page: this one, or a mirror
function showPictures(doc, urls) {
  const set = (id, url) => { const el = doc.getElementById(id); if (el) el.style.backgroundImage = url ? 'url("' + url + '")' : 'none'; };
  set('bdBack', urls.back);
  set('bdStill', urls.still);
  set('bdFrontPic', urls.front);
  const win = doc.defaultView;
  if (win) win.picturesHere = { back: !!urls.back, still: !!urls.still };
  doc.body.classList.toggle('has-front', !!urls.front);
  if (win && win.backdropClass) win.backdropClass();
}
function pictureMirror(win) {
  try { showBackground(win, mirrorBackground(win)); } catch (err) { /* closed */ }
}
// The background layer shows for a picture or a drawing; the motion starts when it does
window.picturesHere = {}; let artShown = '';
function backdropClass() {
  const body = document.body;
  body.classList.toggle('has-backdrop', !!(window.picturesHere.back || window.picturesHere.still || artShown));
  // calm words come with any picture or drawing; the words are sized again when that changes
  const calm = body.classList.contains('has-backdrop') || body.classList.contains('has-front');
  if (calm !== body.classList.contains('calm-words')) { body.classList.toggle('calm-words', calm); scaleText(); }
  startBackdrop();
}

// ---- Built-in drawings (#133): line art that draws itself in as the song goes on, over a soft color field.
// The lines glow, and two faint echo lines dance a little around them (with the Motion setting). Drawings
// stay low and at the edges, and fade to a third where the words are. On by choice only (None to start).
// Each is a 160 x 90 picture: c the line color, hi and lo the color field's top and bottom, p the lines in
// the order they draw.
const ART = {
  mountains: { label: 'Mountains', c: '#FAC775', hi: '#1a1410', lo: '#633806',
    p: ['M0 82 L30 60 L46 72 L70 52 L96 76 L118 62 L160 80', 'M136 20 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0', 'M0 87 C40 84 120 90 160 86'] },
  waves: { label: 'Waves', c: '#85B7EB', hi: '#0b1420', lo: '#0C447C',
    p: ['M24 16 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0', 'M0 68 C20 61 40 75 60 68 S100 61 120 68 S150 75 160 68',
      'M0 76 C20 69 40 83 60 76 S100 69 120 76 S150 83 160 76', 'M0 84 C20 77 40 91 60 84 S100 77 120 84 S150 91 160 84'] },
  tree: { label: 'Tree', c: '#97C459', hi: '#0f160b', lo: '#27500A',
    p: ['M0 86 C50 80 110 80 160 86', 'M138 84 L138 56', 'M138 68 L127 58 M138 63 L149 53',
      'M124 54 C116 40 128 28 138 31 C150 25 164 38 154 52 C160 60 146 64 138 58 C131 64 117 62 124 54'] },
  cross: { label: 'Cross', c: '#F0997B', hi: '#1a100c', lo: '#712B13',
    p: ['M0 89 C50 77 110 77 160 89', 'M80 64 L80 84 M73 69 L87 69', 'M80 60 L80 56 M88 63 L92 59 M72 63 L68 59 M90 69 L96 69 M70 69 L64 69'] },
};
const ART_ECHOES = [1.07, 1.15]; // each echo's size around the bottom middle, before it dances
// Each screen's background: '' none, 'picture' (the pictures under Backgrounds), or a drawing. This screen's is
// remembered on the device; each mirror has its own ('same' as this screen, to start); a phone following shows
// the drawing on the main screen of the person sharing, or one of its own.
const bgChoice = value => value === 'picture' || ART[value] ? value : '';
let screenBg = null; // null until known: an older device that only had pictures gets 'picture' once they load
try {
  const saved = localStorage.getItem('yCantaBackground');
  if (saved !== null) screenBg = bgChoice(saved);
  else if (ART[localStorage.getItem('yCantaArt')]) screenBg = localStorage.getItem('yCantaArt'); // the drawing picked before
} catch (err) { /* private window */ }
let followBg = 'same', leaderArt = ''; // a phone following: its own choice, and the leader's drawing
try { const saved = localStorage.getItem('yCantaFollowBackground'); if (saved === '' || ART[saved]) followBg = saved; } catch (err) { /* private window */ }
const sharedArt = () => ART[screenBg] ? screenBg : ''; // what phones following are told
// art: the drawing on this page. x is how much is drawn (0 to 1), pulled toward the song's place by the same
// soft spring as the pictures; a new song fades the lines out, then starts drawing again.
const art = { key: null, x: 0, v: 0, rest: 0, fade: 0, resetting: false, drawn: -1, L: [], T: 1, box: null, ctm: null };
function applyArt(name) {
  name = ART[name] ? name : '';
  const svg = document.getElementById('bdArt');
  if (!svg) return;
  if (name !== artShown) {
    artShown = name;
    document.body.classList.toggle('has-art', !!name);
    if (name) {
      const d = ART[name];
      const paths = d.p.map(s => '<path d="' + s + '"/>').join('');
      svg.setAttribute('viewBox', '0 0 160 90');
      svg.style.background = 'linear-gradient(to bottom, ' + d.hi + ', ' + d.lo + ')';
      svg.innerHTML = '<defs><filter id="artBlur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur id="artBlurSize" stdDeviation="2"/></filter>'
        + '<filter id="artSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur id="artSoftSize" stdDeviation="6"/></filter>'
        + '<mask id="artMask" maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="4160" height="4090">'
        + '<rect x="-2000" y="-2000" width="4160" height="4090" fill="white"/><rect id="artHole" fill="#555" filter="url(#artSoft)" width="0" height="0"/></mask></defs>'
        + '<g mask="url(#artMask)" fill="none" stroke="' + d.c + '" stroke-linecap="round" stroke-linejoin="round">'
        + '<g class="art-echoes">' + ART_ECHOES.map((s, j) => '<g data-s="' + s + '" opacity="' + (.32 - .14 * j) + '">' + paths + '</g>').join('') + '</g>'
        + '<g class="art-glow" filter="url(#artBlur)" opacity=".55">' + paths + '</g>'
        + '<g class="art-main">' + paths + '</g></g>';
      art.L = [...svg.querySelectorAll('.art-main path')].map(p => p.getTotalLength());
      art.T = art.L.reduce((a, b) => a + b, 0) || 1;
      art.drawn = -1;
      art.key = null; // start drawing this song from the beginning
      art.sizeKey = null; // new lines: give them their widths
      artSize();
    } else {
      svg.innerHTML = '';
    }
  }
  backdropClass();
}
// Line widths in screen pixels, whatever the screen; the drawing sits on the bottom, sized to the width on a
// tall screen (a phone) and to the height on a wide one, so nothing important is cut off
function artSize() {
  const svg = document.getElementById('bdArt');
  if (!svg || !artShown) return;
  const fit = window.innerWidth / Math.max(1, window.innerHeight) < 16 / 9 ? 'xMidYMax meet' : 'xMidYMax slice';
  if (svg.getAttribute('preserveAspectRatio') !== fit) svg.setAttribute('preserveAspectRatio', fit);
  if (!svg.getBoundingClientRect().width) return; // hidden: no size yet (it is checked again while showing)
  const ctm = svg.getScreenCTM();
  if (!ctm || !ctm.a) return;
  const sizeKey = ctm.a.toFixed(4) + ',' + ctm.e.toFixed(1) + ',' + ctm.f.toFixed(1);
  art.ctm = ctm;
  if (art.sizeKey === sizeKey) return; // nothing changed: leave the lines (and their glow) as they are
  art.sizeKey = sizeKey;
  const px = Math.max(2.5, window.innerWidth / 480) / ctm.a; // the main line, about 4px on a 1920 screen
  svg.querySelector('.art-main').setAttribute('stroke-width', px.toFixed(3));
  svg.querySelector('.art-glow').setAttribute('stroke-width', (px * 3).toFixed(3));
  svg.querySelector('.art-echoes').setAttribute('stroke-width', (px * .55).toFixed(3));
  svg.querySelector('#artBlurSize').setAttribute('stdDeviation', (px * 1.6).toFixed(3));
  svg.querySelector('#artSoftSize').setAttribute('stdDeviation', (px * 4).toFixed(3));
}
window.addEventListener('resize', () => { clearTimeout(art.sizeTimer); art.sizeTimer = setTimeout(artSize, 150); });
// The box the words take up on screen (padded), or the whole screen for Whole song and Grid
function wordsBox() {
  if (document.body.classList.contains('wholesong') || document.body.classList.contains('gridview')) {
    return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  }
  const content = document.querySelector('#cur_slide .content');
  if (!content || !content.textContent.trim()) return null;
  // the letters themselves: each line is a full-width block, so measure its text, not its box
  const range = document.createRange(), walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue.trim()) continue;
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    left = Math.min(left, r.left); top = Math.min(top, r.top); right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom);
  }
  if (!(right > left)) return null;
  const pad = Math.min(window.innerWidth, window.innerHeight) * .05;
  return { x: left - pad, y: top - pad, w: right - left + pad * 2, h: bottom - top + pad * 2 };
}
// This screen's Background choice in the panel
function setBackground(value) {
  if (isFollower()) {
    followBg = value === 'same' || ART[value] ? value : '';
    try { localStorage.setItem('yCantaFollowBackground', followBg === 'same' ? 'same' : followBg); } catch (err) { /* private window */ }
    document.querySelectorAll('input[name="screenBg"]').forEach(box => { box.checked = box.value === followBg; });
    applyArt(followBg === 'same' ? leaderArt : followBg);
    return;
  }
  screenBg = bgChoice(value);
  try { localStorage.setItem('yCantaBackground', screenBg); } catch (err) { /* private window */ }
  document.querySelectorAll('input[name="screenBg"]').forEach(box => { box.checked = box.value === screenBg; });
  showBackground(window, screenBg);
  secondary_windows.filter(win => !win.closed).forEach(pictureMirror); // the mirrors set to Same as main
  if (sharing) publishLive(); // phones following show its drawing too
}
function setArt(name) { setBackground(name); } // the older name, for anything still calling it
// The panel's Backgrounds section: which pictures are in use
function renderPictures() {
  PICTURES.forEach(which => {
    const row = document.getElementById('picture-' + which);
    if (!row) return;
    row.querySelector('.picture-state').textContent = pictureBlobs[which] ? 'In use' : '';
    row.querySelector('.picture-remove').hidden = !pictureBlobs[which];
  });
  // pictures load after the panel can be made: open its sections for the ones in use (never closes them)
  const section = document.getElementById('helpBackgrounds');
  if (section && PICTURES.some(which => pictureBlobs[which])) section.open = true;
  const more = section && section.querySelector('details.more');
  if (more && (pictureBlobs.still || pictureBlobs.front)) more.open = true;
}
function setMotion(level) {
  motionLevel = Number(level);
  try { localStorage.setItem('yCantaMotion', String(motionLevel)); } catch (err) { /* private window */ }
  document.querySelectorAll('input[name="motion"]').forEach(box => { box.checked = Number(box.value) === motionLevel; });
  secondary_windows.filter(win => !win.closed).forEach(win => { try { win.mirrorMotion = motionLevel; } catch (err) { /* closed */ } });
}

// The motion: drift on its own time, plus a spring that carries the pictures left to right through the song.
//   rest  where the spring wants to be; it slides toward this part's spot at about one part per SETTLE
//   pan   where the pictures are (0 = start of the song, 1 = end), pulled toward rest by a critically damped
//         spring, so it starts and stops softly and never overshoots
const SETTLE = 5; // seconds for the spring to catch up
const PAN_BACK = .04, PAN_FRONT = .06; // how far each picture travels each side of center, as a share of screen width
const motion = { running: false, last: 0, clock: 0, rest: 0, pan: 0, speed: 0, seed: Array.from({ length: 40 }, () => Math.random() * Math.PI * 2) };
const wave = (t, k) => Math.sin(t * .071 + motion.seed[k]) * .5 + Math.sin(t * .113 + motion.seed[k + 1]) * .3 + Math.sin(t * .0237 + motion.seed[k + 2]) * .2;
// How many parts a song has in the order people sing it (Space from the first part to the end)
function sungLength(song) {
  const key = song.id + ':' + song.doc.content.length;
  if (song.sungLengthKey === key) return song.sungLength;
  const walk = { doc: song.doc, passage: song.passage, chunk_index: 0, sung: new Set([0]), sungOrder: [0] };
  let count = 1;
  for (let guard = 0; guard < 80; guard++) {
    const next = spaceTarget(walk);
    if (next === null) break;
    walk.chunk_index = next; walk.sung.add(next); walk.sungOrder.push(next);
    count++;
  }
  song.sungLengthKey = key;
  song.sungLength = count;
  return count;
}
// Where the presentation is in the song, 0 to 1. It never goes back within a song: going back to the chorus
// is still going on through the song. It is the larger of the parts shown so far against the parts people
// sing, and where the part is written (so the final chorus key jumps ahead). A mirror is told by its main
// window; a phone following works it out from what it shows.
let progressBest = { key: null, p: 0 };
function songPlace() {
  if (window.mirrorProgress) return window.mirrorProgress;
  if (!current_song || !current_song.doc || !window.songbook || document.getElementById('pres_title')) return { key: 'title', song: 0, step: .25 };
  const key = window.songbook.song_index + ':' + current_song.id;
  const parts = current_song.doc.content.length, total = sungLength(current_song);
  const order = current_song.sungOrder && current_song.sungOrder.length ? current_song.sungOrder : [current_song.chunk_index];
  const shown = order.filter((part, i) => i === 0 || part !== order[i - 1]).length;
  let p = Math.min(1, Math.max(total > 1 ? (shown - 1) / (total - 1) : 1, parts > 1 ? current_song.chunk_index / (parts - 1) : 1));
  if (progressBest.key === key) p = Math.max(p, progressBest.p);
  progressBest = { key, p };
  return { key, song: p, step: 1 / Math.max(1, total - 1) };
}
// A soft spring toward a place: the rest point moves at a steady pace for a normal part change; a big jump
// goes faster at first so it is not still drifting back halfway through the next song
function springStep(s, dt, target, step) {
  const gap = target - s.rest;
  const pace = Math.max(step, Math.abs(gap)) / (SETTLE * .9);
  s.rest += Math.sign(gap) * Math.min(Math.abs(gap), pace * dt);
  const w = 4.7 / SETTLE;
  s.v += (w * w * (s.rest - s.x) - 2 * w * s.v) * dt;
  s.x += s.v * dt;
}
const panSpring = { x: 0, v: 0, rest: 0 };
// The drawing: drawn as far as the song has gone (a little at the first part), its echoes dancing, and the
// lines faded where the words are
function artFrame(dt, place, dance, t) {
  const svg = document.getElementById('bdArt');
  if (!svg || !artShown || !art.L.length) return;
  if (!art.ctm) artSize();
  if (place.key !== art.key) { art.key = place.key; art.resetting = true; }
  if (art.resetting) { // a new song: the lines fade out, then draw again from the start
    art.fade -= dt / .6;
    if (art.fade <= 0) { art.fade = 0; art.x = art.v = art.rest = 0; art.resetting = false; }
  } else {
    art.fade = Math.min(1, art.fade + dt / .8);
    for (let i = 0; i < 4; i++) springStep(art, dt / 4, .12 + .88 * place.song, place.step * .88);
  }
  svg.querySelector('[mask]').setAttribute('opacity', art.fade.toFixed(3));
  const lengths = lag => {
    let left = Math.max(0, art.x - lag) * art.T;
    return art.L.map(len => { const n = Math.max(0, Math.min(len, left)); left -= len; return n; });
  };
  if (Math.abs(art.x - art.drawn) > .0004) {
    art.drawn = art.x;
    // a line not started yet is hidden: a round line end on no length still draws a dot
    const draw = (path, len) => {
      path.setAttribute('stroke-dasharray', len.toFixed(2) + ' 9999');
      path.setAttribute('visibility', len > .01 ? 'visible' : 'hidden');
    };
    const now = lengths(0);
    svg.querySelectorAll('.art-main path, .art-glow path').forEach((path, i) => draw(path, now[i % now.length]));
    svg.querySelectorAll('.art-echoes > g').forEach((echo, j) => {
      const behind = lengths(.05 * (j + 1));
      echo.querySelectorAll('path').forEach((path, i) => draw(path, behind[i]));
    });
  }
  // each echo slowly swells, shrinks and sways on its own uneven rhythm; the main line never moves
  svg.querySelectorAll('.art-echoes > g').forEach((echo, j) => {
    const size = 1 + (Number(echo.dataset.s) - 1) * (1 + dance * .35 * wave(t * 5.8, 13 + j * 6));
    const sway = dance * .8 * wave(t * 4.6, 16 + j * 6);
    echo.setAttribute('transform', 'translate(' + (80 + sway).toFixed(2) + ' 90) scale(' + size.toFixed(4) + ') translate(-80 -90)');
  });
}
// The words' box: the dark layer sits on it and the drawing fades under it. Measured a few times a second
// (the words change size with each part) and eased, so nothing jumps when a part changes.
function veilFrame(dt, now) {
  if (!art.measured || now - art.measured > 250) { art.measured = now; art.target = wordsBox(); artSize(); }
  const target = art.target;
  const veil = document.getElementById('bdVeil');
  const k = 1 - Math.exp(-dt / .35);
  if (target) {
    if (!art.box) art.box = { ...target };
    ['x', 'y', 'w', 'h'].forEach(side => { art.box[side] += (target[side] - art.box[side]) * k; });
  }
  art.veil = (art.veil || 0) + ((target ? 1 : 0) - (art.veil || 0)) * k;
  const b = art.box;
  if (veil && b) {
    const grow = .15; // the veil reaches a little past the words, fading out
    veil.style.width = (b.w * (1 + grow * 2)).toFixed(0) + 'px';
    veil.style.height = (b.h * (1 + grow * 2)).toFixed(0) + 'px';
    veil.style.transform = 'translate(' + (b.x - b.w * grow).toFixed(0) + 'px,' + (b.y - b.h * grow).toFixed(0) + 'px)';
    veil.style.opacity = art.veil.toFixed(3);
  }
  const hole = artShown && document.getElementById('artHole');
  if (hole && b && art.ctm) {
    const inv = art.ctm.inverse();
    const at = (x, y) => new DOMPoint(x, y).matrixTransform(inv);
    const a = at(b.x, b.y), z = at(b.x + b.w, b.y + b.h);
    hole.setAttribute('x', a.x.toFixed(2)); hole.setAttribute('y', a.y.toFixed(2));
    hole.setAttribute('width', Math.max(0, z.x - a.x).toFixed(2)); hole.setAttribute('height', Math.max(0, (z.y - a.y) * art.veil).toFixed(2));
  }
}
function startBackdrop() {
  const on = document.body.classList.contains('has-backdrop') || document.body.classList.contains('has-front');
  if (motion.running || !on || document.hidden) return;
  motion.running = true;
  motion.last = performance.now();
  requestAnimationFrame(backdropFrame);
}
function backdropFrame(now) {
  const on = document.body.classList.contains('has-backdrop') || document.body.classList.contains('has-front');
  if (!on || document.hidden) { motion.running = false; return; }
  const dt = Math.min(.1, (now - motion.last) / 1000);
  motion.last = now;
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const chosen = typeof window.mirrorMotion === 'number' ? window.mirrorMotion : motionLevel; // a mirror: its main window's
  const level = calm ? Math.min(chosen, 1) : chosen;
  const amp = level === 0 ? 0 : level === 1 ? (calm ? .4 : 1) : 2.2;
  motion.clock += dt * (level === 2 ? 1.8 : calm ? .5 : 1);
  // Motion Off holds the pictures still in the middle; otherwise the spring carries them through the song
  const place = songPlace();
  for (let i = 0; i < 4; i++) springStep(panSpring, dt / 4, place.song, place.step); // small steps keep the spring smooth on a slow frame
  artFrame(dt, place, level === 0 ? 0 : level === 1 ? (calm ? .5 : 1) : 2, motion.clock);
  veilFrame(dt, now);
  const pan = level === 0 ? 0 : .5 - panSpring.x; // + is left of center: the view travels to the right
  const w = window.innerWidth, t = motion.clock;
  // Scale each picture up just enough that its edges never show: its margin (8% back, 10% front, set in the
  // page's style) has to cover the travel plus the drift
  const fit = (margin, size, travel, drift) => 1 + Math.max(0, travel + drift - margin) / (size / 2);
  const back = document.getElementById('bdBack'), front = document.getElementById('bdFrontPic');
  if (back) back.style.transform = 'translate3d(' + ((pan * 2 * PAN_BACK + wave(t, 0) * .035 * amp) * w).toFixed(1) + 'px,' + (wave(t, 3) * w * .022 * amp).toFixed(1) + 'px,0) scale('
    + (fit(.08, 1.16, PAN_BACK, (.035 + .009) * amp + .005) + wave(t * .5, 6) * .015 * amp).toFixed(4) + ')';
  if (front) front.style.transform = 'translate3d(' + ((pan * 2 * PAN_FRONT + wave(t * 1.3, 1) * .05 * amp) * w).toFixed(1) + 'px,' + (wave(t * 1.3, 4) * w * .035 * amp).toFixed(1) + 'px,0) scale('
    + fit(.1, 1.2, PAN_FRONT, .05 * amp + .005).toFixed(4) + ')';
  requestAnimationFrame(backdropFrame);
}
document.addEventListener('visibilitychange', startBackdrop);

// ---- Mirrors from the main window (#51): each open mirror's look, set here so the room never sees a panel
function openMirrors() { secondary_windows = secondary_windows.filter(win => !win.closed); return secondary_windows; }
function mirrorSet(index, what, value) {
  const win = openMirrors()[index];
  if (!win) return renderMirrors();
  try {
    const body = win.document.body;
    if (what === 'view') win.setView(value);
    else if (what === 'bg') { win.mirrorBg = value; pictureMirror(win); }
    else {
      const cls = { white: 'white', black: 'black', chords: 'nochords', marker: 'nomarker' }[what];
      body.classList.toggle(cls, what === 'chords' || what === 'marker' ? !value : value);
      win.scaleText();
    }
    const help = win.document.getElementById('help'); // its own panel is made again next time, to match
    if (help) help.remove();
  } catch (err) { /* the mirror closed */ }
  renderMirrors();
}
function renderMirrors() {
  const box = document.getElementById('mirrorList');
  if (!box) return;
  box.innerHTML = openMirrors().map((win, i) => {
    let body;
    try { body = win.document.body.classList; } catch (err) { return ''; }
    const view = body.contains('wholesong') ? 'whole' : 'part';
    const choice = (value, label) => '<label><input type="radio" name="mirrorView' + i + '" value="' + value + '"' + (view === value ? ' checked' : '')
      + ' onchange="mirrorSet(' + i + ', \'view\', this.value)">' + label + '</label>';
    const sw = (what, label, on) => switchHtml('mirror' + i + what, label, on, 'mirrorSet(' + i + ', \'' + what + '\', this.checked)');
    // its own background, or the same as this screen's
    const bg = win.mirrorBg === undefined ? 'same' : win.mirrorBg;
    const bgOption = (value, label) => '<label><input type="radio" name="mirrorBg' + i + '" value="' + value + '"' + (bg === value ? ' checked' : '')
      + ' onchange="mirrorSet(' + i + ', \'bg\', this.value)">' + label + '</label>';
    return '<div class="mirror-row"><div class="mirror-name">Mirror ' + (i + 1)
      + '<button type="button" class="btn" onclick="openMirrors()[' + i + '].close(); setTimeout(renderMirrors, 100)">Close it</button></div>'
      + '<div class="segmented">' + choice('part', 'One part') + choice('whole', 'Whole song') + '</div>'
      + '<div class="switches">' + sw('white', 'White text', body.contains('white')) + sw('black', 'Black background', body.contains('black'))
      + sw('chords', 'Chords', !body.contains('nochords')) + sw('marker', 'Next-part arrow', !body.contains('nomarker')) + '</div>'
      + '<div class="picture-row bg-row"><span>Background</span><span class="segmented">' + bgOption('same', 'Same as main') + bgOption('', 'None')
      + bgOption('picture', 'Picture') + Object.keys(ART).map(name => bgOption(name, ART[name].label)).join('') + '</span></div></div>';
  }).join('');
}
