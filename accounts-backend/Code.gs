/**
 * yCanta accounts helper.
 *
 * Lets a church admin create accounts and reset passwords for their own church, without being a CouchDB
 * server admin. It is bound to the "yCanta Server" sheet (owned by info.ycanta@gmail.com) and writes
 * requests to its Log tab, never the passwords.
 *
 * Script Properties (Project Settings > Script Properties), set by hand, never in this file:
 *   COUCH_URL   the CouchDB address the app uses, ending in "/", e.g. https://ycanta.canaanf.org/couch/
 *   MAKER_NAME  a CouchDB account that is an admin of the _users database ONLY (not a server admin)
 *   MAKER_PASS  its password
 * The helper adds SIGNING_KEY itself the first time it needs it (it signs confirmed recovery emails).
 *
 * Church admin requests (createAccount, resetPassword) carry the church admin's own name and password. The
 * helper checks them with CouchDB, then checks that the name is on that church's admin list. A church admin
 * controls their church's list, so the list alone never decides whose password they may reset: the
 * account must also belong to that church in a way only the server set (see resetPassword).
 *
 * Password recovery by email (anyone):
 *   startEmail / confirmEmail  a signed-in person adds a recovery email to their own account. The helper
 *                              emails a code to that address first, and signs the email it saves, so an
 *                              address someone typed into their account record directly is never used.
 *   clearEmail                 removes it.
 *   requestReset               "forgot password": emails a one-time code to the account's recovery email.
 *                              The reply is the same whether or not the account exists.
 *   confirmReset               the code plus a new password.
 * Codes are 8 characters, last 20 minutes, allow 5 tries, and are kept only as a hash, in the script cache
 * (which empties itself), as are the counters below.
 *
 * Limits: 3 emails an hour per account, 5 recovery-email changes per 6 hours per account, 20 emails an
 * hour in all, and only "forgot password" emails once Google's daily email quota runs low. 10 wrong
 * passwords an hour for one name stops the helper checking that name's password for the rest of the hour.
 */

const MIN_PASSWORD = 6;
const CODE_MINUTES = 20;
const CODE_TRIES = 5;
const EMAILS_PER_HOUR = 3;
const EMAIL_CHANGES_PER_6_HOURS = 5;
const EMAILS_PER_HOUR_ALL = 20;
const WRONG_PASSWORDS_PER_HOUR = 10;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 letters, none that look alike
const SAME_REPLY = 'If that account has a recovery email, a code is on its way. It lasts ' + CODE_MINUTES + ' minutes.';
const BAD_CODE = 'That code is wrong or has expired. Please ask for a new one.';
const ACTIONS = ['status', 'requestReset', 'confirmReset', 'startEmail', 'confirmEmail', 'clearEmail', 'getEmail',
  'changeOwnPassword', 'createAccount', 'resetPassword'];

function doGet() {
  return reply({ ok: true, service: 'yCanta accounts' });
}

function doPost(e) {
  let body = {};
  let result;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    result = handle(body);
  } catch (err) {
    // Only messages written for people go back; anything unexpected stays in the script's own log
    if (!(err && err.shown)) console.error(err);
    result = { ok: false, error: err && err.shown ? err.message : 'Something went wrong. Please try again.' };
  }
  if (ACTIONS.indexOf(body && body.action) !== -1) logRequest(body, result);
  return reply(result);
}

// An error meant for the person using the app
function fail(message) {
  const err = new Error(message);
  err.shown = true;
  throw err;
}

function checkName(name) {
  if (!name || name.length > 64 || name.charAt(0) === '_' || /[:\u0000-\u001f]/.test(name)) {
    fail('Please use a different user name.');
  }
}
function checkPassword(password) {
  if (String(password || '').length < MIN_PASSWORD) {
    fail('The password needs at least ' + MIN_PASSWORD + ' characters.');
  }
}

