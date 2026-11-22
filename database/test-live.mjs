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

// A signed-in leader following along, and handing the screens to them
const leadOk = await req(as('vera'), 'PUT', `/${DB}/lead:${code}:vera`, { type: 'live-lead', owner: 'vera' });
check('a leader can say they are following', leadOk.status === 201, leadOk);
const leadOther = await req(as('vera'), 'PUT', `/${DB}/lead:${code}:alice`, { type: 'live-lead', owner: 'vera' });
check('a leader record is only your own', leadOther.status === 403, leadOther);
let nowRev = now.json.rev;
const veraTooSoon = await req(as('vera'), 'PUT', `/${DB}/now:${code}`, { type: 'live-now', owner: 'alice', driver: 'vera', part: 1, _rev: nowRev });
check('a leader can\'t take the screens', veraTooSoon.status === 403, veraTooSoon);
const handed = await req(as('alice'), 'PUT', `/${DB}/now:${code}`, { type: 'live-now', owner: 'alice', driver: 'vera', part: 1, _rev: nowRev });
check('the sharer can hand the screens to a leader', handed.status === 201, handed);
nowRev = handed.json.rev;
const veraMoves = await req(as('vera'), 'PUT', `/${DB}/now:${code}`, { type: 'live-now', owner: 'alice', driver: 'vera', part: 2, _rev: nowRev });
check('the leader can move the screens', veraMoves.status === 201, veraMoves);
nowRev = veraMoves.json.rev;
const passOn = await req(as('vera'), 'PUT', `/${DB}/now:${code}`, { type: 'live-now', owner: 'alice', driver: 'eddie', part: 2, _rev: nowRev });
check('the leader can\'t pass the screens on', passOn.status === 403, passOn);
const newOwner = await req(as('vera'), 'PUT', `/${DB}/now:${code}`, { type: 'live-now', owner: 'vera', driver: 'vera', part: 2, _rev: nowRev });
check('the leader can\'t become the owner', newOwner.status === 403, newOwner);
const veraEnds = await req(as('vera'), 'DELETE', `/${DB}/now:${code}?rev=${nowRev}`);
check('the leader can\'t end it', veraEnds.status === 403, veraEnds);
const veraSet = await req(as('vera'), 'PUT', `/${DB}/set:${code}`, { ...set('alice'), title: 'Changed', _rev: made.json.rev });
check('the leader can\'t change the songs', veraSet.status === 403, veraSet);
const gaveBack = await req(as('vera'), 'PUT', `/${DB}/now:${code}`, { type: 'live-now', owner: 'alice', driver: 'alice', part: 2, _rev: nowRev });
check('the leader can give the screens back', gaveBack.status === 201, gaveBack);
nowRev = gaveBack.json.rev;
const veraAfter = await req(as('vera'), 'PUT', `/${DB}/now:${code}`, { type: 'live-now', owner: 'alice', driver: 'vera', part: 3, _rev: nowRev });
check('after giving back, the leader can\'t move them', veraAfter.status === 403, veraAfter);
const leadGone = await req(as('vera'), 'DELETE', `/${DB}/lead:${code}:vera?rev=${leadOk.json.rev}`);
check('a leader can leave', leadGone.status === 200, leadGone);
now.json.rev = nowRev;

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
