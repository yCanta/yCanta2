// A small, realistic church on the LOCAL test CouchDB for trying the app: church_a with a church admin
// (alice), an editor (eddie), members (vera, vic), an old-style tagged editor (leo), the save rules,
// a category list, and a few songs and a songbook by different people.
import { readFileSync } from 'node:fs';
import { req, as, makeUser, freshDb } from './lib.mjs';

const DB = 'church_a';
await freshDb(DB);
for (const u of ['alice', 'eddie', 'vera', 'vic', 'olly']) await makeUser(u);
await makeUser('leo', ['church_a-editor']);
await req(as('admin'), 'PUT', `/${DB}/_security`, {
  admins: { names: ['alice'], roles: [] },
  members: { names: ['eddie', 'vera', 'vic'], roles: ['church_a-editor', '_admin'] },
  editors: { names: ['eddie'] },
});
await req(as('admin'), 'PUT', `/${DB}/_design/auth`, { validate_doc_update: readFileSync(new URL('./validate.js', import.meta.url), 'utf8') });
await req(as('alice'), 'PUT', `/${DB}/categories`, { categories: ['Joy', 'Hope', 'Praise'] });

const now = Date.now();
const song = (id, title, by, i) => ({
  _id: id, title, addedBy: 'u-' + by, editedBy: 'u-' + by, added: now - i * 1000, edited: now - i * 1000,
  authors: ['Test Author'], scripture_ref: [''], introduction: '', key: 'G', categories: ['Joy'], cclis: false,
  yt: '', chords: '', copyright: '', content: [[{ type: 'verse' }, [['la la la']]]],
  search: `t:${title}\u0000a:Test Author\u0000addedBy:${by}\u0000`,
});
const saves = [
  ['eddie', song('s-eddie-1', "Eddie's Song", 'eddie', 1)],
  ['vera', song('s-vera-1', "Vera's Song", 'vera', 2)],
  ['vic', song('s-vic-1', "Vic's Song", 'vic', 3)],
  ['eddie', { _id: 'sb-eddie-1', title: "Eddie's Songbook", addedBy: 'u-eddie', editedBy: 'u-eddie', added: now, edited: now, showStatus: false, showComments: true, songrefs: [{ id: 's-eddie-1', status: 'n', key: 'G' }, { id: 's-vera-1', status: 'n', key: 'G' }] }],
];
for (const [who, doc] of saves) {
  const r = await req(as(who), 'PUT', `/${DB}/${doc._id}`, doc);
  if (r.status !== 201) console.log('seed failed', doc._id, r);
}
console.log('seeded', DB, (await req(as('admin'), 'GET', `/${DB}`)).json.doc_count, 'docs');
