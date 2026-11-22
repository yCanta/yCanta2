// Sets up ycanta_live, the shared presentations database (#51), on the LOCAL test CouchDB. Safe to run
// again: it keeps the database and only updates its settings. seed-local-church.mjs runs it too.
// For the live server, do the same steps by hand in Fauxton (see README.md, "Shared presentations").
import { readFileSync } from 'node:fs';
import { req, as } from './lib.mjs';

const DB = 'ycanta_live';
const made = await req(as('admin'), 'PUT', `/${DB}`);
if (made.status !== 201 && made.status !== 412) throw new Error(`Couldn't make ${DB}: ${JSON.stringify(made)}`);
// No members: anyone can read, so a TV or a phone can follow with no account
await req(as('admin'), 'PUT', `/${DB}/_security`, { admins: { names: [], roles: [] }, members: { names: [], roles: [] } });
const old = await req(as('admin'), 'GET', `/${DB}/_design/live`);
await req(as('admin'), 'PUT', `/${DB}/_design/live`, {
  ...(old.status === 200 ? { _rev: old.json._rev } : {}),
  validate_doc_update: readFileSync(new URL('./live-validate.js', import.meta.url), 'utf8'),
});
// Each slide change is a new version of now:CODE; keep only a few old ones
await req(as('admin'), 'PUT', `/${DB}/_revs_limit`, 10);
console.log('set up', DB);
