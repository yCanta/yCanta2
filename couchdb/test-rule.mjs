// Every save rule, as every kind of user, against the local test server.
import { readFileSync } from 'node:fs';
import { req, as, makeUser, freshDb } from './lib.mjs';

const DB = 'church_a';
const validate = readFileSync(new URL('./validate.js', import.meta.url), 'utf8');

await freshDb(DB);
for (const u of ['alice', 'eddie', 'vera', 'vic', 'olly']) await makeUser(u);
await makeUser('leo', ['church_a-editor']);
await req(as('admin'), 'PUT', `/${DB}/_security`, {
  admins: { names: ['alice'], roles: [] },
  members: { names: ['eddie', 'vera', 'vic'], roles: ['church_a-editor'] },
  editors: { names: ['eddie'] },
});
const ddoc = await req(as('admin'), 'PUT', `/${DB}/_design/auth`, { validate_doc_update: validate });
if (ddoc.status !== 201) { console.log('design doc failed', ddoc); process.exit(1); }

let pass = 0, fail = 0;
const rows = [];
async function expect(label, allowed, who, method, path, body) {
  const r = await req(who ? as(who) : null, method, `/${DB}/${path}`, body);
  const ok = r.status < 300;
  const good = ok === allowed;
  good ? pass++ : fail++;
  rows.push(`${good ? 'PASS' : 'FAIL'}  ${allowed ? 'allow' : 'deny '}  ${String(r.status).padEnd(3)}  ${label}${ok ? '' : '  -> ' + (r.json?.reason || r.json?.error)}`);
  return r;
}
const get = async id => (await req(as('admin'), 'GET', `/${DB}/${encodeURIComponent(id)}`)).json;
const put = (label, allowed, who, doc) => expect(label, allowed, who, 'PUT', encodeURIComponent(doc._id), doc);
const song = (id, by, extra = {}) => ({ _id: id, title: 'Song ' + id, content: 'la', addedBy: 'u-' + by, editedBy: 'u-' + by, ...extra });

// --- songs and songbooks
await put('viewer adds own song', true, 'vera', song('s-vera1', 'vera'));
await put('viewer adds song credited to someone else', false, 'vera', song('s-fake', 'eddie'));
await put('editor adds song', true, 'eddie', song('s-eddie1', 'eddie'));
await put('viewer edits own song', true, 'vera', { ...(await get('s-vera1')), title: 'Vera edited' });
await put("viewer edits editor's song", false, 'vera', { ...(await get('s-eddie1')), title: 'nope' });
await put("viewer hands own song to someone else", false, 'vera', { ...(await get('s-vera1')), addedBy: 'u-vic' });
await put("editor edits viewer's song", true, 'eddie', { ...(await get('s-vera1')), title: 'Eddie edited' });
await put("old-tag editor edits viewer's song", true, 'leo', { ...(await get('s-vera1')), title: 'Leo edited' });
await put("church admin edits anything", true, 'alice', { ...(await get('s-eddie1')), title: 'Alice edited' });
await put("other viewer edits viewer's song", false, 'vic', { ...(await get('s-vera1')), title: 'vic' });
await put('viewer adds own songbook', true, 'vera', { _id: 'sb-vera1', title: 'Book', songrefs: [], addedBy: 'u-vera' });
await put("viewer adds a song to editor's songbook", false, 'vera', { _id: 'sb-eddie1', title: 'E', songrefs: [], addedBy: 'u-eddie' });

// delete and restore (whole-doc delete, as the Trash branch does it)
const v1 = await get('s-vera1');
const del = await put('viewer deletes own song (keeps body)', true, 'vera', { ...v1, _deleted: true, deletedBy: 'u-vera', deletedAt: Date.now() });
const tomb = (await req(as('admin'), 'GET', `/${DB}/s-vera1?rev=${del.json.rev}&revs=true`)).json;
const { _deleted, deletedBy, deletedAt, _revisions, ...restored } = tomb;
// The app restores on the device and sync carries it up, so send it the way sync does (new_edits:false)
const synced = (hash) => ({ new_edits: false, docs: [{ ...restored, _rev: `${_revisions.start + 1}-${hash}`, _revisions: { start: _revisions.start + 1, ids: [hash, ..._revisions.ids] } }] });
const syncRestore = async (label, allowed, who, hash) => {
  const r = await req(as(who), 'POST', `/${DB}/_bulk_docs`, synced(hash));
  const ok = r.status === 201 && !(r.json?.[0]?.error);
  const good = ok === allowed; good ? pass++ : fail++;
  rows.push(`${good ? 'PASS' : 'FAIL'}  ${allowed ? 'allow' : 'deny '}  ${r.status}  ${label}${ok ? '' : '  -> ' + (r.json?.[0]?.reason || r.json?.reason)}`);
};
await syncRestore('other viewer restores it (via sync)', false, 'vic', 'aaaa1111');
await syncRestore('viewer restores own song (via sync)', true, 'vera', 'bbbb2222');
const live = (await req(as('admin'), 'GET', `/${DB}/s-vera1`)).json;
const back = live.title === v1.title && !live._deleted; back ? pass++ : fail++;
rows.push(`${back ? 'PASS' : 'FAIL'}  restored song is live with its title: ${live.title} (${live._rev})`);
await put("viewer deletes editor's song", false, 'vera', { ...(await get('s-eddie1')), _deleted: true });
const v1b = await get('s-vera1');
await expect('viewer deletes own song the old way (no body)', true, 'vera', 'DELETE', `s-vera1?rev=${v1b._rev}`);
const e1 = await get('s-eddie1');
await expect('editor deletes any song the old way', true, 'eddie', 'DELETE', `s-eddie1?rev=${e1._rev}`);

