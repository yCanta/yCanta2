// Runs Code.gs unchanged in Node, with stand-ins for the Apps Script services, against the LOCAL test
// CouchDB. Run couchdb/test-rule.mjs and couchdb/probe-account-helper.mjs first (they make church_a,
// church_b, the fake users and the accounts-only "maker" admin).
import { loadHelper } from './local-shim.mjs';
import { req, as, pw, BASE } from '../couchdb/lib.mjs';

const props = { COUCH_URL: BASE + '/', MAKER_NAME: 'maker', MAKER_PASS: pw('maker') };
const logRows = [];
const sentMail = [];
const { call } = loadHelper(props, { logRows, sentMail });
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

// ---- recovery email and forgotten passwords
const codeIn = mail => (mail?.body.match(/code[^:]*: ([A-Z2-9]{8})/i) || [])[1];
const lastMail = () => sentMail[sentMail.length - 1];
const userDoc = async name => (await req(as('admin'), 'GET', '/_users/org.couchdb.user:' + name)).json;
for (const n of ['vera', 'eddie']) { const d = await userDoc(n); delete d.email; await req(as('admin'), 'PUT', '/_users/org.couchdb.user:' + n, d); }
for (const k of Object.keys(props)) if (/^(sent|reset|verify):/.test(k)) delete props[k];
const own = (name, extra) => ({ name, ownPassword: pw(name), ...extra });
const usedCodes = [];

r = call({ ...own('vera'), ownPassword: 'wrong', action: 'startEmail', email: 'vera@example.test' });
check('adding an email needs your own password', !r.ok && sentMail.length === 0, r);
r = call(own('vera', { action: 'startEmail', email: 'Vera@Example.test' }));
const verifyCode = codeIn(lastMail());
usedCodes.push(verifyCode);
check('a code goes to the new address first', r.ok && lastMail()?.to === 'vera@example.test' && !!verifyCode, { r, to: lastMail()?.to });
check('the email is not saved before the code', !(await userDoc('vera')).email);
r = call(own('vera', { action: 'confirmEmail', code: 'AAAAAAAA' }));
check('a wrong code does not save it', !r.ok, r);
r = call(own('vera', { action: 'confirmEmail', code: verifyCode.toLowerCase().replace(/(.{4})/, '$1-') }));
check('the right code saves it (any case, dash ok)', r.ok && (await userDoc('vera')).email === 'vera@example.test', r);
const peek = await req(as('vic'), 'GET', '/_users/org.couchdb.user:vera');
check("others can't read the email", peek.status >= 400 && !JSON.stringify(peek.json).includes('example.test'), peek.status);

let mails = sentMail.length;
r = call({ action: 'requestReset', who: 'vera' });
const resetCode = codeIn(lastMail());
usedCodes.push(resetCode);
check('forgot password by name sends a code', r.ok && sentMail.length === mails + 1 && !!resetCode, r);
const sameReply = r.message;
mails = sentMail.length;
r = call({ action: 'requestReset', who: 'nobody-here' });
check('unknown name: same reply, no email', r.ok && r.message === sameReply && sentMail.length === mails, r);
r = call({ action: 'requestReset', who: 'eddie' });
check('account without an email: same reply, no email', r.ok && r.message === sameReply && sentMail.length === mails, r);
r = call({ action: 'requestReset', who: 'nobody@example.test' });
check('unknown email: same reply, no email', r.ok && r.message === sameReply && sentMail.length === mails, r);

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
props['sent:vera'] = '[]';
call({ action: 'requestReset', who: 'vera' });
const code3 = codeIn(lastMail());
usedCodes.push(code3);
const entry = JSON.parse(props['reset:vera']);
props['reset:vera'] = JSON.stringify({ ...entry, expires: Date.now() - 1 });
r = call({ action: 'confirmReset', name: 'vera', code: code3, password: 'late-pass' });
check('an expired code fails', !r.ok && await canLogIn('vera', 'recovered-pass'), r);
check('codes are stored only as a hash', !Object.values(props).some(v => usedCodes.some(c => String(v).includes(c))));
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
check('you can remove your email', !(await userDoc('vera')).email, r);
const doc = await userDoc('vera'); doc.password = pw('vera'); await req(as('admin'), 'PUT', '/_users/org.couchdb.user:vera', doc);

const secrets = ['first-pass-1', 'new-eddie-pass', 'new-leo-pass', 'hijack-bob', pw('alice'), pw('vera'), 'recovered-pass', 'hacked-pass', ...usedCodes];
const leaked = logRows.flat().some(cell => secrets.some(s => String(cell).includes(s)));
check(`log has ${logRows.length} rows and no passwords`, logRows.length > 10 && !leaked);
rows.push('\nlast log rows:\n' + logRows.slice(-4).map(r => r.slice(1).join(' | ')).join('\n'));

console.log(rows.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
