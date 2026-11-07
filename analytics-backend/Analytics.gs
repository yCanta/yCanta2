/**
 * yCanta analytics, version 2. Replaces Responses.gs.
 *
 * Two tabs with fixed columns:
 *   Sessions  one row per visit (page load): who, which device, which settings. Updated in place
 *             when the app sends more about the same visit.
 *   Events    one row per thing that happened: page viewed, song edited, export, ...
 * Each POST writes straight to these tabs under the script lock. There is no Script Properties
 * cache, no daily trigger, and no new columns, so the tabs stay narrow and the dashboard fast.
 *
 * Needs from Config.gs: ANALYTICS_SHEET_ID, RESPONSE_SHEET (the old tab, only for migrateResponses).
 */
const SESSIONS_SHEET = 'Sessions';
const EVENTS_SHEET = 'Events';
const DASHBOARD_SHEET = 'Dashboard';

// Sessions columns, and the key each one has in the app's session object
const SESSION_COLUMNS = [
  ['Start', 'start'], ['Install', 'install'], ['Session', 'id'], ['User', 'user'], ['Database', 'db'],
  ['Platform', 'platform'], ['Screen', 'screen'], ['Touch', 'touch'], ['Installed', 'installed'],
  ['Dark mode', 'darkMode'], ['Font size', 'fontSize'], ['Load ms', 'loadMs'], ['Online', 'online'],
  ['Location', 'location'], ['Last seen', 'lastSeen']
];
const EVENT_COLUMNS = ['Time', 'Install', 'Session', 'User', 'Event', 'Value'];
const SESSION_ID_COL = 3;  // the Session column, used to find a visit's row again
const START_COL = 1;
const LAST_SEEN_COL = SESSION_COLUMNS.length;

const SESSION_GAP_MS = 30 * 60 * 1000; // version 1 data has no visit id: a 30 minute gap starts a new one
const MAX_SESSIONS_PER_POST = 60;
const MAX_EVENTS_PER_POST = 1000;
const MAX_TEXT = 2000; // export events carry the whole export config as JSON

// Version 1 names that are facts about the visit, and the session key each one fills
const V1_SESSION_FIELDS = {
  username: 'user', platform: 'platform', screenSize: 'screen', touch: 'touch', installed: 'installed',
  darkMode: 'darkMode', fontSize: 'fontSize', loadTime: 'loadMs', location: 'location'
};

/**
 * Entry point for {action: "log"} POSTs.
 *   Version 2: {v: 2, sessions: [{id, install, start, user, ...}], events: [[time, sessionId, user, event, value]],
 *               legacy: [version 1 entries the app had queued]}
 *   Version 1 (the app before Nov 2026): {data: [{Timestamp, analyticId, <name>: <value>}]}
 */
function processAnalyticsPost(payload) {
  if (!payload) return { error: "No data provided" };

  let batch;
  if (payload.v === 2) {
    batch = fromV2_(payload);
    if (Array.isArray(payload.legacy) && payload.legacy.length) {
      const old = fromV1_(payload.legacy.slice(0, MAX_EVENTS_PER_POST));
      batch.sessions = batch.sessions.concat(old.sessions);
      batch.events = batch.events.concat(old.events);
    }
  } else {
    const data = Array.isArray(payload.data) ? payload.data : [payload.data];
    batch = fromV1_(data.slice(0, MAX_EVENTS_PER_POST));
  }

  writeBatch_(batch);
  return { result: "success" };
}

function fromV2_(payload) {
  const sessions = (Array.isArray(payload.sessions) ? payload.sessions : [])
    .slice(0, MAX_SESSIONS_PER_POST)
    .filter(s => s && typeof s === 'object' && s.id)
    .map(s => {
      const session = {};
      SESSION_COLUMNS.forEach(([, key]) => { if (s[key] !== undefined && s[key] !== null) session[key] = s[key]; });
      return session;
    });

  // An event's install comes from its session, when the session is in this POST
  const installs = {};
  sessions.forEach(s => { installs[s.id] = s.install; });

  const events = (Array.isArray(payload.events) ? payload.events : [])
    .slice(0, MAX_EVENTS_PER_POST)
    .filter(e => Array.isArray(e) && e.length >= 5)
    .map(([time, session, user, type, value]) => ({
      time: Number(time), install: installs[session] || '', session: session || '', user: user || '', type, value
    }));

  return { sessions, events };
}

/**
 * Version 1 entries are one fact each: {Timestamp, analyticId, username: "u-carl"}. Group them into
 * visits: a visit starts at a login ('username' again for the same install) or after a 30 minute gap.
 * Facts about the visit fill its Sessions row; everything else becomes an event.
 */
