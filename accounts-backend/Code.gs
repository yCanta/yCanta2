/**
 * yCanta accounts helper.
 *
 * Lets a church admin create accounts and reset passwords for their own church, without being a CouchDB
 * server admin. It is bound to the "yCanta Server" sheet (owned by info.ycanta@gmail.com) and writes every
 * request to its Log tab, never the passwords.
 *
 * Script Properties (Project Settings > Script Properties), set by hand, never in this file:
 *   COUCH_URL   the CouchDB address the app uses, ending in "/", e.g. https://login.ycanta.com/couch/
 *   MAKER_NAME  a CouchDB account that is an admin of the _users database ONLY (not a server admin)
 *   MAKER_PASS  its password
 *
 * Church admin requests (createAccount, resetPassword) carry the church admin's own name and password. The
 * helper checks them with CouchDB, then checks that the name is on that church's admin list.
 *
 * Password recovery by email (anyone):
 *   startEmail / confirmEmail  a signed-in person adds a recovery email to their own account. The helper
 *                              emails a code to that address first, so only an inbox they control is saved.
 *   clearEmail                 removes it.
 *   requestReset               "forgot password": emails a one-time code to the account's recovery email.
 *                              The reply is the same whether or not the account exists.
 *   confirmReset               the code plus a new password.
 * Codes are 8 characters, last 20 minutes, allow 5 tries, and are kept only as a hash in Script Properties.
 * Each account gets at most 3 emails an hour.
 */

const MIN_PASSWORD = 6;
const CODE_MINUTES = 20;
const CODE_TRIES = 5;
const EMAILS_PER_HOUR = 3;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 letters, none that look alike
const SAME_REPLY = 'If that account has a recovery email, a code is on its way. It lasts ' + CODE_MINUTES + ' minutes.';
const BAD_CODE = 'That code is wrong or has expired. Please ask for a new one.';

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
    result = { ok: false, error: String((err && err.message) || err) };
  }
  logRequest(body, result);
  return reply(result);
}

function checkName(name) {
  if (!name || name.length > 64 || name.charAt(0) === '_' || /[:\u0000-\u001f]/.test(name)) {
    throw new Error('Please use a different user name.');
  }
}
function checkPassword(password) {
  if (String(password || '').length < MIN_PASSWORD) {
    throw new Error('The password needs at least ' + MIN_PASSWORD + ' characters.');
  }
}

function handle(body) {
  const action = body.action;
  const name = String(body.name || '').trim();

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
  if (!/^[a-z][a-z0-9_$()+\/-]*$/.test(db)) throw new Error('That is not a church database name.');
  checkName(name);
  if (action === 'createAccount' || action === 'resetPassword') {
    checkPassword(body.password);
  } else {
    throw new Error('Unknown request.');
  }

  const church = checkChurchAdmin(db, String(body.adminName || ''), String(body.adminPassword || ''));
  if (action === 'createAccount') return createAccount(name, String(body.password));
  return resetPassword(church, name, String(body.password));
}

// The caller must sign in as themselves, and be on this church's admin list (or a server admin, or carry
// the older "<db>-admin" tag). Returns the church's security list.
function checkChurchAdmin(db, adminName, adminPassword) {
  if (!adminName || !adminPassword) throw new Error('Please enter your own name and password.');
  const login = couch('post', '_session', { body: { name: adminName, password: adminPassword } });
  if (login.status !== 200) throw new Error('Your name or password was not right.');
  const roles = (login.json && login.json.roles) || [];
  const cookie = String(login.headers['Set-Cookie'] || login.headers['set-cookie'] || '').split(';')[0];

  const sec = couch('get', encodeURIComponent(db) + '/_security', { cookie: cookie });
  if (sec.status !== 200) throw new Error('You are not part of that church.');
  const admins = (sec.json && sec.json.admins) || {};
  const isAdmin = roles.indexOf('_admin') !== -1 ||
    roles.indexOf(db + '-admin') !== -1 ||
    (admins.names || []).indexOf(adminName) !== -1 ||
    (admins.roles || []).some(function (r) { return roles.indexOf(r) !== -1; });
  if (!isAdmin) throw new Error('Only a church admin can do that.');
  return { db: db, sec: sec.json || {} };
}

