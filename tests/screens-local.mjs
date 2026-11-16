// Screenshots of every page at every screen size, against the LOCAL test server only, for checking that a
// change to the layout or the styles moves nothing it shouldn't. Take a set before the change and one after,
// then compare them: it lists each picture that changed, with how many pixels and where.
//
// Needs the same as tests/app-local.mjs: the local CouchDB with church_a seeded (database/seed-local-church.mjs),
// and Chrome, Brave or Edge.
// usage: node tests/screens-local.mjs shoot <folder>          (ONLY=<text> shoots only names containing it)
//        node tests/screens-local.mjs compare <before> <after>
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const [mode, dirA, dirB] = process.argv.slice(2);
if (!['shoot', 'compare'].includes(mode) || !dirA || (mode === 'compare' && !dirB)) {
  console.error('usage: node tests/screens-local.mjs shoot <folder> | compare <before> <after>');
  process.exit(2);
}
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'http://localhost:8765';
const CDP_PORT = 9334;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The screen sizes the styles change at: 40rem wide (640px), 75rem (1200px), 31.25rem tall (500px), a mouse
// or a finger (hover), and dark mode
const SIZES = [
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'landscape', width: 844, height: 390, mobile: true },
  { name: 'tablet', width: 820, height: 1180, mobile: true },
  { name: 'laptop', width: 1024, height: 768, mobile: false },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'phone-dark', width: 390, height: 844, mobile: true, dark: true },
  { name: 'desktop-dark', width: 1440, height: 900, mobile: false, dark: true },
];
// The pages, from the seeded church: its songbook, a song in it, the editors and the export, and the side
// panels open
const BOOK = 'sb-eddie-1', SONG = 's-vera-1';
const VIEWS = [
  { name: 'songbooks', hash: '#songbooks' },
  { name: 'book', hash: `#${BOOK}` },
  { name: 'song', hash: `#${BOOK}&${SONG}` },
  { name: 'book-edit', hash: `#${BOOK}?edit`, wait: `!!document.querySelector('#songbook_content .edit_buttons')` },
  { name: 'book-edit-panel', hash: `#${BOOK}?edit`, wait: `!!document.querySelector('#songbook_content .edit_buttons')`, open: '#songListEdit' },
  { name: 'song-edit', hash: `#${BOOK}&${SONG}?edit`, wait: `!!document.querySelector('#song .edit_buttons')` },
  { name: 'song-edit-panel', hash: `#${BOOK}&${SONG}?edit`, wait: `!!document.querySelector('#song .edit_buttons')`, open: '#song-edit' },
  // an old version open beside the song (a stand-in, as the Info window's list would give it)
  { name: 'song-old-version', hash: `#${BOOK}&${SONG}`, wait: `!!window.song && !!window.user`, setup: `(async () => {
      const old = JSON.parse(JSON.stringify(window.song)); old._rev = '1-oldversion'; old.content = [[{ type: 'verse' }, ['la la la (an old version)']]];
      delete old._versions; window.song._versions = { list: [{ rev: window.song._rev }, { rev: old._rev, doc: old }] };
      await loadSong(window.song._id, old._rev); return 'ok'; })()` },
  { name: 'export', hash: `#${BOOK}?export`, wait: `!!document.querySelector('#downloadPDF a[href^="blob:"]')` },
  { name: 'export-preview', hash: `#${BOOK}?export`, wait: `!!document.querySelector('#downloadPDF a[href^="blob:"]')`, open: '#exportPreview' },
];

// ---------- file server (only if nothing is on 8765 yet) ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.xml': 'text/xml' };
let server = null;
if (mode === 'shoot' && !(await fetch(APP + '/index.html').then(r => r.ok).catch(() => false))) {
  server = createServer((rq, rs) => {
    let path = normalize(decodeURIComponent(new URL(rq.url, APP).pathname)).replace(/^([\\/])+/, '');
    if (!path) path = 'index.html';
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { rs.writeHead(404); rs.end(); return; }
    rs.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    rs.end(readFileSync(file));
  });
  await new Promise(r => server.listen(8765, '127.0.0.1', r));
}