function fromV1_(entries) {
  const items = [];
  entries.forEach(entry => {
    if (!entry || typeof entry !== 'object') return;
    const time = Number(entry.Timestamp) || 0;
    Object.keys(entry).forEach(key => {
      if (key === 'Timestamp' || key === 'analyticId' || key === '') return;
      const value = entry[key];
      if (value === undefined || value === null || value === '' || value === 'undefined') return;
      items.push({ time, install: String(entry.analyticId || ''), type: key, value });
    });
  });
  items.sort((a, b) => a.time - b.time);

  const sessions = [];
  const events = [];
  const open = {}; // install -> the visit being filled
  items.forEach(item => {
    let session = open[item.install];
    const field = V1_SESSION_FIELDS[item.type];
    if (!session || item.time - session.lastSeen > SESSION_GAP_MS || (item.type === 'username' && session.user)) {
      session = open[item.install] = {
        id: item.install + '-' + item.time, install: item.install, start: item.time, lastSeen: item.time, hasFacts: false
      };
      sessions.push(session);
    }
    session.lastSeen = Math.max(session.lastSeen, item.time);
    if (field) {
      session[field] = item.value;
      session.hasFacts = true;
    } else {
      events.push({ time: item.time, install: item.install, sessionRef: session, type: item.type, value: item.value });
    }
  });

  // A visit with only events (a later send from the same page load) gets no row of its own
  events.forEach(e => {
    e.user = e.sessionRef.user || '';
    e.session = e.sessionRef.hasFacts ? e.sessionRef.id : '';
    delete e.sessionRef;
  });
  const withFacts = sessions.filter(s => s.hasFacts);
  withFacts.forEach(s => delete s.hasFacts);
  return { sessions: withFacts, events };
}

function writeBatch_(batch, appendOnly) {
  if (!batch.sessions.length && !batch.events.length) return;

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.openById(ANALYTICS_SHEET_ID);
    const sessionSheet = getOrCreateSheet_(ss, SESSIONS_SHEET, SESSION_COLUMNS.map(([name]) => name));
    const eventSheet = getOrCreateSheet_(ss, EVENTS_SHEET, EVENT_COLUMNS);

    const newSessions = appendOnly ? batch.sessions : updateExistingSessions_(sessionSheet, batch.sessions);
    appendRows_(sessionSheet, newSessions.map(sessionRow_));
    appendRows_(eventSheet, batch.events.map(eventRow_));
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sessions the tab already has get their row updated (new values win, the earliest Start and the
 * latest Last seen are kept). Returns the ones that still need a row.
 */
function updateExistingSessions_(sheet, sessions) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return sessions;
  const idRange = sheet.getRange(2, SESSION_ID_COL, lastRow - 1, 1);

  return sessions.filter(session => {
    const found = idRange.createTextFinder(String(session.id)).matchEntireCell(true).findNext();
    if (!found) return true;

    const rowRange = sheet.getRange(found.getRow(), 1, 1, SESSION_COLUMNS.length);
    const row = rowRange.getValues()[0];
    const update = sessionRow_(session);
    const merged = row.map((old, i) => {
      const value = update[i];
      if (value === '' || value === null) return old;
      if (i === START_COL - 1 && old instanceof Date) return value < old ? value : old;
      if (i === LAST_SEEN_COL - 1 && old instanceof Date) return value > old ? value : old;
      return value;
    });
    rowRange.setValues([merged]);
    return false;
  });
}

function sessionRow_(session) {
  return SESSION_COLUMNS.map(([, key]) => {
    const value = session[key];
    if (key === 'start' || key === 'lastSeen') return toDate_(value);
    return cell_(value);
  });
}

function eventRow_(e) {
  return [toDate_(e.time), cell_(e.install), cell_(e.session), cell_(e.user), cell_(e.type), cell_(e.value)];
}

function toDate_(ms) {
  ms = Number(ms);
  return ms > 0 ? new Date(ms) : '';
}

// A sheet cell value. Text that starts like a formula is kept as text: anyone can POST to this web app.
function cell_(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT);
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return text;
}

function getOrCreateSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // A new tab has 26 columns; keep only the ones used so the cell count stays small
    if (sheet.getMaxColumns() > headers.length) {
      sheet.deleteColumns(headers.length + 1, sheet.getMaxColumns() - headers.length);
    }
  }
  return sheet;
}

function appendRows_(sheet, rows) {
  if (!rows.length) return;
  const startRow = sheet.getLastRow() + 1;
  const neededRows = startRow + rows.length - 1;
  if (neededRows > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), neededRows - sheet.getMaxRows());
  }
  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
}

/**
 * Run once by hand after deploying: copies the old Responses tab (columns A:R, the real ones)
 * into Sessions and Events. The 930-odd "Timestamp%3D..." columns are skipped: they hold only
 * the word "undefined", from the old GET parsing bug. Delete the old Responses and Dash tabs
 * afterwards to drop about 20 million cells.
 */
