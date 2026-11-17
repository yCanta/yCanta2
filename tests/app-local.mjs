// Click-through test of the app itself, against the LOCAL test server only. It opens the app in a headless
// browser, signs in as the local test user alice, and adds, edits and cancels songs and songbooks the way a
// person would (real clicks and typing), then checks what the server saved. Any page error fails the test.
//
// Needs:
//   - the local CouchDB with church_a set up (database/seed-local-church.mjs)
//   - Chrome, Brave or Edge (or set BROWSER to its path)
//   - nothing else on port 8765 except this app (it starts its own file server there if the port is free;
//     the local CouchDB only lets http://localhost:8765 in)
// usage: node tests/app-local.mjs            (SHOW=1 to watch it in a real window; QUICK=1 skips the phone part)
//
// It only adds docs whose titles start with "App Test", and takes them out again at the end.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// The local test server as alice (her password is the local-only one from database/lib.mjs)
const as = name => name;
async function req(name, method, path, body) {
  const res = await fetch('http://127.0.0.1:5984' + path, { method,
    headers: { Authorization: 'Basic ' + Buffer.from(`${name}:local-test-${name}`).toString('base64'), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'http://localhost:8765';
const DB = '/church_a';
const CDP_PORT = 9333;
const RUN = `App Test ${Date.now().toString(36)}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- results ----------
let failed = 0;
const ok = (cond, what, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${what}${!cond && detail ? `  (${detail})` : ''}`);
  if (!cond) failed++;
  return cond;
};

// ---------- file server (only if nothing is on 8765 yet) ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.xml': 'text/xml' };
let server = null;
const appUp = await fetch(APP + '/index.html').then(r => r.ok).catch(() => false);
if (!appUp) {
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
const profile = mkdtempSync(join(tmpdir(), 'ycanta-app-test-'));
const browser = spawn(browserPath, [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--window-size=1100,900', ...(process.env.SHOW ? [] : ['--headless=new']), 'about:blank'], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const pageErrors = [];
const dialogs = [];
let intercepted = null;
let dialogAnswer = true;
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params }));
});
async function connect() {
  for (let tries = 0; tries < 50; tries++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const page = pages.find(p => p.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
        ws.onmessage = e => {
          const m = JSON.parse(e.data);
          if (m.id && pending.has(m.id)) {
            const p = pending.get(m.id); pending.delete(m.id);
            m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
          } else if (m.method === 'Runtime.exceptionThrown') {
            pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
          } else if (m.method === 'Page.javascriptDialogOpening') {
            dialogs.push(m.params.message); // confirm "leave without saving?" and the like: say yes (or dialogAnswer)
            send('Page.handleJavaScriptDialog', { accept: dialogAnswer });
          } else if (m.method === 'Input.dragIntercepted') {
            intercepted = m.params.data; // a mouse drag began (see mouseDrag)
          }
        };
        return;
      }
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('The browser did not start');
}
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const until = async (expr, what, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ev(expr).catch(() => false)) return true;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${what}`);
};
// A real click in the middle of the element
const click = async selector => {
  // pop-up notices (sync, "updated by", first-run) can sit over the links: close them, as a person would
  // the first one that's showing; scrolled to only when it's off screen, since a scroll can move the page
  const box = await ev(`(async () => { document.querySelectorAll('.notyf__toast').forEach(t => t.remove());
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
    if (!el) return null;
    const frame = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    let r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) {
      el.scrollIntoView({ block: 'center' });
      await frame();
    }
    // wait (up to 3s) until it has stopped moving and nothing covers its middle
    for (let tries = 0; tries < 60; tries++) {
      r = el.getBoundingClientRect();
      await frame();
      const now = el.getBoundingClientRect();
      const x = now.left + now.width / 2, y = now.top + now.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (now.top === r.top && now.left === r.left && hit && (hit === el || el.contains(hit) || hit.contains(el))) return { x, y };
      await new Promise(done => setTimeout(done, 50));
    }
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, covered: true }; })()`);
  if (!box) throw new Error(`Nothing to click: ${selector}`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  }
  await sleep(150);
};
// Click into a field and type, after selecting what's there when replace is set
const type = async (selector, text, replace = false) => {
  await click(selector);
  if (replace) await ev(`document.execCommand('selectAll')`);
  await send('Input.insertText', { text });
  await sleep(100);
};
const remote = async docId => (await req(as('alice'), 'GET', `${DB}/${encodeURIComponent(docId)}`)).json;
// The app saves on the device first and sends it to the server a moment later: wait for the server's copy
const remoteWhen = async (docId, test, ms = 10000) => {
  const end = Date.now() + ms;
  let doc;
  while (Date.now() < end) {
    doc = await remote(docId);
    if (doc && !doc.error && test(doc)) return doc;
    await sleep(200);
  }
  return doc;
};
const hash = () => ev('location.hash');
// ---------- phone helpers ----------
// A phone-sized screen with touch, like a 390px-wide phone
const phoneMode = async on => {
  if (on) {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  } else {
    await send('Emulation.clearDeviceMetricsOverride');
    await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  }
  await sleep(600);
};
// A finger moving from (x0, y0) to (x1, y1) in small steps, like a real swipe or scroll
const touchDrag = async (x0, y0, x1, y1, steps = 12) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }] });
    await sleep(16);
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(500); // the panel's slide
};
const tap = async (x, y) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(50);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(500);
};
// Where an element is on screen (scrolled into view first)
const spot = sel => ev(`(async () => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
  el.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 300)); const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; })()`);
// A finger that presses, holds still, then drags (a phone's drag; a quick move is a scroll)
// (`during` runs halfway, while the row is still being dragged)
const touchHoldDrag = async (from, to, hold = 400, steps = 16, during = null) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  await sleep(hold);
  for (let i = 1; i <= steps; i++) {
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }] });
    await sleep(30);
    if (during && i === Math.floor(steps / 2)) await during();
  }
  await sleep(200);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(700);
};
// A mouse drag through the browser's own drag-and-drop (what SortableJS uses with a mouse)
const mouseDrag = async (from, to, steps = 10) => {
  await send('Input.setInterceptDrags', { enabled: true });
  intercepted = null;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 6 && !intercepted; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y + i * 3, button: 'left', buttons: 1 });
    await sleep(40);
  }
  for (let i = 0; i < 20 && !intercepted; i++) await sleep(50);
  if (!intercepted) {
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: from.x, y: from.y, button: 'left', clickCount: 1 });
    await send('Input.setInterceptDrags', { enabled: false });
    throw new Error('the mouse drag did not start');
  }
  const data = intercepted;
  await send('Input.dispatchDragEvent', { type: 'dragEnter', x: from.x, y: from.y, data });
  for (let i = 1; i <= steps; i++) {
    await send('Input.dispatchDragEvent', { type: 'dragOver', x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps, data });
    await sleep(60);
  }
  await send('Input.dispatchDragEvent', { type: 'dragOver', x: to.x, y: to.y, data });
  await sleep(200);
  await send('Input.dispatchDragEvent', { type: 'drop', x: to.x, y: to.y, data });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
  await send('Input.setInterceptDrags', { enabled: false });
  await sleep(600);
};
// The grip of a song's nth part (0 is the first) in the song editor
const gripOf = n => `#song song .wrap:nth-child(${n + 1} of .wrap) .drag-grip`;
const bookOrder = () => ev(`[...document.querySelectorAll('#songbook_content ul.list > li')].map(li => li.dataset.songId)`);
const chunkOrder = () => ev(`[...document.querySelectorAll('#song song .wrap chunk')].map(c => c.textContent.trim().split('\\n')[0])`);
// Screenshots when SHOTS is set to a folder
const shot = async name => {
  if (!process.env.SHOTS) return;
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(process.env.SHOTS, { recursive: true });
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(process.env.SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
};
const panel = sel => ev(`(() => { const p = document.querySelector(${JSON.stringify(sel)}); const r = p.getBoundingClientRect();
  return { open: p.classList.contains('sidebar-open'), left: Math.round(r.left), width: Math.round(r.width) }; })()`);
// The closed panel's visible part (its tab) covers nothing that can be tapped or typed in
const coveredByTab = sel => ev(`(() => { const p = document.querySelector(${JSON.stringify(sel)});
  const tab = p.querySelector('.sidebar-tab') || p; const t = tab.getBoundingClientRect();
  const left = Math.max(t.left, 0); if (left >= innerWidth) return [];
  const column = p.closest('.column');
  return [...column.querySelectorAll('input, button, a, [contenteditable="true"], select, textarea, li')]
    .filter(el => !p.contains(el) && el.getClientRects().length)
    .filter(el => { const r = el.getBoundingClientRect(); return r.right > left + 1 && r.bottom > t.top && r.top < t.bottom && r.top < innerHeight && r.bottom > 0; })
    .map(el => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') + ' ' + (el.textContent || el.value || '').trim().slice(0, 20)); })()`);
// Checks for one sidebar at phone size: scrolling must never open or close it, and a real swipe or tap must
// (swipeY: where a swipe on the open panel starts; the export Preview's PDF is its own page and gets the
// touches over it, so that panel is swiped by its header)
async function phonePanel(name, sel, swipeY = 420) {
  const W = 390;
  await shot(`${name}-closed`);
  const covered = await coveredByTab(sel);
  ok(covered.length === 0, `${name}: the closed panel's tab covers nothing`, covered.slice(0, 5).join(' | '));
  // scrolling down along the right edge, drifting 70px sideways, leaves it closed
  await touchDrag(W - 12, 650, W - 82, 300);
  ok(!(await panel(sel)).open, `${name}: a scroll with sideways drift doesn't open the closed panel`);
  // a tap on its tab opens it
  const tabAt = await ev(`(() => { const p = document.querySelector(${JSON.stringify(sel)}); const t = (p.querySelector('.sidebar-tab') || p).getBoundingClientRect();
    return { x: Math.min(t.left + t.width / 2, ${W} - 4), y: Math.min(t.top + t.height / 2, innerHeight / 2) }; })()`);
  await tap(tabAt.x, tabAt.y);
  ok((await panel(sel)).open, `${name}: a tap on the tab opens the panel`);
  if (!(await panel(sel)).open) await ev(`document.querySelector(${JSON.stringify(sel)}).classList.add('sidebar-open')`);
  await shot(`${name}-open`);
  // an open panel's list still scrolls (when it's longer than the screen)
  const scroller = `document.querySelector(${JSON.stringify(sel)} + ' > :not(.sidebar-tab)')`;
  const canScroll = await ev(`(() => { const s = ${scroller}; s.scrollTop = 0; return s.scrollHeight > s.clientHeight + 20; })()`);
  if (canScroll && swipeY > 200) {
    await touchDrag(W - 100, 700, W - 100, 300);
    ok((await ev(`${scroller}.scrollTop`)) > 50, `${name}: the open panel's list scrolls`);
  }
  // scrolling the open panel's list with sideways drift, either way, leaves it open
  await touchDrag(W - 120, 700, W - 50, 300);
  ok((await panel(sel)).open, `${name}: a scroll drifting right doesn't close the open panel`);
  await touchDrag(W - 60, 700, W - 130, 300);
  ok((await panel(sel)).open, `${name}: a scroll drifting left doesn't close the open panel`);
  // a real swipe to the right closes it; a real swipe to the left from the tab opens it again
  const openLeft = (await panel(sel)).left; // start the swipe on the panel itself (they differ in width)
  await touchDrag(openLeft + 20, swipeY, W - 10, swipeY + 10);
  ok(!(await panel(sel)).open, `${name}: a swipe right closes the panel`);
  const under = await ev(`(() => { const el = document.elementFromPoint(${W - 8}, 420); return el ? el.tagName + '.' + el.className + ' in ' + (el.closest('[id]')?.id || '') : 'nothing'; })()`);
  await touchDrag(W - 8, 420, W - 250, 430);
  const afterSwipe = await panel(sel);
  ok(afterSwipe.open, `${name}: a swipe left from the tab opens the panel`, `under the finger: ${under}; panel ${JSON.stringify(afterSwipe)}; editing ${await ev('!!window.songEditing')}`);
  await ev(`document.querySelector(${JSON.stringify(sel)}).classList.remove('sidebar-open')`);
  await sleep(400);
}

// "+ Add SB" above the songbooks list
const openNewSongbook = async () => {
  await ev(`location.hash = '#songbooks'`);
  await until(`document.querySelector('[data-songbook-edit="new"]')?.getAttribute('href') === '#sb-new-songbook?edit'`, 'the Add SB link');
  await click('[data-songbook-edit="new"]');
  await until(`!!document.querySelector('#songbook_content .edit_buttons')`, 'the new songbook editor', 5000)
    .catch(async err => { throw new Error(`${err.message}, at ${await hash()}`); });
};

// ---------- the test ----------
const made = []; // ids to take out at the end
try {
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  // never reach a live church server from a test
  // (nor YouTube: the player test checks the player's own looks and gestures, the same with no network)
  await send('Network.setBlockedURLs', { urls: ['*ycanta.canaanf.org*', '*login.ycanta.com*', '*demo.ycanta.com*', '*youtube.com*', '*youtube-nocookie.com*', '*ytimg.com*'] });

  // Sign in as alice on the local test church
  await send('Page.navigate', { url: APP + '/#login' });
  await until(`!!document.getElementById('db_select')`, 'the sign-in page');
  await ev(`localStorage.setItem('databases', JSON.stringify({ 'church_a(remote)': { name: 'church_a(remote)', type: 'remote', url: 'http://localhost:5984/church_a' } }));
    localStorage.setItem('defaultdbName', 'church_a(remote)'); 'ok'`);
  await send('Page.reload');
  await until(`[...document.querySelectorAll('#db_select option')].some(o => o.value === 'church_a(remote)')`, 'the church list');
  await ev(`(() => { const s = document.getElementById('db_select'); s.value = 'church_a(remote)'; s.dispatchEvent(new Event('change')); })()`);
  await type('#username', 'alice');
  await type('#pwd', 'local-test-alice'); // local test account (database/lib.mjs), localhost only
  await ev(`checkLogin() && dbLogin('login'), 'ok'`);
  await until(`window.loggedin === true && !location.hash.startsWith('#login')`, 'sign-in', 30000);
  ok(true, 'signed in as alice');
  // a new browser downloads the church's songs first, under a "Getting your songs" card
  await until(`!document.getElementById('download_status')`, 'the first download to finish', 60000);
  // a new browser gets first-run notices that can sit over the links: close them, as a person would
  const closeNotices = () => ev(`document.querySelectorAll('.notyf__toast').forEach(t => t.remove()); 'ok'`);
  await closeNotices();

  // A song in three parts, for dragging parts around (made on the server, as another device would)
  const partsId = `s-${Date.now()}`;
  const now = Date.now();
  const put = await req(as('alice'), 'PUT', `${DB}/${partsId}`, {
    _id: partsId, title: `${RUN} Parts`, authors: [''], scripture_ref: [''], introduction: '', key: '', categories: [''],
    cclis: false, copyright: '', yt: '', chords: '', search: `t:${RUN} Parts\0`,
    content: [[{ type: 'verse' }, ['First part']], [{ type: 'chorus' }, ['Second part']], [{ type: 'verse' }, ['Third part']]],
    added: now, addedBy: 'u-alice', edited: now, editedBy: 'u-alice' });
  if (put.status === 201) made.push(partsId);
  ok(put.status === 201, 'a three-part test song is made on the server', JSON.stringify(put.json));
  await until(`db.get('${partsId}').then(() => true, () => false)`, 'the three-part song to reach this browser', 20000);

  // 0. Bad records don't break the lists: a song and a songbook with odd or missing fields (from an old
  // import, a bug, or another app), arriving by sync. Each list still loads, with every other row.
  const badSongId = `s-${Date.now()}-bad`, badBookId = `sb-${Date.now()}-bad`;
  const badSong = await req(as('alice'), 'PUT', `${DB}/${badSongId}`, {
    _id: badSongId, title: 12345, content: 'la la', categories: 'Joy', scripture_ref: 'John 3:16', authors: null,
    key: 7, yt: 'not a number', addedBy: 'u-alice', editedBy: 'u-alice' }); // no search, added or edited
  const badBook = await req(as('alice'), 'PUT', `${DB}/${badBookId}`, {
    _id: badBookId, title: `${RUN} Bad Book`, songrefs: [{ id: badSongId, status: 'n' }, null, { id: partsId }] }); // no addedBy or editedBy
  if (badSong.status === 201) made.push(badSongId);
  if (badBook.status === 201) made.push(badBookId);
  ok(badSong.status === 201 && badBook.status === 201, 'a bad song and a bad songbook are put on the server', JSON.stringify([badSong.json, badBook.json]));
  await until(`db.get('${badBookId}').then(() => true, () => false)`, 'the bad records to reach this browser', 20000);
  await ev(`location.hash = '#songbooks'`);
  await until(`document.querySelectorAll('#songbooks_container .list > li, #songbooks .list > li').length > 2`, 'the songbooks list', 10000).catch(() => {});
  ok(await ev(`[...document.querySelectorAll('#songbooks_container .list > li, #songbooks .list > li')].some(li => li.textContent.includes(${JSON.stringify(`${RUN} Bad Book`)}))`),
    'bad records: the songbooks list loads, the bad songbook too');
  await ev(`location.hash = '#sb-allSongs'`);
  await until(`[...document.querySelectorAll('#songbook_content .list > li')].some(li => li.dataset.songId === ${JSON.stringify(partsId)})`, 'All Songs', 10000).catch(() => {});
  ok(await ev(`(() => { const ids = [...document.querySelectorAll('#songbook_content .list > li')].map(li => li.dataset.songId); return ids.includes(${JSON.stringify(partsId)}) && ids.includes(${JSON.stringify(badSongId)}); })()`),
    'bad records: All Songs loads, with the bad song and the others');
  await ev(`location.hash = '#${badBookId}'`);
  await until(`[...document.querySelectorAll('#songbook_content .list > li')].some(li => li.dataset.songId === ${JSON.stringify(partsId)})`, 'the bad songbook', 10000).catch(() => {});
  ok(await ev(`(() => { const ids = [...document.querySelectorAll('#songbook_content .list > li')].map(li => li.dataset.songId); return ids.includes(${JSON.stringify(partsId)}) && ids.includes(${JSON.stringify(badSongId)}); })()`),
    'bad records: the bad songbook opens, listing its songs');
  await ev(`location.hash = '#${badBookId}&${badSongId}'`);
  await until(`!!document.querySelector('#song .song-title a')`, 'the bad song', 10000).catch(() => {});
  ok(await ev(`document.querySelector('#song .song-title a')?.textContent.includes('12345')`), 'bad records: the bad song opens and shows its title');
  // the song editor, the export and the presentation read the same fields
  await ev(`location.hash = location.hash + '?edit'`);
  await until(`!!document.querySelector('#song .edit_buttons')`, 'the bad song editor', 10000).catch(() => {});
  ok(await ev(`!!document.querySelector('#song .edit_buttons')`), 'bad records: the bad song opens in the editor');
  await click('#song .edit_buttons a'); // Cancel: nothing is saved
  await until(`!location.hash.includes('?edit')`, 'leaving the bad song editor', 10000).catch(() => {});
  await ev(`location.hash = '#${badBookId}?export'`);
  await until(`document.getElementById('format')?.options.length > 1`, 'the export of the bad songbook', 10000).catch(() => {});
  await until(`!!document.querySelector('#downloadPDF a[href^="blob:"]')`, 'the PDF of the bad songbook', 20000).catch(() => {});
  ok(await ev(`!!document.querySelector('#downloadPDF a[href^="blob:"]')`), 'bad records: the bad songbook exports to a PDF');
  await ev(`location.hash = '#${badBookId}?present'`);
  await sleep(3000);
  await ev(`location.hash = '#songbooks'`);
  await sleep(1500);
  ok(pageErrors.length === 0, 'bad records: no page errors so far (lists, song, editor, export, presentation)', pageErrors.join(' | ').slice(0, 600));

  // 1. Add a song from All Songs (#150)
  await ev(`location.hash = '#sb-allSongs'`);
  await until(`document.querySelectorAll('#songbook_content .list > li').length > 0`, 'All Songs');
  await until(`document.querySelector('[data-song-edit="new"]')?.getAttribute('href')?.includes('s-new-song')`, 'the Add Song link');
  await click('[data-song-edit="new"]');
  await until(`!!document.querySelector('#song .edit_buttons')`, 'the new song editor', 5000).catch(() => {});
  if (ok(await ev(`!!document.querySelector('#song .edit_buttons')`), 'Add Song opens the editor', `at ${await hash()}`)) {
    await type('#song .song-title a', `${RUN} Song`);
    await type('#song chunk', 'A line from the app test');
    await click('#song .edit_buttons button');
    await until(`/&s-\\d/.test(location.hash) && !location.hash.includes('?edit') && !!document.querySelector('#song .song-card[data-rev^="1-"]')`, 'the saved song');
    const songId = (await hash()).split('&')[1];
    made.push(songId);
    const doc = await remoteWhen(songId, d => d.title === `${RUN} Song`);
    ok(doc.title === `${RUN} Song`, 'the new song is saved with its title', doc.title);
    ok(JSON.stringify(doc.content).includes('A line from the app test'), 'the new song is saved with its words');
    await until(`[...document.querySelectorAll('#songbook_content .list > li')].some(li => li.textContent.includes(${JSON.stringify(RUN + ' Song')}))`, 'the song in All Songs');
    ok(true, 'the new song shows in All Songs');

    // 2. Edit it
    await ev(`location.hash = location.hash + '?edit'`);
    await until(`!!document.querySelector('#song .edit_buttons')`, 'the song editor');
    await type('#song .song-title a', `${RUN} Song Edited`, true);
    await click('#song .edit_buttons button');
    await until(`!location.hash.includes('?edit') && !!document.querySelector('#song .song-card[data-rev^="2-"]')`, 'the edited song');
    const edited = await remoteWhen(songId, d => d.title === `${RUN} Song Edited`);
    ok(edited.title === `${RUN} Song Edited`, 'an edit is saved', edited.title);

    // 3. Cancel an edit: nothing is saved
    await ev(`location.hash = location.hash + '?edit'`);
    await until(`!!document.querySelector('#song .edit_buttons')`, 'the song editor');
    await type('#song .song-title a', `${RUN} Should Not Save`, true);
    await click('#song .edit_buttons a');
    await until(`!location.hash.includes('?edit') && !document.querySelector('#song .edit_buttons')`, 'leaving the editor');
    await sleep(2000); // time for a save to reach the server, if one were (wrongly) made
    const afterCancel = await remote(songId);
    ok(afterCancel.title === `${RUN} Song Edited` && afterCancel._rev.startsWith('2-'), 'Cancel on a song saves nothing');
    ok((await ev(`document.querySelector('#song .song-title a').textContent.trim()`)) === `${RUN} Song Edited`, 'Cancel on a song shows the saved song');

    // 4. Make a songbook with that song in it
    await openNewSongbook();
    await type('#songbook_title', `${RUN} Book`);
    await until(`!!document.querySelector('#songbook_edit_togglesongs li[data-song-id="${songId}"]')`, 'the song in "Add a song?"');
    await click(`#songbook_edit_togglesongs li[data-song-id="${songId}"]`);
    // with a mouse: drag the three-part song in from "Add a song?" below it, then up above it
    await until(`!!document.querySelector('#songbook_edit_togglesongs li[data-song-id="${partsId}"]')`, 'the three-part song in "Add a song?"');
    const adderRow = `#songbook_edit_togglesongs li[data-song-id="${partsId}"]`;
    const firstRow = await spot(`#songbook_content ul.list > li[data-song-id="${songId}"]`);
    await mouseDrag(await spot(adderRow), { x: firstRow.x, y: firstRow.bottom - 4 });
    const added = await bookOrder();
    ok(added.length === 2 && added.includes(partsId) && added.includes(songId), 'mouse: a song dragged from "Add a song?" is added to the book', JSON.stringify(added));
    ok(await ev(`!!document.querySelector('${adderRow}') && document.querySelector('${adderRow}').getAttribute('data-xInBook') === '1'`),
      'mouse: "Add a song?" keeps the song, marked as in the book once');
    // drag the bottom song to the top
    const bottomId = added[1];
    const top = await spot(`#songbook_content ul.list > li:first-child`);
    await mouseDrag(await spot(`#songbook_content ul.list > li:last-child`), { x: top.x, y: top.top + 4 });
    const moved = await bookOrder();
    ok(moved[0] === bottomId && moved.length === 2, 'mouse: a song dragged up in the book moves up', JSON.stringify(moved));
    await click('#songbook_content .edit_buttons button');
    await until(`/^#sb-(?!new)/.test(location.hash) && !location.hash.includes('?edit')`, 'the saved songbook');
    const bookId = (await hash()).slice(1).split('&')[0];
    made.push(bookId);
    const book = await remoteWhen(bookId, d => d.title === `${RUN} Book`);
    ok(book.title === `${RUN} Book`, 'the new songbook is saved with its title', book.title);
    ok(book.songrefs?.some(ref => ref.id === songId), 'the new songbook holds the song');
    ok(JSON.stringify(book.songrefs?.map(ref => ref.id)) === JSON.stringify(moved), 'the dragged order is saved', JSON.stringify(book.songrefs?.map(ref => ref.id)));

    // 5. Cancel an edit of the songbook: nothing is saved
    await ev(`location.hash = '#${bookId}?edit'`);
    await until(`!!document.querySelector('#songbook_content .edit_buttons')`, 'the songbook editor');
    await type('#songbook_title', `${RUN} Book Should Not Save`, true);
    // with a mouse: drag a song from the book back to "Add a song?" to take it out (then Cancel keeps it)
    const outId = (await bookOrder())[0];
    const adderList = await spot('#songbook_edit_togglesongs ul.list > li:nth-child(3)');
    await mouseDrag(await spot(`#songbook_content ul.list > li:first-child`), adderList);
    const left = await bookOrder();
    ok(left.length === 1 && !left.includes(outId), 'mouse: a song dragged back to "Add a song?" comes out of the book', JSON.stringify(left));
    ok(await ev(`!document.querySelector('#songbook_edit_togglesongs li[data-song-id="${outId}"]').hasAttribute('data-xInBook')`),
      'mouse: "Add a song?" no longer marks it as in the book');
    await click('#songbook_content .edit_buttons button:nth-child(2)');
    await until(`location.hash === '#${bookId}'`, 'leaving the songbook editor');
    await sleep(2000);
    ok((await remote(bookId))._rev === book._rev, 'Cancel on a songbook saves nothing');
    ok((await ev(`document.getElementById('songbook_title').textContent.trim()`)) === `${RUN} Book`, 'Cancel on a songbook shows the saved book');

    // 6. An export starts with the first setup in its menu, not "Custom" (#146)
    await ev(`location.hash = '#${bookId}?export'`);
    await until(`document.getElementById('format').options.length > 1`, 'the export setups');
    await sleep(500);
    const setup = await ev(`(() => { const f = document.getElementById('format'); return { picked: f.options[f.selectedIndex].textContent, first: f.options[0].textContent, columns: document.getElementById('columns').value }; })()`);
    ok(setup.picked === setup.first && setup.picked !== 'Custom', 'an export starts with the first setup in its menu', JSON.stringify(setup));
    // #131: "+ Save new Config" asks for a name in the app's own dialog, saves, shows the new setup in the
    // menu and its button, and doesn't restart the preview; the × deletes it after asking
    await ev(`document.getElementById('pdf').contentWindow.appTestMark = 1; 'ok'`); // a restarted preview is a new window, without it
    await click('#export_new_config');
    await until(`!!document.querySelector('dialog[open] input[name="name"]')`, 'the new config dialog');
    await type('dialog[open] input[name="name"]', `${RUN} Cfg`);
    await ev(`document.querySelector('dialog[open] form').requestSubmit()`);
    await until(`[...document.querySelectorAll('#cfg_buttons [data-save-name]')].some(b => b.dataset.saveName === ${JSON.stringify(`${RUN} Cfg`)})`, 'the new config button', 10000).catch(() => {});
    const savedCfg = await ev(`({ menu: document.getElementById('format').selectedOptions[0]?.textContent, dialog: !!document.querySelector('dialog[open]'),
      viewer: document.getElementById('pdf').contentWindow?.appTestMark === 1 })`);
    ok(savedCfg.menu === `Your ${RUN} Cfg` && !savedCfg.dialog, 'export: a new config is saved and picked in the Format menu', JSON.stringify(savedCfg));
    ok(savedCfg.viewer, "export: saving a config doesn't restart the preview");
    await ev(`[...document.querySelectorAll('#cfg_buttons [data-save-name]')].find(b => b.dataset.saveName === ${JSON.stringify(`${RUN} Cfg`)}).querySelector('.export_close').click()`);
    await until(`!!document.querySelector('dialog[open]')`, 'the delete config dialog');
    await ev(`document.querySelector('dialog[open] form').requestSubmit()`);
    await until(`![...document.querySelectorAll('#cfg_buttons [data-save-name]')].some(b => b.dataset.saveName === ${JSON.stringify(`${RUN} Cfg`)})`, 'the config to go', 10000).catch(() => {});
    ok(!(await ev(`[...document.getElementById('format').options].some(o => o.textContent === ${JSON.stringify(`Your ${RUN} Cfg`)})`)), 'export: the × deletes a config, after asking');
    const band = await ev(`[...document.querySelectorAll('#export .subcolumn:first-child .column_header .buttonsRight, #export .edit_buttons')].map(b => b.innerText.replace(/\\s+/g, ' ').trim())`);
    ok(band.length === 2 && band.every(t => t === 'Generate PDF Close') && !(await ev(`document.querySelector('#export .float-menu').children.length`)),
      'export: Generate PDF and Close in its title row and at the bottom, no floating button', JSON.stringify(band));
    await ev(`[...document.querySelectorAll('#export .edit_buttons')].pop().querySelector('button:last-child').click()`);
    await until(`location.hash === '#${bookId}'`, 'Close to leave the export');
    ok(true, 'export: Close goes back to the songbook');

    // 6a. With a mouse: in the book editor, with a song open, drop the other song on the song to open it
    await ev(`location.hash = '#${bookId}?edit&${songId}'`);
    await until(`!!document.querySelector('#songbook_content .edit_buttons') && !!document.querySelector('#song song')`, 'the book editor with a song open');
    await sleep(800);
    await mouseDrag(await spot(`#songbook_content ul.list > li[data-song-id="${partsId}"]`), await spot('#song song'));
    ok((await hash()) === `#${bookId}?edit&${partsId}`, 'mouse: a song dropped on the open song opens it', await hash());
    ok((await bookOrder()).length === 2, 'mouse: dropping it there leaves the book as it was', JSON.stringify(await bookOrder()));
    await click('#songbook_content .edit_buttons button:nth-child(2)'); // Cancel
    await until(`!location.hash.includes('?edit')`, 'leaving the book editor');

    // 6b. With a mouse: drag a song's last part to the top in the song editor, and save
    await ev(`location.hash = '#${bookId}&${partsId}?edit'`);
    await until(`document.querySelectorAll('#song song .wrap').length === 3`, 'the three-part song in the editor');
    await sleep(500);
    const firstPart = await spot(gripOf(0));
    await mouseDrag(await spot(gripOf(2)), { x: firstPart.x, y: firstPart.top - 6 });
    ok(JSON.stringify(await chunkOrder()) === JSON.stringify(['Third part', 'First part', 'Second part']), 'mouse: a part dragged to the top moves there', JSON.stringify(await chunkOrder()));
    // a click in a part's words still puts the cursor there (it doesn't start a drag)
    await click('#song song .wrap chunk');
    ok(await ev(`!!document.activeElement?.closest('chunk')`), 'mouse: a click in a part\'s words puts the cursor there');
    await click('#song .edit_buttons button');
    await until(`!location.hash.includes('?edit') && !!document.querySelector('#song .song-card[data-rev^="2-"]')`, 'the saved three-part song');
    const parts = await remoteWhen(partsId, d => d._rev.startsWith('2-'));
    ok(JSON.stringify(parts.content?.map(c => c[1][0])) === JSON.stringify(['Third part', 'First part', 'Second part']), 'the dragged parts order is saved', JSON.stringify(parts.content?.map(c => c[1])));

    // (QUICK=1 skips the phone part, about 50 of the run's ~80 seconds; releases run it all)
    if (!process.env.QUICK) {
      // 7. On a phone: the three side panels (scrolling never flips them; a swipe or a tap on the tab does),
      // and scrolling through a song doesn't swipe to another one
      await phoneMode(true);
      // #6: the browser's pull-to-refresh and sideways "back" stay off, on the page and in the side panels
      // (set only there now, not on every element)
      await ev(`location.hash = '#${bookId}'`);
      await until(`document.querySelectorAll('#songbook_content .list > li').length > 0`, 'the songbook on a phone');
      await sleep(800);
      const overscroll = sel => ev(`(() => { const s = getComputedStyle(document.querySelector(${JSON.stringify(sel)})); return s.overscrollBehaviorX + ' ' + s.overscrollBehaviorY; })()`);
      ok((await overscroll('html')) === 'contain contain', 'pull-to-refresh: off on the page', await overscroll('html'));
      ok((await overscroll('#songListEdit')) === 'contain contain', 'pull-to-refresh: off in a side panel', await overscroll('#songListEdit'));
      ok((await overscroll('#songbook_content')) === 'auto auto', 'overscroll set only where needed, not on every element', await overscroll('#songbook_content'));
      await ev(`location.hash = '#${bookId}?edit'`);
      await until(`!!document.querySelector('#songbook_content .edit_buttons')`, 'the songbook editor on a phone');
      await sleep(800);
      await phonePanel('add-a-song', '#songListEdit');
      // with a finger: a quick swipe over the book's songs scrolls, it doesn't move one
      const before = JSON.stringify(await bookOrder());
      const lastRow = await spot(`#songbook_content ul.list > li:last-child`);
      await touchDrag(lastRow.x, lastRow.y, lastRow.x, lastRow.y - 120);
      ok(JSON.stringify(await bookOrder()) === before, 'finger: a quick swipe over the songs moves none', JSON.stringify(await bookOrder()));
      // Chrome on Android's long-press link menu (it would end the drag) is cancelled while a song is held,
      // and only then. (This browser never opens that menu itself, so the test sends the menu's event.)
      const menuCancelled = `(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        document.querySelector('#songbook_content ul.list > li:first-child a').dispatchEvent(e); return e.defaultPrevented; })()`;
      const heldHash = await hash();
      const heldRow = await spot(`#songbook_content ul.list > li:first-child a`);
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: heldRow.x, y: heldRow.y }] });
      await sleep(400);
      const cancelledWhileHeld = await ev(menuCancelled);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(700);
      const cancelledAfter = await ev(menuCancelled);
      ok(cancelledWhileHeld && !cancelledAfter, "finger: the long-press link menu is held back while a song is picked up, and only then",
        JSON.stringify({ cancelledWhileHeld, cancelledAfter }));
      if (await hash() !== heldHash) { await ev(`location.hash = ${JSON.stringify(heldHash)}`); await sleep(800); }
      // press, hold, and drag the last song to the top
      const firstPhoneRow = await spot(`#songbook_content ul.list > li:first-child`);
      const movingId = await ev(`document.querySelector('#songbook_content ul.list > li:last-child').dataset.songId`);
      // (the same row the quick swipe was on: a scroll mustn't leave it ignoring the next press-and-hold)
      // the row following the finger is solid, so the rows under it (and its own gap) don't show through it
      let floating = null;
      await touchHoldDrag(await spot(`#songbook_content ul.list > li:last-child`), { x: firstPhoneRow.x, y: firstPhoneRow.top + 4 }, 400, 16,
        async () => {
          await shot('finger-drag-midway');
          floating = await ev(`(() => { const el = document.querySelector('.sortable-drag'); if (!el) return null;
            return { opacity: getComputedStyle(el).opacity, background: getComputedStyle(el.querySelector(':scope > a')).backgroundColor }; })()`);
        });
      ok(floating && floating.opacity === '1' && !/rgba\(.*, 0\)|transparent/.test(floating.background),
        'finger: the dragged song is solid, nothing shows through it', JSON.stringify(floating));
      ok((await bookOrder())[0] === movingId, 'finger: press, hold and drag moves a song in the book, even right after a scroll over it', JSON.stringify(await bookOrder()));
      // open "Add a song?" with its tab and drag a song from it into the book
      await ev(`document.getElementById('songListEdit').classList.add('sidebar-open')`);
      await sleep(500);
      const rowsBefore = (await bookOrder()).length;
      const target = await ev(`(() => { const r = document.querySelector('#songbook_content ul.list > li:first-child').getBoundingClientRect(); return { x: Math.max(r.left + 30, 20), y: r.bottom - 4 }; })()`);
      await touchHoldDrag(await spot(`#songbook_edit_togglesongs li[data-song-id="${songId}"]`), target);
      ok((await bookOrder()).length === rowsBefore + 1, 'finger: a song dragged from "Add a song?" is added to the book', JSON.stringify(await bookOrder()));
      await ev(`document.getElementById('songListEdit').classList.remove('sidebar-open')`);
      await sleep(400);
      // pulling down from the top still leaves the editor, as it always has, asking first about unsaved changes:
      // answering Cancel keeps you editing, with everything back in place
      const editHash = await hash();
      let asked = dialogs.length;
      dialogAnswer = false;
      await touchDrag(200, 95, 205, 420, 14);
      await sleep(1200);
      dialogAnswer = true;
      const kept = await ev(`({ hash: location.hash, editing: window.songbookEditing, buttons: !!document.querySelector('#songbook_content .edit_buttons'),
        moved: [...document.querySelectorAll('.column')].filter(c => c.style.transform).map(c => c.id) })`);
      ok(dialogs.length > asked && kept.hash === editHash && kept.editing && kept.buttons && kept.moved.length === 0,
        'phone: pulling down while editing asks, and Cancel keeps you editing with nothing moved', JSON.stringify(kept));
      asked = dialogs.length;
      await touchDrag(200, 95, 205, 420, 14);
      await until(`!location.hash.includes('?edit')`, 'leaving the songbook editor by pulling down', 5000).catch(() => {});
      ok(!(await hash()).includes('?edit') && dialogs.length > asked, 'phone: pulling down while editing and answering OK leaves the editor', `${await hash()}, asked: ${dialogs.length > asked}`);
      if ((await hash()).includes('?edit')) {
        await click('#songbook_content .edit_buttons button:nth-child(2)'); // Cancel
        await until(`!location.hash.includes('?edit')`, 'leaving the songbook editor');
      }
      // the book opens fresh afterwards, not still looking like the editor
      await ev(`location.hash = '#${bookId}'`);
      await until(`location.hash === '#${bookId}' && !document.querySelector('#songbook_content .edit_buttons')`, 'the book, not the editor', 5000).catch(() => {});
      ok(!(await ev(`!!document.querySelector('#songbook_content .edit_buttons')`)), 'phone: after leaving the editor the book opens fresh');

      await ev(`location.hash = '#${bookId}&${songId}?edit'`);
      await until(`!!document.querySelector('#song .edit_buttons')`, 'the song editor on a phone');
      await sleep(800);
      await phonePanel('song-categories', '#song-edit');
      await click('#song .edit_buttons a'); // Cancel
      await until(`!location.hash.includes('?edit') && !document.querySelector('#song .edit_buttons')`, 'leaving the song editor');

      // with a finger: press, hold and drag a song's last part (by its grip) to the top
      await ev(`location.hash = '#${bookId}&${partsId}?edit'`);
      await until(`document.querySelectorAll('#song song .wrap').length === 3`, 'the three-part song in the editor on a phone');
      await sleep(800);
      const partsBefore = await chunkOrder();
      const topPart = await spot(gripOf(0));
      await touchHoldDrag(await spot(gripOf(2)), { x: topPart.x, y: topPart.top - 6 });
      const partsAfter = await chunkOrder();
      ok(partsAfter[0] === partsBefore[2], 'finger: press, hold and drag moves a part to the top', JSON.stringify(partsAfter));
      await click('#song .edit_buttons a'); // Cancel
      await until(`!location.hash.includes('?edit') && !document.querySelector('#song .edit_buttons')`, 'leaving the song editor');

      await ev(`location.hash = '#${bookId}?export'`);
      await until(`document.getElementById('format').options.length > 1`, 'the export on a phone');
      await sleep(800);
      await phonePanel('export-preview', '#exportPreview', 100);

      await ev(`location.hash = '#${bookId}&${songId}'`);
      await until(`!!document.querySelector('#song song') && document.body.classList.contains('song') && !document.body.classList.contains('export')`, 'the song on a phone');
      await sleep(800);
      const onSong = await hash();
      await touchDrag(190, 650, 320, 250); // scrolling up the song, drifting 130px right
      ok((await hash()) === onSong, 'phone: scrolling a song with sideways drift stays on the song', await hash());
      await shot('song-after-drift');
      // quick sideways flicks (starting in the middle half of the screen) still go to the next and previous song
      const flickLeft = () => touchDrag(280, 500, 100, 505, 4);
      const flickRight = () => touchDrag(110, 500, 290, 505, 4);
      const order = await bookOrder();
      const at = order.indexOf(songId);
      const next = order[at + 1], prev = order[at - 1];
      if (next) {
        await flickLeft();
        await until(`location.hash === '#${bookId}&${next}'`, 'the next song', 3000).catch(() => {});
        ok((await hash()) === `#${bookId}&${next}`, 'phone: a quick flick left goes to the next song', await hash());
        await sleep(800);
        await flickRight();
        await until(`location.hash === '#${bookId}&${songId}'`, 'the song again', 3000).catch(() => {});
        ok((await hash()) === `#${bookId}&${songId}`, 'phone: a quick flick right goes to the previous song', await hash());
        await sleep(800);
      }
      if (!prev) { // from the first song, a flick right goes back to the book
        await flickRight();
        await until(`location.hash === '#${bookId}'`, 'the book', 3000).catch(() => {});
        ok((await hash()) === `#${bookId}`, 'phone: a flick right on the first song goes back to the book', await hash());
        await sleep(800);
      }
      // and on a songbook's list of songs, they go to the next and previous songbook
      if ((await hash()) !== `#${bookId}`) { await ev(`location.hash = '#${bookId}'`); await sleep(1200); }
      await until(`document.body.classList.contains('songList') && !document.body.classList.contains('song')`, 'the songbook on a phone');
      const books = await ev(`[...document.querySelectorAll('#songbooks_container ul.list > li')].map(li => li.dataset.songbookId)`);
      const bookAt = books.indexOf(bookId);
      const nextBook = books[bookAt + 1], prevBook = books[bookAt - 1];
      if (nextBook) {
        await flickLeft();
        await until(`location.hash === '#${nextBook}'`, 'the next songbook', 3000).catch(() => {});
        ok((await hash()) === `#${nextBook}`, 'phone: a quick flick left on a songbook goes to the next songbook', await hash());
        await sleep(800);
        await flickRight();
        await until(`location.hash === '#${bookId}'`, 'the songbook again', 3000).catch(() => {});
        ok((await hash()) === `#${bookId}`, 'phone: a quick flick right on a songbook goes to the previous one', await hash());
      } else if (prevBook) {
        await flickRight();
        await until(`location.hash === '#${prevBook}'`, 'the previous songbook', 3000).catch(() => {});
        ok((await hash()) === `#${prevBook}`, 'phone: a quick flick right on a songbook goes to the previous one', await hash());
      }

      // 8. The video player (#140) on a phone: the window, Minimize to the pill beside +, a swipe to the side
      // tab, the tab dragged up and down and pulled back out, and closing it. YouTube is blocked here, so this
      // checks the player's looks and gestures, not the video.
      const videoId = `s-${Date.now()}-video`;
      const videoPut = await req(as('alice'), 'PUT', `${DB}/${videoId}`, {
        _id: videoId, title: `${RUN} Video`, authors: [''], scripture_ref: [''], introduction: '', key: '', categories: [''],
        cclis: false, copyright: '', yt: '', chords: '', search: `t:${RUN} Video\0`,
        content: [[{ type: 'verse' }, ['la la la']], [{ type: 'comment' }, ['https://www.youtube.com/watch?v=XtbQR1_h1mE']]],
        added: Date.now(), addedBy: 'u-alice', edited: Date.now(), editedBy: 'u-alice' });
      if (videoPut.status === 201) made.push(videoId);
      await until(`db.get('${videoId}').then(() => true, () => false)`, 'the video song to reach this browser', 20000);
      await ev(`location.hash = '#sb-allSongs&${videoId}'`);
      await until(`window.youtube_links?.length > 0 && !!document.querySelector('#song .yt-play')`, 'the video song on a phone');
      await sleep(800);
      await click('#song .yt-play');
      await until(`document.getElementById('playerDock').hidden === false`, 'the player window', 5000).catch(() => {});
      const dock = () => ev(`(() => { const d = document.getElementById('playerDock'); const r = d.getBoundingClientRect();
        return { look: d.dataset.look, side: d.dataset.side, hidden: d.hidden, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; })()`);
      ok((await dock()).look === 'dialog', 'player: ▶ opens the player window', JSON.stringify(await dock()));
      await click('#playerDock .player-min');
      await sleep(600);
      const pill = await dock();
      // the + showing: other pages' buttons sit at the same spot under this one (lib.js placePill does the same)
      const fab = await ev(`(() => { const dock = document.getElementById('playerDock');
        const b = [...document.querySelectorAll('.float-menu > :last-child')].filter(el => { const r = el.getBoundingClientRect();
          if (!r.width || r.left < 0 || r.right > innerWidth + 1 || r.top < innerHeight - 200 || r.bottom > innerHeight) return false;
          const onTop = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).find(e => !dock.contains(e));
          return el.contains(onTop); }).map(el => el.getBoundingClientRect())[0];
        return b && { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left) }; })()`);
      ok(pill.look === 'pill', 'player: Minimize makes it the pill', JSON.stringify(pill));
      ok(fab && Math.abs(pill.top - fab.top) <= 2 && Math.abs(pill.bottom - fab.bottom) <= 2 && pill.right <= fab.left,
        'player: the pill lines up with the + button, beside it', JSON.stringify({ pill, fab }));
      // the room for the pill under a song is in the part that scrolls: no column is taller than the screen
      // (scrolling past a list's end used to move the whole column, + and all)
      const tallColumns = await ev(`[...document.querySelectorAll('.column')].filter(c => c.scrollHeight > c.clientHeight + 1).map(c => c.id + ' ' + c.scrollHeight + '/' + c.clientHeight)`);
      ok(tallColumns.length === 0, 'player: with the pill showing, no column scrolls past its end', tallColumns.join(' | '));
      // a sideways swipe on the pill tucks it into the tab on that side
      await touchDrag(pill.left + 60, pill.top + 20, pill.left + 260, pill.top + 24, 8);
      const tab = await dock();
      ok(tab.look === 'tab' && tab.side === 'right', 'player: a swipe right on the pill tucks it into a tab on the right', JSON.stringify(tab));
      // the tab drags up and down its side
      await sleep(300);
      const tabNow = await dock();
      const tabX = Math.round((tabNow.left + tabNow.right) / 2);
      await touchDrag(tabX, tabNow.top + 10, tabX, tabNow.top - 190, 10);
      const moved = await dock();
      ok(moved.look === 'tab' && Math.abs((tabNow.top - moved.top) - 200) <= 12, 'player: the tab drags up its side, and stays a tab', JSON.stringify({ before: tabNow, after: moved }));
      // pulled out toward the middle, it opens as the window again
      await touchDrag(tabX, moved.top + 10, tabX - 180, moved.top + 30, 10);
      ok((await dock()).look === 'dialog', 'player: the tab pulled out toward the middle opens the window', JSON.stringify(await dock()));
      await click('#playerDock .player-foot button:last-child'); // ✕
      await sleep(300);
      ok((await dock()).hidden === true, 'player: ✕ closes it', JSON.stringify(await dock()));
      await phoneMode(false);
    }
  }

  // 7. Cancel a new songbook: back to the songbooks list, nothing saved (#149)
  await openNewSongbook();
  await type('#songbook_title', `${RUN} Cancelled Book`);
  await click('#songbook_content .edit_buttons button:nth-child(2)');
  await until(`!location.hash.includes('?edit')`, 'leaving the new songbook editor');
  ok((await hash()) === '#songbooks', 'Cancel on a new songbook goes back to the songbooks list', await hash());
  const books = (await req(as('alice'), 'GET', `${DB}/_all_docs?startkey=%22sb-%22&endkey=%22sb-%EF%BF%B0%22&include_docs=true`)).json.rows;
  ok(!books.some(row => row.doc.title === `${RUN} Cancelled Book`), 'a cancelled new songbook is not saved');

  // The Admin panel (a church admin's view of the people list) comes from the lists only (#144): leo's
  // old "church_a-editor" tag doesn't make him an editor, and there's no note about older tags
  await ev(`loadAllUsers()`);
  await until(`!!document.querySelector('#all_users .people-list')`, 'the Admin people list');
  const adminView = await ev(`(() => { const level = n => document.querySelector('#all_users li[data-name="' + n + '"] select')?.value;
    return { alice: level('alice'), eddie: level('eddie'), leo: level('leo'), text: document.getElementById('all_users').textContent }; })()`);
  ok(adminView.alice === 'admin' && adminView.eddie === 'editor' && adminView.leo === 'viewer' && !/older|tag/i.test(adminView.text),
    'Admin panel: levels come from the lists only, with no note about older tags', JSON.stringify({ ...adminView, text: adminView.text.slice(0, 200) }));

  // 9. Each person gets their own copy of a church on a device (#139). Make an old-style shared copy (as
  // the app kept one before) holding alice's songs, a change the server never got, alice's device record
  // and eddie's. Signing in again with "Keep me logged in" makes "church_a(remote)~alice", started from
  // that copy but without the unsent change or eddie's record.
  const serverParts = await remote(partsId);
  await ev(`(async () => {
    const shared = new PouchDB('church_a(remote)');
    await db.replicate.to(shared);
    const song = await shared.get(${JSON.stringify(partsId)});
    await shared.put({ ...song, title: 'Never sent to the server' });
    await shared.put({ _id: '_local/u-alice', fromShared: true });
    await shared.put({ _id: '_local/u-eddie', fromShared: true, pwd: 'not yours' });
    await shared.close();
    return 'ok'; })()`);
  await ev(`dbLogout(), 'ok'`);
  await until(`!window.loggedin && !!document.getElementById('db_select')`, 'signed out', 10000);
  await ev(`(() => { const s = document.getElementById('db_select'); s.value = 'church_a(remote)'; s.dispatchEvent(new Event('change'));
    document.getElementById('keep_logged_in').checked = true; return 'ok'; })()`);
  await type('#username', 'alice');
  await type('#pwd', 'local-test-alice'); // local test account (database/lib.mjs), localhost only
  await ev(`checkLogin() && dbLogin('login'), 'ok'`);
  await until(`window.loggedin === true`, 'signing in again, kept', 30000);
  await until(`db.get(${JSON.stringify(partsId)}).then(d => d._rev === ${JSON.stringify(serverParts._rev)}, () => false)`, "the server's version of the song", 20000).catch(() => {});
  const ownCopy = await ev(`(async () => {
    const get = id => db.get(id).then(d => d, () => null);
    const song = await get(${JSON.stringify(partsId)});
    return { name: db.name, kept: db.adapter !== 'memory', songTitle: song?.title, songRev: song?._rev,
      copied: window.copiedFromShared, eddies: !!(await get('_local/u-eddie')), songs: (await db.info()).doc_count }; })()`);
  ok(ownCopy.name === 'church_a(remote)~alice' && ownCopy.kept, 'own copy: signing in kept makes a copy for this person', JSON.stringify(ownCopy));
  ok(ownCopy.songTitle === serverParts.title && ownCopy.songRev === serverParts._rev, "own copy: a change the server never got stays behind; the server's version is used", JSON.stringify(ownCopy));
  ok(ownCopy.copied > 0, 'own copy: it starts from the shared copy instead of downloading everything', JSON.stringify(ownCopy));
  ok(!ownCopy.eddies, "own copy: another person's device record (with their offline password) isn't in it", JSON.stringify(ownCopy));
  const titleText = await ev(`document.querySelector('#title a')?.textContent.replace(/\s+/g, ' ').trim()`);
  ok(titleText === 'Church A REMOTE', 'own copy: the title still names the church, not the copy', titleText);
  // put the device back as it was: signed out, no kept sign-in, no copies on disk
  await ev(`(async () => { await dbLogout(); localStorage.removeItem('loggedin');
    for (const name of ['church_a(remote)~alice', 'church_a(remote)']) await new PouchDB(name).destroy();
    return 'ok'; })()`);
} catch (err) {
  ok(false, 'the test ran to the end', err.message);
} finally {
  ok(pageErrors.length === 0, 'no page errors', pageErrors.join(' | ').slice(0, 600));
  if (dialogs.length) console.log('(dialogs answered yes:', dialogs.join(' | '), ')');
  // take the test's docs out again
  for (const docId of made) {
    const doc = await remote(docId);
    if (doc?._rev) await req(as('alice'), 'DELETE', `${DB}/${encodeURIComponent(docId)}?rev=${doc._rev}`);
  }
  try { ws?.close(); } catch { /* gone */ }
  browser.kill();
  server?.close();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* the browser may still hold it */ }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