function handle(body) {
  const action = body.action;
  const name = String(body.name || '').trim();

  // Setup check: can the helper reach CouchDB, and does its account work? Shows no secrets.
  if (action === 'status') return status();

  // Recovery email and forgotten passwords: no church admin involved
  if (action === 'requestReset') return requestReset(String(body.who || '').trim());
  if (action === 'confirmReset') {
    checkName(name);
    checkPassword(body.password);
    return confirmReset(name, String(body.code || ''), String(body.password));
  }
  // Your own account. CouchDB 3 closes the account list to regular users, so they can't read or change
  // their own account record directly; the helper does it after checking their password.
  const ownActions = ['startEmail', 'confirmEmail', 'clearEmail', 'getEmail', 'changeOwnPassword'];
  if (ownActions.indexOf(action) !== -1) {
    checkName(name);
    checkOwnPassword(name, String(body.ownPassword || ''));
    if (action === 'startEmail') return startEmail(name, String(body.email || ''));
    if (action === 'confirmEmail') return confirmEmail(name, String(body.code || ''));
    if (action === 'getEmail') return getEmail(name);
    if (action === 'changeOwnPassword') {
      checkPassword(body.password);
      return setPassword(name, String(body.password));
    }
    return clearEmail(name);
  }

  const db = String(body.db || '');
  if (!/^[a-z][a-z0-9_$()+\/-]*$/.test(db)) fail('That is not a church database name.');
  checkName(name);
  if (action === 'createAccount' || action === 'resetPassword') {
    checkPassword(body.password);
  } else {
    fail('Unknown request.');
  }

  const church = checkChurchAdmin(db, String(body.adminName || ''), String(body.adminPassword || ''));
  if (action === 'createAccount') return createAccount(church, name, String(body.password));
  return resetPassword(church, name, String(body.password));
}

// ---- Short-lived state, in the script cache (it empties itself, so nothing piles up) ----

function cache() {
  return CacheService.getScriptCache();
}
function readCache(key) {
  const text = cache().get(key);
  return text ? JSON.parse(text) : null;
}
function writeCache(key, value, seconds) {
  if (value === null) cache().remove(key);
  else cache().put(key, JSON.stringify(value), seconds);
}

// Count an event in a time window; false (without counting) once `limit` is reached
function allowed(key, limit, seconds) {
  const now = Date.now();
  const times = (readCache(key) || []).filter(function (t) { return now - t < seconds * 1000; });
  if (times.length >= limit) return false;
  times.push(now);
  writeCache(key, times, seconds);
  return true;
}

// A password check through the helper must not become a way to guess passwords
function checkPasswordWith(name, password) {
  const key = 'wrong:' + name;
  const wrong = readCache(key) || [];
  const now = Date.now();
  const recent = wrong.filter(function (t) { return now - t < 3600 * 1000; });
  if (recent.length >= WRONG_PASSWORDS_PER_HOUR) fail('Too many wrong passwords. Please wait an hour and try again.');
  const login = couch('post', '_session', { body: { name: name, password: password } });
  if (login.status !== 200) {
    recent.push(now);
    writeCache(key, recent, 3600);
    fail('Your name or password was not right.');
  }
  return login;
}

// ---- Church admins ----

// The caller must sign in as themselves, and be on this church's admin list (or a server admin, or carry
// the older "<db>-admin" tag). Returns the church's security list.
function checkChurchAdmin(db, adminName, adminPassword) {
  if (!adminName || !adminPassword) fail('Please enter your own name and password.');
  const login = checkPasswordWith(adminName, adminPassword);
  const roles = (login.json && login.json.roles) || [];
  const cookie = String(login.headers['Set-Cookie'] || login.headers['set-cookie'] || '').split(';')[0];

  const sec = couch('get', encodeURIComponent(db) + '/_security', { cookie: cookie });
  if (sec.status !== 200) fail('You are not part of that church.');
  const admins = (sec.json && sec.json.admins) || {};
  const isAdmin = roles.indexOf('_admin') !== -1 ||
    roles.indexOf(db + '-admin') !== -1 ||
    (admins.names || []).indexOf(adminName) !== -1 ||
    (admins.roles || []).some(function (r) { return roles.indexOf(r) !== -1; });
  if (!isAdmin) fail('Only a church admin can do that.');
  return { db: db, sec: sec.json || {} };
}

