// Checks the shared presentations save rule (live-validate.js, #51) on the LOCAL test CouchDB.
// Run seed-local-church.mjs first (it makes the users and sets up ycanta_live).
import { req, as, BASE } from './lib.mjs';

const DB = 'ycanta_live';
let failed = 0, passed = 0;
function check(name, ok, got) {
  if (ok) passed++;
  else { failed++; console.log('FAIL', name, JSON.stringify(got)); }
}
const code = 'T' + Math.random().toString(36).slice(2, 5).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
const set = owner => ({ type: 'live-set', owner, title: 'Test', songs: [] });

const anon = await fetch(`${BASE}/${DB}/set:${code}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(set('alice')) });
check('no one signed in: can\'t share', anon.status === 401, anon.status);

const notMine = await req(as('vera'), 'PUT', `/${DB}/set:${code}`, set('alice'));
check('can\'t share in someone else\'s name', notMine.status === 403, notMine);

const made = await req(as('alice'), 'PUT', `/${DB}/set:${code}`, set('alice'));
check('signed in: can share', made.status === 201, made);

const read = await fetch(`${BASE}/${DB}/set:${code}`);
check('anyone can read a share', read.status === 200, read.status);
const changes = await fetch(`${BASE}/${DB}/_changes?filter=_doc_ids&doc_ids=${encodeURIComponent(JSON.stringify(['set:' + code]))}`);
check('anyone can follow changes', changes.status === 200, changes.status);

const taken = await req(as('vera'), 'PUT', `/${DB}/set:${code}`, { ...set('vera'), _rev: made.json.rev });
check('someone else can\'t change it', taken.status === 403, taken);

const now = await req(as('alice'), 'PUT', `/${DB}/now:${code}`, { type: 'live-now', owner: 'alice', index: 0, id: 's-1', part: 0 });
check('the sharer can write now:', now.status === 201, now);

const wrongType = await req(as('alice'), 'PUT', `/${DB}/now:${code}`, { type: 'live-set', owner: 'alice', _rev: now.json.rev });
check('the type must match the name', wrongType.status === 403, wrongType);

const badName = await req(as('alice'), 'PUT', `/${DB}/other`, { type: 'live-set', owner: 'alice' });
check('only set: and now: records', badName.status === 403, badName);

const veraDelete = await req(as('vera'), 'DELETE', `/${DB}/set:${code}?rev=${made.json.rev}`);
check('someone else can\'t end it', veraDelete.status === 403, veraDelete);

const gone = await req(as('alice'), 'DELETE', `/${DB}/set:${code}?rev=${made.json.rev}`);
const gone2 = await req(as('alice'), 'DELETE', `/${DB}/now:${code}?rev=${now.json.rev}`);
check('the sharer can end it', gone.status === 200 && gone2.status === 200, [gone, gone2]);

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