// --- comments
await put('viewer starts a comment thread', true, 'vera', { _id: 'c_sb-x_s-y', comments: [{ date: 1, user: 'u-vera', comment: 'hi' }] });
let c = await get('c_sb-x_s-y');
await put('other viewer adds own comment', true, 'vic', { ...c, comments: [...c.comments, { date: 2, user: 'u-vic', comment: 'yo' }] });
c = await get('c_sb-x_s-y');
await put("viewer changes someone else's comment", false, 'vic', { ...c, comments: [{ ...c.comments[0], comment: 'edited' }, c.comments[1]] });
await put('viewer adds a comment as someone else', false, 'vic', { ...c, comments: [...c.comments, { date: 3, user: 'u-vera', comment: 'fake' }] });
await put('viewer removes comments', false, 'vic', { ...c, comments: [c.comments[1]] });
await put('viewer deletes the thread', false, 'vic', { ...c, _deleted: true });
await put('editor edits a comment', true, 'eddie', { ...c, comments: [{ ...c.comments[0], comment: 'tidied' }, c.comments[1]] });

// --- saved export settings
await put('viewer saves own export settings', true, 'vera', { _id: 'cfg-sb-x' + 'u-vera', cfg: [], name: '' });
await put('viewer saves own named export settings', true, 'vera', { _id: 'cfg-sb-x' + 'u-vera:Big Print', cfg: [], name: 'Big Print' });
await put("viewer saves someone else's export settings", false, 'vera', { _id: 'cfg-sb-x' + 'u-eddie', cfg: [], name: '' });
await put("viewer sneaks a name onto someone else's", false, 'vera', { _id: 'cfg-sb-x' + 'u-eddie:u-vera', cfg: [], name: '' });
const cfg = await get('cfg-sb-xu-vera');
await expect('viewer deletes own export settings', true, 'vera', 'DELETE', `cfg-sb-xu-vera?rev=${cfg._rev}`);

// --- profiles and favorites
await put('viewer creates own profile', true, 'vera', { _id: 'u-vera', name: 'vera', fav_sbs: [], fav_songs: [] });
await put('viewer adds a favorite', true, 'vera', { ...(await get('u-vera')), fav_songs: ['s-eddie1'] });
await put("viewer changes someone else's profile", false, 'vera', { _id: 'u-eddie', name: 'eddie', fav_sbs: [], fav_songs: [] });
await put("editor changes someone else's profile", false, 'eddie', { ...(await get('u-vera')), fav_songs: [] });
await put("church admin changes someone's profile", true, 'alice', { ...(await get('u-vera')), fav_songs: [] });

// --- category list
await put('church admin creates categories', true, 'alice', { _id: 'categories', categories: ['Joy'] });
await put('viewer changes categories', false, 'vera', { ...(await get('categories')), categories: ['x'] });
await put('editor changes categories', true, 'eddie', { ...(await get('categories')), categories: ['Joy', 'Hope'] });
const login = await put('viewer login re-puts categories with no rev (putIfNotExists)', false, 'vera', { _id: 'categories', categories: [] });
rows.push(`      -> status the app sees at login: ${login.status} (putIfNotExists only ignores 409)`);

// --- everything else
await put('viewer saves an unknown kind of doc', false, 'vera', { _id: 'x-thing' });
await put('editor saves an unknown kind of doc', false, 'eddie', { _id: 'x-thing' });
await put('church admin saves an unknown kind of doc', true, 'alice', { _id: 'x-thing' });
await expect('editor changes the rule itself', false, 'eddie', 'PUT', '_design/auth', { ...(await get('_design/auth')), validate_doc_update: 'function(){}' });
await expect('church admin can update the rule', true, 'alice', 'PUT', '_design/auth', { ...(await get('_design/auth')) });
await put('outsider saves anything', false, 'olly', song('s-olly', 'olly'));
await put('signed-out save', false, null, song('s-anon', 'anon'));

// --- sync: a phone pushing a mix of allowed and refused docs (PouchDB uses new_edits:false)
const bulk = await req(as('vera'), 'POST', `/${DB}/_bulk_docs`, { new_edits: false, docs: [
  { ...song('s-sync-ok', 'vera'), _rev: '1-aaaa' },
  { ...song('s-sync-bad', 'eddie'), _rev: '1-bbbb' },
] });
const okDoc = (await req(as('admin'), 'GET', `/${DB}/s-sync-ok`)).status;
const badDoc = (await req(as('admin'), 'GET', `/${DB}/s-sync-bad`)).status;
const goodSync = bulk.status === 201 && okDoc === 200 && badDoc === 404;
goodSync ? pass++ : fail++;
rows.push(`${goodSync ? 'PASS' : 'FAIL'}  sync push: allowed doc saved (${okDoc}), refused doc skipped (${badDoc}); reply ${JSON.stringify(bulk.json)}`);

console.log(rows.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
