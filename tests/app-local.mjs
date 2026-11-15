// Click-through test of the app itself, against the LOCAL test server only. It opens the app in a headless
// browser, signs in as the local test user alice, and adds, edits and cancels songs and songbooks the way a
// person would (real clicks and typing), then checks what the server saved. Any page error fails the test.
//
// Needs:
//   - the local CouchDB with church_a set up (database/seed-local-church.mjs)
//   - Chrome, Brave or Edge (or set BROWSER to its path)
//   - nothing else on port 8765 except this app (it starts its own file server there if the port is free;
//     the local CouchDB only lets http://localhost:8765 in)
// usage: node tests/app-local.mjs            (SHOW=1 to watch it in a real window)
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
async function req(name, method, path) {
  const res = await fetch('http://127.0.0.1:5984' + path, { method,
    headers: { Authorization: 'Basic ' + Buffer.from(`${name}:local-test-${name}`).toString('base64') } });
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
            dialogs.push(m.params.message); // confirm "leave without saving?" and the like: say yes
            send('Page.handleJavaScriptDialog', { accept: true });
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
  await send('Network.setBlockedURLs', { urls: ['*ycanta.canaanf.org*', '*login.ycanta.com*', '*demo.ycanta.com*'] });

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

  // 1. Add a song from All Songs (#150)
  await ev(`location.hash = '#sb-allSongs'`);
  await until(`document.querySelectorAll('#songbook_content .list > li').length > 0`, 'All Songs');
  await until(`document.querySelector('[data-song-edit="new"]')?.getAttribute('href')?.includes('s-new-song')`, 'the Add Song link');
  await click('[data-song-edit="new"]');
  await until(`!!document.querySelector('#song .edit_buttons')`, 'the new song editor', 5000).catch(() => {});
  if (ok(await ev(`!!document.querySelector('#song .edit_buttons')`), 'Add Song opens the editor', `at ${await hash()}`)) {
    await type('#song stitle', `${RUN} Song`);
    await type('#song chunk', 'A line from the app test');
    await click('#song .edit_buttons button');
    await until(`/&s-\\d/.test(location.hash) && !location.hash.includes('?edit') && !!document.querySelector('#song song[data-rev^="1-"]')`, 'the saved song');
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
    await type('#song stitle', `${RUN} Song Edited`, true);
    await click('#song .edit_buttons button');
    await until(`!location.hash.includes('?edit') && !!document.querySelector('#song song[data-rev^="2-"]')`, 'the edited song');
    const edited = await remoteWhen(songId, d => d.title === `${RUN} Song Edited`);
    ok(edited.title === `${RUN} Song Edited`, 'an edit is saved', edited.title);

    // 3. Cancel an edit: nothing is saved
    await ev(`location.hash = location.hash + '?edit'`);
    await until(`!!document.querySelector('#song .edit_buttons')`, 'the song editor');
    await type('#song stitle', `${RUN} Should Not Save`, true);
    await click('#song .edit_buttons a');
    await until(`!location.hash.includes('?edit') && !document.querySelector('#song .edit_buttons')`, 'leaving the editor');
    await sleep(2000); // time for a save to reach the server, if one were (wrongly) made
    const afterCancel = await remote(songId);
    ok(afterCancel.title === `${RUN} Song Edited` && afterCancel._rev.startsWith('2-'), 'Cancel on a song saves nothing');
    ok((await ev(`document.querySelector('#song stitle').textContent.trim()`)) === `${RUN} Song Edited`, 'Cancel on a song shows the saved song');

    // 4. Make a songbook with that song in it
    await openNewSongbook();
    await type('#songbook_title', `${RUN} Book`);
    await until(`!!document.querySelector('#songbook_edit_togglesongs li[data-song-id="${songId}"]')`, 'the song in "Add a song?"');
    await click(`#songbook_edit_togglesongs li[data-song-id="${songId}"]`);
    await click('#songbook_content .edit_buttons button');
    await until(`/^#sb-(?!new)/.test(location.hash) && !location.hash.includes('?edit')`, 'the saved songbook');
    const bookId = (await hash()).slice(1).split('&')[0];
    made.push(bookId);
    const book = await remoteWhen(bookId, d => d.title === `${RUN} Book`);
    ok(book.title === `${RUN} Book`, 'the new songbook is saved with its title', book.title);
    ok(book.songrefs?.some(ref => ref.id === songId), 'the new songbook holds the song');

    // 5. Cancel an edit of the songbook: nothing is saved
    await ev(`location.hash = '#${bookId}?edit'`);
    await until(`!!document.querySelector('#songbook_content .edit_buttons')`, 'the songbook editor');
    await type('#songbook_title', `${RUN} Book Should Not Save`, true);
    await click('#songbook_content .edit_buttons button:nth-child(2)');
    await until(`location.hash === '#${bookId}'`, 'leaving the songbook editor');
    await sleep(2000);
    ok((await remote(bookId))._rev === book._rev, 'Cancel on a songbook saves nothing');
    ok((await ev(`document.getElementById('songbook_title').textContent.trim()`)) === `${RUN} Book`, 'Cancel on a songbook shows the saved book');
  }

  // 6. Cancel a new songbook: back to the songbooks list, nothing saved (#149)
  await openNewSongbook();
  await type('#songbook_title', `${RUN} Cancelled Book`);
  await click('#songbook_content .edit_buttons button:nth-child(2)');
  await until(`!location.hash.includes('?edit')`, 'leaving the new songbook editor');
  ok((await hash()) === '#songbooks', 'Cancel on a new songbook goes back to the songbooks list', await hash());
  const books = (await req(as('alice'), 'GET', `${DB}/_all_docs?startkey=%22sb-%22&endkey=%22sb-%EF%BF%B0%22&include_docs=true`)).json.rows;
  ok(!books.some(row => row.doc.title === `${RUN} Cancelled Book`), 'a cancelled new songbook is not saved');
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
