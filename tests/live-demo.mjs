// Opens a shared presentation to try by hand (#51), on the LOCAL test server only. A real browser window
// presents a demo songbook as alice and shares it; a second window follows as a leader (alice on "another
// device"); a third, phone-sized and not signed in, follows as someone in the room. The browser stays open
// when this ends: close it when done. The demo songs stay in the local test church (s-demo-*, sb-demo-51).
//
// Needs: the local CouchDB set up by database/seed-local-church.mjs, something serving this folder on
// localhost:8765 (or nothing there: then it serves the folder itself and keeps running until you press Ctrl+C),
// and Chrome, Brave or Edge (or set BROWSER).
// usage: node tests/live-demo.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'http://localhost:8765';
const COUCH = 'http://127.0.0.1:5984';
const CDP_PORT = 9335;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function req(name, method, path, body) {
  const res = await fetch(COUCH + path, { method,
    headers: { Authorization: 'Basic ' + Buffer.from(`${name}:local-test-${name}`).toString('base64'), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// ---------- demo songs (placeholder words, real song shapes) ----------
const stamp = Date.now();
const lines = (what, n = 2) => Array.from({ length: n }, (_, i) => [`${what}, line ${i + 1}`]);
const song = (id, title, parts) => ({ _id: id, title, addedBy: 'u-alice', editedBy: 'u-alice', added: stamp, edited: stamp,
  authors: ['Demo'], scripture_ref: [''], introduction: '', key: 'G', categories: [], cclis: false, yt: '', chords: '', copyright: 'Demo song',
  content: parts.map(([type, words]) => [{ type }, lines(words)]),
  search: `t:${title}\u0000a:Demo\u0000addedBy:alice\u0000` });
const songs = [
  song('s-demo-1', 'Demo: Verse and Chorus', [['verse', 'First verse'], ['chorus', 'Chorus'], ['verse', 'Second verse'], ['verse', 'Third verse'], ['bridge', 'Bridge'], ['final chorus', 'Final chorus']]),
  song('s-demo-2', 'Demo: With a Pre-chorus', [['verse', 'First verse'], ['pre-chorus', 'Pre-chorus'], ['chorus', 'Chorus'], ['verse', 'Second verse'], ['verse', 'Third verse'], ['ending', 'Ending']]),
  song('s-demo-3', 'Demo: Hymn', [['verse', 'First verse'], ['verse', 'Second verse'], ['verse', 'Third verse'], ['verse', 'Fourth verse']]),
  song('s-demo-4', 'Demo: Chorus First', [['chorus', 'Chorus'], ['verse', 'First verse'], ['verse', 'Second verse']]),
];
for (const doc of [...songs, { _id: 'sb-demo-51', title: 'Shared Presentation Demo', addedBy: 'u-alice', editedBy: 'u-alice', added: stamp, edited: stamp,
  showStatus: false, showComments: true, songrefs: songs.map(s => ({ id: s._id, status: 'n', key: 'G' })) }]) {
  const old = await req('alice', 'GET', '/church_a/' + doc._id);
  const put = await req('alice', 'PUT', '/church_a/' + doc._id, old.status === 200 ? { ...doc, _rev: old.json._rev } : doc);
  if (put.status !== 201) { console.error('Couldn\'t save', doc._id, put); process.exit(1); }
}

// ---------- the app ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
let server = null;
if (!(await fetch(APP + '/index.html').then(r => r.ok).catch(() => false))) {
  server = createServer((rq, rs) => {
    let path = normalize(decodeURIComponent(new URL(rq.url, APP).pathname)).replace(/^([\\/])+/, '');
    if (!path) path = 'index.html';
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { rs.writeHead(404); rs.end(); return; }
    rs.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    rs.end(readFileSync(file));
  });
  await new Promise(r => server.listen(8765, '127.0.0.1', r));
  console.log('Serving the app on', APP, '(press Ctrl+C when done)');
}

// ---------- a visible browser of its own (a new profile, so no old cached app files) ----------
const browserPath = [process.env.BROWSER,
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p));
const profile = mkdtempSync(join(tmpdir(), 'ycanta-live-demo-'));
spawn(browserPath, [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--window-position=0,0', '--window-size=1100,820', 'about:blank'], { stdio: 'ignore', detached: true }).unref();

async function tab(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const until = async (expr, what, ms = 20000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await ev(expr).catch(() => false)) return true; await sleep(100); }
    throw new Error(`Timed out waiting for ${what}`);
  };
  await send('Page.enable').catch(() => {}); // (the browser itself has no page)
  await send('Network.setBlockedURLs', { urls: ['*ycanta.canaanf.org*', '*login.ycanta.com*', '*demo.ycanta.com*'] }).catch(() => {});
  return { ws, send, ev, until };
}
let first = null;
for (let tries = 0; tries < 200 && !first; tries++) { // up to 40 seconds: a browser can be slow to start
  try { first = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find(p => p.type === 'page'); } catch { /* starting */ }
  if (!first) await sleep(200);
}
if (!first) { console.error('The browser did not start'); process.exit(1); }
const browserWs = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json()).webSocketDebuggerUrl;
const b = await tab({ webSocketDebuggerUrl: browserWs });
const pageFor = async targetId => tab((await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find(t => t.id === targetId));

// 1. The presenter: alice signs in and presents the demo book
const d = await tab(first);
await d.send('Page.navigate', { url: APP + '/#login' });
await d.until(`!!document.getElementById('db_select')`, 'the sign-in page');
await d.ev(`localStorage.setItem('databases', JSON.stringify({ 'church_a(remote)': { name: 'church_a(remote)', type: 'remote', url: 'http://localhost:5984/church_a' } }));
  localStorage.setItem('defaultdbName', 'church_a(remote)'); 'ok'`);
await d.send('Page.reload');
await d.until(`[...document.querySelectorAll('#db_select option')].some(o => o.value === 'church_a(remote)')`, 'the church list');
await d.ev(`(() => { const s = document.getElementById('db_select'); s.value = 'church_a(remote)'; s.dispatchEvent(new Event('change'));
  document.getElementById('username').value = 'alice'; document.getElementById('pwd').value = 'local-test-alice'; })()`);
await d.ev(`checkLogin() && dbLogin('login'), 'ok'`);
await d.until(`window.loggedin === true && !location.hash.startsWith('#login')`, 'sign-in', 40000);
await d.until(`!!window.db && window.db.get('sb-demo-51').then(() => true, () => false)`, 'the demo book on the device', 40000);
await d.ev(`location.hash = '#sb-demo-51'; 'ok'`);
await d.until(`window.songbook && window.songbook._id === 'sb-demo-51'`, 'the songbook');
await d.ev(`location.hash = '#sb-demo-51?present'; 'ok'`);
const P = `document.getElementById('presentation').contentWindow`;
await d.until(`!!document.getElementById('presentation') && !!${P}.presentationReady`, 'the presentation');
await d.ev(`${P}.presentationReady.then(() => 'ok')`);
await d.ev(`${P}.startShare().then(() => 'ok')`);
const code = await d.ev(`${P}.liveHost().Live.code`);
const link = await d.ev(`${P}.shareLink(${JSON.stringify(code)})`);
await d.ev(`${P}.nextChunk(), ${P}.toggleHelp(), 'ok'`);

// 2. A leader: alice on "another device" (same sign-in, its own window)
const leaderTarget = await b.send('Target.createTarget', { url: link, newWindow: true });
const leaderWin = await b.send('Browser.getWindowForTarget', { targetId: leaderTarget.targetId });
await b.send('Browser.setWindowBounds', { windowId: leaderWin.windowId, bounds: { left: 1110, top: 0, width: 820, height: 620 } });

// 3. Someone in the room: not signed in (a separate browser context), phone-sized
const ctx = await b.send('Target.createBrowserContext');
const phoneTarget = await b.send('Target.createTarget', { url: 'about:blank', newWindow: true, browserContextId: ctx.browserContextId });
const phoneWin = await b.send('Browser.getWindowForTarget', { targetId: phoneTarget.targetId });
await b.send('Browser.setWindowBounds', { windowId: phoneWin.windowId, bounds: { left: 1110, top: 630, width: 420, height: 760 } });
const phone = await pageFor(phoneTarget.targetId);
await phone.send('Page.navigate', { url: link });

console.log(`Sharing code ${code}. Three windows are open:
  1. the presenter (alice), with the setup panel open (h or ? opens and closes it)
  2. a leader following (alice on another device): the presenter can "Let them lead"
  3. a phone-sized window, not signed in: someone in the room
Follow link: ${link}
Close the browser when done.`);
for (const w of [d, b, phone]) w.ws.close();
if (!server) process.exit(0);