// ---------- browser ----------
const browserPath = [process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p));
if (!browserPath) { console.error('No Chrome, Brave or Edge found; set BROWSER'); process.exit(2); }
const profile = mkdtempSync(join(tmpdir(), 'ycanta-screens-'));
const browser = spawn(browserPath, [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--hide-scrollbars', '--headless=new', 'about:blank'], { stdio: 'ignore' });
let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params }));
});
for (let tries = 0; tries < 50 && !ws; tries++) {
  try {
    const page = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find(p => p.type === 'page');
    if (page) {
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    }
  } catch { await sleep(200); }
}
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
  } else if (m.method === 'Page.javascriptDialogOpening') {
    send('Page.handleJavaScriptDialog', { accept: true }); // "leave without saving?" when going from an editor
  }
};
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const until = async (expr, what, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ev(expr).catch(() => false)) return true;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${what}`);
};

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['*ycanta.canaanf.org*', '*login.ycanta.com*', '*demo.ycanta.com*', '*youtube.com*', '*google*'] });

  if (mode === 'compare') {
    // compared in the browser: it reads the pictures' pixels
    const names = readdirSync(dirA).filter(f => f.endsWith('.png')).sort();
    let changed = 0;
    for (const name of names) {
      if (!existsSync(join(dirB, name))) { console.log(`MISSING  ${name}`); changed++; continue; }
      const a = readFileSync(join(dirA, name)), b = readFileSync(join(dirB, name));
      if (a.equals(b)) continue;
      const diff = await ev(`(async () => {
        const load = async b64 => createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
        const [a, b] = await Promise.all([load(${JSON.stringify(a.toString('base64'))}), load(${JSON.stringify(b.toString('base64'))})]);
        if (a.width !== b.width || a.height !== b.height) return { size: [a.width, a.height, b.width, b.height] };
        const px = img => { const c = new OffscreenCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
        const pa = px(a), pb = px(b);
        let n = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
        for (let i = 0; i < pa.length; i += 4) {
          if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) > 24) {
            n++; const p = i / 4, x = p % a.width, y = Math.floor(p / a.width);
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          }
        }
        return { n, box: n ? [x0, y0, x1, y1] : null };
      })()`);
      if (diff.size) { console.log(`SIZE     ${name}  ${diff.size.join(' ')}`); changed++; }
      else if (diff.n) { console.log(`CHANGED  ${name}  ${diff.n} px in x ${diff.box[0]}-${diff.box[2]}, y ${diff.box[1]}-${diff.box[3]}`); changed++; }
    }
    console.log(`${names.length} pictures, ${changed} changed`);
  } else {
    mkdirSync(dirA, { recursive: true });
    // sign in as alice on the local test church (as in tests/app-local.mjs)
    await send('Page.navigate', { url: APP + '/#login' });
    await until(`!!document.getElementById('db_select')`, 'the sign-in page');
    await ev(`localStorage.setItem('databases', JSON.stringify({ 'church_a(remote)': { name: 'church_a(remote)', type: 'remote', url: 'http://localhost:5984/church_a' } }));
      localStorage.setItem('defaultdbName', 'church_a(remote)'); 'ok'`);
    await send('Page.reload');
    await until(`[...document.querySelectorAll('#db_select option')].some(o => o.value === 'church_a(remote)')`, 'the church list');
    await ev(`(() => { const s = document.getElementById('db_select'); s.value = 'church_a(remote)'; s.dispatchEvent(new Event('change'));
      document.getElementById('username').value = 'alice'; document.getElementById('pwd').value = 'local-test-alice'; // local test account, localhost only
      return checkLogin() && dbLogin('login'), 'ok'; })()`);
    await until(`window.loggedin === true && !location.hash.startsWith('#login')`, 'sign-in', 30000);
    await until(`!document.getElementById('download_status')`, 'the first download', 60000);

    // nothing that moves on its own: no transitions or animations, no blinking cursor, no notices
    const still = `(() => { if (!document.getElementById('shots-still')) document.head.insertAdjacentHTML('beforeend',
      '<style id="shots-still">*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; } .notyf { display: none !important; }</style>'); return 'ok'; })()`;
    for (const size of SIZES) {
      await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile, screenWidth: size.width, screenHeight: size.height });
      await send('Emulation.setTouchEmulationEnabled', size.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: size.dark ? 'dark' : 'light' },
        { name: 'hover', value: size.mobile ? 'none' : 'hover' }, { name: 'pointer', value: size.mobile ? 'coarse' : 'fine' }] });
      for (const view of VIEWS) {
        const name = `${view.name}--${size.name}`;
        if (process.env.ONLY && !name.includes(process.env.ONLY)) continue;
        // from the songbooks list each time, so one page's editor or open panel doesn't carry over
        await ev(`location.hash = '#songbooks'`);
        await sleep(700);
        await ev(`location.hash = ${JSON.stringify(view.hash)}`);
        if (view.wait) await until(view.wait, name).catch(err => console.log(`(${err.message})`));
        await sleep(1200);
        if (view.setup) await ev(view.setup);
        await ev(still);
        await ev(`document.activeElement?.blur(); document.querySelectorAll('.sidebar-open').forEach(p => p.classList.remove('sidebar-open'));
          ${view.open ? `document.querySelector(${JSON.stringify(view.open)}).classList.add('sidebar-open');` : ''} 'ok'`);
        await sleep(500);
        const { data } = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(dirA, `${name}.png`), Buffer.from(data, 'base64'));
      }
      console.log(`shot ${size.name}`);
    }
    // put the device back as it was: signed out
    await ev(`location.hash = '#songbooks'`);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  ws?.close();
  browser.kill();
  server?.close();
  try { (await import('node:fs')).rmSync(profile, { recursive: true, force: true }); } catch { }
}
