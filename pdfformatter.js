/*jshint esversion: 6 */
importScripts('pdfkit.standalone.js', 'blob-stream.js');

function expand_chord(line){
  let CHORD_SPACE_RATIO = 0.45;

  let old_line = line.split(/(<c>.*?<\/c>)/)
  line = '';
  let chord_line = '';
  old_line.forEach(function(item){
    if(item.includes('<c>')){
      chord_line += item.replace('<c>','').replace('</c>','');
    }
    else{
      line += item;
      if(line.length > chord_line.length) {
        chord_line += ' '.repeat(line.length - chord_line.length);
      }
    }
  });
  
  // Add space to the end of the chord line to make the chord recognized as a chord when reimporting.
  var w = (chord_line.split(' ').length - 1); //count
  var char = chord_line.length - w;

  var w_ad = parseInt(((CHORD_SPACE_RATIO * char)/(1-CHORD_SPACE_RATIO) - w) + 1);
  if (w_ad > 0) {
    chord_line += ' '.repeat(w_ad);
  }
  var expanded_line = chord_line + '\n' + line.trimEnd();
  return expanded_line;
}

var doc;
var inch = 72;

onmessage = function(e) {
  console.log('Message received from main script');
  format(e.data[0],read_config(e.data[1]));
}

function* range(start, end) {
  yield start;
  if (start === end) return;
  yield* range(start + 1, end);
}
function hash(string) { 
  var hash = 0; 
  if (string.length == 0) return hash; 
  for (let i = 0; i < string.length; i++) { 
    let char = string.charCodeAt(i); 
    hash = ((hash << 5) - hash) + char; 
    hash = hash & hash; 
  } 
  return hash; 
} 

var INDENT_NO_LABEL       = 'indented no label';
var VARIABLE_INDENT       = ['verse', 'no label', INDENT_NO_LABEL, 'introduction'];
var SCRIPTURE_IN_TITLE    = 'in-title';
var SCRIPTURE_UNDER_TITLE = 'under-title';
var INDEX_ON_NEW_PAGE     = 'on-new-page';
var INDEX_NO_PAGE_BREAK   = 'no-page-break';
var INDEX_OFF             = 'no-index';
var BIBLE_BOOK_ORDER_DICT = {'gen':1,'genesis':1,'ex':2,'exod':2,'exodus':2,'lev':3,'leviticus':3,'num':4,'numbers':4,'deut':5,'deuteronomy':5,'josh':6,'joshua':6,'judg':7,'judges':7,'ruth':8,'1 sam':9,'1 samuel':9,'2 sam':10,'2 samuel':10,'1 kings':11,'2 kings':12,'1 chr':13,'1 chron':13,'1 chronicles':13,'2 chr':14,'2 chron':14,'2 chronicles':14,'i sam':9,'i samuel':9,'ii sam':10,'ii samuel':10,'i kings':11,'ii kings':12,'i chron':13,'i chronicles':13,'ii chron':14,'ii chronicles':14,'ezra':15,'neh':16,'nehemiah':16,'esth':17,'esther':17,'job':18,'ps':19,'psalm':19,'psalms':19,'prov':20,'proverbs':20,'eccles':21,'ecclesiastes':21,'song of sol':22,'song of solomon':22,'isa':23,'is':23,'isaiah':23,'jer':24,'jeremiah':24,'lam':25,'lamentations':25,'ezek':26,'ezekiel':26,'dan':27,'daniel':27,'hos':28,'hosea':28,'joel':29,'amos':30,'obad':31,'obadiah':31,'jon':32,'jonah':32,'mic':33,'micah':33,'nah':34,'nahum':34,'hab':35,'habakkuk':35,'zeph':36,'zephaniah':36,'hag':37,'haggai':37,'zech':38,'zechariah':38,'mal':39,'malachi':39,'matt':40,'mt':40,'matthew':40,'mk':41,'mark':41,'lk':42,'luke':42,'jn':43,'john':43,'act':44,'acts':44,'rom':45,'romans':45,'1 cor':46,'1 corinthians':46,'i cor':46,'i corinthians':46,'2 cor':47,'2 corinthians':47,'ii cor':47,'ii corinthians':47,'gal':48,'galatians':48,'eph':49,'ephesians':49,'phil':50,'philippians':50,'col':51,'colossians':51,'1 thess':52,'1 thessalonians':52,'i thess':52,'i thessalonians':52,'2 thess':53,'2 thessalonians':53,'ii thess':53,'ii thessalonians':53,'1 tim':54,'1 timothy':54,'2 tim':55,'2 timothy':55,'i tim':54,'i timothy':54,'ii tim':55,'ii timothy':55,'tit':56,'titus':56,'philem':57,'philemon':57,'heb':58,'hebrews':58,'jas':59,'james':59,'1 pet':60,'1 peter':60,'2 pet':61,'2 peter':61,'1 john':62,'2 john':63,'3 john':64,'i pet':60,'i peter':60,'ii pet':61,'ii peter':61,'i john':62,'ii john':63,'iii john':64,'jude':65,'rev':66,'revelation':66};

/*================
// our data objects
// ================*/
class Songbook {
  constructor(title, ccli=''){
    this.title = title;
    this.ccli = ccli;
    this.songs = [];
    this.scrip_index = new ScripIndex(); // list of IndexEntry's
    this.index = new Index();            // list of IndexEntry's
    this.cat_index = new CatIndex();     // list of CatIndexEntry's
    this.height = 0;
    this.height_after = 0;
  }
}

class Index extends Array {
  constructor() {
    super();
    this.height = 0;
    this.height_after = 0;
  }
}

class ScripIndex extends Array {
  constructor() {
    super();
    this.height = 0;
    this.height_after = 0;
  }
}

class CatIndex extends Array {
  constructor() {
    super();
    this.height = 0;
    this.height_after = 0;
  }
}

class Category {
  constructor(category, height){
    this.category = category;
    this.height = height;
    this.height_after = 0;
  }
}

class IndexEntry {
  constructor(song, index_text, is_song_title){
    this.song = song;
    this.index_text = index_text.trim();
    this.is_song_title = is_song_title;
    this.height = 0;
    this.height_after = 0;
  }
}

class CatIndexEntry {
  //Same as above, could probably be changed to an extend the above.
  constructor(song, index_text, is_song_title){
    this.song = song;
    this.index_text = index_text.trim();
    this.is_song_title = is_song_title;
    this.height = 0;
    this.height_after = 0;
  } 
}

class Song {
  constructor(title, author, copyright='', ccli='', scripture_ref='', key='', introduction=null, categories=null){
    this.title = title.trim();
    this.author = author.trim();
    this.copyright = copyright.trim();
    this.ccli = ccli;
    this.scripture_ref = scripture_ref.trim();
    this.key = key.trim();
    if (this.key){
      this.key = 'Key: ' + this.key;
    }
    this.introduction = introduction;
    this.categories = categories || [];

    this.chunks = [];
    this.num = null;  // song number in songbook
    this.height = 0;
    this.height_after = 0;
  }
}

class Chunk {
  constructor(type){
    this.type = type;
    this.lines = [];
    this.num = null; // verse number if this.type == 'verse' else null
    this.height = 0;
    this.height_after = 0;
  }

  has_chords() {
    return this.lines.filter(l => Object.keys(l.chords).length).length !== 0;
  }
}

class Line {
  constructor(text, chords){
    this.text = text;
    this.chords = chords;
    this.height = 0;
    this.height_after = 0;
  }
}

/*=============
// Begin helper functions
//
//==============*/
function sort_scrip_index(scrip_ref){ 
  var x = scrip_ref.trim().replace('.','').split(/\s(?=\d)/, 1);
  let book_number;
  let chapter_number;
  let verse_number;
  
  // get the book number XX
  try {
    book_number = String(BIBLE_BOOK_ORDER_DICT[x[0]]);
  }
  catch(error) {
    book_number = '99';
  }
  book_number = book_number.padStart(2,'0');
  
  // get chapter number YYY
  try {
    chapter_number = x[1].split(':')[0];
  }
  catch(err) {
    chapter_number = '000';
  }
  if (chapter_number.length < 4){
    chapter_number = chapter_number.padStart(3,'0');
  }
  else {
    chapter_number = '999';
  }

  // get verse number ZZZ
  try {
    verse_number = x[1].split(':')[1].split(/[-,]/)[0];
    verse_number = verse_number.padStart(3,'0');
    if (verse_number.length > 3) {
      verse_number = '000';
    }
  }
  catch(err) {
    verse_number = '000';
  }
 
  return book_number + chapter_number + verse_number;
}

