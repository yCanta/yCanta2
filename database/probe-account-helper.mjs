// What could an account-making helper (e.g. in Apps Script) do with an account that is an admin of the
// _users database only? Run against the LOCAL test server after test-rule.mjs.
import { req, as, makeUser, BASE, pw } from './lib.mjs';

const out = {};
await makeUser('maker');
// close sign-up again, and make "maker" an admin of the account list only
out.closeSignup = (await req(as('admin'), 'PUT', '/_users/_security', { admins: { names: ['maker'], roles: [] }, members: { names: [], roles: ['_admin'] } })).status;

const userDoc = (name, roles = [], extra = {}) => ({ _id: 'org.couchdb.user:' + name, name, type: 'user', roles, password: pw(name), ...extra });
async function clear(name) {
  const r = await req(as('admin'), 'GET', '/_users/org.couchdb.user:' + name);
  if (r.status === 200) await req(as('admin'), 'DELETE', `/_users/org.couchdb.user:${name}?rev=${r.json._rev}`);
}
for (const n of ['anon3', 'made1', 'made2', 'made3']) await clear(n);

out.anonymousSignupNowClosed = (await req(null, 'PUT', '/_users/org.couchdb.user:anon3', userDoc('anon3'))).status;
out.makerCreatesAccount = (await req(as('maker'), 'PUT', '/_users/org.couchdb.user:made1', userDoc('made1'))).status;
const vera = (await req(as('maker'), 'GET', '/_users/org.couchdb.user:vera')).json;
out.makerResetsPassword = (await req(as('maker'), 'PUT', '/_users/org.couchdb.user:vera', { ...vera, password: pw('vera') })).status;
out.makerGivesOldEditorTag = (await req(as('maker'), 'PUT', '/_users/org.couchdb.user:made2', userDoc('made2', ['church_a-editor']))).status;
out.makerGivesServerAdmin = (await req(as('maker'), 'PUT', '/_users/org.couchdb.user:made3', userDoc('made3', ['_admin']))).json;
out.makerReadsChurch = (await req(as('maker'), 'GET', '/church_a/_all_docs')).status;
out.makerReadsServerConfig = (await req(as('maker'), 'GET', '/_node/_local/_config')).status;
out.makerChangesChurchList = (await req(as('maker'), 'PUT', '/church_a/_security', { admins: { names: ['maker'] }, members: {} })).status;

// How the helper would check who is asking: the church admin's app sends its session cookie,
// the helper asks CouchDB who that is, then reads that church's admin list with the same cookie.
const login = await fetch(BASE + '/_session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'alice', password: pw('alice') }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
const who = await (await fetch(BASE + '/_session', { headers: { Cookie: cookie } })).json();
const sec = await (await fetch(BASE + '/church_a/_security', { headers: { Cookie: cookie } })).json();
out.helperSeesCaller = who.userCtx.name;
out.callerIsChurchAdmin = sec.admins.names.includes(who.userCtx.name);
const fake = await (await fetch(BASE + '/_session', { headers: { Cookie: 'AuthSession=bogus' } })).json();
out.forgedCookieGives = fake.userCtx?.name ?? fake;
const sessionCfg = (await req(as('admin'), 'GET', '/_node/_local/_config/chttpd_auth/timeout')).json;
out.sessionTimeoutSeconds = sessionCfg;

console.log(JSON.stringify(out, null, 1));
