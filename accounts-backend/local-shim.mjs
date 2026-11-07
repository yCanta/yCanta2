// Runs Code.gs unchanged in Node, with stand-ins for the Apps Script services, for LOCAL testing only.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

// UrlFetchApp is synchronous; do each request in a child Node process
const fetchChild = `
const [url, init] = JSON.parse(process.argv[1]);
fetch(url, init).then(async r => {
  const headers = {}; r.headers.forEach((v, k) => { headers[k === 'set-cookie' ? 'Set-Cookie' : k] = v; });
  process.stdout.write(JSON.stringify({ status: r.status, text: await r.text(), headers }));
});`;

export function loadHelper(props, { logRows = [], sentMail = [] } = {}) {
  const sheets = {};
  const sheet = name => (sheets[name] ||= {
    rows: name === 'Log' ? logRows : [],
    getLastRow() { return this.rows.length; },
    appendRow(r) { this.rows.push(r); },
    getDataRange() { const rows = this.rows; return { getValues: () => rows.map(r => [...r]) }; },
    deleteRow(i) { this.rows.splice(i - 1, 1); },
    getRange(row, col) { const rows = this.rows; return { setValue: v => { rows[row - 1][col - 1] = v; } }; },
    hideSheet() {},
  });
  const sandbox = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    Utilities: {
      base64Encode: s => Buffer.from(s, 'utf8').toString('base64'),
      Charset: { UTF_8: 'UTF-8' },
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, text) => [...require_crypto().createHash('sha256').update(String(text), 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)),
      getUuid: () => require_crypto().randomUUID(),
    },
    UrlFetchApp: {
      fetch(url, p) {
        const headers = { ...(p.headers || {}) };
        if (p.contentType) headers['Content-Type'] = p.contentType;
        const out = JSON.parse(execFileSync(process.execPath, ['-e', fetchChild, JSON.stringify([url, { method: p.method.toUpperCase(), headers, body: p.payload }])]).toString());
        return { getResponseCode: () => out.status, getContentText: () => out.text, getAllHeaders: () => out.headers };
      },
    },
    MailApp: { sendEmail: msg => sentMail.push(msg), getRemainingDailyQuota: () => 100 },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: t => ({ text: t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: name => sheet(name), insertSheet: name => sheet(name) }) },
    Date, JSON, Math,
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('./Code.gs', import.meta.url), 'utf8'), sandbox);
  return { sandbox, sheets, call: body => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(body) } }).text) };
}

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
function require_crypto() { return require('node:crypto'); }