// New account with no tags. It can't see any church until the church admin adds the name to the
// church's list (the app does that next). An existing account is left alone, so one person can belong
// to more than one church.
function createAccount(name, password) {
  const path = '_users/' + encodeURIComponent('org.couchdb.user:' + name);
  const existing = couch('get', path, { maker: true });
  if (existing.status === 200) return { ok: true, existed: true };
  if (existing.status !== 404) throw new Error('Could not check that name (' + existing.status + ').');
  const made = couch('put', path, { maker: true, body: { _id: 'org.couchdb.user:' + name, name: name, type: 'user', roles: [], password: password } });
  if (made.status !== 201 && made.status !== 202) throw new Error('Could not create the account (' + made.status + ').');
  return { ok: true, existed: false };
}

// Only for people in the caller's own church who are not church admins themselves.
function resetPassword(church, name, password) {
  const sec = church.sec;
  const listed = function (group) { return !!group && (group.names || []).indexOf(name) !== -1; };
  const path = '_users/' + encodeURIComponent('org.couchdb.user:' + name);
  const user = couch('get', path, { maker: true });
  if (user.status !== 200) throw new Error('There is no account with that name.');
  const tags = user.json.roles || [];
  const tagged = tags.indexOf(church.db + '-viewer') !== -1 || tags.indexOf(church.db + '-editor') !== -1;
  if (listed(sec.admins) || tags.indexOf(church.db + '-admin') !== -1) {
    throw new Error('Church admins change their own password in the app.');
  }
  if (!listed(sec.members) && !listed(sec.editors) && !tagged) throw new Error('That person is not part of your church.');
  const doc = user.json;
  doc.password = password;
  const saved = couch('put', path, { maker: true, body: doc });
  if (saved.status !== 201 && saved.status !== 202) throw new Error('Could not change the password (' + saved.status + ').');
  return { ok: true };
}

// ---- Recovery email and forgotten passwords ----

function userPath(name) {
  return '_users/' + encodeURIComponent('org.couchdb.user:' + name);
}

// The person proves who they are with their own password (the app sends the one they signed in with)
function checkOwnPassword(name, password) {
  if (!password) throw new Error('Please sign in again first.');
  const login = couch('post', '_session', { body: { name: name, password: password } });
  if (login.status !== 200) throw new Error('Your name or password was not right.');
}

function newCode() {
  // Apps Script's UUIDs come from a secure random source; skip their fixed version/variant digits
  const hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const random = hex.slice(0, 12) + hex.slice(20, 32) + hex.slice(32, 44) + hex.slice(52, 64);
  let code = '';
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET.charAt(parseInt(random.substr(i * 2, 2), 16) % 32);
  return code;
}

function hashCode(name, code) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'ycanta|' + name + '|' + code, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function normalCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Script Properties hold pending codes and email counts, keyed by account name
function readProp(key) {
  const text = PropertiesService.getScriptProperties().getProperty(key);
  return text ? JSON.parse(text) : null;
}
function writeProp(key, value) {
  const props = PropertiesService.getScriptProperties();
  if (value === null) props.deleteProperty(key);
  else props.setProperty(key, JSON.stringify(value));
}

// At most EMAILS_PER_HOUR emails per account, and stop well before Google's daily email limit
function mayEmail(name) {
  if (MailApp.getRemainingDailyQuota() < 5) return false;
  const now = Date.now();
  const sent = (readProp('sent:' + name) || []).filter(function (t) { return now - t < 3600 * 1000; });
  if (sent.length >= EMAILS_PER_HOUR) return false;
  sent.push(now);
  writeProp('sent:' + name, sent);
  return true;
}

function sendCode(to, subject, lines) {
  MailApp.sendEmail({ to: to, subject: subject, name: 'yCanta', body: lines.join('\n') });
}

// Store a code for this account and purpose; returns the code to email
function issueCode(purpose, name, extra) {
  const code = newCode();
  const entry = { hash: hashCode(name, code), expires: Date.now() + CODE_MINUTES * 60 * 1000, tries: 0 };
  for (const key in (extra || {})) entry[key] = extra[key];
  writeProp(purpose + ':' + name, entry);
  return code;
}

