/**
 * yCanta analytics, version 2. Replaces Responses.gs.
 *
 * Two tabs with fixed columns:
 *   Sessions  one row per visit (page load): who, device, location, settings, active minutes, and
 *             every page viewed, in order, in one cell. Updated in place as the visit goes on.
 *   Events    one row per rare thing: an edit, an export, analytics turned off, going offline.
 * Each POST writes straight to these tabs under the script lock. There is no Script Properties
 * cache, no daily trigger, and no new columns, so the tabs stay small and the dashboard fast.
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
  ['Location', 'location'], ['Last seen', 'lastSeen'], ['Minutes', 'activeMin'], ['Views', 'views'],
  ['Pages', 'pages']
];
const EVENT_COLUMNS = ['Time', 'Install', 'Session', 'User', 'Event', 'Value'];
const col_ = key => SESSION_COLUMNS.findIndex(([, k]) => k === key); // 0-based column of a session key

const SESSION_GAP_MS = 30 * 60 * 1000; // version 1 data has no visit id: a 30 minute gap starts a new one
const MAX_SESSIONS_PER_POST = 60;
const MAX_EVENTS_PER_POST = 1000;
const MAX_TEXT = 2000;       // export events carry the whole export config as JSON
const MAX_PAGES_TEXT = 8000; // a sheet cell holds 50,000 characters
const PAGE_EVENTS = ['hashchanged'];     // these go in the visit's Pages cell, not the Events tab
const ACTIVITY_EVENTS = ['timing'];      // version 1 tab switches: they only move Last seen

// Version 1 names that are facts about the visit, and the session key each one fills
const V1_SESSION_FIELDS = {
  username: 'user', platform: 'platform', screenSize: 'screen', touch: 'touch', installed: 'installed',
  darkMode: 'darkMode', fontSize: 'fontSize', loadTime: 'loadMs', location: 'location'
};

/**
 * Entry point for {action: "log"} POSTs.
 *   Version 2: {v: 2, sessions: [{id, install, start, user, ..., activeMin, views, pages: []}],
 *               events: [[time, sessionId, user, event, value]], legacy: [version 1 entries]}
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
      if (!Array.isArray(session.pages)) delete session.pages;
      return session;
    });

  // An event's install comes from its session, when the session is in this POST
  const installs = {};
  sessions.forEach(s => { installs[s.id] = s.install; });

  const events = (Array.isArray(payload.events) ? payload.events : [])
    .slice(0, MAX_EVENTS_PER_POST)
    .filter(e => Array.isArray(e) && e.length >= 5)
    .filter(([, , , type]) => !PAGE_EVENTS.includes(type) && !ACTIVITY_EVENTS.includes(type))
    .map(([time, session, user, type, value]) => ({
      time: Number(time), install: installs[session] || '', session: session || '', user: user || '', type, value
    }));

  return { sessions, events };
}

/**
 * Version 1 entries are one fact each: {Timestamp, analyticId, username: "u-carl"}. Group them into
 * visits: a visit starts at a login ('username' again for the same install) or after a 30 minute gap.
 * Facts fill the visit's Sessions row, pages go in its Pages cell, and the rest become events.
 * A visit with no facts is the rest of one already in the sheet (the old app sent on every tab
 * switch), so it is marked to be added to that row instead of getting its own.
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
        id: item.install + '-' + item.time, install: item.install, start: item.time, lastSeen: item.time,
        pages: [], views: 0, continuation: true
      };
      sessions.push(session);
    }
    session.lastSeen = Math.max(session.lastSeen, item.time);
    if (field) {
      session[field] = item.value;
      session.continuation = false;
    } else if (item.type === 'connection') {
      session.online = item.value === 'online'; // logged at every login; a later change just updates it
    } else if (PAGE_EVENTS.includes(item.type)) {
      addPage_(session, item.value);
    } else if (!ACTIVITY_EVENTS.includes(item.type)) {
      events.push({ time: item.time, install: item.install, sessionRef: session, type: item.type, value: item.value });
    }
  });

  sessions.forEach(s => {
    if (s.start > 0) s.activeMin = minutesBetween_(s.start, s.lastSeen); // the old app didn't measure active time
  });
  events.forEach(e => {
    e.user = e.sessionRef.user || '';
    e.session = e.sessionRef.continuation ? '' : e.sessionRef.id;
    delete e.sessionRef;
  });
  return { sessions, events };
}

// Pages are kept without the "#", and a page repeated straight after itself is counted but not listed again
function addPage_(session, hash) {
  const page = String(hash).replace(/^#/, '') || 'home';
  if (session.pages[session.pages.length - 1] !== page) session.pages.push(page);
  session.views += 1;
}

function minutesBetween_(start, end) {
  return Math.round((end - start) / 6000) / 10;
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
 * Updates the rows of visits the tab already has, and returns the visits that still need a row.
 *   Version 2 visit: found by its Session id. The app sends the whole visit each time, so new values win.
 *   Version 1 continuation: added to the install's latest row if that one ended less than 30 minutes before.
 */
