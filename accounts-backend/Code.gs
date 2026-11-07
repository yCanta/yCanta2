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
 * Every request must carry the church admin's own name and password. The helper checks them with CouchDB,
 * then checks that the name is on that church's admin list, before it does anything.
 */

const MIN_PASSWORD = 6;

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

function handle(body) {
  const action = body.action;
  const db = String(body.db || '');
  const name = String(body.name || '');
  if (!/^[a-z][a-z0-9_$()+\/-]*$/.test(db)) throw new Error('That is not a church database name.');
  if (!name || name.length > 64 || name.charAt(0) === '_' || /[:\u0000-\u001f]/.test(name)) {
    throw new Error('Please use a different user name.');
  }
  if (action === 'createAccount' || action === 'resetPassword') {
    if (String(body.password || '').length < MIN_PASSWORD) {
      throw new Error('The password needs at least ' + MIN_PASSWORD + ' characters.');
    }
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
      String(body.name || ''), result.ok ? (result.existed ? 'ok (account already existed)' : 'ok') : 'refused: ' + result.error,
    ]);
  } catch (err) {
    // logging must never stop the request
  }
}