//Parse song_object
function parse_song(song_object){  //json song object
  let title = song_object.title;
  if (title == '') {  // if not found title is null
    title = 'Untitled';
  }

  let author = song_object.authors;
  author = author.join(', ');
  
  let categories = song_object.categories;

  let ccli = song_object.cclis;

  let copyright = song_object.copyright;

  let scripture_ref = song_object.scripture_ref;
  scripture_ref = scripture_ref.join(', ');

  let key = song_object.key;

  let intro = song_object.introduction;
  
  //could sub some of these directly for song.____
  let song = new Song(title, author, copyright, ccli, scripture_ref, key, intro.trim(), categories);

  // parse song chunks
  let verse_num = 1;
  for(let chunk_ob of song_object.content) {
    let type = chunk_ob[0].type;
    let chunk = new Chunk(type);
    
    // skip comment chunks
    if (chunk.type == 'comment') {
      continue;
    }
    // increment verse count
    else if (chunk.type == 'verse') {
      chunk.num = verse_num;
      verse_num += 1;
    }

    // parse lines and chords in chunk
    for(let line of chunk_ob[1]) {
      let text = line;
      let chords = {};
      let tmp_line = expand_chord(line).split('\n');

      //parse chords and rest of line text
      //split line by <c> and </c>

      let tmp_chord = tmp_line[0];
      let offset = 0;
      for(let i=0; i < tmp_chord.length; i++) {
        if(tmp_chord[i] != ' ') {
          if(tmp_chord[i+1] && tmp_chord[i+1] == ' ') {
            chords[i-offset] = tmp_chord.slice(i-offset,i+1); // len(text) is offset in text where chord appears  
            offset = 0;
          }
          else {
            offset += 1;
          }
        }
      }
      text = tmp_line[1];

      // done parsing line -- add it
      line = new Line(text, chords);
      
      chunk.lines.push(line);
    }

    // done parsing chunk -- add it
    song.chunks.push(chunk);
  }
  return song;
}


function parse(export_object, cfg) {

  // check if we are parsing a song and not a songbook
  if (export_object._id.startsWith('s-')) {
    let song = parse_song(export_object);
    song.num = 1;
    return song;
  }


  // Ok we are doing a songbook
  // ==========================

  // parse songbook information
  let title = export_object.title;

  let songbook = new Songbook(title);

  let song_num = 1;

  // iterate through all songs in the songbook
  for(let i = 0; i < export_object.songs.length; i++) {
    if(cfg.SONGS_TO_PRINT.indexOf(export_object.songrefs[i].status)==-1){
      continue;
    }

    let song = parse_song(export_object.songs[i].doc);
    song.num = song_num;
    song_num += 1;

    // done parsing song -- add it
    songbook.songs.push(song);

    // generate index entries for this song
    if(cfg.DISPLAY_INDEX != INDEX_OFF){
      songbook.index.push(new IndexEntry(song, song.title, true));
    }
    for(let cat of song.categories){  // an entry for each category in the song
      let exclude = false;
      for(let exc of cfg.INDEX_CAT_EXCLUDE){
        if(exc.indexOf(cat) != -1) { // cat matches exclusion
          exclude = true;
          break;
        }
      }
      if(!exclude){
        if(songbook.cat_index[cat]==undefined){
          songbook.cat_index[cat] = new CatIndex();
        }
        songbook.cat_index[cat].push(new CatIndexEntry(song, song.title, true));
      }
    }
    // add entries for scripture ref
    if(song.scripture_ref && cfg.DISPLAY_SCRIP_INDEX != INDEX_OFF){
      let scripture_refs = song.scripture_ref.split(/[,;]\s(?=[A-Za-z])/);
      for(let scripture_ref of scripture_refs){
        songbook.scrip_index.push(new IndexEntry(song, scripture_ref, true));
      }
    }
    // add some first line index entries
    if(cfg.INCLUDE_FIRST_LINE && cfg.DISPLAY_INDEX != INDEX_OFF){
      let first_verse = true;
      for(let chunk of song.chunks){
        // if this is a chorus chunk or a first verse chunk AND the first line is not the same as the song title
        if((chunk.type == 'chorus' || ((('verse', 'no label', INDENT_NO_LABEL).indexOf(chunk.type) > -1) && first_verse)) && 
          (chunk.lines.length > 0) && (chunk.lines[0].text.replace(/[^A-Za-z]/, '').toLowerCase() != song.title.replace(/[^A-Za-z]/, '').toLowerCase())) {
          songbook.index.push(new IndexEntry(song, chunk.lines[0].text, false));
          // TODO? at the moment, not including first line entries in cat index

          // don't do any more verse index entries -- we aren't on the first verse anymore
          if(('verse', 'no label', INDENT_NO_LABEL).indexOf(chunk.type)){
            first_verse = false;
          }
        }
      }
    } // done with index
  }
  // done parsing songbook -- return
  return songbook;
}


class PageMapping{
  constructor(page=null, startx=null, starty=null, endx=null, endy=null){
    //assert page is not null and startx is not null and starty is not null and endx is not null and endy is not null
    this.page = page;
    this.startx = startx;
    this.starty = starty;
    this.endx = endx;
    this.endy = endy;
  }
}

class PageLayout{
  //"""Interface required for objects doing page layout and ordering"""
  constructor(options) {
    //pass
  }

  get_page_width() {
    //'''Returns the width of each page (not piece of paper) based on the options passed to __init__'''
   // pass
  }

  get_page_height() {
    //'''Returns the height of each page (not piece of paper) based on the options passed to __init__'''
    //pass
  }

  page_order(pages) {
    //'''Returns a list of lists -- each inner list maps 0..n virtual pages to the physical paper'''
    //pass
  }

  previous_page_visible(previous_pages) {
    //'''Returns True or False -- looks at previous_pages to determine if the chorus needs to be duplicated'''
    //pass
  }
}

var page_layouts = [];
function register_page_layout(name, klass) {
  if(page_layouts.indexOf(name)!=-1) {
    console.log('ERROR!!!');
  }
  page_layouts[name] = klass;
}

function get_page_layouts() {
  return page_layouts.keys();
}

class PageLayoutSimple {
  constructor(options) {
    this.cfg = options;
  }

  get_page_width() {
    return this.cfg.PAPER_WIDTH - (this.cfg.PAPER_MARGIN_RIGHT + this.cfg.PAPER_MARGIN_LEFT
                                  +this.cfg.PAGE_MARGIN_RIGHT  + this.cfg.PAGE_MARGIN_LEFT);
  }

  get_page_height() {
    return this.cfg.PAPER_HEIGHT - (this.cfg.PAPER_MARGIN_TOP + this.cfg.PAPER_MARGIN_BOTTOM
                                   +this.cfg.PAGE_MARGIN_TOP  + this.cfg.PAGE_MARGIN_BOTTOM);
  }

  page_order(pages) {
    let cfg = this.cfg;
    // helper function
    function _make_mapping(p) {
      return PageMapping(
          p,                                                                  //p
          cfg.PAPER_MARGIN_LEFT+cfg.PAGE_MARGIN_LEFT,                         //sx
          cfg.PAPER_MARGIN_TOP+cfg.PAGE_MARGIN_TOP,                           //sy
          cfg.PAPER_WIDTH-(cfg.PAPER_MARGIN_RIGHT+cfg.PAGE_MARGIN_RIGHT),     //ex
          cfg.PAPER_HEIGHT-(cfg.PAPER_MARGIN_BOTTOM+cfg.PAGE_MARGIN_BOTTOM)); //ey
    }

    return pages.map(p => _make_mapping(p));
  }

  previous_page_visible(previous_pages){
    return false;
  }
}

//register_page_layout('simple', PageLayoutSimple)

class PageLayoutColumn {
  constructor(options) {
    this.cfg = options;
  }

  get_page_width(margin=1) {
    let ret = (this.cfg.PAPER_WIDTH - (this.cfg.PAPER_MARGIN_RIGHT + this.cfg.PAPER_MARGIN_LEFT + this.cfg.COLUMN_GUTTER*(this.cfg.COLUMNS-1))) / this.cfg.COLUMNS;
    if (margin) {
      ret = ret - (this.cfg.PAGE_MARGIN_RIGHT + this.cfg.PAGE_MARGIN_LEFT);
    }
    return ret;
  }

  get_page_height() {
    return this.cfg.PAPER_HEIGHT - (this.cfg.PAPER_MARGIN_TOP + this.cfg.PAPER_MARGIN_BOTTOM
                                   +this.cfg.PAGE_MARGIN_TOP  + this.cfg.PAGE_MARGIN_BOTTOM);
  }

  page_order(pages) {
    let ret = [];
    let curent_paper_page = [];
    
    for(let p of pages) {
      let sx=this.cfg.PAPER_MARGIN_LEFT+this.cfg.PAGE_MARGIN_LEFT + (curent_paper_page.length)*(this.get_page_width(0)+this.cfg.COLUMN_GUTTER);
      let sy=this.cfg.PAPER_MARGIN_TOP+this.cfg.PAGE_MARGIN_TOP;
      let ex=sx + this.get_page_width(1); // margin=1 so margins not included in calc
      let ey=this.cfg.PAPER_HEIGHT-(this.cfg.PAPER_MARGIN_BOTTOM + this.cfg.PAGE_MARGIN_BOTTOM);

      curent_paper_page.push(new PageMapping(p, sx, sy, ex, ey));
      
      if(curent_paper_page.length >= this.cfg.COLUMNS) {
        ret.push(curent_paper_page);
        curent_paper_page = [];
      }
    }

    if(curent_paper_page.length > 0) {
      ret.push(curent_paper_page);
    }

    return ret;
  }

  previous_page_visible(previous_pages) {
    // if the previous_pages just completed the last column on the previous physical page
    if(previous_pages.length % this.cfg.COLUMNS == 0) {
      return false;
    }

    return true;  
  }
}