function updateExistingSessions_(sheet, sessions) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return sessions;
  const width = SESSION_COLUMNS.length;

  return sessions.filter(session => {
    let found;
    if (session.continuation) {
      const matches = sheet.getRange(2, col_('install') + 1, lastRow - 1, 1)
        .createTextFinder(String(session.install)).matchEntireCell(true).findAll();
      found = matches.length ? matches[matches.length - 1] : null;
    } else {
      found = sheet.getRange(2, col_('id') + 1, lastRow - 1, 1)
        .createTextFinder(String(session.id)).matchEntireCell(true).findNext();
    }
    if (!found) return true;

    const rowRange = sheet.getRange(found.getRow(), 1, 1, width);
    const row = rowRange.getValues()[0];
    const oldEnd = row[col_('lastSeen')];
    if (session.continuation && !(oldEnd instanceof Date && session.start - oldEnd.getTime() <= SESSION_GAP_MS)) {
      return true; // too long after that visit: a visit of its own
    }

    const update = sessionRow_(session);
    const merged = row.map((old, i) => {
      const value = update[i];
      if (session.continuation) {
        if (i === col_('pages')) return joinPages_(String(old || '').split(' ').filter(Boolean).concat(session.pages));
        if (i === col_('views')) return (Number(old) || 0) + session.views;
        if (i === col_('id') || i === col_('start')) return old;
      }
      if (value === '' || value === null) return old;
      if (i === col_('start') && old instanceof Date) return value < old ? value : old;
      if (i === col_('lastSeen') && old instanceof Date) return value > old ? value : old;
      return value;
    });
    if (session.continuation && merged[col_('start')] instanceof Date && merged[col_('lastSeen')] instanceof Date) {
      merged[col_('activeMin')] = minutesBetween_(merged[col_('start')].getTime(), merged[col_('lastSeen')].getTime());
    }
    rowRange.setValues([merged]);
    return false;
  });
}

function sessionRow_(session) {
  return SESSION_COLUMNS.map(([, key]) => {
    const value = session[key];
    if (key === 'start' || key === 'lastSeen') return toDate_(value);
    if (key === 'pages') return Array.isArray(value) ? joinPages_(value) : '';
    if (key === 'views' && !value) return '';
    return cell_(value);
  });
}

// One cell, pages separated by spaces. A very long visit keeps its first pages and says how many more there were.
function joinPages_(pages) {
  let text = pages.map(p => String(p).replace(/\s+/g, '')).join(' ');
  if (text.length > MAX_PAGES_TEXT) {
    const kept = text.slice(0, MAX_PAGES_TEXT).split(' ').slice(0, -1);
    text = kept.join(' ') + ` ...+${pages.length - kept.length}`;
  }
  return cell_(text, MAX_PAGES_TEXT + 20);
}

function eventRow_(e) {
  return [toDate_(e.time), cell_(e.install), cell_(e.session), cell_(e.user), cell_(e.type), cell_(e.value)];
}

function toDate_(ms) {
  ms = Number(ms);
  return ms > 0 ? new Date(ms) : '';
}

// A sheet cell value. Text that starts like a formula is kept as text: anyone can POST to this web app.
function cell_(value, maxLength = MAX_TEXT) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text.length > maxLength) text = text.slice(0, maxLength);
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
 * Run once by hand after deploying (a second run refuses): copies the old Responses tab (columns A:R)
 * into Sessions and Events, and empties the old Script Properties cache into them. Then delete the
 * old Responses and Dash tabs: the file was at Google's 20 million cell limit.
 */
function migrateResponses() {
  const props = PropertiesService.getScriptProperties();
  // First, since the old cache can fill the property store and then the flag below can't be saved
  const fromCache = writeCacheToSheets();
  if (props.getProperty('responsesMigrated')) {
    throw new Error('Already migrated on ' + props.getProperty('responsesMigrated') + '. Delete that script property to migrate again.');
  }
  const ss = SpreadsheetApp.openById(ANALYTICS_SHEET_ID);
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

  // In one pass every visit is complete, so none of them is a continuation of a row in the sheet
  const batch = fromV1_(entries);
  batch.sessions.forEach(s => { s.continuation = false; });
  writeBatch_(batch, true);
  props.setProperty('responsesMigrated', new Date().toISOString());

  // The app may have sent new rows before this ran, so put both tabs in time order
  [SESSIONS_SHEET, EVENTS_SHEET].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet.getLastRow() > 2) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).sort(1);
  });
  const summary = `Migrated ${entries.length} rows into ${batch.sessions.length} visits and ${batch.events.length} events, plus ${fromCache} cached entries`;
  console.log(summary);
  return summary;
}