// New account with no tags. It can't see any church until the church admin adds the name to the
// church's list (the app does that next). It is marked as made for this church, which is what lets this
// church's admins reset its password later. An existing account is left alone, so one person can belong
// to more than one church.
function createAccount(church, name, password) {
  if (name === PropertiesService.getScriptProperties().getProperty('MAKER_NAME')) fail('Please use a different user name.');
  const path = userPath(name);
  const existing = couch('get', path, { maker: true });
  if (existing.status === 200) return { ok: true, existed: true };
  if (existing.status !== 404) fail('Could not check that name (' + existing.status + ').');
  const made = couch('put', path, { maker: true, body: {
    _id: 'org.couchdb.user:' + name, name: name, type: 'user', roles: [], password: password, created_for: church.db,
  } });
  if (made.status !== 201 && made.status !== 202) fail('Could not create the account (' + made.status + ').');
  return { ok: true, existed: false };
}

// Only for people in the caller's church who are not admins anywhere. A church admin can put any name on
// their own list, so being on the list isn't enough: the account must carry this church's older tag (only
// server admins set those) or have been made for this church by the helper.
function resetPassword(church, name, password) {
  const sec = church.sec;
  const listed = function (group) { return !!group && (group.names || []).indexOf(name) !== -1; };
  const notYours = 'That person is not part of your church. Ask Carl or Evan.';
  if (name === PropertiesService.getScriptProperties().getProperty('MAKER_NAME')) fail(notYours);
  const user = couch('get', userPath(name), { maker: true });
  if (user.status !== 200) fail(notYours);
  const tags = user.json.roles || [];
  if (listed(sec.admins) || tags.some(function (t) { return /(^_|-admin$)/.test(t); })) {
    fail('Church admins change their own password, or use "Forgot password?".');
  }
  const taggedHere = tags.indexOf(church.db + '-viewer') !== -1 || tags.indexOf(church.db + '-editor') !== -1;
  const madeHere = user.json.created_for === church.db;
  const onList = listed(sec.members) || listed(sec.editors);
  if (!(taggedHere || (madeHere && onList))) fail(notYours);
  return setPassword(name, password);
}

function status() {
  const server = couch('get', '', { maker: true }); // the live server refuses signed-out requests
  const session = couch('get', '_session', { maker: true });
  const sec = couch('get', '_users/_security', { maker: true });
  const admins = (sec.json && sec.json.admins && sec.json.admins.names) || [];
  return {
    ok: true,
    reachesCouchDB: server.status === 200,
    helperSignedIn: !!(session.json && session.json.userCtx && session.json.userCtx.name),
    helperManagesAccounts: admins.indexOf(PropertiesService.getScriptProperties().getProperty('MAKER_NAME')) !== -1,
  };
}

// ---- Recovery email and forgotten passwords ----

function userPath(name) {
  return '_users/' + encodeURIComponent('org.couchdb.user:' + name);
}

// The person proves who they are with their own password (the app sends the one they signed in with)
function checkOwnPassword(name, password) {
  if (!password) fail('Please sign in again first.');
  checkPasswordWith(name, password);
}

function newCode() {
  // Apps Script's UUIDs come from a secure random source; skip their fixed version/variant digits
  const hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const random = hex.slice(0, 12) + hex.slice(20, 32) + hex.slice(32, 44) + hex.slice(52, 64);
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET.charAt(parseInt(random.substr(i * 2, 2), 16) % 32);
  return code;
}

function hex(bytes) {
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function hashCode(name, code) {
  return hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'ycanta|' + name + '|' + code, Utilities.Charset.UTF_8));
}

function normalCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// A confirmed recovery email is saved with a signature, so an email typed straight into an account
// record (people can edit their own) is never trusted for sending codes.
function signingKey() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('SIGNING_KEY');
  if (!key) {
    key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('SIGNING_KEY', key);
  }
  return key;
}
function emailSignature(name, email) {
  return hex(Utilities.computeHmacSha256Signature(name + '|' + email, signingKey(), Utilities.Charset.UTF_8));
}
function trustedEmail(user) {
  return user && user.email && user.email_sig === emailSignature(user.name, user.email) ? user.email : '';
}

