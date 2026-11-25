// Click-through test of the UX audit's changes (Help, the menu under your name, error notes, Undo, search tips,
// the status button, the export page's cards, the profile and category forms, the swipe tip) and of yCanta's
// own icons (#95), against the LOCAL test server only, the same way tests/app-local.mjs does: a headless
// browser signed in as the local test user alice. Any page error fails the test.
//
// Needs the local CouchDB with church_a set up (database/seed-local-church.mjs) and Chrome, Brave or Edge.
// usage: node tests/ux-local.mjs        (SHOW=1 to watch it in a real window)
//
// It only adds docs whose titles start with "UX Test", and takes them out again at the end.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

async function req(method, path, body) {
  const res = await fetch('http://127.0.0.1:5984' + path, { method,
    headers: { Authorization: 'Basic ' + Buffer.from('alice:local-test-alice').toString('base64'), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'http://localhost:8765';
const DB = '/church_a';
const CDP_PORT = 9334;
const RUN = `UX Test ${Date.now().toString(36)}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
}

// ---------- browser ----------
const browserPath = [process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p));
if (!browserPath) { console.error('No Chrome, Brave or Edge found; set BROWSER'); process.exit(2); }
const profile = mkdtempSync(join(tmpdir(), 'ycanta-ux-test-'));
const browser = spawn(browserPath, [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--window-size=1100,900', ...(process.env.SHOW ? [] : ['--headless=new']), 'about:blank'], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map(), pageErrors = [], dialogs = [];
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params }));
});
async function connect() {
  for (let tries = 0; tries < 50; tries++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find(p => p.type === 'page');
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
            dialogs.push(m.params.message); // "leave without saving?", "move to the Trash?": yes
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
// A real click in the middle of the first showing element, once it has stopped moving
const click = async selector => {
  const box = await ev(`(async () => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
    if (!el) return null;
    el.scrollIntoView({ block: 'nearest' });
    const frame = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    let r;
    for (let tries = 0; tries < 30; tries++) { r = el.getBoundingClientRect(); await frame(); const n = el.getBoundingClientRect(); if (n.top === r.top && n.left === r.left) break; }
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!box) throw new Error(`Nothing to click: ${selector}`);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await sleep(200);
};
const key = async (k, code, vk, text) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
  await sleep(250);
};
const closeNotices = () => ev(`document.querySelectorAll('.notyf__toast').forEach(t => t.remove()); 'ok'`);
const go = async (to, readyExpr, what) => { await ev(`location.hash = ${JSON.stringify(to)}, 'ok'`); await until(readyExpr, what, 15000); await sleep(600); await closeNotices(); };

// Every icon on screen: each <use> names a drawing icons.svg has, and draws something; no emoji or rare symbol
// left in a button or link (they show blank or as boxes on some devices, #95)
const iconCheck = where => ev(`(async () => {
  const names = window.__iconNames || (window.__iconNames = await fetch('icons.svg').then(r => r.text())
    .then(t => [...new DOMParser().parseFromString(t, 'image/svg+xml').querySelectorAll('symbol')].map(s => s.id)));
  // icons are drawn right into the page from icons.svg (lib.js icon, drawIcons), each naming its drawing in data-icon;
  // the few made before icons.svg is in use <use href="icons.svg#...">
  const icons = [...document.querySelectorAll('svg.icon')];
  const shown = icons.filter(s => s.getBoundingClientRect().width > 0);
  const unknown = [...icons.filter(s => !names.includes(s.dataset.icon)).map(s => 'unknown drawing: ' + s.dataset.icon),
    ...[...document.querySelectorAll('svg.icon use')].map(u => u.getAttribute('href')).filter(h => !h.startsWith('icons.svg#') || !names.includes(h.split('#')[1]))];
  const blank = shown.filter(s => { try { return !(s.getBBox().width > 0); } catch { return true; } }).map(s => s.outerHTML.slice(0, 60));
  const symbolRe = /[\\u{1F000}-\\u{1FAFF}\\u2190-\\u21FF\\u2300-\\u23FF\\u25A0-\\u25FF\\u2600-\\u27BF\\u2B00-\\u2BFF\\u2800-\\u28FF]/u;
  const leftover = [...document.querySelectorAll('button, a, [role=button], .float-menu-icon')]
    .filter(e => e.getClientRects().length && !e.closest('#helpOverlay, kbd') && symbolRe.test(e.textContent))
    .map(e => e.textContent.trim().slice(0, 20));
  return { shown: shown.length, unknown, blank, leftover: [...new Set(leftover)] }; })()`);
const iconOk = async where => {
  const r = await iconCheck(where);
  ok(r.shown > 0 && !r.unknown.length && !r.blank.length, `icons: ${where}, every icon is a drawing from icons.svg and draws (${r.shown})`, JSON.stringify(r));
  ok(!r.leftover.length, `icons: ${where}, no emoji or rare symbol left in a button or link`, r.leftover.join(' | '));
};
// The ::before or ::after drawn from the stylesheet's copy of a drawing
const maskOf = (sel, pseudo) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'missing';
  const s = getComputedStyle(e, ${JSON.stringify(pseudo)}); return s.maskImage || s.webkitMaskImage; })()`);

const made = [];
try {
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.setBlockedURLs', { urls: ['*ycanta.canaanf.org*', '*login.ycanta.com*', '*demo.ycanta.com*', '*youtube.com*', '*youtube-nocookie.com*', '*ytimg.com*'] });

  // ---- icons.svg itself ----
  const sprite = await (await fetch(APP + '/icons.svg')).text();
  const symbols = [...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]);
  ok(symbols.length >= 40 && !/<!--[\s\S]*?--[^>][\s\S]*?-->/.test(sprite), 'icons.svg is there, with its drawings', `${symbols.length} drawings`);
  ok(readFileSync(join(ROOT, 'sw.js'), 'utf8').includes("'icons.svg'"), 'icons.svg is kept for offline use (sw.js)');

  // ---- the sign-in page: Forgot PIN for songs kept on this device ----
  await send('Page.navigate', { url: APP + '/#login' });
  await until(`!!document.getElementById('db_select')`, 'the sign-in page');
  await until(`typeof forgotPin === 'function'`, 'the app to load');
  ok(await ev(`/Forgot PIN/.test(document.getElementById('forgot_pin')?.textContent || '')`), 'sign-in: Forgot PIN? is there for songs kept on this device');

  // ---- sign in as alice ----
  await ev(`localStorage.setItem('databases', JSON.stringify({ 'church_a(remote)': { name: 'church_a(remote)', type: 'remote', url: 'http://localhost:5984/church_a' } }));
    localStorage.setItem('defaultdbName', 'church_a(remote)'); 'ok'`);
  await send('Page.reload');
  await until(`[...document.querySelectorAll('#db_select option')].some(o => o.value === 'church_a(remote)')`, 'the church list');
  await ev(`(() => { const s = document.getElementById('db_select'); s.value = 'church_a(remote)'; s.dispatchEvent(new Event('change'));
    document.getElementById('username').value = 'alice'; document.getElementById('pwd').value = 'local-test-alice'; })()`); // local test account, localhost only
  await ev(`checkLogin() && dbLogin('login'), 'ok'`);
  await until(`window.loggedin === true && !location.hash.startsWith('#login')`, 'sign-in', 30000);
  await until(`!document.getElementById('download_status')`, 'the first download', 60000);
  await closeNotices();
  ok(true, 'signed in as alice');

  // a song and a songbook holding it, made on the server as another device would
  const now = Date.now(), songId = `s-${now}-ux`, bookId = `sb-${now}-ux`;
  const song = await req('PUT', `${DB}/${songId}`, { _id: songId, title: `${RUN} Song`, authors: ['UX Author'], scripture_ref: [''], introduction: '',
    key: 'G', categories: [''], cclis: false, copyright: '', yt: '', chords: '', search: `t:${RUN} Song\0`,
    content: [[{ type: 'verse' }, ['First part']], [{ type: 'chorus' }, ['Second part']]], added: now, addedBy: 'u-alice', edited: now, editedBy: 'u-alice' });
  if (song.status === 201) made.push(songId);
  const book = await req('PUT', `${DB}/${bookId}`, { _id: bookId, title: `${RUN} Book`, songrefs: [{ id: songId, status: 'n' }],
    added: now, addedBy: 'u-alice', edited: now, editedBy: 'u-alice' });
  if (book.status === 201) made.push(bookId);
  ok(song.status === 201 && book.status === 201, 'a test song and songbook are made on the server');
  await until(`db.get('${bookId}').then(() => true, () => false)`, 'the test songbook to reach this browser', 20000);

  // ---- the menu under your name ----
  await go('#', `!!document.getElementById('username_legend')`, 'home');
  await click('#username_legend');
  const menu = await ev(`(() => { const items = [...document.querySelectorAll('#account_menu button')].filter(b => b.offsetParent);
    return { open: !document.querySelector('.accountBtn').classList.contains('closed'), items: items.map(b => b.textContent.trim()),
      drawn: items.filter(b => b.querySelector('svg.icon')?.getBBox().width > 0).length }; })()`);
  ok(menu.open && menu.items.length >= 6 && menu.drawn === menu.items.length, 'menu: your name opens the list, each item with its icon', JSON.stringify(menu));
  await iconOk('the menu under your name');
  await key('Escape', 'Escape', 27);
  ok(await ev(`document.querySelector('.accountBtn').classList.contains('closed')`), 'menu: Esc closes it');
  await click('#username_legend');
  await click('#account_menu [data-open="appSettings"]');
  await sleep(600);
  ok(await ev(`!document.getElementById('appSettings')?.classList.contains('closed')`), 'menu: Settings opens its card on the home page');

  // ---- Help ----
  await click('#username_legend');
  await click('#account_menu [data-open="help"]');
  await until(`document.getElementById('helpOverlay')?.open`, 'Help to open');
  ok(await ev(`document.querySelectorAll('#helpOverlay .help-tab').length === 6 && !!document.querySelector('#helpOverlay .help-find')`), 'Help: opens from the menu, with six tabs and a find box');
  await key('Escape', 'Escape', 27);
  ok(await ev(`!document.getElementById('helpOverlay').open`), 'Help: Esc closes it');
  await ev(`document.activeElement?.blur(), 'ok'`);
  await key('?', 'Slash', 191, '?');
  ok(await ev(`!!document.getElementById('helpOverlay')?.open`), 'Help: ? outside a text box opens it');
  await ev(`closeHelp(), 'ok'`);

  // ---- error notes (no alert boxes) ----
  await closeNotices();
  await ev(`showError('Type your <b>username</b> and PIN.'), 'ok'`);
  await sleep(500);
  const short = await ev(`(() => { const t = [...document.querySelectorAll('.notyf__toast--error')].at(-1); return t ? t.textContent : null; })()`);
  ok(short && short.includes('<b>username</b>'), 'error note: a short one shows as a note, its text as typed (not as HTML)', String(short));
  await ev(`showError('Line one\\nLine two', { stay: true }), 'ok'`);
  await sleep(500);
  const stay = await ev(`(() => { const t = [...document.querySelectorAll('.notyf__toast--error')].find(t => t.textContent.includes('Line two')); return t ? { br: !!t.querySelector('br'), dismiss: !!t.querySelector('.notyf__dismiss-btn, .notyf__dismiss') } : null; })()`);
  ok(stay && stay.br && stay.dismiss, 'error note: one with details stays, line by line, with a close button', JSON.stringify(stay));
  await closeNotices();

  // ---- All Songs: icons, the search tips, the clear button ----
  await go('#sb-allSongs', `document.querySelectorAll('#songList li a').length > 0`, 'All Songs');
  await iconOk('All Songs');
  ok(await ev(`getComputedStyle(document.querySelector('svg.icon')).pointerEvents === 'none'`), 'icons: a tap or click goes to the button, not the drawing');
  const tipChar = await ev(`getComputedStyle(document.querySelector('#songList .search-tips'), '::after').content`);
  ok(tipChar === '"?"', 'search tips: the hint bubble shows a ?', tipChar);
  const row = await ev(`(() => { const mid = e => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; };
    const s = document.querySelector('#songList .search-row input.search'), q = document.querySelector('#songList .search-tips'), f = document.querySelector('#songList .song-filter');
    return { q: Math.round(mid(q) - mid(s)), f: Math.round(mid(f) - mid(s)) }; })()`);
  ok(Math.abs(row.q) <= 2 && Math.abs(row.f) <= 3, 'search tips: the ? sits level with the search box and Filter', JSON.stringify(row));
  const tipAt = await ev(`(() => { const r = document.querySelector('#songList .search-tips').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tipAt.x, y: tipAt.y });
  const tops = [];
  for (let i = 0; i < 6; i++) { tops.push(await ev(`document.getElementById('tooltip') ? Math.round(document.getElementById('tooltip').getBoundingClientRect().top) : null`)); await sleep(25); }
  const tipText = await ev(`document.getElementById('tooltip')?.textContent || ''`);
  ok(tipText.includes('whole song') && tops.every(t => t !== null && t === tops[0]), 'search tips: they open in place (no sliding in) and say what search looks at', JSON.stringify(tops));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
  ok((await maskOf('#songList span.deleteicon > span', '::after')).includes('svg'), 'search box: an empty one shows the magnifier drawing');
  await click('#songList input.search');
  await send('Input.insertText', { text: RUN });
  await sleep(900);
  const typed = await ev(`(() => { const s = document.querySelector('#songList span.deleteicon > span'); const m = getComputedStyle(s, '::after').maskImage;
    const box = document.querySelector('#songList input.search').getBoundingClientRect(), ic = s.getBoundingClientRect();
    return { clear: m.includes('mask'), inside: ic.right <= box.right && ic.left >= box.left, rows: document.querySelectorAll('#songList li:not([style*="none"]) a').length }; })()`);
  ok(typed.clear && typed.inside, 'search box: with text, a round clear button inside the box', JSON.stringify(typed));
  await click('#songList span.deleteicon > span');
  ok(await ev(`document.querySelector('#songList input.search').value === ''`), 'search box: the clear button empties it');

  // ---- a song: the header's icons ----
  await go(`#${bookId}&${songId}`, `!!document.querySelector('#song .song-card')`, 'the test song');
  await iconOk('a song');
  for (const [sel, pseudo, what] of [['#song .star', '::after', 'favorite star'], ['#song info', '::after', 'info'], ['#song .fsButton', '::after', 'full width']]) {
    ok((await maskOf(sel, pseudo)).includes('svg'), `icons: the ${what} is a drawing`);
  }
  const fsBefore = await maskOf('#song .fsButton', '::after');
  await ev(`document.querySelector('#song .fsButton').click(), 'ok'`); // its icon is drawn outside its own (empty) box
  await sleep(300);
  const fsAfter = await maskOf('#song .fsButton', '::after');
  ok(fsBefore !== fsAfter, 'full width: the arrows turn inward while the song is wide');
  await ev(`document.querySelector('#song .fsButton').click(), 'ok'`);

  // ---- the song editor: its how-to line; leaving without a change doesn't ask ----
  await go(`#${bookId}&${songId}?edit`, `!!document.querySelector('#song .edit_buttons')`, 'the song editor');
  ok(await ev(`!!document.querySelector('#song .edit-hint')`), 'song editor: a line says how chords and parts are typed');
  await iconOk('the song editor');
  const asked = dialogs.length;
  await go(`#${bookId}`, `!location.hash.includes('?edit') && !window.songEditing`, 'leaving the song editor');
  ok(dialogs.length === asked, "song editor: leaving with nothing changed doesn't ask");

  // ---- the songbook editor: the round status button ----
  await go(`#${bookId}?edit`, `!!document.getElementById('statusON')`, 'the songbook editor');
  if (!(await ev(`document.getElementById('songbook_content').classList.contains('showStatus')`))) await click('#showStatusID .switch-track');
  await sleep(400);
  await iconOk('the songbook editor');
  const before = await ev(`location.hash`);
  const label0 = await ev(`document.querySelector('#songbook_content li > .status-btn')?.getAttribute('aria-label')`);
  await click('#songbook_content li > .status-btn');
  const st = await ev(`(() => { const li = document.querySelector('#songbook_content li'); return { status: li.dataset.songStatus, label: li.querySelector('.status-btn').getAttribute('aria-label') }; })()`);
  ok(st.status === 'a' && st.label !== label0 && (await ev('location.hash')) === before, 'status: the round button moves a song on (new to approved), says so, and opens nothing', JSON.stringify({ label0, ...st }));
  ok((await maskOf('#songbook_content li > .status-btn', '::before')).includes('svg'), 'status: its mark is a drawing');
  const mid = await ev(`(() => { const li = document.querySelector('#songbook_content li'), b = li.querySelector(':scope > button[aria-label="Take out of the songbook"]'); const a = li.getBoundingClientRect(), c = b.getBoundingClientRect();
    return Math.round((c.top + c.height / 2) - (a.top + a.height / 2)) + 0; })()`); // + 0: a -0 comes back from the browser as nothing
  ok(Math.abs(mid) <= 2, "songbook editor: a row's trash sits in the middle of the row", String(mid));
  await click('#songbook_content .edit_buttons [data-cancel]'); // Cancel
  await until(`!location.hash.includes('?edit')`, 'leaving the songbook editor');

  // ---- the export page's cards ----
  await go(`#${bookId}?export`, `!!document.getElementById('export_words_summary')`, 'the export page');
  await sleep(1500);
  const exp = await ev(`(() => ({ cards: [...document.querySelectorAll('#export .export-more')].length,
    summaries: ['export_words_summary', 'export_page_summary', 'export_index_summary'].map(id => document.getElementById(id).textContent.trim()),
    titleChoices: [...document.getElementById('hide_booktitle').options].map(o => o.value).join(','),
    pill: !!document.getElementById('export_copy') && !!document.getElementById('export_paste') }))()`);
  ok(exp.cards >= 3 && exp.summaries.every(Boolean), 'export: the folded cards each say what is set inside', JSON.stringify(exp.summaries));
  ok(exp.titleChoices === 'yes,no,span,page' && exp.pill, 'export: the title has four places to go, and Copy and Paste are there', JSON.stringify(exp));
  await ev(`(() => { const s = document.getElementById('hide_booktitle'); s.value = 'span'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  ok(await ev(`serializeForm('export_form').find(f => f.name === 'hide_booktitle')?.value === 'span'`), 'export: "Across the top of the page" is what a Format saves');
  await iconOk('the export page');
  await ev(`closeExport(), 'ok'`);
  await sleep(800);

  // ---- Undo after a delete (the songbook: a song in a book can't go to the Trash) ----
  await go(`#${bookId}`, `window.songbook?._id === ${JSON.stringify(bookId)}`, 'the test songbook');
  await ev(`deleteSongbook(${JSON.stringify(bookId)}), 'ok'`);
  await until(`[...document.querySelectorAll('.notyf__toast')].some(t => t.textContent.includes('Undo'))`, 'the Undo note', 8000);
  ok(true, 'Undo: after a delete, a note offers Undo');
  await ev(`[...document.querySelectorAll('.notyf__toast')].find(t => t.textContent.includes('Undo')).querySelector('.notyf__wrapper, .notyf__message').click(), 'ok'`);
  await until(`db.get(${JSON.stringify(bookId)}).then(d => !d.deletedAt, () => false)`, 'the songbook to come back', 8000).catch(() => {});
  ok(await ev(`db.get(${JSON.stringify(bookId)}).then(d => !d.deletedAt, () => false)`), 'Undo: puts the songbook back');
  await until(`location.hash === ${JSON.stringify('#' + bookId)}`, 'the songbook to open again', 5000).catch(() => {});
  ok((await ev('location.hash')) === '#' + bookId, 'Undo: opens it again');

  // ---- the profile name and the category editor (no raw record editor) ----
  await go('#', `!!document.getElementById('username_legend')`, 'home');
  ev(`editProfileName()`).catch(() => {}); // it waits for the dialog: don't
  await until(`!!document.querySelector('dialog[open]')`, 'the name dialog', 5000);
  const nameBox = await ev(`(() => { const d = document.querySelector('dialog[open]'); return { field: !!d.querySelector('input'), text: d.textContent.includes('sign in as') }; })()`);
  ok(nameBox.field && nameBox.text, 'profile: Name opens a small form for the name others see', JSON.stringify(nameBox));
  await key('Escape', 'Escape', 27);
  await sleep(300);
  await ev(`editCategories(), 'ok'`);
  await until(`!!document.querySelector('#category_content .cat-edit')`, 'the category editor', 5000);
  const cats = await ev(`(() => ({ rows: document.querySelectorAll('#category_content .cat-row').length, grips: document.querySelectorAll('#category_content .cat-grip svg.icon').length,
    add: [...document.querySelectorAll('#category_content button')].some(b => /Category/.test(b.textContent)) }))()`);
  ok(cats.rows > 0 && cats.grips === cats.rows && cats.add, 'categories: an editor with a drag grip on each row and + Category', JSON.stringify(cats));

  // ---- the header: room under the name button on a wide screen ----
  const head = await ev(`(() => ({ legend: document.getElementById('username_legend').getBoundingClientRect().bottom, main: document.querySelector('main').getBoundingClientRect().top }))()`);
  ok(head.main - head.legend >= 8, 'header: the columns start clear of the name button', JSON.stringify(head));

  // ---- every alphabet (#90): search finds accented Spanish, Hindi and Arabic words; a song's languages ----
  // Songs made on the server as an older app saved them: a "search" field that lost accents and other
  // letters. The app builds its own from the song, so they're found anyway.
  const t90 = Date.now(), esId = `s-${t90}-es`, hiId = `s-${t90}-hi`, arId = `s-${t90}-ar`, enId = `s-${t90}-en`, langBook = `sb-${t90}-langs`;
  const song90 = (id, title, lines, extra = {}) => req('PUT', `${DB}/${id}`, { _id: id, title, authors: [''], scripture_ref: [''], introduction: '',
    key: '', categories: [''], cclis: false, copyright: '', yt: '', chords: '', search: `t:${title.replace(/[^a-zA-Z0-9 ]/g, '')}\0`,
    content: [[{ type: 'verse' }, lines]], added: t90, addedBy: 'u-alice', edited: t90, editedBy: 'u-alice', ...extra });
  const made90 = [
    [esId, await song90(esId, `${RUN} Canción`, ['Señor, Tú eres mi canción'])],
    [hiId, await song90(hiId, `${RUN} यीशु`, ['प्रभु की स्तुति करो'])],
    [arId, await song90(arId, `${RUN} ترنيمة`, ['<c>C</c>يَسُوعُ رَبِّي، مَحَبَّتُهُ أَبَدِيَّةٌ', 'And an English line'])],
    [enId, await song90(enId, `${RUN} English`, ['Amazing grace how sweet the sound'])],
  ];
  made90.forEach(([docId, r]) => r.status === 201 && made.push(docId));
  const lb = await req('PUT', `${DB}/${langBook}`, { _id: langBook, title: `${RUN} Languages`, songrefs: made90.map(([docId]) => ({ id: docId, status: 'n' })),
    added: t90, addedBy: 'u-alice', edited: t90, editedBy: 'u-alice' });
  if (lb.status === 201) made.push(langBook);
  ok(made90.every(([, r]) => r.status === 201) && lb.status === 201, 'languages: Spanish, Hindi, Arabic and English test songs and a book are made');
  await until(`db.get('${langBook}').then(() => true, () => false)`, 'the language book to reach this browser', 20000);
  await go(`#${langBook}`, `document.querySelectorAll('#songbook_content .list > li').length === 4`, 'the language book');
  const searchFor = text => ev(`(async () => { const s = document.querySelector('#songbook_content .search'); s.value = ${JSON.stringify(text)};
    s.dispatchEvent(new KeyboardEvent('keyup')); await new Promise(r => setTimeout(r, 300));
    return [...document.querySelectorAll('#songbook_content .list > li .name')].map(n => n.textContent); })()`);
  for (const [typed, want, what] of [['cancion', 'Canción', 'Spanish without accents'], ['señor tú', 'Canción', 'Spanish with accents'],
    ['प्रभु की स्तुति', 'यीशु', 'Hindi words'], ['يَسُوعُ', 'ترنيمة', 'Arabic words'], ['ربي محبته ابديه', 'ترنيمة', 'Arabic typed without marks, ا for أ and ه for ة,'], ['يَسُوعُ رَبِّي مَحَبَّتُهُ', 'ترنيمة', 'Arabic with marks'], ['t:' + RUN.toLowerCase() + ' यीशु', 'यीशु', 'a Hindi title with t:']]) {
    const found = await searchFor(typed);
    ok(found.length === 1 && found[0].endsWith(want), `search: ${what} ("${typed}") find the song`, JSON.stringify(found));
  }
  await searchFor('');
  // the presentation's search box too
  await ev(`location.hash = '#${langBook}?present', 'ok'`);
  await until(`document.getElementById('presentation')?.contentWindow?.window?.songbook?.songs?.length === 4`, 'the presentation', 15000);
  const presFind = text => ev(`(() => { const f = document.getElementById('presentation').contentWindow; f.document.querySelector('#searchbox input').value = ${JSON.stringify(text)};
    f.searchDatabase(); return f.document.getElementById('searchresults').textContent; })()`);
  for (const [typed, want] of [['senor tu', 'Señor Tú eres mi canción'], ['प्रभु', 'प्रभु की स्तुति करो'], ['رَبِّي', 'يَسُوعُ رَبِّي'], ['محبته ابديه', 'مَحَبَّتُهُ أَبَدِيَّةٌ']]) {
    const shown = await presFind(typed);
    ok(shown.includes(want), `presentation search: "${typed}" finds its line`, shown.slice(0, 200));
  }
  await go(`#${langBook}`, `!document.getElementById('presentation') && window.songbook?._id === ${JSON.stringify(langBook)}`, 'leaving the presentation');
  // the Filter's Language group: English (the church's usual, for songs with none), Hindi and Arabic from their letters
  await click('.song-filter[data-list="book"] .filter-btn');
  await until(`document.getElementById('filter_panel_book')?.classList.contains('open')`, 'the filter panel', 5000);
  const langChips = await ev(`[...document.querySelectorAll('#filter_panel_book .filter-chip[data-group="lang"]')].map(c => c.dataset.value + ':' + c.querySelector('.n').textContent)`);
  ok(JSON.stringify(langChips) === JSON.stringify(['en:2', 'ar:1', 'hi:1']), 'filter: a Language group, English (no language picked) first, Hindi and Arabic seen from their letters', JSON.stringify(langChips));
  await ev(`document.querySelector('#filter_panel_book .filter-chip[data-group="lang"][data-value="ar"]').click(), 'ok'`); // (the panel redraws on each sync change)
  await sleep(300);
  const arOnly = await ev(`window.songbook_list.visibleItems.map(i => i.values().name)`);
  ok(arOnly.length === 1 && arOnly[0].endsWith('ترنيمة'), 'filter: picking Arabic leaves the Arabic song', JSON.stringify(arOnly));
  await ev(`clearSongFilter('book'); toggleSongFilterPanel('book'), 'ok'`);
  await sleep(400);
  // right to left: an Arabic line turns by itself; an English line, even in the same song, doesn't
  await go(`#${langBook}&${arId}`, `!!document.querySelector('#song .song-card line')`, 'the Arabic song');
  const dirs = await ev(`[...document.querySelectorAll('#song .song-card line')].map(l => l.getAttribute('dir') + ':' + (l.matches(':dir(rtl)') ? 'rtl' : 'ltr'))`);
  // (the Arabic line starts with a chord: "rtl" from its first letter that isn't a chord's, lineDir)
  ok(JSON.stringify(dirs) === JSON.stringify(['rtl:rtl', 'auto:ltr']), 'right to left: the Arabic line (starting with a chord) reads right to left, the English line left to right', JSON.stringify(dirs));
  await click('#song info');
  await until(`document.getElementById('dialog').dataset.use === 'info' && !!document.querySelector('#dialog .song-langs')`, 'the Info window', 5000);
  const infoAr = await ev(`document.querySelector('#dialog .song-langs').textContent`);
  ok(infoAr.includes('Arabic') && infoAr.includes('from its letters'), "info: an Arabic song with no language picked says Arabic, from its letters", infoAr);
  await ev(`document.querySelector('#dialog .close-x, #dialog [aria-label="Close"]')?.click(), 'ok'`);
  // a song's languages: Spanish and English picked in the editor survive the save, and no search field is saved
  await go(`#${langBook}&${esId}?edit`, `!!document.querySelector('#song .lang-row .lang-add')`, 'the Spanish song editor');
  ok(await ev(`!document.querySelector('#song .lang-row [data-lang]') && document.querySelector('#song .lang-none').textContent.includes('English')`), "editor: a song with no language says it counts as the church's usual (English)");
  await click('#song .lang-add');
  await send('Input.insertText', { text: 'espa' }); // typed: the choices under the box narrow to Spanish (Español)
  await sleep(300);
  const offered = await ev(`[...document.querySelectorAll('#song .lang-suggest [data-add]')].map(b => b.dataset.add)`);
  ok(offered[0] === 'es', 'editor: typing "espa" offers Spanish first', JSON.stringify(offered));
  await click('#song .lang-suggest [data-add="es"]');
  await send('Input.insertText', { text: 'english' });
  await key('Enter', 'Enter', 13);
  const picked = await ev(`[...document.querySelectorAll('#song .lang-row [data-lang]')].map(c => c.dataset.lang)`);
  ok(JSON.stringify(picked) === '["es","en"]', 'editor: Spanish picked from the choices, English typed and Enter', JSON.stringify(picked));
  await click('#song .edit_buttons [data-save]');
  await until(`!location.hash.includes('?edit') && !window.songEditing && !!document.querySelector('#song .song-card line')`, 'the save', 10000);
  let saved90 = {};
  for (let tries = 0; tries < 60 && !saved90.langs; tries++) { saved90 = (await req('GET', `${DB}/${esId}`)).json || {}; if (!saved90.langs) await sleep(250); } // synced up
  ok(JSON.stringify(saved90.langs) === '["es","en"]' && !('search' in saved90), 'save: the song keeps its two languages, and no search field is saved', JSON.stringify({ langs: saved90.langs, search: saved90.search }));
  await click('#song info');
  await until(`!!document.querySelector('#dialog .song-langs')`, 'the Info window', 5000);
  const info90 = await ev(`document.querySelector('#dialog .song-langs').textContent`);
  ok(info90.includes('Spanish') && info90.includes('Español') && info90.includes('English'), 'info: says both languages', info90);
  await ev(`document.querySelector('#dialog .close-x, #dialog [aria-label="Close"]')?.click(), 'ok'`);
  // export: the book's Hindi and Arabic letters can't be printed yet
  await go(`#${langBook}?export`, `!!document.getElementById('export_words_summary')`, 'the language book export');
  await until(`!document.getElementById('export_script_note').hidden`, 'the export note', 8000).catch(() => {});
  const note90 = await ev(`(() => { const n = document.getElementById('export_script_note'); return n.hidden ? '' : n.textContent; })()`);
  ok(note90.startsWith('2 songs have Hindi or Arabic letters') && note90.includes('wrong symbols'), 'export: warns that Hindi and Arabic letters print as the wrong symbols', note90);
  await ev(`closeExport(), 'ok'`);
  await sleep(800);

  // ---- a phone: the swipe tip, once; the + menu turns into × ----
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await ev(`localStorage.removeItem('yCantaSwipeHint'), 'ok'`);
  await go(`#${bookId}&${songId}`, `!!document.querySelector('#song .song-card')`, 'the song on a phone');
  await sleep(1200);
  const tip1 = await ev(`[...document.querySelectorAll('.notyf__toast')].some(t => t.textContent.includes('swipe sideways'))`);
  await closeNotices();
  await go(`#${bookId}`, `!!document.querySelector('#songbook_content li')`, 'the book on a phone');
  await go(`#${bookId}&${songId}`, `!!document.querySelector('#song .song-card')`, 'the song again on a phone');
  await sleep(1200);
  const tip2 = await ev(`[...document.querySelectorAll('.notyf__toast')].some(t => t.textContent.includes('swipe sideways'))`);
  ok(tip1 && !tip2, 'phone: the first song opened says you can swipe, only once', JSON.stringify({ tip1, tip2 }));
  await go(`#${bookId}`, `!!document.querySelector('#songbook_content li')`, 'the book on a phone');
  const toggle = '#songList .float-menu-toggle button';
  await click(toggle);
  const fab = await ev(`(() => { const b = document.querySelector(${JSON.stringify(toggle)}); return { turned: b.classList.contains('icon-rotate'), plus: b.querySelector('svg.icon')?.dataset.icon }; })()`);
  ok(fab.turned && fab.plus === 'plus', 'phone: the + button opens its menu and turns into ×', JSON.stringify(fab));
  await iconOk('the + menu on a phone');
} catch (err) {
  ok(false, 'the test ran to the end', err.message);
} finally {
  ok(pageErrors.length === 0, 'no page errors', pageErrors.join(' | ').slice(0, 600));
  for (const docId of made) {
    const doc = (await req('GET', `${DB}/${encodeURIComponent(docId)}`)).json;
    if (doc?._rev) await req('DELETE', `${DB}/${encodeURIComponent(docId)}?rev=${doc._rev}`);
  }
  try { ws?.close(); } catch { /* gone */ }
  browser.kill();
  server?.close();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* the browser may still hold it */ }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