/**
 * Empties the caches the old versions kept in Script Properties into the new tabs. Named like the
 * old function so the existing daily trigger keeps working; delete that trigger once it has run.
 */
function writeCacheToSheets() {
  const props = PropertiesService.getScriptProperties();
  const entries = JSON.parse(props.getProperty('analyticsCache') || "[]");

  // Version 6 kept each GET as [key, value] pairs, split on the raw "&" and "=" and decoded once.
  // When the "=" arrived encoded, the pair is ["Timestamp%3D123", "undefined"].
  JSON.parse(props.getProperty('responseCache') || "[]").forEach(sub => {
    const entry = {};
    (Array.isArray(sub) ? sub : []).forEach(param => {
      if (!Array.isArray(param)) return;
      let [key, value] = param;
      if (value === undefined || value === null || value === 'undefined') {
        const pair = safeDecode_(String(key));
        const at = pair.indexOf('=');
        if (at <= 0) return;
        key = pair.slice(0, at);
        value = pair.slice(at + 1);
      }
      entry[key] = safeDecode_(String(value)); // the old app encoded values twice
    });
    entries.push(entry);
  });

  if (entries.length) {
    const batch = fromV1_(entries);
    batch.sessions.forEach(s => { s.continuation = false; }); // the cache holds whole visits too
    writeBatch_(batch, true);
  }
  props.deleteProperty('analyticsCache');
  props.deleteProperty('responseCache');
  return entries.length;
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

  const S = `${SESSIONS_SHEET}!A2:R`;
  const E = `${EVENTS_SHEET}!A2:F`;
  const last30 = `${SESSIONS_SHEET}!A2:A >= TODAY() - 30`;
  const cells = [
    ['A1', 'Installs'], ['A2', `=COUNTUNIQUE(${SESSIONS_SHEET}!B2:B)`],
    ['B1', 'Users, last 30 days'], ['B2', `=IFERROR(COUNTUNIQUE(FILTER(${SESSIONS_SHEET}!D2:D, ${last30})), 0)`],
    ['C1', 'Visits, last 30 days'], ['C2', `=COUNTIF(${SESSIONS_SHEET}!A2:A, ">=" & (TODAY() - 30))`],
    ['D1', 'Median minutes per visit, last 30 days'], ['D2', `=IFERROR(MEDIAN(FILTER(${SESSIONS_SHEET}!P2:P, ${last30}, ${SESSIONS_SHEET}!P2:P <> "")), 0)`],
    ['E1', 'Exports, last 30 days'], ['E2', `=COUNTIFS(${EVENTS_SHEET}!E2:E, "exported", ${EVENTS_SHEET}!A2:A, ">=" & (TODAY() - 30))`],

    ['A4', `=QUERY(${S}, "select D, count(C), avg(P), sum(Q), max(A) where D <> '' group by D order by max(A) desc label D 'User', count(C) 'Visits', avg(P) 'Avg minutes', sum(Q) 'Page views', max(A) 'Last seen' format avg(P) '0.0'", 0)`],
    ['G4', `=QUERY(${S}, "select N, count(C), max(A) where N <> '' group by N order by max(A) desc label N 'Location', count(C) 'Visits', max(A) 'Last seen'", 0)`],
    ['K4', `=QUERY(${S}, "select F, count(C), avg(P) where F <> '' group by F order by count(C) desc label F 'Platform', count(C) 'Visits', avg(P) 'Avg minutes' format avg(P) '0.0'", 0)`],
    ['O4', `=QUERY(${S}, "select year(A), month(A) + 1, count(C), avg(P), sum(Q) where A is not null group by year(A), month(A) + 1 order by year(A) desc, month(A) + 1 desc label year(A) 'Year', month(A) + 1 'Month', count(C) 'Visits', avg(P) 'Avg minutes', sum(Q) 'Page views' format avg(P) '0.0'", 0)`],
    ['U4', `=QUERY(${E}, "select D, count(A), max(A) where E = 'edited' group by D order by count(A) desc label D 'Editor', count(A) 'Edits', max(A) 'Last edit'", 0)`]
  ];
  cells.forEach(([a1, value]) => sheet.getRange(a1).setValue(value));
  sheet.getRange('A1:E1').setFontWeight('bold');
  sheet.getRange('A2:E2').setFontSize(18);
  sheet.setFrozenRows(2);
}