// Check a code; the entry is used up on success, and dropped after too many wrong tries
function useCode(purpose, name, code) {
  const key = purpose + ':' + name;
  const entry = readProp(key);
  if (!entry || Date.now() > entry.expires) {
    writeProp(key, null);
    throw new Error(BAD_CODE);
  }
  if (hashCode(name, normalCode(code)) !== entry.hash) {
    entry.tries += 1;
    writeProp(key, entry.tries >= CODE_TRIES ? null : entry);
    throw new Error(BAD_CODE);
  }
  writeProp(key, null);
  return entry;
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function startEmail(name, email) {
  email = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new Error('That does not look like an email address.');
  return withLock(function () {
    if (!mayEmail(name)) throw new Error('Too many emails for this account. Please try again in an hour.');
    const code = issueCode('verify', name, { email: email });
    sendCode(email, 'Your yCanta email code', [
      'Someone signed in as "' + name + '" asked to use this address to recover their yCanta password.',
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
    if (user.status !== 200) throw new Error('Could not find your account.');
    const doc = user.json;
    doc.email = entry.email;
    const saved = couch('put', userPath(name), { maker: true, body: doc });
    if (saved.status !== 201 && saved.status !== 202) throw new Error('Could not save the email (' + saved.status + ').');
    return { ok: true, email: entry.email };
  });
}

function getEmail(name) {
  const user = couch('get', userPath(name), { maker: true });
  if (user.status !== 200) throw new Error('Could not find your account.');
  return { ok: true, email: user.json.email || '' };
}

function setPassword(name, password) {
  const user = couch('get', userPath(name), { maker: true });
  if (user.status !== 200) throw new Error('Could not find your account.');
  const doc = user.json;
  doc.password = password;
  const saved = couch('put', userPath(name), { maker: true, body: doc });
  if (saved.status !== 201 && saved.status !== 202) throw new Error('Could not change the password (' + saved.status + ').');
  return { ok: true };
}

function clearEmail(name) {
  const user = couch('get', userPath(name), { maker: true });
  if (user.status !== 200) throw new Error('Could not find your account.');
  const doc = user.json;
  delete doc.email;
  const saved = couch('put', userPath(name), { maker: true, body: doc });
  if (saved.status !== 201 && saved.status !== 202) throw new Error('Could not remove the email (' + saved.status + ').');
  return { ok: true };
}

// "Forgot password": who is an account name or a recovery email. Same reply either way.
function requestReset(who) {
  if (!who || who.length > 200) throw new Error('Please enter your name or email.');
  let accounts = [];
  if (who.indexOf('@') !== -1) {
    const found = couch('post', '_users/_find', { maker: true, body: { selector: { type: 'user', email: who.toLowerCase() }, fields: ['name', 'email'], limit: 5 } });
    accounts = (found.json && found.json.docs) || [];
  } else if (who.charAt(0) !== '_' && !/[:\u0000-\u001f]/.test(who)) {
    const user = couch('get', userPath(who), { maker: true });
    if (user.status === 200 && user.json.email) accounts = [user.json];
  }
  withLock(function () {
    accounts.slice(0, 3).forEach(function (account) {
      if (!mayEmail(account.name)) return;
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
  if (!base) throw new Error('The helper is not set up yet (COUCH_URL).');
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

// Who asked for what, and how it went. Never the passwords.
function logRequest(body, result) {
  try {
    const book = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = book.getSheetByName('Log') || book.insertSheet('Log');
    if (sheet.getLastRow() === 0) sheet.appendRow(['When', 'Church admin', 'Church', 'Request', 'For', 'Result']);
    sheet.appendRow([
      new Date(), String(body.adminName || ''), String(body.db || ''), String(body.action || ''),
      String(body.name || body.who || ''), result.ok ? (result.existed ? 'ok (account already existed)' : 'ok') : 'refused: ' + result.error,
    ]);
  } catch (err) {
    // logging must never stop the request
  }
}