//register_page_layout('column', PageLayoutColumn)


function shift_mappings(mappings, right=0) {
  //'''Helper function to shift pagemappings left-right'''
  for(let map of mappings) {
    map.startx += right;
    map.endx   += right;
  }

  return mappings;
}

class PageLayoutColumn1Sided extends PageLayoutColumn {
  constructor(options) {
    super(options);

    // save old width and apply binder
    this.old_width = this.cfg.PAPER_WIDTH;
    this.cfg.PAPER_WIDTH = this.old_width - this.cfg.PAPER_MARGIN_GUTTER;
  }

  page_order(pages) {
    pages = PageLayoutColumn.prototype.page_order.call(this, pages);
    for(let pg of pages) {
      shift_mappings(pg, this.cfg.PAPER_MARGIN_GUTTER);
    }

    // return page size to normal
    this.cfg.PAPER_WIDTH = this.old_width;

    return pages;
  }
}

register_page_layout('single-sided', PageLayoutColumn1Sided);


class PageLayoutColumn2Sided extends PageLayoutColumn {
  constructor(options) {
    super(options);

    // save old width and apply binder
    this.old_width = this.cfg.PAPER_WIDTH;
    this.cfg.PAPER_WIDTH = this.old_width - this.cfg.PAPER_MARGIN_GUTTER;
  }

  page_order(pages) {
    pages = PageLayoutColumn.prototype.page_order.call(this, pages);
    for(const [i, pg] of Object.entries(pages)) {
      if(i % 2 == 0) {  // every other page must be shifted since we are printing double sided
        shift_mappings(pg, this.cfg.PAPER_MARGIN_GUTTER);
      }
    }

    // return page size to normal
    this.cfg.PAPER_WIDTH = this.old_width;

    return pages;
  }
}

register_page_layout('double-sided', PageLayoutColumn2Sided);


class PageLayoutBooklet extends PageLayoutColumn {
  constructor(options) {
    super(options); // call super

    // mess with paper size -- make it half size with new height being old width and new width being 1/2 old height
    // we won't keep this messed up size, but it is needs to be messed up prior to the formatting stage
    this.old_width = this.cfg.PAPER_WIDTH;
    this.old_height = this.cfg.PAPER_HEIGHT;
    this.cfg.PAPER_HEIGHT = this.old_width;
    this.cfg.PAPER_WIDTH = (this.old_height - this.cfg.PAPER_MARGIN_GUTTER) / 2.0;
  }

  page_order(pages) {
    // first run through our parent (column layout) page order algorithm
    pages = PageLayoutColumn.prototype.page_order.call(this, pages);
    
    // now pages is a list of lists of PageMappings -- we need to map 4 of the inner lists onto each sheet of paper
    let paper_pages = [];
    // page mapping in booklet is: page4 and page1 on one side of a sheet of paper and page2 and page3 on the otherside
    //
    //  (outside sheet)      (inside sheet)
    // +---------------+    +---------------+
    // |       |       |    |       |       |
    // | Page4 | Page1 |    | Page2 | Page3 |
    // |       |       |    |       |       |
    // +---------------+    +---------------+
    // 

    let page1 = [];
    let page2 = [];
    let page3 = [];
    let page4 = [];

    // process pages in groups of 4
    for(let i of range(0, pages.length, 4)) {
      if ((i+0) < pages.length) {  // page 1 on physical paper
        page1 = shift_mappings(pages[i+0], this.cfg.PAPER_WIDTH + this.cfg.PAPER_MARGIN_GUTTER);  // shift right (include binder)
      }
      if ((i+1) < pages.length) {  // page 2 on physical paper
        page2 = pages[i+1];                                                   // no shift
      }
      if ((i+2) < pages.length) {  // page 3 on physical paper
        page3 = shift_mappings(pages[i+2], this.cfg.PAPER_WIDTH + this.cfg.PAPER_MARGIN_GUTTER);  // shift right (include binder)
      }
      if ((i+3) < pages.length) {  // page 4 on physical paper
        page4 = pages[i+3];                                                   // no shift

        // all 4 pages have now been found and shifted as needed
        //used to be push(pag4 + page1) was causing problems !!!!!!!!!STILL ERROR HERE
        paper_pages.push(page4,page1);  // 4 and 1 on same page
        paper_pages.push(page2,page3);  // 2 and 3 on following page
        
        // discard saved pages -- they are now in page list
        page1 = [];
        page2 = [];
        page3 = [];
        page4 = [];
      }
    }

    // add any pages that were defined but not added (adds only done in the loop when page 4 is reached)
    if (page1==[]) {
      paper_pages.push(page1);
    }
    if (page2==[] || page3==[]) {
      paper_pages.push(page2,page3);
    }

    // set the paper sizes back to normal (but flipped 90 degrees)
    this.cfg.PAPER_WIDTH = this.old_height;
    this.cfg.PAPER_HEIGHT = this.old_width;

    console.log(paper_pages);

    return paper_pages;
  }

  previous_page_visible(previous_pages) {
    // base our decision on what parent PageLayoutColumn would do
    let crosses_pages =  PageLayoutColumn.prototype.previous_page_visible.call(this, previous_pages);

    // but we have page 2 and page 3 opening across from each other
    // and page 4 and 1 open across from each other when the little booklets go together
    // ... so in one case we can see previous page even when columns say we shouldn't
    let physical_pages = previous_pages.length / this.cfg.COLUMNS;      // this.cfg.COLUMNS per page


    // if this is page 2 or 4 now, then prev. page is visible 
    if (physical_pages % 4 == (2 || 0)){
      return true; 
    }
    
    // default -- do parent's decision
    return crosses_pages;
  }
}

register_page_layout('booklet', PageLayoutBooklet);


class PageLayoutAdobeBooklet extends PageLayoutColumn {
  constructor(options) {
    super(options); // call super

    // mess with paper size -- make it half size with new height being old width and new width being 1/2 old height
    let old_width = this.cfg.PAPER_WIDTH;
    let old_height = this.cfg.PAPER_HEIGHT;
    this.cfg.PAPER_HEIGHT = old_width;
    this.cfg.PAPER_WIDTH = old_height / 2.0;
  }
}

register_page_layout('adobe-booklet', PageLayoutAdobeBooklet);

function myStringWidth(text, font, size, doc=null) {
  if(doc == null) {
    doc = new PDFDocument();
  }

  doc.font(font);
  doc.fontSize(size);

  let s = doc.widthOfString(text);
  //let s = stringWidth(text, font, size);  //PDFFUNCTION!!!!!!!!!
  return s;
}

function word_wrap(text, width, font, size, hanging_indent=0, doc) {
  let Line_object;
  let orig_text;
  let chords;
  if(text instanceof Line){
    Line_object = true;
    orig_text = text;   // save original line object
    chords = text.chords;
    text = text.text;
  }
  else{
    Line_object = false;
  }

  if(text.trim() == ''){
    return [];
  }
  //""" Returns a list of strings that will fit inside width """
  let out = [];
  text = text.split(' ');
  while(text.length > 0) {
    let num_words = text.length;

    while((num_words > 1) && (myStringWidth(text.slice(0, num_words).join(' '), font, size, doc) > width)) {
      num_words = num_words - 1; // try again minus one word
    }
    
    // num_words is now the most that can fit this line
    let new_text = text.splice(0, num_words).join(' ');

    let new_chords = {};

    if(Line_object) {
      for(let item of Object.keys(chords)){
        if(item < new_text.length){
          new_chords[item] = chords[item];
          delete chords[item];
        }
      }
      out.push(new Line(new_text,new_chords));
      for(let item of Object.keys(chords)){
        chords[item - (new_text.length+1)] = chords[item];
        delete chords[item];
      }
    }
    else {  //normal text
      out.push(new_text);
    }

    // we just added the first line
    if(out.length == 1) {
      width -= hanging_indent;
    }
  }

  return out;
}

function print_chords(doc, cfg=null, font_size=null, y_offset=null, x_offset=null, page_mapping=null, line=null) {
  //assert null not in (doc, cfg, font_size, y_offset, x_offset, page_mapping, line)

  doc.font(cfg.FONT_FACE).fontSize(cfg.SONGCHORD_SIZE);

  // loop through chords
  let char_offsets = Object.keys(line.chords);
  for(let char_offset of char_offsets) {
    let chord_offset = myStringWidth(line.text.slice(0, char_offset), cfg.FONT_FACE, font_size, doc);
    doc.text(line.chords[char_offset], page_mapping.startx + x_offset + chord_offset, page_mapping.starty + y_offset, { lineBreak: false });
  }
  y_offset += cfg.SONGCHORD_SIZE;

  return y_offset + cfg.SONGCHORD_SPACE;
}


