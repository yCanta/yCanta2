// The Bible text for presentations (#157): which book a reference means, which verses, and their text in a
// public-domain translation. The text is one JSON file per book under bible/<translation>/ (bible/build.mjs
// makes them); a book is fetched the first time it's used and sw.js keeps it for offline use. The app and
// the presentation window both load this file, so it uses nothing else from the app.
//
//   await Bible.passage('John 3:16-18', 'BSB')
//     -> { label: 'John 3:16–18', translation: {id, name, credit}, verses: [{ book, chapter, verse, text }] }
//   Bible.parse('Ps 95:1, 2, 6, 7')    -> { label, parts: [{ book, chapter, from, to }] } or { error }
const Bible = (() => {
  let base = 'bible/'; // where the files are: set to a full address in the presentation window (it has no page address of its own)
  let books = null; // [{ id, name, chapters, verses: [verse count of each chapter] }] from bible/books.json
  let translations = null; // [{ id, name, credit, source }] from bible/translations.json
  const bookFiles = new Map(); // 'BSB/JHN' -> its chapters, or the promise of them
  const MAX_VERSES = 200; // a whole book typed by mistake shouldn't make a thousand slides (Psalm 119 is 176)

  // Short names people write, besides each book's own name (which also works shortened, if only one book
  // starts that way: "Philip" is Philippians, "Jo" is too many books)
  const ALIASES = {
    GEN: 'gen ge gn', EXO: 'ex exo exod', LEV: 'lev le lv', NUM: 'num nu nm nb', DEU: 'deut deu dt',
    JOS: 'josh jos jsh', JDG: 'judg jdg jg jdgs', RUT: 'ruth rth ru', '1SA': '1sam 1sa 1sm', '2SA': '2sam 2sa 2sm',
    '1KI': '1kgs 1ki 1kg', '2KI': '2kgs 2ki 2kg', '1CH': '1chr 1ch 1chron', '2CH': '2chr 2ch 2chron',
    EZR: 'ezra ezr', NEH: 'neh ne', EST: 'esth est es', JOB: 'job jb', PSA: 'ps psa pss psalm psm',
    PRO: 'prov pro prv pr', ECC: 'eccl ecc eccles qoh', SNG: 'song sos sng songofsongs canticles',
    ISA: 'isa is', JER: 'jer je jr', LAM: 'lam la', EZK: 'ezek eze ezk', DAN: 'dan da dn', HOS: 'hos ho',
    JOL: 'joel jl', AMO: 'amos am', OBA: 'obad ob oba', JON: 'jonah jon jnh', MIC: 'mic mi', NAM: 'nah na',
    HAB: 'hab hb', ZEP: 'zeph zep zp', HAG: 'hag hg', ZEC: 'zech zec zc', MAL: 'mal ml', MAT: 'matt mt mat',
    MRK: 'mark mk mr mrk', LUK: 'luke lk lu luk', JHN: 'john jn jhn joh', ACT: 'acts ac act', ROM: 'rom ro rm',
    '1CO': '1cor 1co', '2CO': '2cor 2co', GAL: 'gal ga', EPH: 'eph ephes', PHP: 'phil php pp philipp',
    COL: 'col co', '1TH': '1thess 1th 1thes', '2TH': '2thess 2th 2thes', '1TI': '1tim 1ti 1tm', '2TI': '2tim 2ti 2tm',
    TIT: 'titus tit ti', PHM: 'philem phm pm phlm', HEB: 'heb he', JAS: 'jas jm jam james',
    '1PE': '1pet 1pe 1pt', '2PE': '2pet 2pe 2pt', '1JN': '1john 1jn 1jo 1jhn', '2JN': '2john 2jn 2jo 2jhn',
    '3JN': '3john 3jn 3jo 3jhn', JUD: 'jude jud jd', REV: 'rev re rv revelations apocalypse',
  };
  let aliasMap = null;
  const squash = text => text.toLowerCase().replace(/[.\s]/g, '');

  async function getJson(path) {
    const res = await fetch(base + path);
    if (!res.ok) throw new Error(`Couldn't load the Bible (${res.status}).`);
    return res.json();
  }

  // The book list and translations, once
  async function ready() {
    if (!books) {
      const [b, t] = await Promise.all([getJson('books.json'), getJson('translations.json')]);
      books = b;
      translations = t;
      aliasMap = new Map();
      books.forEach(book => {
        aliasMap.set(squash(book.name), book);
        (ALIASES[book.id] || '').split(' ').filter(Boolean).forEach(alias => aliasMap.set(alias, book));
      });
    }
    return books;
  }

  // "1 John", "I Jn", "First John", "Ps." -> the book, or null
  function findBook(name) {
    let text = name.trim().toLowerCase().replace(/^(first|i)\s+/, '1 ').replace(/^(second|ii)\s+/, '2 ').replace(/^(third|iii)\s+/, '3 ');
    const key = squash(text);
    if (!key) return null;
    if (aliasMap.has(key)) return aliasMap.get(key);
    const starts = books.filter(book => squash(book.name).startsWith(key));
    return key.length >= 3 && starts.length === 1 ? starts[0] : null;
  }

  // A reference -> its parts, each one chapter's run of verses (no more than maxVerses in all). A list goes on
  // with the same book ("Ps 95:1, 6", "Rom 8:19; 12:1") until another book is named. A book with one chapter
  // takes "Jude 3" as verse 3.
  function parse(text, maxVerses = MAX_VERSES) {
    if (!books) return { error: 'The Bible is still loading.' };
    const parts = [];
    let book = null, chapter = null;
    const pieces = String(text).replace(/[–—]/g, '-').split(/[;,]/).map(p => p.trim()).filter(Boolean);
    if (!pieces.length) return { error: 'Type a reference, like John 3:16.' };
    for (const piece of pieces) {
      const m = /^(.*?[a-z].*?)?\s*(\d+)(?::(\d+))?(?:\s*-\s*(\d+)(?::(\d+))?)?\s*$/i.exec(piece);
      if (!m) return { error: `"${piece}" isn't a reference.` };
      let [, name, a, b, c, d] = m;
      if (name) {
        book = findBook(name);
        if (!book) {
          // "Jo" starts several books: name them, instead of saying it isn't one
          const key = squash(name.trim().toLowerCase());
          const could = key ? books.filter(b => squash(b.name).startsWith(key)).map(b => b.name) : [];
          if (could.length > 1) {
            return { error: `"${name.trim()}" could be ${could.slice(0, 5).join(', ')}${could.length > 5 ? '…' : ''}. Type more of the name.` };
          }
          return { error: `"${name.trim()}" isn't a book of the Bible.` };
        }
        chapter = null;
      }
      if (!book) return { error: 'Start with a book, like John 3:16.' };
      const nums = [a, b, c, d].map(n => (n === undefined ? undefined : Number(n)));
      const oneChapter = book.chapters === 1;
      let from, to;
      if (nums[1] !== undefined) { // 3:16, 3:16-18, 3:16-4:2
        chapter = nums[0];
        from = { chapter, verse: nums[1] };
        to = nums[3] !== undefined ? { chapter: nums[2], verse: nums[3] } : { chapter, verse: nums[2] ?? nums[1] };
      } else if (oneChapter || (!name && chapter)) { // Jude 3, or "Ps 95:1, 2": more verses of the chapter
        chapter = chapter || 1;
        from = { chapter, verse: nums[0] };
        to = { chapter, verse: nums[2] ?? nums[0] };
      } else { // Ps 23, Ps 1-2: whole chapters
        from = { chapter: nums[0], verse: 1 };
        const last = nums[2] ?? nums[0];
        to = { chapter: last, verse: book.verses[last - 1] };
        chapter = null;
      }
      if (!book.verses[from.chapter - 1] || !book.verses[to.chapter - 1]) {
        return { error: `${book.name} has ${book.chapters} chapter${book.chapters === 1 ? '' : 's'}.` };
      }
      for (let ch = from.chapter; ch <= to.chapter; ch++) {
        const first = ch === from.chapter ? from.verse : 1;
        const last = Math.min(ch === to.chapter ? to.verse : book.verses[ch - 1], book.verses[ch - 1]);
        if (first > last) return { error: `${book.name} ${ch} has ${book.verses[ch - 1]} verses.` };
        parts.push({ book, chapter: ch, from: first, to: last });
      }
    }
    const count = parts.reduce((n, p) => n + p.to - p.from + 1, 0);
    if (count > maxVerses) return { error: `That's ${count} verses. Show at most ${maxVerses} at a time.` };
    return { parts, label: label(parts) };
  }

  // The reference as a title: "John 3:16–18", "Psalm 23", "Psalms 1–2", "John 3:16–4:2", "Psalm 95:1, 2, 6, 7",
  // "Romans 8:19; 12:1; Revelation 7:9". A run that goes on into the next chapter is written as one range.
  function label(parts) {
    const runs = [];
    parts.forEach(p => {
      const run = runs.at(-1);
      if (run && run.book === p.book && p.chapter === run.toChapter + 1 && p.from === 1
          && run.to === p.book.verses[run.toChapter - 1]) {
        run.toChapter = p.chapter;
        run.to = p.to;
      } else {
        runs.push({ book: p.book, chapter: p.chapter, from: p.from, toChapter: p.chapter, to: p.to });
      }
    });
    let out = '', lastBook = null, lastChapter = null;
    runs.forEach((r, i) => {
      const oneChapter = r.book.chapters === 1;
      const startsChapter = r.from === 1, endsChapter = r.to === r.book.verses[r.toChapter - 1];
      let ref;
      if (r.toChapter !== r.chapter) {
        ref = startsChapter && endsChapter ? `${r.chapter}–${r.toChapter}` : `${r.chapter}:${r.from}–${r.toChapter}:${r.to}`;
      } else {
        const verses = r.from === r.to ? `${r.from}` : `${r.from}–${r.to}`;
        ref = oneChapter ? verses : startsChapter && endsChapter ? `${r.chapter}` : `${r.chapter}:${verses}`;
      }
      if (r.book !== lastBook) {
        const name = r.book.name === 'Psalms' && r.toChapter === r.chapter ? 'Psalm' : r.book.name;
        out += (i ? '; ' : '') + `${name} ${ref}`;
      } else if (r.chapter === lastChapter && r.toChapter === r.chapter && (oneChapter || ref.includes(':'))) {
        out += `, ${ref.slice(ref.indexOf(':') + 1)}`; // more verses of the same chapter: "95:1, 2, 6"
      } else {
        out += `; ${ref}`;
      }
      lastBook = r.book;
      lastChapter = r.toChapter;
    });
    return out;
  }

  // One book of a translation, fetched once (and kept offline by sw.js)
  function bookText(translation, bookId) {
    const key = `${translation}/${bookId}`;
    if (!bookFiles.has(key)) {
      const loading = getJson(`${key}.json`).then(file => file.c, err => { bookFiles.delete(key); throw err; });
      bookFiles.set(key, loading);
    }
    return bookFiles.get(key);
  }

  function translation(id) {
    return translations.find(t => t.id === id) || translations[0];
  }

  // The verses of a reference, with their text
  async function passage(text, translationId) {
    await ready();
    const found = parse(text);
    if (found.error) throw new Error(found.error);
    const t = translation(translationId);
    const verses = [];
    for (const part of found.parts) {
      const chapters = await bookText(t.id, part.book.id);
      for (let v = part.from; v <= part.to; v++) {
        const words = chapters[part.chapter - 1]?.[v - 1];
        if (words) verses.push({ book: part.book.id, chapter: part.chapter, verse: v, text: words });
      }
    }
    return { label: found.label, translation: t, verses };
  }

  // Fetch ahead the books some references name (a songbook about to be presented), so they work offline.
  // References that don't parse are skipped.
  async function prefetch(refs, translationId) {
    await ready();
    const t = translation(translationId);
    const ids = new Set();
    refs.forEach(ref => (parse(ref).parts || []).forEach(p => ids.add(p.book.id)));
    await Promise.all([...ids].map(id => bookText(t.id, id).catch(() => {})));
    return ids.size;
  }

  // Is this the start of a reference ("John ", "1 Jn", "Ps 23:")? So the presentation's search box lets numbers
  // be typed after a book's name instead of picking a search result.
  function startsWithBook(text) {
    if (!books) return false;
    const name = /^\s*(\d?\s*[^\d:]*?)\s*(\d|$)/.exec(text)?.[1] || '';
    return /[a-z]/i.test(name) && !!findBook(name);
  }

  return {
    setBase(url) { base = url; },
    ready, parse, passage, prefetch, startsWithBook,
    translations: () => translations || [],
  };
})();