// Per account, and for everyone together, and keep the last of Google's daily quota for "forgot password"
function mayEmail(name, forReset) {
  if (MailApp.getRemainingDailyQuota() < (forReset ? 5 : 25)) return false;
  if (!allowed('sent:' + name, EMAILS_PER_HOUR, 3600)) return false;
  return allowed('sent-all', EMAILS_PER_HOUR_ALL, 3600);
}

function sendCode(to, subject, lines) {
  MailApp.sendEmail({ to: to, subject: subject, name: 'yCanta', body: lines.join('\n') });
}

// Store a code for this account and purpose; returns the code to email
function issueCode(purpose, name, extra) {
  const code = newCode();
  const entry = { hash: hashCode(name, code), expires: Date.now() + CODE_MINUTES * 60 * 1000, tries: 0 };
  for (const key in (extra || {})) entry[key] = extra[key];
  writeCache(purpose + ':' + name, entry, CODE_MINUTES * 60);
  return code;
}

function pendingCode(purpose, name) {
  const entry = readCache(purpose + ':' + name);
  return entry && Date.now() <= entry.expires ? entry : null;
}

// Check a code; the entry is used up on success, and dropped after too many wrong tries
function useCode(purpose, name, code) {
  const key = purpose + ':' + name;
  const entry = pendingCode(purpose, name);
  if (!entry) {
    writeCache(key, null);
    fail(BAD_CODE);
  }
  if (hashCode(name, normalCode(code)) !== entry.hash) {
    entry.tries += 1;
    const secondsLeft = Math.max(1, Math.ceil((entry.expires - Date.now()) / 1000));
    writeCache(key, entry.tries >= CODE_TRIES ? null : entry, secondsLeft);
    fail(BAD_CODE);
  }
  writeCache(key, null);
  return entry;
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function startEmail(name, email) {
  email = email.trim().toLowerCase();
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email) || email.length > 200) {
    fail('That does not look like an email address.');
  }
  return withLock(function () {
    if (!allowed('email-change:' + name, EMAIL_CHANGES_PER_6_HOURS, 6 * 3600) || !mayEmail(name, false)) {
      fail('Too many emails for this account right now. Please try again later.');
    }
    const code = issueCode('verify', name, { email: email });
    sendCode(email, 'Your yCanta email code', [
      'Someone signed in to yCanta asked to use this address to recover their password.',
      '',
      'To confirm, enter this code in yCanta: ' + code,
      '',
      'It lasts ' + CODE_MINUTES + ' minutes. If this was not you, ignore this email and nothing changes.',
    ]);
    return { ok: true };
  });
}

function confirmEmail(name, code) {
  return withLock(function () {
    const entry = useCode('verify', name, code);
    const user = couch('get', userPath(name), { maker: true });
    if (user.status !== 200) fail('Could not find your account.');
    const doc = user.json;
    doc.email = entry.email;
    doc.email_sig = emailSignature(name, entry.email);
    const saved = couch('put', userPath(name), { maker: true, body: doc });
    if (saved.status !== 201 && saved.status !== 202) fail('Could not save the email (' + saved.status + ').');
    return { ok: true, email: entry.email };
  });
}

function getEmail(name) {
  const user = couch('get', userPath(name), { maker: true });
  if (user.status !== 200) fail('Could not find your account.');
  return { ok: true, email: trustedEmail(user.json) };
}

function setPassword(name, password) {
  const user = couch('get', userPath(name), { maker: true });
  if (user.status !== 200) fail('Could not find your account.');
  const doc = user.json;
  doc.password = password;
  const saved = couch('put', userPath(name), { maker: true, body: doc });
  if (saved.status !== 201 && saved.status !== 202) fail('Could not change the password (' + saved.status + ').');
  writeCache('reset:' + name, null); // a code still waiting for this account is no longer needed
  return { ok: true };
}