function print_line(doc, font_face=null, font_size=null, y_offset=null, x_offset=0, line_space=null, page_mapping=null, line=null) { 
  //assert null not in (pdf, font_face, font_size, y_offset, line_space, page_mapping, line)

//DBG  // rect around text
//DBG  pdf.setStrokeColor('blue')
//DBG  pdf.rect(page_mapping.startx+x_offset, page_mapping.starty-y_offset,
//DBG      pdf.stringWidth(line, font_face, font_size), font_size, fill=False)
//DBG  // rect for line space
//DBG  pdf.setStrokeColor('green')
//DBG  pdf.setFillColor('green')
//DBG  pdf.rect(page_mapping.startx+x_offset, page_mapping.starty-(y_offset + line_space),
//DBG      pdf.stringWidth(line, font_face, font_size), line_space, fill=True)
//DBG  // big rect around everything
//DBG  pdf.setStrokeColor('red')
//DBG  pdf.rect(page_mapping.startx+x_offset, page_mapping.starty-(y_offset + line_space),
//DBG      pdf.stringWidth(line, font_face, font_size), font_size+line_space)
//DBG  // reset
//DBG  pdf.setStrokeColor('black')
//DBG  pdf.setFillColor('black')

  doc.font(font_face).fontSize(font_size);
  doc.text(line, page_mapping.startx+x_offset, page_mapping.starty + y_offset, { lineBreak: false });

  y_offset += font_size;
  return y_offset + line_space;
}

function page_height(p) {
  let h = 0; 
  for(let i of p) {
    h += i.height + i.height_after;
  }
  return h;
}

function paginate(songbook, cfg) {
  /* returns a list of pages: each page is a list of things to show on that page 
      Songbook and Song objects only count for titles and headers - chunks have to be listed separate

      *** calculations MUST be kept in sync with calc_heights and format_page
  */

  function height_of_introduction_plus_first_chunk(chunks) {
    let height = 0;
    for(let c of chunks) {
      height += c.height;
      if(c.type != 'introduction') {
        break;
      }
    }
    return height;
  }

  let USABLE_HEIGHT = cfg.PAPER_HEIGHT - (cfg.PAGE_MARGIN_BOTTOM + cfg.PAGE_MARGIN_TOP + cfg.PAPER_MARGIN_BOTTOM + cfg.PAPER_MARGIN_TOP);
  let pages = [];
  let p;
  let list_of_songs;

  // we may be called with just a song and not a songbook
  if(songbook instanceof Song) {
    list_of_songs = [songbook];
    p = [];
  }
  else {
    list_of_songs = songbook.songs;
    p = [songbook];
  }

  let songs_have_been_added = false;

  for(let song of list_of_songs) {
    // if cfg says each song on a new page and this isn't the first song in the book
    // or if we can't fit the song header and a non-intro chunk on the page go to the next page
    if(cfg.START_SONG_ON_NEW_PAGE && songs_have_been_added || page_height(p) + song.height + height_of_introduction_plus_first_chunk(song.chunks) > USABLE_HEIGHT) {
      pages.push(p);
      p = []; // new page
    }

    // song header will fit
    p.push(song);

    // now songs have been added :-)
    songs_have_been_added = true;

    let chorus = [];
    // fit as many chunks as we can
    //for idx,chunk in enumerate(song.chunks):
    for(const [idx, chunk] of Object.entries(song.chunks)) {

      // to maximize space usage we can usually subtract SONGLINE_SPACE because
      // we don't need it at the bottom of a page -- HOWEVER, if the last chunk
      // has copyright info, we can't remove SONGLINE_SPACE because it is not
      // at the bottom of the page
      let songline_correct;
      if(chunk.last_chunk) { // last_chunk only set when there is copyright for the song
        songline_correct = 0;
      }
      else {
        songline_correct = cfg.SONGLINE_SPACE;
      }

      // this chunk doesn't fit -- next page 
      if(page_height(p) + (chunk.height - songline_correct) > USABLE_HEIGHT) {
        pages.push(p);
        p = []; // new page

        // duplicate the chorus on each new page/column/etc if the page layout says it is needed
        // Also ... if there are enough verses left in this song (i.e. > 1) then we want to dupe the chorus AFTER adding the verse
        if(chorus.length != 0 && !cfg.page_layout.previous_page_visible(pages)) {

          // this chunk and at least one more are still to go -- so do chunk, chorus, chunk... end-of-song
          // UNLESS this chunk is a chorus, in which case we want to print any pre-choruses first
          if(idx+1 < song.chunks.length && chunk.type.indexOf('chorus') == -1) {
            p.push(chunk);
            p.push(...chorus); // extend with chorus(es)
          }
          else {  // this is the last chunk in the song -- do chorus, chunk, end-of-song
            p.push(...chorus); // extend with chorus(es)
            p.push(chunk);
          }
        }

        else { // no chorus stuff ... just add it 
          p.push(chunk);
        }
      }

      else { // space for this chunk
        p.push(chunk);
      }
      if(chunk.type.indexOf('chorus') > -1) {
        chorus.push(chunk);
      }
    }
    // done with chunks in song -- on to next song
  }
  // done with all songs in songbook -- add final song page if cat_index starts on next page and len(p) > 0

  if(cfg.DISPLAY_CAT_INDEX == INDEX_ON_NEW_PAGE) {
    // Fresh page if current page has anything on it.
    if(p.length != 0) {
      pages.push(p);
      p = [];
    }
    // add pages until previous page not visible so index is not visible from last song 
    while(cfg.page_layout.previous_page_visible(pages)) {
      pages.push(p);
      p = [];
    }
  }

  // now do category index pages if we are paginating a songbook
  if((songbook instanceof Songbook) && cfg.DISPLAY_CAT_INDEX != INDEX_OFF) {
    // create a new page if no room on current page
    if(page_height(p) + songbook.cat_index.height > USABLE_HEIGHT) {
      pages.push(p);
      p = [];
    }

    // add cat_index title to page
    p.push(songbook.cat_index);
    const cat_entries = Object.entries(songbook.cat_index).sort();
    for(let cat of cat_entries) { //!!!!IS THIS SORTED ?
      if(cat[1] instanceof Array) {
        if((page_height(p) + songbook.cat_index.cat_height + cat[1].height) > USABLE_HEIGHT) {  // can't fit category + one index entry
          pages.push(p);
          p = [];
        }
        p.push(new Category(cat[0], songbook.cat_index.cat_height));

        // sort cat_index entries then add to page
        let entries = cat[1].sort(function(a, b) {
          var nameA = a.index_text.toLowerCase(); // ignore upper and lowercase
          var nameB = b.index_text.toLowerCase(); // ignore upper and lowercase
          if (nameA < nameB) {
            return -1;
          }
          if (nameA > nameB) {
            return 1;
          }
          // names must be equal
          return 0;
        });

        for(let index_entry of entries) {
          // if there is no room for this entry, then the page is complete and we start a new one
          if ((page_height(p) + index_entry.height) > USABLE_HEIGHT) {
            pages.push(p);
            p = [];
          }

          // add the cat_index entry
          p.push(index_entry);
        }
      }
    }
  }
 
  // done with category index -- add last page if scripture index starts on next page and len(p) > 0
  if(cfg.DISPLAY_SCRIP_INDEX == INDEX_ON_NEW_PAGE) { 
    // Fresh page if current page has anything on it.
    if(p.length != 0) {
      pages.push(p);
      p = [];
    }
    // add pages until previous index is not visible so index is not visible
    while(cfg.page_layout.previous_page_visible(pages)){
      pages.push(p);
      p = [];
    }
  }

  // now do scripture index pages if we are paginating a songbook
  if(songbook instanceof Songbook && cfg.DISPLAY_SCRIP_INDEX != INDEX_OFF) {
    // create a new page if no room on current page
    if(page_height(p) + songbook.index.height > USABLE_HEIGHT) {
      pages.push(p);
      p = [];
    }

    // add index title to page
    p.push(songbook.scrip_index);

    // sort index entries then add to page
    let entries = songbook.scrip_index.sort(function(a,b) {
      let a_num = parseInt(sort_scrip_index(a.index_text.toLowerCase()));
      let b_num = parseInt(sort_scrip_index(b.index_text.toLowerCase()));
      let response = 0;
      if(a_num > b_num){
        response = 1;
      }
      else if(b_num > a_num){
        response = -1;
      }
      return response;
    });

    for(let index_entry of entries) {
      // if there is no room for this entry, then the page is complete and we start a new one
      if ((page_height(p) + index_entry.height) > USABLE_HEIGHT) {
        pages.push(p);
        p = [];
      }

      // add the index entry
      p.push(index_entry);
    }
  }

  // done with scripture index -- add final page if index starts on next page and len(p) > 0
  if(cfg.DISPLAY_INDEX == INDEX_ON_NEW_PAGE) {
    // Fresh page if current page has anything on it.
    if (p.length != 0) {
      pages.push(p);
      p = [];
    }
    // add pages until previous index is not visible so index is not visible
    while(cfg.page_layout.previous_page_visible(pages)) {
      pages.push(p);
      p = [];
    }
  }

  // now do regular index pages if we are paginating a songbook
  if(songbook instanceof Songbook && cfg.DISPLAY_INDEX != INDEX_OFF) {
    // create a new page if no room on current page
    if(page_height(p) + songbook.index.height > USABLE_HEIGHT) {
      pages.push(p);
      p = [];
    }

    // add index title to page
    p.push(songbook.index);

    // sort index entries then add to page
    let entries = songbook.index.sort(function(a,b) { 
      let a_sort = a.index_text.toLowerCase();
      let b_sort = b.index_text.toLowerCase();
      if(a_sort > b_sort){
        return 1;
      }
      else if(b_sort > a_sort) {
        return -1;
      }
      else {
        return 0;
      }
    });


    for(let index_entry of entries) {
      // if there is no room for this entry, then the page is complete and we start a new one
      if((page_height(p) + index_entry.height) > USABLE_HEIGHT) {
        pages.push(p);
        p = [];
      }

      // add the index entry
      p.push(index_entry);
    }
  }

  // add final page (index or last song page if index is disabled)
  if(p.length != 0) {
    pages.push(p);
  }

  return pages;
}