function migrateResponses() {
  const ss = SpreadsheetApp.openById(ANALYTICS_SHEET_ID);
  const events = ss.getSheetByName(EVENTS_SHEET);
  if (events && events.getLastRow() > 1) {
    throw new Error('Events already has rows. Delete the Sessions and Events tabs first to migrate again.');
  }
  const old = ss.getSheetByName(RESPONSE_SHEET);
  const values = old.getRange(1, 1, old.getLastRow(), 18).getValues();
  const header = values[0];
  const entries = values.slice(1).map(row => {
    const entry = {};
    header.forEach((name, i) => {
      let value = row[i];
      if (name === 'Timestamp' && value instanceof Date) value = value.getTime();
      if (name && value !== '') entry[name] = value;
    });
    return entry;
  });

  const batch = fromV1_(entries);
  writeBatch_(batch, true);
  writeCacheToSheets(); // and whatever the old version left in Script Properties
  console.log(`Migrated ${entries.length} rows into ${batch.sessions.length} sessions and ${batch.events.length} events`);
}

/**
 * Empties the caches the old versions kept in Script Properties into the new tabs. Named like the
 * old function so the existing daily trigger keeps working; delete that trigger once it has run.
 */
function writeCacheToSheets() {
  const props = PropertiesService.getScriptProperties();
  const entries = JSON.parse(props.getProperty('analyticsCache') || "[]");

  // Version 6 kept each submission as [key, value] pairs, sometimes with the "=" still encoded
  JSON.parse(props.getProperty('responseCache') || "[]").forEach(sub => {
    const entry = {};
    sub.forEach(param => {
      const pair = safeDecode_(param.filter(p => p !== undefined).join('='));
      const at = pair.indexOf('=');
      if (at > 0) entry[pair.slice(0, at)] = safeDecode_(pair.slice(at + 1));
    });
    entries.push(entry);
  });

  if (entries.length) writeBatch_(fromV1_(entries), true);
  props.deleteProperty('analyticsCache');
  props.deleteProperty('responseCache');
}

function safeDecode_(value) {
  try { return decodeURIComponent(value); } catch (err) { return value; }
}

/**
 * Run once by hand: builds the Dashboard tab. Every table is one QUERY over the narrow tabs,
 * so it stays quick as data grows (the old Dash ran a COUNTIF over 900+ columns for each row).
 */
function buildDashboard() {
  const ss = SpreadsheetApp.openById(ANALYTICS_SHEET_ID);
  const sheet = ss.getSheetByName(DASHBOARD_SHEET) || ss.insertSheet(DASHBOARD_SHEET, 0);
  sheet.clear();

  const S = `${SESSIONS_SHEET}!A2:O`;
  const E = `${EVENTS_SHEET}!A2:F`;
  const cells = [
    ['A1', 'Installs'], ['A2', `=COUNTUNIQUE(${SESSIONS_SHEET}!B2:B)`],
    ['B1', 'Users, last 30 days'], ['B2', `=IFERROR(COUNTUNIQUE(FILTER(${SESSIONS_SHEET}!D2:D, ${SESSIONS_SHEET}!A2:A >= TODAY() - 30)), 0)`],
    ['C1', 'Visits, last 30 days'], ['C2', `=COUNTIF(${SESSIONS_SHEET}!A2:A, ">=" & (TODAY() - 30))`],
    ['D1', 'Exports, last 30 days'], ['D2', `=COUNTIFS(${EVENTS_SHEET}!E2:E, "exported", ${EVENTS_SHEET}!A2:A, ">=" & (TODAY() - 30))`],

    ['A4', `=QUERY(${S}, "select D, count(C), max(A) where D <> '' group by D order by max(A) desc label D 'User', count(C) 'Visits', max(A) 'Last seen'", 0)`],
    ['E4', `=QUERY(${S}, "select N, count(C), max(A) where N <> '' group by N order by max(A) desc label N 'Location', count(C) 'Visits', max(A) 'Last seen'", 0)`],
    ['I4', `=QUERY(${S}, "select F, count(C) where F <> '' group by F order by count(C) desc label F 'Platform', count(C) 'Visits'", 0)`],
    ['L4', `=QUERY(${S}, "select year(A), month(A) + 1, count(C) where A is not null group by year(A), month(A) + 1 order by year(A) desc, month(A) + 1 desc label year(A) 'Year', month(A) + 1 'Month', count(C) 'Visits'", 0)`],
    ['P4', `=QUERY(${E}, "select F, count(A) where E = 'hashchanged' group by F order by count(A) desc limit 100 label F 'Page', count(A) 'Views'", 0)`],
    ['S4', `=QUERY(${E}, "select D, count(A), max(A) where E = 'edited' group by D order by count(A) desc label D 'Editor', count(A) 'Edits', max(A) 'Last edit'", 0)`]
  ];
  cells.forEach(([a1, value]) => sheet.getRange(a1).setValue(value));
  sheet.getRange('A1:D1').setFontWeight('bold');
  sheet.getRange('A2:D2').setFontSize(18);
  sheet.setFrozenRows(2);
}