function clearEmail(name) {
  const user = couch('get', userPath(name), { maker: true });
  if (user.status !== 200) fail('Could not find your account.');
  const doc = user.json;
  delete doc.email;
  delete doc.email_sig;
  const saved = couch('put', userPath(name), { maker: true, body: doc });
  if (saved.status !== 201 && saved.status !== 202) fail('Could not remove the email (' + saved.status + ').');
  return { ok: true };
}

// "Forgot password": who is an account name or a recovery email. Same reply either way.
function requestReset(who) {
  if (!who || who.length > 200) fail('Please enter your name or email.');
  let accounts = [];
  if (who.indexOf('@') !== -1) {
    const found = couch('post', '_users/_find', { maker: true, body: { selector: { type: 'user', email: who.toLowerCase() }, fields: ['name', 'email', 'email_sig'], limit: 5 } });
    accounts = (found.json && found.json.docs) || [];
  }
  if (!accounts.length && who.charAt(0) !== '_' && !/[:\u0000-\u001f]/.test(who)) {
    const user = couch('get', userPath(who), { maker: true }); // names may contain "@" too
    if (user.status === 200) accounts = [user.json];
  }
  accounts = accounts.filter(trustedEmail);
  withLock(function () {
    accounts.slice(0, 3).forEach(function (account) {
      // A code already on its way stays the only one, so a stranger asking again can't cancel it
      if (pendingCode('reset', account.name) || !mayEmail(account.name, true)) return;
      const code = issueCode('reset', account.name);
      sendCode(account.email, 'Your yCanta password reset code', [
        'Someone asked to reset the yCanta password for "' + account.name + '".',
        '',
        'Your name: ' + account.name,
        'Your code: ' + code,
        '',
        'Enter both in yCanta under "Forgot password?". The code lasts ' + CODE_MINUTES + ' minutes.',
        'If this was not you, ignore this email and your password stays the same.',
      ]);
    });
  });
  return { ok: true, message: SAME_REPLY };
}

function confirmReset(name, code, password) {
  return withLock(function () {
    useCode('reset', name, code);
    return setPassword(name, password);
  });
}

// One CouchDB request. opts: body, cookie, maker (sign in as the accounts-only admin).
function couch(method, path, opts) {
  opts = opts || {};
  const props = PropertiesService.getScriptProperties();
  const base = props.getProperty('COUCH_URL');
  if (!base) fail('The helper is not set up yet.');
  const headers = {};
  if (opts.maker) {
    headers.Authorization = 'Basic ' + Utilities.base64Encode(props.getProperty('MAKER_NAME') + ':' + props.getProperty('MAKER_PASS'), Utilities.Charset.UTF_8);
  }
  if (opts.cookie) headers.Cookie = opts.cookie;
  const params = { method: method, headers: headers, muteHttpExceptions: true, followRedirects: false };
  if (opts.body !== undefined) {
    params.contentType = 'application/json';
    params.payload = JSON.stringify(opts.body);
  }
  const res = UrlFetchApp.fetch(base + path, params);
  let json = null;
  try { json = JSON.parse(res.getContentText()); } catch (err) { json = null; }
  return { status: res.getResponseCode(), json: json, headers: res.getAllHeaders() };
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// A sheet cell from text anyone can send: short, and never read as a formula
function cell(value) {
  const text = String(value || '').slice(0, 100);
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

// Who asked for what, and how it went. Never the passwords or codes.
function logRequest(body, result) {
  try {
    const book = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = book.getSheetByName('Log') || book.insertSheet('Log');
    if (sheet.getLastRow() === 0) sheet.appendRow(['When', 'Church admin', 'Church', 'Request', 'For', 'Result']);
    sheet.appendRow([
      new Date(), cell(body.adminName), cell(body.db), cell(body.action), cell(body.name || body.who),
      cell(result.ok ? (result.existed ? 'ok (account already existed)' : 'ok') : 'refused: ' + result.error),
    ]);
  } catch (err) {
    // logging must never stop the request
  }
}