function calc_heights(songbook, cfg, doc) {
  //"""Calculates heights of songbook pieces -- calculations MUST be kept in sync with format_page and paginate"""
  // calc heights of elements and store in songbook object tree

  // we may be called with just a song even though the variable name suggests otherwise
  let list_of_songs;
  let index;
  let scrip_index;
  let cat_index;
  if(songbook instanceof Song) {
    list_of_songs = [songbook];
    index = [];
    scrip_index = [];
    cat_index = [];
  }
  else {
    list_of_songs = songbook.songs;
    if(!cfg.HIDE_BOOKTITLE){
      songbook.height = cfg.BOOKTITLE_SIZE + cfg.BOOKTITLE_SPACE;
    }
    else {
      songbook.height = 0;
    }

    // category index
    if(cfg.DISPLAY_CAT_INDEX != INDEX_OFF) {
      cat_index = songbook.cat_index;
      songbook.cat_index.height = cfg.INDEX_TITLE_SIZE + cfg.INDEX_TITLE_SPACE;
      songbook.cat_index.cat_height = cfg.INDEX_CAT_SIZE + cfg.INDEX_CAT_SPACE + cfg.INDEX_CAT_B4;
    }
    else {
      cat_index = [];
    }

    // scripture index
    if(cfg.DISPLAY_SCRIP_INDEX != INDEX_OFF) {
      scrip_index = songbook.scrip_index;
      songbook.scrip_index.height = cfg.INDEX_TITLE_SIZE + cfg.INDEX_TITLE_SPACE;
      if(cfg.DISPLAY_SCRIP_INDEX == INDEX_NO_PAGE_BREAK) {  // only add space before if not starting on a new page
        songbook.scrip_index.height += cfg.INDEX_TITLE_B4;
      }
    }
    else {
      scrip_index = []; // make scripture index height calculation loop be empty
    }

    // index
    if(cfg.DISPLAY_INDEX != INDEX_OFF) {
      index = songbook.index;
      songbook.index.height = cfg.INDEX_TITLE_SIZE + cfg.INDEX_TITLE_SPACE;
      if(cfg.DISPLAY_INDEX == INDEX_NO_PAGE_BREAK){  // only add space before if not starting on a new page
        songbook.index.height += cfg.INDEX_TITLE_B4;
      }
    }
    else {
      index = []; // make index height calculation loop be empty
    }
  }
  
  //myStringWdith('8 is copied from format_page - keep them in sync 
  let chunk_width = (cfg.page_layout.get_page_width() - myStringWidth('8)   ', cfg.FONT_FACE, cfg.SONGLINE_SIZE, doc));
  for(let song of list_of_songs) {
    song.height = 0;
    let song_title;

    if(cfg.SCRIPTURE_LOCATION == SCRIPTURE_IN_TITLE && song.scripture_ref) {
      let num = song.num;
      let title = song.title + '(' + song.scripture_ref + ')';
      song_title = cfg.SONGTITLE_FORMAT.replace('${title}',title).replace('${num}',song.num);
    }
    else {
      let num = song.num;
      let title = song.title;
      song_title = cfg.SONGTITLE_FORMAT.replace('${title}',title).replace('${num}',song.num);
    }

    song.num_width = myStringWidth(cfg.SONGTITLE_FORMAT.replace('${title}','').replace('${num}',song.num), cfg.FONT_FACE, cfg.SONGTITLE_SIZE, doc)*1.5;

    // Word wrap title as needed
    song.title_wrapped = word_wrap(song_title, cfg.page_layout.get_page_width(), cfg.FONT_FACE, cfg.SONGTITLE_SIZE, song.num_width, doc);
    // add to height for each line
    //song.height += sum(cfg.SONGTITLE_SIZE + cfg.SONGTITLE_SPACE for line in song.title_wrapped);
    song.height += (cfg.SONGTITLE_SIZE + cfg.SONGTITLE_SPACE)*song.title_wrapped.length;

    // small text that goes under the title
    let small_text = [];
    if(song.author) {
      small_text.push(song.author);
    }

    if(cfg.SCRIPTURE_LOCATION == SCRIPTURE_UNDER_TITLE && song.scripture_ref) {
      small_text.push(song.scripture_ref);
    }

    if(song.key) {
      small_text.push(song.key);
    }

    // wrap small_text
    small_text = small_text.join(' '.repeat(8));
    song.small_text = word_wrap(small_text, cfg.page_layout.get_page_width(), cfg.FONT_FACE, cfg.SMALL_SIZE, 0, doc);
    // add height of wrapped small_text
    song.height += (cfg.SMALL_SIZE + cfg.SMALL_SPACE)*song.small_text.length;


    // introduction if applicable -- not shown when chords are not shown
    if(song.introduction && cfg.DISPLAY_CHORDS){
      song.height += cfg.SONGCHORD_SIZE + cfg.SONGCHORD_SPACE;
    }
    for(let chunk of song.chunks) {
      chunk.last_chunk = false;  // the real last chunk is set true after loop

      // when word wrapping lines we need to split so chunk.lines is right length.
      if(cfg.RESIZE_PERCENT == 0) {  // 0 means we are wrapping
        let split_lines = [];
        for(let line of chunk.lines) {
          let split_line = word_wrap(line, chunk_width, cfg.FONT_FACE, cfg.SONGLINE_SIZE, 0, doc); 
          split_lines.push(...split_line);
        }

        chunk.lines = split_lines;
      }

      chunk.height = cfg.SONGCHUNK_B4 + chunk.lines.length * (cfg.SONGLINE_SIZE + cfg.SONGLINE_SPACE);
      if(VARIABLE_INDENT.indexOf(chunk.type) == -1){                     // if not a verse, intro, or  unlabeled chunk, we put
        chunk.height += cfg.SONGLINE_SIZE + cfg.SONGLINE_SPACE;  // Chorus, Pre-Chorus, Bridge, etc on a separate line
      }

      // space for chords
      if(cfg.DISPLAY_CHORDS && chunk.has_chords()){
        chunk.height += chunk.lines.length * (cfg.SONGCHORD_SIZE + cfg.SONGCHORD_SPACE);
      }

      // set height on lines (currently unused?)
      for(let l of chunk.lines) {
        l.height = cfg.SONGLINE_SIZE + cfg.SONGLINE_SPACE;
        if(cfg.DISPLAY_CHORDS && chunk.has_chords()){
          l.height += cfg.SONGCHORD_SIZE + cfg.SONGCHORD_SPACE;
        }
      }
    }

    // after looping through chunks and setting their height, any copyright_footer height is added to the last chunk
    // no copyright_footer if no copyright
    if(song.copyright) {
      let copyright_text = song.copyright + '.';
      if(song.ccli) {
        copyright_text = copyright_text + '  Used By Permission. CCLI License #'+cfg.CCLI;
      }

      song.chunks[song.chunks.length-1].last_chunk = true;  // lets the formatter know to print the copyright_footer
      song.chunks[song.chunks.length-1].copyright_footer = word_wrap(copyright_text, cfg.page_layout.get_page_width(), cfg.FONT_FACE, cfg.COPYRIGHT_SIZE, 0, doc);
      // add space for each line in copyright_footer
      song.chunks[song.chunks.length-1].height += cfg.SONGCHUNK_B4 + (cfg.COPYRIGHT_SIZE + cfg.COPYRIGHT_SPACE)*song.chunks[song.chunks.length-1].copyright_footer.length;
    }

    // end of song -- add SONG_SPACE_AFTER to last chunk (will be after the copyright) if there are chunks in song
    if(song.chunks.length > 0) {
      song.chunks[song.chunks.length-1].height_after = cfg.SONG_SPACE_AFTER;
    }
  }

  // index
  for(let index_entry of index) {
    if(index_entry.is_song_title) {
      index_entry.height = cfg.INDEX_SONG_SIZE + cfg.INDEX_SONG_SPACE;
    }
    else {
      index_entry.height = cfg.INDEX_FIRST_LINE_SIZE + cfg.INDEX_FIRST_LINE_SPACE;
    }
  }

  // scrip index
  for(let index_entry of scrip_index) {
    index_entry.height = cfg.INDEX_SONG_SIZE + cfg.INDEX_SONG_SPACE;
  }

  // cat index
  for(let c of Object.entries(cat_index)) {
    if(c[1] instanceof Array) {
      c[1].height = songbook.cat_index.cat_height;        

      for(let index_entry of cat_index[c[0]]) {
        if(index_entry.is_song_title) {
          index_entry.height = cfg.INDEX_SONG_SIZE + cfg.INDEX_SONG_SPACE;
        }
        else{
          index_entry.height = cfg.INDEX_FIRST_LINE_SIZE + cfg.INDEX_FIRST_LINE_SPACE;
        }
      }
    }
  }
}


