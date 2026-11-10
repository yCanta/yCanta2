// Tiny CouchDB client for a LOCAL test server only. Never point it at a live server: it deletes and
// recreates the church_a database and makes fake users.
// The local server admin's password comes from COUCH_ADMIN_PASS or couchdb/.admin-pass (not committed).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = 'http://127.0.0.1:5984';
const here = dirname(fileURLToPath(import.meta.url));
export const ADMIN = {
  name: process.env.COUCH_ADMIN_NAME || 'admin',
  pass: (process.env.COUCH_ADMIN_PASS || readFileSync(join(here, '.admin-pass'), 'utf8')).trim(),
};
export const pw = name => 'local-test-' + name; // fake users on the local test server only

export async function req(user, method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = 'Basic ' + Buffer.from(`${user.name}:${user.pass ?? pw(user.name)}`).toString('base64');
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json; try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}
export const as = name => (name === 'admin' ? ADMIN : { name });

export async function makeUser(name, roles = []) {
  const id = 'org.couchdb.user:' + name;
  const old = await req(ADMIN, 'GET', '/_users/' + encodeURIComponent(id));
  const doc = { _id: id, name, type: 'user', roles, password: pw(name) };
  if (old.status === 200) doc._rev = old.json._rev;
  return req(ADMIN, 'PUT', '/_users/' + encodeURIComponent(id), doc);
}
export async function freshDb(db) {
  await req(ADMIN, 'DELETE', '/' + db);
  return req(ADMIN, 'PUT', '/' + db);
}
