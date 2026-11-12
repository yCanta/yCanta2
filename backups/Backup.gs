/**
 * yCanta nightly backups (#138 phase 3).
 *
 * Every night this saves a gzipped JSON copy of each church database to the "yCanta backups" folder in
 * the Google Drive of the account that owns this project (info.ycanta@gmail.com). It keeps the last 14 days,
 * plus the first backup of each of the last 12 months. Older ones go to Drive's trash, which keeps them
 * 30 more days.
 *
 * A backup holds every document as it is now, deleted ones and kept old versions (h- docs) included, plus
 * the church's lists (_security). The Admin panel's "Restore from a backup" reads these files.
 *
 * Script Properties (Project Settings > Script Properties), set by hand, never in this file:
 *   COUCH_URL     the CouchDB address the app uses, ending in "/", e.g. https://ycanta.canaanf.org/couch/
 *   BACKUP_NAME   a CouchDB account on each church's members list. It only ever reads.
 *   BACKUP_PASS   its password
 *   BACKUP_DBS    the church databases, separated by commas, e.g. canaan,being_church
 * The script adds BACKUP_FOLDER_ID itself the first time it runs.
 *
 * Run installBackupTrigger() once from the editor to start the nightly runs, and backupAll() to take one
 * now. If a night fails, Apps Script emails the project's owner.
 */

const KEEP_DAYS = 14;
const KEEP_MONTHS = 12;
const FOLDER_NAME = 'yCanta backups';
const BACKUP_PAGE = 1000; // docs per request to CouchDB
const TIME_ZONE = 'America/New_York';

function backupAll() {
  const props = PropertiesService.getScriptProperties();
  const dbs = (props.getProperty('BACKUP_DBS') || '').split(',').map(function (db) { return db.trim(); }).filter(Boolean);
  if (!dbs.length) throw new Error('Set BACKUP_DBS in Script Properties first.');
  const folder = backupFolder();
  const day = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd');
  const failed = [];
  dbs.forEach(function (db) {
    try {
      const backup = takeBackup(db);
      const name = backupName(db, day);
      const blob = Utilities.gzip(Utilities.newBlob(JSON.stringify(backup), 'application/json', db + '.json'), name);
      // a second run on the same day replaces that day's file
      const same = folder.getFilesByName(name);
      while (same.hasNext()) same.next().setTrashed(true);
      folder.createFile(blob);
      console.log('Backed up ' + db + ': ' + backup.docs.length + ' docs');
      const names = [];
      const files = folder.getFiles();
      while (files.hasNext()) names.push(files.next().getName());
      backupsToRemove(names, db, day).forEach(function (old) {
        const found = folder.getFilesByName(old);
        while (found.hasNext()) found.next().setTrashed(true);
      });
    } catch (err) {
      failed.push(db + ': ' + (err && err.message || err));
    }
  });
  if (failed.length) throw new Error('Some backups failed. ' + failed.join(' | '));
}

// One database: every doc in its change feed (which, unlike _all_docs, includes deleted docs with what
// they kept), and its lists
function takeBackup(db) {
  const path = encodeURIComponent(db);
  const info = backupFetch(path);
  // In pages: kept old versions make the feed grow, and one fetch can't be bigger than 50MB. A doc saved
  // while this runs can show up in two pages; the later one is newer, so it replaces the earlier one.
  const byId = {};
  let since = '0';
  for (;;) {
    const page = backupFetch(path + '/_changes?include_docs=true&style=main_only&limit=' + BACKUP_PAGE + '&since=' + encodeURIComponent(since));
    page.results.forEach(function (row) { if (row.doc) byId[row.id] = row.doc; });
    since = page.last_seq;
    if (page.results.length < BACKUP_PAGE) break;
  }
  const docs = Object.keys(byId).map(function (id) { return byId[id]; });
  return {
    yCantaBackup: 1,
    db: db,
    takenAt: new Date().toISOString(),
    docCount: info.doc_count,
    lastSeq: since,
    security: backupFetch(path + '/_security'),
    docs: docs,
  };
}

function backupFetch(path) {
  const props = PropertiesService.getScriptProperties();
  const base = props.getProperty('COUCH_URL');
  if (!base) throw new Error('Set COUCH_URL in Script Properties first.');
  const auth = Utilities.base64Encode(props.getProperty('BACKUP_NAME') + ':' + props.getProperty('BACKUP_PASS'), Utilities.Charset.UTF_8);
  const res = UrlFetchApp.fetch(base + path, {
    headers: { Authorization: 'Basic ' + auth },
    muteHttpExceptions: true,
    followRedirects: false,
  });
  const code = res.getResponseCode();
  if (code !== 200) throw new Error(path.split('?')[0] + ' answered ' + code + ': ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText());
}

function backupFolder() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('BACKUP_FOLDER_ID');
  if (id) {
    try {
      const folder = DriveApp.getFolderById(id);
      if (!folder.isTrashed()) return folder;
    } catch (err) {
      // gone: make a new one
    }
  }
  const folder = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('BACKUP_FOLDER_ID', folder.getId());
  return folder;
}

function backupName(db, day) {
  return db + ' ' + day + '.json.gz';
}

// Which of one database's backups to remove on `today` (yyyy-MM-dd): all but the last KEEP_DAYS days and
// the first backup of each of the last KEEP_MONTHS months, this one included. Other files are left alone.
function backupsToRemove(names, db, today) {
  const prefix = db + ' ';
  const dated = names
    .filter(function (name) { return name.indexOf(prefix) === 0 && /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(name.slice(prefix.length)); })
    .map(function (name) { return { name: name, day: name.slice(prefix.length, prefix.length + 10) }; })
    .sort(function (a, b) { return a.day < b.day ? -1 : a.day > b.day ? 1 : 0; });
  const keep = {};
  const firstDay = shiftDay(today, -(KEEP_DAYS - 1));
  const months = {};
  for (let i = 0; i < KEEP_MONTHS; i++) months[monthsBack(today, i)] = true;
  const firstOfMonth = {};
  dated.forEach(function (backup) {
    if (backup.day >= firstDay) keep[backup.name] = true;
    const month = backup.day.slice(0, 7);
    if (months[month] && !firstOfMonth[month]) {
      firstOfMonth[month] = true;
      keep[backup.name] = true;
    }
  });
  return dated.filter(function (backup) { return !keep[backup.name]; }).map(function (backup) { return backup.name; });
}

function shiftDay(day, days) {
  return new Date(Date.parse(day + 'T12:00:00Z') + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function monthsBack(day, count) {
  let year = Number(day.slice(0, 4));
  let month = Number(day.slice(5, 7)) - count;
  while (month < 1) { month += 12; year--; }
  return year + '-' + (month < 10 ? '0' : '') + month;
}

// Run once from the editor: a backup every night between 2 and 3 am
function installBackupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'backupAll') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('backupAll').timeBased().everyDays(1).atHour(2).inTimezone(TIME_ZONE).create();
}