function format_page(doc, cfg, page_mapping) {
  const { outline } = doc;

  //"""Format a page onto the PDF -- calculations MUST be kept in sync with calc_heights and paginate"""

  // pick a standard indent that almost every chunk will fit (except for intros and probably verse 10 and greater)
  let STANDARD_LABEL_INDENT_LENGTH = myStringWidth('8)   ', cfg.FONT_FACE, cfg.SONGLINE_SIZE, doc);

  // REMEMBER: we are in the 4th Quadrant (like Math) ... top left is (0,0)
  // ---------
  // | 2 | 1 |
  // ---------
  // | 3 | 4 |
  // ---------
  // PYTHON we were in the 1st quadrant - bottom left was (0,0)
  let y = 0;

  let outline_level = 0;

  // set clip region
  doc.save(); // so we can restore to no clip after this page

  if(cfg.DEBUG_MARGINS) {
    doc.rect(page_mapping.startx, page_mapping.starty,
        page_mapping.endx-page_mapping.startx,page_mapping.endy-page_mapping.starty);
  }

  // make a bounding box to keep from printing out of bounds
  doc
  .rect(page_mapping.startx, page_mapping.starty,
      page_mapping.endx-page_mapping.startx,page_mapping.endy-page_mapping.starty)
  .clip();

  // draw page items
  for(let item of page_mapping.page) {
    //if isinstance(item, Songbook):
    if(item instanceof Songbook) {
      // add to outline
      //let key = String(hash(('SONGBOOK ' + item.title)));
      //doc.bookmarkPage(key, left=page_mapping.startx, top=page_mapping.starty-y);
      //outline_level = 0;
      //doc.addOutlineEntry(item.title, key, level=outline_level);
//      outline.addItem(item.title);
      //outline_level = 1;

      // SONGBOOK TITLE
      if(!cfg.HIDE_BOOKTITLE) {
        y = print_line(doc, cfg.FONT_FACE, cfg.BOOKTITLE_SIZE, y, 0, cfg.BOOKTITLE_SPACE, page_mapping, item.title);
      }
    }
    // SONG
    else if(item instanceof Song) {
      // add to outline
      //let key = String(hash('SONG(%d): %s' % (item.num, item.title)));
      //doc.bookmarkPage(key, left=page_mapping.startx, top=page_mapping.starty-y);
      //doc.addOutlineEntry(item.title, key, level=outline_level);
//      outline.addItem(item.title);  
      //XXX: here we could add stuff to make index entries linkable

      // SONG TITLE
      for(const [i, title_line] of Object.entries(item.title_wrapped)) {
      //for i, title_line in enumerate(item.title_wrapped):
        let indent;
        if(i == 0){ // first line
          indent = 0;
        }
        else {
          indent = item.num_width;
        }

        y = print_line(doc, cfg.FONT_FACE, cfg.SONGTITLE_SIZE, y, indent, cfg.SONGTITLE_SPACE, page_mapping, title_line);
      }

      // small_text after title
      for(let sm_line of item.small_text) {
        y = print_line(doc, cfg.FONT_FACE, cfg.SMALL_SIZE, y, 0, cfg.SMALL_SPACE, page_mapping, sm_line);
      }

      // introduction if applicable -- not shown when chords are not shown
      if(item.introduction && cfg.DISPLAY_CHORDS) {
        y = print_line(doc, cfg.FONT_FACE, cfg.SONGCHORD_SIZE, y, 0, cfg.SONGCHORD_SPACE, page_mapping, item.introduction);
      }
    }

    // VERSE OR CHORUS
    else if( item instanceof Chunk) {
      y += cfg.SONGCHUNK_B4;
      let label;
      // calulate prefix text for the chunk
      if(item.type == 'chorus') {
        label = 'Chorus:';
      }
      else if(item.type == 'verse') {
        label = item.num + ')';
      }
      else if(item.type == 'bridge') {
        label = 'Bridge:';
      }
      else if(item.type == 'pre-chorus') {
        label = 'Pre-Chorus:';
      }
      else if(item.type == 'final chorus') {
        label = 'Final Chorus:';
      }
      else if(item.type == 'ending') {
        label = 'Ending:';
      }
      else if(item.type == 'introduction') {
        label = 'Introduction:';
      }
      else {
        label = '';
      }

      let label_length;
      if(VARIABLE_INDENT.indexOf(item.type) != -1) {  // these chunks are indented by num of chars in label
        label_length = Math.max(myStringWidth(label+'  ', cfg.FONT_FACE, cfg.SONGLINE_SIZE, doc), STANDARD_LABEL_INDENT_LENGTH);
        // type indented no label gets an extra indent
        if(item.type == INDENT_NO_LABEL) {
          label_length *= 2;
        }
      }
      else {                             // everything else gets a standard indent
        label_length = STANDARD_LABEL_INDENT_LENGTH;
      }

      // print the chunk lines
      if(item.type == 'introduction' && !cfg.DISPLAY_CHORDS) { // introduction is not shown when chords are not shown
        //pass
      }
      else {
        for(const [count, line] of Object.entries(item.lines)) {
        //for count, line in enumerate(item.lines):
          if(count == 0) { // on the first line in the chunk write the label: chorus, 1), 2), 3) ...
            let new_y;
            if(cfg.DISPLAY_CHORDS && item.has_chords() && item.type == 'verse') { //for verses with chords, we move the label down 
              new_y = print_line(doc, cfg.FONT_FACE, cfg.SONGLINE_SIZE, y+cfg.SONGCHORD_SIZE+cfg.SONGCHORD_SPACE, 0, cfg.SONGLINE_SPACE, page_mapping, label);
            }
            else {
              new_y = print_line(doc, cfg.FONT_FACE, cfg.SONGLINE_SIZE, y, 0, cfg.SONGLINE_SPACE, page_mapping, label);
            }
            if(VARIABLE_INDENT.indexOf(item.type) == -1) { // standard indent, with chunk body on next line
              y = new_y;                          // so we update y ... in other cases y not updated, so same line used
            }
            //else: ignore new_y and we print on same line below
          }

          // shrink font size, or wrap the line if that lets us fit
          // if resize != 0 we are shrinking, else we wrap
          let font_size = cfg.SONGLINE_SIZE;
          if(cfg.RESIZE_PERCENT == 0) {
            // font size does not change.  
            font_size = font_size;
          }   
          else {
            // reduce font size as much as needed but don't pass x% original
            while ((label_length + myStringWidth(line.text, cfg.FONT_FACE, font_size, doc)) > (page_mapping.endx - page_mapping.startx) && font_size > cfg.SONGLINE_SIZE * cfg.RESIZE_PERCENT) {
              font_size = font_size * 0.99; // reduce 1%
              //print 'reducing from', cfg.SONGLINE_SIZE, 'to', font_size, '%2.2f%%' % (font_size / cfg.SONGLINE_SIZE)
            }
          }
          // we have a font -- lets use it
          //DBG:sav_y = y
          if(cfg.DISPLAY_CHORDS && item.has_chords()) {
            y = print_chords(doc, cfg, font_size, y, label_length, page_mapping, line);
          }
          y = print_line(doc, cfg.FONT_FACE, font_size, y, label_length, cfg.SONGLINE_SPACE, page_mapping, line.text);
          //DBG:doc.setStrokeColor('green')
          //DBG:doc.rect(page_mapping.startx+label_length, page_mapping.starty-(sav_y),
          //DBG:    doc.stringWidth(line.text, cfg.FONT_FACE, font_size), -line.height)
          //DBG:doc.setStrokeColor('red')
          //DBG:doc.rect(page_mapping.startx+label_length, page_mapping.starty-(sav_y),
          //DBG:    doc.stringWidth(line.text, cfg.FONT_FACE, font_size), sav_y-y)
          //DBG:// reset
          //DBG:doc.setStrokeColor('black')
          //DBG:doc.setFillColor('black')
        }
      }

      if(item.last_chunk) {
        y += cfg.SONGCHUNK_B4;
        for(let line of item.copyright_footer) {
          y = print_line(doc, cfg.FONT_FACE, cfg.COPYRIGHT_SIZE, y, 0, 0, page_mapping, line);
          y += cfg.COPYRIGHT_SPACE;        // COPYRIGHT SPACE is padding between copyright lines 
        }
      }

      // any parting space
      y += item.height_after;
    }

        //DBG:doc.rect(page_mapping.startx+5, page_mapping.starty - (starty+cfg.SONGLINE_SIZE), 20, starty-y)
    // INDEX
    else if((item instanceof Index) && cfg.DISPLAY_INDEX != INDEX_OFF) { // top-level index which contains index entries
      if(cfg.DISPLAY_INDEX == INDEX_NO_PAGE_BREAK) {
        y += cfg.INDEX_TITLE_B4;  // only add space when index not starting on a new page
      }
      y = print_line(doc, cfg.INDEX_TITLE_FONT, cfg.INDEX_TITLE_SIZE, y, 0, cfg.INDEX_TITLE_SPACE, page_mapping, "Alphabetical Index");
    }

    // SCRIP INDEX
    else if((item instanceof ScripIndex) && cfg.DISPLAY_SCRIP_INDEX != INDEX_OFF) { // top-level scrip_index which contains index entries
      if(cfg.DISPLAY_SCRIP_INDEX == INDEX_NO_PAGE_BREAK) {
        y += cfg.INDEX_TITLE_B4;  // only add space when scrip index not starting on a new page
      }
      y = print_line(doc, cfg.INDEX_TITLE_FONT, cfg.INDEX_TITLE_SIZE, y, 0, cfg.INDEX_TITLE_SPACE, page_mapping, "Scripture Index");
    }
    // CAT INDEX
    else if((item instanceof CatIndex) && cfg.DISPLAY_CAT_INDEX != INDEX_OFF) { // top-level cat_index which contains index entries
      if(cfg.DISPLAY_CAT_INDEX == INDEX_NO_PAGE_BREAK) {
        y += cfg.INDEX_TITLE_B4;  // adding space because cat_index not starting on a new page
      }
      y = print_line(doc, cfg.INDEX_TITLE_FONT, cfg.INDEX_TITLE_SIZE, y, 0, cfg.INDEX_TITLE_SPACE, page_mapping, "Category Index");
    }

    // CAT INDEX Category
    else if((item instanceof Category) && cfg.DISPLAY_CAT_INDEX != INDEX_OFF) { // Category inside cat_index
      y += cfg.INDEX_CAT_B4;  // add space before the category
      y = print_line(doc, cfg.INDEX_CAT_FONT, cfg.INDEX_CAT_SIZE, y, 0, cfg.INDEX_CAT_SPACE, page_mapping, item.category);
    }

    // CAT INDEX ITEM
    else if((item instanceof CatIndexEntry) && cfg.DISPLAY_CAT_INDEX != INDEX_OFF) {
      // print only the song number at this time -- don't save y since we are going to print on the line again
      print_line(doc, cfg.INDEX_SONG_FONT, cfg.INDEX_SONG_SIZE, y, 0, cfg.INDEX_SONG_SPACE, page_mapping, String(item.song.num));
      // now print the index text with a consistent x offset so everything lines up
      y = print_line(doc, cfg.INDEX_SONG_FONT, cfg.INDEX_SONG_SIZE, y, Math.max(cfg.INDEX_SONG_SIZE, cfg.INDEX_FIRST_LINE_SIZE)*2, cfg.INDEX_SONG_SPACE, page_mapping, item.index_text);
    }

    // INDEX ITEMS (after CatIndexEntry because CatIndexEntry is a subclass of IndexEntry)
    else if((item instanceof IndexEntry) && (cfg.DISPLAY_INDEX != INDEX_OFF || cfg.DISPLAY_SCRIP_INDEX != INDEX_OFF)) {
      let LINE_SIZE;
      let LINE_SPACE;
      let FONT;
      if(item.is_song_title) {
        LINE_SIZE = cfg.INDEX_SONG_SIZE;
        LINE_SPACE= cfg.INDEX_SONG_SPACE;
        FONT      = cfg.INDEX_SONG_FONT;
      }
      else {
        LINE_SIZE = cfg.INDEX_FIRST_LINE_SIZE;
        LINE_SPACE= cfg.INDEX_FIRST_LINE_SPACE;
        FONT      = cfg.INDEX_FIRST_LINE_FONT;
      }

      // print only the song number at this time -- don't save y since we are going to print on the line again
      print_line(doc, FONT, LINE_SIZE, y, 0, LINE_SPACE, page_mapping, String(item.song.num));
      // now print the index text with a consistent x offset so everything lines up
      y = print_line(doc, FONT, LINE_SIZE, y, Math.max(cfg.INDEX_SONG_SIZE, cfg.INDEX_FIRST_LINE_SIZE)*2, LINE_SPACE, page_mapping, item.index_text);
    }
  }
  
  // restore original clip settings
  doc.restore();

  // debug -- print page (small page here) rect
  //DBG:print '%d x %d rect at (%d, %d)' % (page_mapping.endx-page_mapping.startx, page_mapping.endy-page_mapping.starty,
  //DBG:    page_mapping.startx, page_mapping.starty)
  //XXX: uncomment last 2 lines to have a border around each page
  //doc.rect(page_mapping.startx, page_mapping.starty,
  //    page_mapping.endx-page_mapping.startx,page_mapping.endy-page_mapping.starty,
  //    fill=0)
  if(page_height(page_mapping.page) != y) {
    //console.log('Page:', doc.getPageNumber(), 'Expected page height:', page_height(page_mapping.page), 'not equal to actual page height:', y);
    //DBG:doc.rect(page_mapping.startx, page_mapping.starty,
    //DBG:    page_mapping.endx-page_mapping.startx,-page_height(page_mapping.page),
    //DBG:    fill=0)
  }
}

