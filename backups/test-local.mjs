// Runs Backup.gs unchanged in Node against the LOCAL test CouchDB (see ../database/), with stand-ins for
// the Apps Script services. Drive is a folder: local-test-output/ (gitignored). Run seed-local-church.mjs
// first. Checks what a backup holds and which old backups get removed.
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gzipSync, gunzipSync } from 'node:zlib';
import vm from 'node:vm';
import { req, as, makeUser, BASE } from '../database/lib.mjs';

const DB = 'church_a';
const out = new URL('./local-test-output/', import.meta.url);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// a backup account on the church's members list
await makeUser('backup');
const sec = (await req(as('admin'), 'GET', `/${DB}/_security`)).json;
if (!sec.members.names.includes('backup')) {
  sec.members.names.push('backup');
  await req(as('admin'), 'PUT', `/${DB}/_security`, sec);
}

// --- stand-ins
const fetchChild = `
const [url, init] = JSON.parse(process.argv[1]);
fetch(url, init).then(async r => process.stdout.write(JSON.stringify({ status: r.status, text: await r.text() })));`;
const props = { COUCH_URL: BASE + '/', BACKUP_NAME: 'backup', BACKUP_PASS: 'local-test-backup', BACKUP_DBS: DB };
const iterator = list => { let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; };
const fileFor = name => ({
  getName: () => name,
  setTrashed: () => renameSync(new URL(name, out), new URL(name + '.trashed', out)),
});
const folder = {
  getId: () => 'local-folder',
  isTrashed: () => false,
  getFiles: () => iterator(readdirSync(out).filter(n => !n.endsWith('.trashed')).map(fileFor)),
  getFilesByName: name => iterator(existsSync(new URL(name, out)) ? [fileFor(name)] : []),
  createFile: blob => { writeFileSync(new URL(blob.name, out), blob.bytes); },
};
const sandbox = {
  console, JSON, Date, Math,
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); } }) },
  Utilities: {
    base64Encode: s => Buffer.from(s, 'utf8').toString('base64'),
    Charset: { UTF_8: 'UTF-8' },
    formatDate: (date, tz, fmt) => date.toISOString().slice(0, 10),
    newBlob: (text, type, name) => ({ bytes: Buffer.from(text, 'utf8'), type, name }),
    gzip: (blob, name) => ({ bytes: gzipSync(blob.bytes), name }),
  },
  UrlFetchApp: {
    fetch(url, p) {
      const r = JSON.parse(execFileSync(process.execPath, ['-e', fetchChild, JSON.stringify([url, { headers: p.headers }])]).toString());
      return { getResponseCode: () => r.status, getContentText: () => r.text };
    },
  },
  DriveApp: { getFolderById: () => folder, createFolder: () => folder },
};
vm.createContext(sandbox);
// small pages, so a few test docs take several requests (paging is what real churches need)
const script = readFileSync(new URL('./Backup.gs', import.meta.url), 'utf8');
if (!/const BACKUP_PAGE = \d+;/.test(script)) throw new Error('BACKUP_PAGE not found in Backup.gs');
vm.runInContext(script.replace(/const BACKUP_PAGE = \d+;/, 'const BACKUP_PAGE = 3;'), sandbox);

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`); };

// --- a backup
// an old-style delete (only _id and _rev kept), so the backup has one
const gone = await req(as('alice'), 'PUT', `/${DB}/s-backup-gone`, { title: 'Gone', addedBy: 'u-alice' });
await req(as('alice'), 'DELETE', `/${DB}/s-backup-gone?rev=${gone.json.rev}`);

sandbox.backupAll();
const today = new Date().toISOString().slice(0, 10);
const file = `${DB} ${today}.json.gz`;
const backup = JSON.parse(gunzipSync(readFileSync(new URL(file, out))).toString('utf8'));
const server = (await req(as('admin'), 'GET', `/${DB}/_changes?style=main_only`)).json.results.length;
check('backup file written', !!backup.yCantaBackup, file);
check('every doc in the change feed is in it', backup.docs.length === server, `${backup.docs.length} of ${server}`);
check('deleted docs are in it', backup.docs.some(d => d._id === 's-backup-gone' && d._deleted));
check('the church lists are in it', Array.isArray(backup.security?.admins?.names), JSON.stringify(backup.security.admins));
check('the save rules are in it', backup.docs.some(d => d._id === '_design/auth'));
sandbox.backupAll();
check('a second run the same day replaces the file', readdirSync(out).filter(n => n === file).length === 1);

// --- a wrong password fails loudly
props.BACKUP_PASS = 'wrong';
let threw = '';
try { sandbox.backupAll(); } catch (err) { threw = err.message; }
check('a failed backup throws, so Apps Script emails the owner', /answered 401/.test(threw), threw.slice(0, 80));
props.BACKUP_PASS = 'local-test-backup';

// --- which old backups go
const days = [];
for (let d = new Date('2025-09-01T12:00:00Z'); d <= new Date('2026-11-10T12:00:00Z'); d = new Date(d.getTime() + 864e5)) {
  days.push(d.toISOString().slice(0, 10));
}
const names = days.map(d => `canaan ${d}.json.gz`).concat(['being_church 2025-01-01.json.gz', 'notes.txt']);
const removed = new Set(sandbox.backupsToRemove(names, 'canaan', '2026-11-10'));
const kept = names.filter(n => !removed.has(n) && n.startsWith('canaan '));
const keptDays = kept.map(n => n.slice(7, 17));
check('keeps the last 14 days', days.slice(-14).every(d => keptDays.includes(d)));
check('keeps the first of each of the last 12 months', ['2025-12-01', '2026-01-01', '2026-06-01', '2026-11-01'].every(d => keptDays.includes(d)) && !keptDays.includes('2025-11-01'));
check('keeps 14 + 11 files in all', kept.length === 25, `${kept.length}: ${keptDays.filter(d => d < '2026-10-28').join(', ')}`);
check("leaves other churches' backups and other files alone", !removed.has('being_church 2025-01-01.json.gz') && !removed.has('notes.txt'));
check('a short history keeps everything', sandbox.backupsToRemove(['canaan 2026-11-09.json.gz', 'canaan 2026-11-10.json.gz'], 'canaan', '2026-11-10').length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
