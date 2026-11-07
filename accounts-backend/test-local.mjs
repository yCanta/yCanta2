// Runs Code.gs unchanged in Node, with stand-ins for the Apps Script services, against the LOCAL test
// CouchDB. Run couchdb/test-rule.mjs and couchdb/probe-account-helper.mjs first (they make church_a,
// church_b, the fake users and the accounts-only "maker" admin).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { req, as, pw, BASE } from '../couchdb/lib.mjs';

const props = { COUCH_URL: BASE + '/', MAKER_NAME: 'maker', MAKER_PASS: pw('maker') };
const logRows = [];

// UrlFetchApp is synchronous; do each request in a child Node process
const fetchChild = `
const [url, init] = JSON.parse(process.argv[1]);
fetch(url, init).then(async r => {
  const headers = {}; r.headers.forEach((v, k) => { headers[k === 'set-cookie' ? 'Set-Cookie' : k] = v; });
  process.stdout.write(JSON.stringify({ status: r.status, text: await r.text(), headers }));
});`;
const sandbox = {
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null }) },
  Utilities: { base64Encode: s => Buffer.from(s, 'utf8').toString('base64'), Charset: { UTF_8: 'UTF-8' } },
  UrlFetchApp: {
    fetch(url, p) {
      const headers = { ...(p.headers || {}) };
      if (p.contentType) headers['Content-Type'] = p.contentType;
      const out = JSON.parse(execFileSync(process.execPath, ['-e', fetchChild, JSON.stringify([url, { method: p.method.toUpperCase(), headers, body: p.payload }])]).toString());
      return { getResponseCode: () => out.status, getContentText: () => out.text, getAllHeaders: () => out.headers };
    },
  },
  ContentService: { createTextOutput: t => ({ text: t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({
    getSheetByName: () => ({ getLastRow: () => logRows.length, appendRow: r => logRows.push(r) }),
    insertSheet: () => null,
  }) },
};
vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL('./Code.gs', import.meta.url), 'utf8'), sandbox);
const call = body => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(body) } }).text);
const canLogIn = async (name, password) => (await req(null, 'POST', '/_session', { name, password })).status === 200;

let pass = 0, fail = 0;
const rows = [];
function check(label, good, detail) { good ? pass++ : fail++; rows.push(`${good ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -> ' + JSON.stringify(detail) : ''}`); }
const admin = (who, extra) => ({ db: 'church_a', adminName: who, adminPassword: pw(who), ...extra });

// clean slate for the made-up account
const old = await req(as('admin'), 'GET', '/_users/org.couchdb.user:newperson');
if (old.status === 200) await req(as('admin'), 'DELETE', `/_users/org.couchdb.user:newperson?rev=${old.json._rev}`);

let r = call(admin('alice', { action: 'createAccount', name: 'newperson', password: 'first-pass-1' }));
check('church admin creates an account', r.ok && r.existed === false, r);
const made = (await req(as('admin'), 'GET', '/_users/org.couchdb.user:newperson')).json;
check('new account has no tags', made && made.roles.length === 0, made?.roles);
check('new account can sign in', await canLogIn('newperson', 'first-pass-1'));
check("new account can't see the church yet", (await req({ name: 'newperson', pass: 'first-pass-1' }, 'GET', '/church_a/_all_docs')).status === 403);

r = call(admin('alice', { action: 'createAccount', name: 'vera', password: 'something-else' }));
check('existing account is left alone', r.ok && r.existed === true, r);
check("existing account's password unchanged", await canLogIn('vera', pw('vera')));

r = call(admin('vera', { action: 'createAccount', name: 'x1', password: 'xxxxxxxx' }));
check('viewer is refused', !r.ok, r);
r = call(admin('eddie', { action: 'createAccount', name: 'x1', password: 'xxxxxxxx' }));
check('editor is refused', !r.ok, r);
r = call({ ...admin('alice'), adminPassword: 'wrong', action: 'createAccount', name: 'x1', password: 'xxxxxxxx' });
check('wrong admin password is refused', !r.ok, r);
r = call({ ...admin('bob'), action: 'createAccount', name: 'x1', password: 'xxxxxxxx' });
check("another church's admin is refused", !r.ok, r);
r = call(admin('admin', { adminPassword: props.MAKER_PASS === '' ? '' : undefined }));
check('missing request is refused', !r.ok, r);

r = call(admin('alice', { action: 'resetPassword', name: 'eddie', password: 'new-eddie-pass' }));
check("church admin resets an editor's password", r.ok && await canLogIn('eddie', 'new-eddie-pass'), r);
call(admin('alice', { action: 'resetPassword', name: 'eddie', password: pw('eddie') }));
r = call(admin('alice', { action: 'resetPassword', name: 'leo', password: 'new-leo-pass' }));
check('church admin resets an old-tag member', r.ok && await canLogIn('leo', 'new-leo-pass'), r);
call(admin('alice', { action: 'resetPassword', name: 'leo', password: pw('leo') }));
r = call(admin('alice', { action: 'resetPassword', name: 'bob', password: 'hijack-bob' }));
check("can't reset someone outside the church", !r.ok && await canLogIn('bob', pw('bob')), r);
r = call(admin('alice', { action: 'resetPassword', name: 'alice', password: 'whatever1' }));
check("can't reset a church admin (even yourself) here", !r.ok, r);
r = call(admin('vera', { action: 'resetPassword', name: 'eddie', password: 'hijack-eddie' }));
check("viewer can't reset passwords", !r.ok && await canLogIn('eddie', pw('eddie')), r);

r = call(admin('alice', { action: 'createAccount', name: '_admin', password: 'xxxxxxxx' }));
check('names starting with _ refused', !r.ok, r);
r = call(admin('alice', { action: 'createAccount', name: 'shortpw', password: 'abc' }));
check('short password refused', !r.ok, r);
r = call({ ...admin('alice'), db: '../_users', action: 'createAccount', name: 'x2', password: 'xxxxxxxx' });
check('odd database names refused', !r.ok, r);
r = call(admin('alice', { action: 'deleteEverything', name: 'vera' }));
check('unknown requests refused', !r.ok, r);

const secrets = ['first-pass-1', 'new-eddie-pass', 'new-leo-pass', 'hijack-bob', pw('alice'), pw('vera')];
const leaked = logRows.flat().some(cell => secrets.some(s => String(cell).includes(s)));
check(`log has ${logRows.length} rows and no passwords`, logRows.length > 10 && !leaked);
rows.push('\nlast log rows:\n' + logRows.slice(-4).map(r => r.slice(1).join(' | ')).join('\n'));

console.log(rows.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