function format(songbook, cfg) {
  let old_time = new Date();
  if (typeof songbook == 'object') {
    songbook = parse(songbook, cfg);    // parse into objects
  }
  let progress = '0%';
  postMessage(['progress',progress]);

  // calculate the space needed for the songbook pieces
  let doc = new PDFDocument();
  calc_heights(songbook, cfg, doc);
  // returns a list of pages: each page is a list of things to show on that page 
  // Songbook and Song objects only count for titles and headers chunks have to be listed separate
  let pages = paginate(songbook, cfg);

  let pages_ordered = cfg.page_layout.page_order(pages);

  // pdf object creation must be after the page layout methods are run because the page layout can change the paper size
  
  //pdf = canvas.Canvas(pdf, pagesize=(cfg.PAPER_WIDTH, cfg.PAPER_HEIGHT));
  let options = {size: cfg.PAPER_SIZE, layout: cfg.PAPER_ORIENTATION, autoFirstPage: false};
  doc = new PDFDocument(options);
  var stream = doc.pipe(blobStream());

  // set the PDF title
  //pdf.setTitle(songbook.title);
  doc.info = {Title: songbook.title};

  for(const [i, physical_page] of Object.entries(pages_ordered)) {
    doc.addPage();
    for(const page_mapping of physical_page) {
      format_page(doc, cfg, page_mapping);
    }
    progress = parseInt(((parseInt(i,10)+1) / pages_ordered.length)*100, 10) +'%';
    postMessage(['progress',progress]);
  }

  // end and return the pdf blob;
  doc.end();
  stream.on('finish', function() {
    console.log(new Date() - old_time);
    console.log('Finished making pdf, posting to main thread');
    postMessage(['pdf',stream.toBlobURL('application/pdf')]);
  });
}

