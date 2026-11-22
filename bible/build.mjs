// Builds the Bible text the app shows in presentations (#157), one small JSON file per book, from the Free
// Use Bible API's public-domain translations (https://bible.helloao.org/docs/). The files live in this repo
// and are served with the app, so the app never depends on that site, and a book is fetched only when it's
// first used (sw.js keeps it for offline use).
//
//   node bible/build.mjs            (writes bible/<ID>/<BOOK>.json, bible/books.json, bible/translations.json)
//
// Each book file: { "id": "JHN", "c": [ ["verse 1", "verse 2", ...], ...chapters ] }. A verse a translation
// leaves out is null. A verse's text keeps poetry's line breaks (\n); headings and notes are dropped.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const API = 'https://bible.helloao.org/api';
// Only public-domain translations: they can be kept offline and shown without a license (see #157)
const TRANSLATIONS = [
  { id: 'BSB', from: 'BSB', name: 'Berean Standard Bible', credit: 'Berean Standard Bible (BSB), public domain' },
  { id: 'WEB', from: 'ENGWEBP', name: 'World English Bible', credit: 'World English Bible (WEB), public domain' },
  { id: 'KJV', from: 'eng_kjv', name: 'King James Version', credit: 'King James Version (KJV)' },
];

const getJson = async url => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
};

const books = [];
const translations = [];
for (const t of TRANSLATIONS) {
  const info = (await getJson(`${API}/available_translations.json`)).translations.find(x => x.id === t.from);
  if (!info?.license?.publicDomain) throw new Error(`${t.from} isn't marked public domain; check before adding it`);
  const whole = await getJson(`${API}/${t.from}/complete.simple.json`);
  await mkdir(join(HERE, t.id), { recursive: true });
  let bytes = 0;
  for (const book of whole.books) {
    const chapters = book.chapters.map(({ chapter }) => {
      const verses = [];
      chapter.content.filter(item => item.type === 'verse').forEach(v => {
        // without the KJV's ¶ paragraph marks
        verses[v.number - 1] = String(v.text ?? '').replace(/¶/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
      });
      return Array.from(verses, v => v ?? null);
    });
    const text = JSON.stringify({ id: book.id, c: chapters });
    bytes += text.length;
    await writeFile(join(HERE, t.id, `${book.id}.json`), text);
    if (t === TRANSLATIONS[0]) {
      books.push({ id: book.id, name: book.commonName, chapters: chapters.length, verses: chapters.map(c => c.length) });
    }
  }
  translations.push({ id: t.id, name: t.name, credit: t.credit, source: info.licenseUrl });
  console.log(`${t.id}: ${whole.books.length} books, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}
await writeFile(join(HERE, 'books.json'), JSON.stringify(books));
await writeFile(join(HERE, 'translations.json'), JSON.stringify(translations, null, 1));