function read_config(config_array) {
  function safe_var(variable, type) {
    if(type == 'string') {
      return String(variable);
    }
    else if(type == 'float') {
      let parsed = parseFloat(variable);
      if(isNaN(parsed)) {
        return 0;
      }
      return parsed;
    }
    else if(type == 'int') {
      let parsed = parseInt(variable, 10);
      if(isNaN(parsed)) {
        return 0;
      }
      return parsed;
    }
    else {
      return 'You missed something!';
    }
  }

  var options = [];
  options.SONGS_TO_PRINT =         ((config_array.print_a == 'on') ? 'a' : '') + 
                                   ((config_array.print_n == 'on') ? 'n' : '') + 
                                   ((config_array.print_r == 'on') ? 'r' : '');
  options.PAPER_SIZE =             safe_var(config_array.paper_size,                 'string');
  options.PAPER_ORIENTATION =      safe_var(config_array.paper_orientation,          'string');  
  options.PAPER_MARGIN_LEFT =      safe_var(config_array.paper_margin_left,          'float');   
  options.PAPER_MARGIN_RIGHT=      safe_var(config_array.paper_margin_right,         'float');         //type="float"           
  options.PAPER_MARGIN_TOP =       safe_var(config_array.paper_margin_top,           'float');           //type="float"           
  options.PAPER_MARGIN_BOTTOM =    safe_var(config_array.paper_margin_bottom,        'float');        //type="float"           

  options.PAGE_LAYOUT_NAME =       safe_var(config_array.page_layout,                'string');                //type="string"          
  options.PAGE_MARGIN_LEFT =       0;//config_array.page_margin_left;           //type="float"           
  options.PAGE_MARGIN_RIGHT =      0;//config_array.page_margin_right;          //type="float"           
  options.PAGE_MARGIN_TOP =        0;//config_array.page_margin_top;            //type="float"           
  options.PAGE_MARGIN_BOTTOM =     0;//config_array.page_margin_bottom;         //type="float"           

  options.PAPER_MARGIN_GUTTER =    safe_var(config_array.paper_margin_gutter,        'float');           

  options.FONT_FACE =              safe_var(config_array.font_face,                  'string');          

  options.CCLI =                   safe_var(config_array.ccli,                       'string');

  options.COLUMNS =                safe_var(config_array.columns,                    'int');   
  options.COLUMN_GUTTER =          safe_var(config_array.column_gutter,              'float');

  options.BOOKTITLE_SIZE =         safe_var(config_array.booktitle_size,             'int');
  options.BOOKTITLE_SPACE =        safe_var(config_array.booktitle_space,            'int');
  options.HIDE_BOOKTITLE =         safe_var(config_array.hide_booktitle,             'string');

  options.START_SONG_ON_NEW_PAGE = safe_var(config_array.start_song_on_new_page,     'string');
  options.SONGTITLE_FORMAT =       safe_var(config_array.songtitle_format,           'string');
  options.SONGTITLE_SIZE =         safe_var(config_array.songtitle_size,             'int');
  options.SONGTITLE_SPACE =        safe_var(config_array.songtitle_space,            'int');
  options.SONG_SPACE_AFTER =       safe_var(config_array.song_space_after,           'int');
  options.SONGCHUNK_B4 =           safe_var(config_array.songchunk_b4,               'int');
  options.SONGLINE_SIZE =          safe_var(config_array.songline_size,              'int');
  options.SONGLINE_SPACE =         safe_var(config_array.songline_space,             'int');
  options.SONGCHORD_SIZE =         safe_var(config_array.songchord_size,             'int');
  options.SONGCHORD_SPACE =        safe_var(config_array.songchord_space,            'int');
  options.DISPLAY_CHORDS =         safe_var(config_array.display_chords,             'string');

  options.SMALL_SIZE =             safe_var(config_array.small_size,                 'int');
  options.SMALL_SPACE =            safe_var(config_array.small_space,                'int');

  options.SCRIPTURE_LOCATION =     safe_var(config_array.scripture_location,         'string');

  options.COPYRIGHT_SIZE =         safe_var(config_array.copyright_size,             'int');
  options.COPYRIGHT_SPACE =        safe_var(config_array.copyright_space_b4,         'int');

  options.RESIZE_PERCENT =         safe_var(config_array.resize_percent,             'int');

  options.DISPLAY_CAT_INDEX =      safe_var(config_array.display_cat_index,          'string');
  options.DISPLAY_SCRIP_INDEX =    safe_var(config_array.display_scrip_index,        'string');
  options.DISPLAY_INDEX =          safe_var(config_array.display_index,              'string');
  options.INCLUDE_FIRST_LINE =     ((config_array.include_first_line == 'on') ? true : false);        //type="string"          
  options.INDEX_TITLE_FONT =       safe_var(config_array.index_title_font,           'string');
  options.INDEX_TITLE_B4 =         safe_var(config_array.index_title_b4,             'int');
  options.INDEX_TITLE_SIZE =       safe_var(config_array.index_title_size,           'int');
  options.INDEX_TITLE_SPACE =      safe_var(config_array.index_title_space,          'int');
  options.INDEX_CAT_FONT =         safe_var(config_array.index_cat_font,             'string');
  options.INDEX_CAT_B4 =           safe_var(config_array.index_cat_b4,               'int');
  options.INDEX_CAT_SIZE =         safe_var(config_array.index_cat_size,             'int');
  options.INDEX_CAT_SPACE =        safe_var(config_array.index_cat_space,            'int');
  options.INDEX_CAT_EXCLUDE =      safe_var(config_array.index_cat_exclude,          'string');
  options.INDEX_SONG_FONT =        safe_var(config_array.index_song_font,            'string');
  options.INDEX_SONG_SIZE =        safe_var(config_array.index_song_size,            'int');
  options.INDEX_SONG_SPACE =       safe_var(config_array.index_song_space,           'int');
  options.INDEX_FIRST_LINE_FONT =  safe_var(config_array.index_first_line_font,      'string');
  options.INDEX_FIRST_LINE_SIZE =  safe_var(config_array.index_first_line_size,      'int');
  options.INDEX_FIRST_LINE_SPACE = safe_var(config_array.index_first_line_space,     'int');

  options.DEBUG_MARGINS =          safe_var(config_array.debug_margins,              'string');

  if (options.SONGS_TO_PRINT == '' || !window.songbook.showStatus) {
    options.SONGS_TO_PRINT = 'anr';
  }
  let opts = {size: options.PAPER_SIZE, layout: options.PAPER_ORIENTATION, autoFirstPage: true};
  let doc = new PDFDocument(opts);
  options.PAPER_WIDTH = doc.page.width;
  options.PAPER_HEIGHT = doc.page.height;

  if (options.SONGTITLE_FORMAT) {
    if (options.SONGTITLE_FORMAT == '') {  // special case for when the option field is left blank in HTML
      options.SONGTITLE_FORMAT = '${title}';
    }
    else {
      options.SONGTITLE_FORMAT = options.SONGTITLE_FORMAT + ' ${title}';
    }
  }
  else {
    options.SONGTITLE_FORMAT = '${num}. ${title}';
  }

  if (options.HIDE_BOOKTITLE && options.HIDE_BOOKTITLE.toLowerCase() == 'yes') {
    options.HIDE_BOOKTITLE = true;
  }
  else {
    options.HIDE_BOOKTITLE = false;
  }

  if (options.START_SONG_ON_NEW_PAGE && options.START_SONG_ON_NEW_PAGE.toLowerCase() == 'on') {
    options.START_SONG_ON_NEW_PAGE = true;
  }
  else {
    options.START_SONG_ON_NEW_PAGE = false;
  }

  if (options.DISPLAY_CHORDS && options.DISPLAY_CHORDS.toLowerCase() == 'yes') {
    options.DISPLAY_CHORDS = true;
  }
  else {
    options.DISPLAY_CHORDS = false;
  }

  if (options.DEBUG_MARGINS && options.DEBUG_MARGINS.toLowerCase() == 'yes') {
    options.DEBUG_MARGINS = true;
  }
  else {
    options.DEBUG_MARGINS = false;
  }

  if (options.DISPLAY_INDEX && options.DISPLAY_INDEX.toLowerCase() == INDEX_ON_NEW_PAGE.toLowerCase()) {
    options.DISPLAY_INDEX = INDEX_ON_NEW_PAGE;
  }
  else if (options.DISPLAY_INDEX && options.DISPLAY_INDEX.toLowerCase() == INDEX_NO_PAGE_BREAK.toLowerCase()) {
    options.DISPLAY_INDEX = INDEX_NO_PAGE_BREAK;
  }
  else {
    options.DISPLAY_INDEX = INDEX_OFF;
  }

  if (options.DISPLAY_SCRIP_INDEX && options.DISPLAY_SCRIP_INDEX.toLowerCase() == INDEX_ON_NEW_PAGE.toLowerCase()) {
    options.DISPLAY_SCRIP_INDEX = INDEX_ON_NEW_PAGE;
  }
  else if (options.DISPLAY_SCRIP_INDEX && options.DISPLAY_SCRIP_INDEX.toLowerCase() == INDEX_NO_PAGE_BREAK.toLowerCase()) {
    options.DISPLAY_SCRIP_INDEX = INDEX_NO_PAGE_BREAK;
  }
  else {
    options.DISPLAY_SCRIP_INDEX = INDEX_OFF;
  }

  if (options.DISPLAY_CAT_INDEX && options.DISPLAY_CAT_INDEX.toLowerCase() == INDEX_ON_NEW_PAGE.toLowerCase()) {
    options.DISPLAY_CAT_INDEX = INDEX_ON_NEW_PAGE;
  }
  else if (options.DISPLAY_CAT_INDEX && options.DISPLAY_CAT_INDEX.toLowerCase() == INDEX_NO_PAGE_BREAK.toLowerCase()) {
    options.DISPLAY_CAT_INDEX = INDEX_NO_PAGE_BREAK;
  }
  else {
    options.DISPLAY_CAT_INDEX = INDEX_OFF;
  }

  if (!options.RESIZE_PERCENT && options.RESIZE_PERCENT != 0) {
    options.RESIZE_PERCENT = 1;
  }
  else{
    options.RESIZE_PERCENT = options.RESIZE_PERCENT / 100.0;
  }

  if (!options.INDEX_CAT_EXCLUDE) {
    options.INDEX_CAT_EXCLUDE = [];
  }
  else {
    options.INDEX_CAT_EXCLUDE = [options.INDEX_CAT_EXCLUDE.split(',').map(c => c.trim())];
  }

  // Margin Conversion from inches to pt
  options.PAPER_MARGIN_LEFT = options.PAPER_MARGIN_LEFT * inch;
  options.PAPER_MARGIN_RIGHT = options.PAPER_MARGIN_RIGHT * inch;
  options.PAPER_MARGIN_TOP = options.PAPER_MARGIN_TOP * inch;
  options.PAPER_MARGIN_BOTTOM = options.PAPER_MARGIN_BOTTOM * inch;

  options.PAGE_MARGIN_LEFT = options.PAGE_MARGIN_LEFT * inch;
  options.PAGE_MARGIN_RIGHT = options.PAGE_MARGIN_RIGHT * inch;
  options.PAGE_MARGIN_TOP = options.PAGE_MARGIN_TOP * inch;
  options.PAGE_MARGIN_BOTTOM = options.PAGE_MARGIN_BOTTOM * inch;

  options.PAPER_MARGIN_GUTTER = options.PAPER_MARGIN_GUTTER * inch;
  options.COLUMN_GUTTER = options.COLUMN_GUTTER * inch;


  // page layout init after almost everything so it can play with options as needed
  options.page_layout     = new page_layouts[options.PAGE_LAYOUT_NAME](options); 

  // these go last since they are derived from the layout
  options.PAGE_WIDTH      = options.page_layout.get_page_width();
  options.PAGE_HEIGHT     = options.page_layout.get_page_height();

  if (!options.CCLI || options.CCLI == 'null') {
    options.CCLI          = '__________';
  }
  return options;
}
