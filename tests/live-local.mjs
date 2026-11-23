// Shared presentation test (#51), against the LOCAL test server only. One tab signs in as alice, presents a
// songbook and shares it; a second tab follows in live.html with no sign-in. Checks that the follower keeps
// up, can wander and come back, keeps its own look, ends when sharing stops, and never runs page code from
// the server. Any page error fails the test.
//
// Needs: the local CouchDB set up by database/seed-local-church.mjs (it also sets up ycanta_live), and
// Chrome, Brave or Edge (or set BROWSER). Uses port 8765 like tests/app-local.mjs.
// usage: node tests/live-local.mjs            (SHOW=1 to watch it in a real window)
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'http://localhost:8765';
const COUCH = 'http://127.0.0.1:5984';
const CDP_PORT = 9334;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function req(name, method, path, body) {
  const res = await fetch(COUCH + path, { method,
    headers: { Authorization: 'Basic ' + Buffer.from(`${name}:local-test-${name}`).toString('base64'), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
}
let passed = 0, failed = 0;
const ok = (cond, what, detail = '') => {
  if (cond) { passed++; console.log('  ok  ', what); }
  else { failed++; console.log('  FAIL', what, detail === '' ? '' : JSON.stringify(detail)); }
};

// ---------- the app, served from this folder unless something already serves it ----------
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
}

// ---------- browser ----------
const browserPath = [process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p));
if (!browserPath) { console.error('No Chrome, Brave or Edge found; set BROWSER'); process.exit(2); }
const profile = mkdtempSync(join(tmpdir(), 'ycanta-live-test-'));
const browser = spawn(browserPath, [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--window-size=1100,800', ...(process.env.SHOW ? [] : ['--headless=new']), 'about:blank'], { stdio: 'ignore' });

// A connection to one tab
async function tab(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map(), errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const until = async (expr, what, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await ev(expr).catch(() => false)) return true; await sleep(50); }
    throw new Error(`Timed out waiting for ${what}`);
  };
  const VK = { C: 67, w: 87, ArrowRight: 39, Enter: 13 };
  const key = async k => {
    const base = { key: k, code: k.length === 1 ? 'Key' + k.toUpperCase() : k, windowsVirtualKeyCode: VK[k], modifiers: k === 'C' ? 8 : 0 };
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: k.length === 1 ? k : k === 'Enter' ? '\r' : undefined });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(100);
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  // never reach a live church server or YouTube from a test
  await send('Network.setBlockedURLs', { urls: ['*ycanta.canaanf.org*', '*login.ycanta.com*', '*demo.ycanta.com*', '*youtube.com*', '*ytimg.com*'] });
  // SHOTS=<folder> saves screenshots along the way
  const shot = async name => { if (!process.env.SHOTS) return;
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(process.env.SHOTS, name + '.png'), Buffer.from(r.data, 'base64')); };
  return { ws, send, ev, until, key, errors, shot };
}
async function firstPage() {
  for (let tries = 0; tries < 50; tries++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find(p => p.type === 'page');
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('The browser did not start');
}

const evil = 'EV' + Math.random().toString(36).slice(2, 4).toUpperCase().replace(/[^A-Z]/g, 'Q');
// A songbook of its own: a song written verse, chorus, verse, verse (for Space), then Vera's Song
const SONG = 's-livetest-' + Date.now().toString(36), BOOK = 'sb-livetest-' + Date.now().toString(36);
const stamp = Date.now();
await req('alice', 'PUT', '/church_a/' + SONG, { title: 'Live Test Song', addedBy: 'u-alice', editedBy: 'u-alice', added: stamp, edited: stamp,
  authors: ['Test Author'], scripture_ref: [''], introduction: '', key: 'G', categories: [], cclis: false, yt: '', chords: '', copyright: '',
  content: [[{ type: 'verse' }, [['First verse']]], [{ type: 'chorus' }, [['The chorus']]], [{ type: 'verse' }, [['Second verse']]], [{ type: 'verse' }, [['Third verse']]]],
  search: 't:Live Test Song\u0000a:Test Author\u0000addedBy:alice\u0000' });
await req('alice', 'PUT', '/church_a/' + BOOK, { title: 'Live Test Book', addedBy: 'u-alice', editedBy: 'u-alice', added: stamp, edited: stamp,
  showStatus: false, showComments: true, songrefs: [{ id: SONG, status: 'n', key: 'G' }, { id: 's-vera-1', status: 'n', key: 'G' }] });
try {
  // ---------- the driver: alice presents the test book ----------
  const d = await tab(await firstPage());
  await d.send('Page.navigate', { url: APP + '/#login' });
  await d.until(`!!document.getElementById('db_select')`, 'the sign-in page');
  await d.ev(`localStorage.setItem('databases', JSON.stringify({ 'church_a(remote)': { name: 'church_a(remote)', type: 'remote', url: 'http://localhost:5984/church_a' } }));
    localStorage.setItem('defaultdbName', 'church_a(remote)'); 'ok'`);
  await d.send('Page.reload');
  await d.until(`[...document.querySelectorAll('#db_select option')].some(o => o.value === 'church_a(remote)')`, 'the church list');
  await d.ev(`(() => { const s = document.getElementById('db_select'); s.value = 'church_a(remote)'; s.dispatchEvent(new Event('change'));
    document.getElementById('username').value = 'alice'; document.getElementById('pwd').value = 'local-test-alice'; })()`);
  await d.ev(`checkLogin() && dbLogin('login'), 'ok'`);
  await d.until(`window.loggedin === true && !location.hash.startsWith('#login')`, 'sign-in', 30000);
  await d.until(`!!window.db && window.db.get(${JSON.stringify(BOOK)}).then(() => true, () => false)`, 'the test book on the device', 20000);
  await d.ev(`location.hash = ${JSON.stringify('#' + BOOK)}; 'ok'`);
  await d.until(`window.songbook && window.songbook._id === ${JSON.stringify(BOOK)}`, 'the songbook', 20000);
  await d.ev(`location.hash = ${JSON.stringify('#' + BOOK + '?present')}; 'ok'`);
  await d.until(`!!document.getElementById('presentation') && !!document.getElementById('presentation').contentWindow.presentationReady`, 'the presentation', 20000);
  await d.ev(`document.getElementById('presentation').contentWindow.presentationReady.then(() => 'ok')`);
  const P = `document.getElementById('presentation').contentWindow`;
  ok(true, 'alice presents the test book');

  // ---------- the setup panel ----------
  await d.ev(`${P}.toggleHelp(), 'ok'`);
  await sleep(300);
  const panel = await d.ev(`(() => { const h = ${P}.document.getElementById('help'); return { html: h.innerHTML, text: h.textContent }; })()`);
  ok(!/Child Windows|data:image\/svg|Image backgrounds|<select/.test(panel.html), 'setup panel: no cast icon or dead controls');
  ok(/This screen/.test(panel.text) && /Open a mirror/.test(panel.text) && /Share with other devices/.test(panel.text), 'setup panel: this screen, a mirror, share', panel.text.slice(0, 200));
  const head = await d.ev(`[...${P}.document.querySelectorAll('#help .help-head .btn')].map(b => b.textContent).join('|')`);
  ok(head === 'Download|Presentation Stats', 'the panel\'s buttons: Download, Presentation Stats', head);
  const order = await d.ev(`[...${P}.document.querySelectorAll('#help section h4')].map(h => h.textContent).join('|')`);
  ok(order === 'This screen|Screens & Sharing', 'This screen comes before Screens & Sharing', order);
  // a click outside the panel closes it
  await d.ev(`${P}.document.getElementById('help').dispatchEvent(new (${P}.MouseEvent)('click', { bubbles: true })), 'ok'`);
  ok((await d.ev(`getComputedStyle(${P}.document.getElementById('help')).display`)) === 'none', 'a click outside the panel closes it');
  await d.ev(`${P}.toggleHelp(), 'ok'`);
  await sleep(300);
  // the panels take the app's theme, and follow it when it changes
  await d.ev(`document.documentElement.classList.add('dark'), 'ok'`);
  await d.until(`${P}.document.documentElement.style.getPropertyValue('--background-color').trim() === '#121212'`, 'the dark theme in the presentation', 3000).catch(() => {});
  const darkBg = await d.ev(`getComputedStyle(${P}.document.querySelector('#help > div')).backgroundColor`);
  await d.ev(`document.documentElement.classList.remove('dark'), 'ok'`);
  await d.until(`${P}.document.documentElement.style.getPropertyValue('--background-color').trim() === 'white'`, 'the light theme back', 3000).catch(() => {});
  ok(darkBg === 'rgb(18, 18, 18)' && (await d.ev(`getComputedStyle(${P}.document.querySelector('#help > div')).backgroundColor`)) === 'rgb(255, 255, 255)',
    'the panel follows the app\'s theme, dark and back', darkBg);

  // ---------- share ----------
  await d.ev(`${P}.startShare().then(() => 'ok')`);
  const code = await d.ev(`${P}.liveHost().Live.code`);
  ok(/^[A-Z0-9]{4}$/.test(code || ''), 'sharing gives a code', code);
  const shown = await d.ev(`${P}.document.querySelector('#share .share-code') && ${P}.document.querySelector('#share .share-code').textContent`);
  ok(shown === code, 'the panel shows the code', shown);
  const link = await d.ev(`${P}.document.querySelector('#share a').href`);
  ok(link.startsWith(APP + '/live.html?server=') && link.endsWith('#' + code), 'the panel links to live.html with the server', link);
  ok(await d.ev(`!!${P}.document.querySelector('#share .share-qr svg')`), 'the panel shows a QR code beside the code');
  await d.shot('1-presenter-sharing');
  await d.ev(`${P}.hideHelp(), ${P}.nextChunk(), 'ok'`); // the first song's first part
  const driverSlide = () => d.ev(`({ id: ${P}.current_song.id, part: ${P}.current_song.chunk_index, text: ${P}.document.querySelector('#cur_slide .content').textContent })`);
  let drv = await driverSlide();
  await sleep(500);
  const nowDoc = (await req('alice', 'GET', `/ycanta_live/now:${code}`)).json;
  ok(nowDoc && nowDoc.id === drv.id && nowDoc.part === drv.part && nowDoc.owner === 'alice', 'the server has the slide on screen', nowDoc);

  // ---------- a follower ----------
  const target = await d.send('Target.createTarget', { url: 'about:blank' });
  const fTarget = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find(t => t.id === target.targetId);
  const f = await tab(fTarget);
  await f.send('Page.navigate', { url: link });
  const F = `document.getElementById('show').contentWindow`;
  await f.until(`document.body.classList.contains('following') && ${F}.current_song && ${F}.current_song.id === ${JSON.stringify(drv.id)}`, 'the follower to show the slide', 15000);
  const followerSlide = () => f.ev(`({ id: ${F}.current_song.id, part: ${F}.current_song.chunk_index, text: ${F}.document.querySelector('#cur_slide .content').textContent,
    pill: ${F}.document.getElementById('livePill').textContent, wandering: ${F}.document.getElementById('livePill').classList.contains('wandering'),
    nudge: ${F}.document.getElementById('livePill').classList.contains('nudge'), cls: ${F}.document.body.className })`);
  let fol = await followerSlide();
  ok(fol.text === drv.text && !fol.wandering && /Live/.test(fol.pill), 'the follower shows the same slide, live', fol);

  // the QR code on the screens: the presenter's and the follower's
  await d.ev(`${P}.setJoin(true), 'ok'`);
  await f.until(`!!${F}.document.getElementById('joinCard')`, 'the join card on the follower', 5000).catch(() => {});
  const joins = { presenter: await d.ev(`!!${P}.document.querySelector('#joinCard .join-qr svg')`), follower: await f.ev(`!!${F}.document.querySelector('#joinCard .join-qr svg')`),
    code: await f.ev(`${F}.document.querySelector('#joinCard .join-code') && ${F}.document.querySelector('#joinCard .join-code').textContent`) };
  ok(joins.presenter && joins.follower && joins.code === code, 'j shows the QR code on the presenter and the follower', joins);
  await d.ev(`${P}.setJoin(false), 'ok'`);
  await f.until(`!${F}.document.getElementById('joinCard')`, 'the join card to go', 5000).catch(() => {});
  ok(!(await f.ev(`!!${F}.document.getElementById('joinCard')`)), 'turned off, the follower\'s QR card goes too');

  // the arrow over the part Space goes to: from the first verse, the chorus
  const marker = (w, frame) => w.ev(`(() => { const p = ${frame}.document.getElementById('progress'); const i = [...p.children].findIndex(c => c.classList.contains('space-next'));
    return { index: i, nextSong: p.classList.contains('space-next-song'), shown: i === -1 ? false : getComputedStyle(p.children[i], '::after').display !== 'none' }; })()`);
  let mk = await marker(d, P);
  ok(mk.index === 1 && mk.shown, 'the arrow marks the chorus after the first verse', mk);

  // Space: verse, chorus, verse, then back to the chorus (the arrows go as written); the follower follows
  await d.ev(`${P}.spaceNext(), 'ok'`);
  drv = await driverSlide();
  const t0 = Date.now();
  await f.until(`${F}.current_song.chunk_index === ${drv.part}`, 'the follower to follow', 5000);
  ok(drv.part === 1, `Space goes to the chorus; the follower follows (${Date.now() - t0} ms)`, drv);
  await d.ev(`${P}.spaceNext(), 'ok'`);
  drv = await driverSlide();
  mk = await marker(d, P);
  ok(drv.part === 2 && mk.index === 1, 'Space goes to the second verse, and the arrow back to the chorus', [drv.part, mk]);
  await f.until(`${F}.current_song.chunk_index === 2`, 'the follower to follow', 5000);
  const fmk = await marker(f, F);
  ok(fmk.index === 1, 'the follower shows the same arrow', fmk);

  // a held key counts as one press: its repeats don't move (Evan: held it and ended up 3 songs on)
  const held = await d.ev(`(() => { const before = ${P}.window.songbook.song_index + ':' + ${P}.current_song.chunk_index;
    for (const key of ['ArrowRight', ' ', 'PageDown']) ${P}.processKey({ key, repeat: true, target: ${P}.document.body, preventDefault() {} });
    return before === ${P}.window.songbook.song_index + ':' + ${P}.current_song.chunk_index; })()`);
  ok(held, 'held keys (repeats) don\'t move the slides');

  // the follower wanders on its own, and the leader changes song
  await f.ev(`${F}.focus(), 'ok'`);
  await f.key('ArrowRight');
  fol = await followerSlide();
  ok(fol.wandering && fol.part === 3 && drv.part === 2 && /Back to live/.test(fol.pill), 'a follower that moves stops following', fol);
  await d.ev(`${P}.nextSong(), 'ok'`);
  drv = await driverSlide();
  await f.until(`/Vera/.test(${F}.document.getElementById('livePill').textContent)`, 'the pill to name the new song', 5000);
  fol = await followerSlide();
  await f.shot('2-follower-wandering');
  ok(fol.wandering && fol.nudge, 'wandering: the pill names the leader\'s new song and nudges', fol);
  await f.key('Enter');
  fol = await followerSlide();
  ok(!fol.wandering && fol.id === drv.id && fol.part === drv.part, 'Enter goes back to live', fol);

  // its own look
  await f.key('C');
  fol = await followerSlide();
  const driverCls = await d.ev(`${P}.document.body.className`);
  await f.shot('3-follower-live-chords');
  ok(!/nochords/.test(fol.cls) && /nochords/.test(driverCls), 'C on the follower turns on its chords only', [fol.cls, driverCls]);

  // whole song on the follower: back on the four-part song, every part shows, the one being sung marked
  await d.ev(`${P}.prevSong(), ${P}.spaceNext(), 'ok'`); // first song, first verse; Space goes to the chorus
  drv = await driverSlide();
  await f.until(`${F}.current_song.chunk_index === ${drv.part} && ${F}.current_song.id === ${JSON.stringify(drv.id)}`, 'the follower on the first song', 5000);
  await f.key('w');
  await sleep(300);
  const whole = await f.ev(`(() => { const c = [...${F}.document.querySelectorAll('#cur_slide chunk')];
    return { count: c.length, current: c.findIndex(x => x.classList.contains('current')), next: c.findIndex(x => x.classList.contains('space-next')),
      fits: ${F}.document.getElementById('cur_slide').scrollWidth <= ${F}.innerWidth + 1 }; })()`);
  whole.driverChunks = await d.ev(`${P}.document.querySelectorAll('#cur_slide chunk').length`);
  await f.shot('4-follower-whole-song');
  ok(whole.count === 4 && whole.current === drv.part && whole.next === 2 && whole.fits && whole.driverChunks === 1,
    'w on the follower shows the whole song, the part sung and the next marked; the presenter is unchanged', whole);
  await f.key('w');

  // ---------- the presenter's own Grid and Whole song: click a part to show it everywhere ----------
  await d.ev(`${P}.hideHelp(), ${P}.setView('grid'), 'ok'`);
  ok((await d.ev(`getComputedStyle(${P}.document.getElementById('menuButton')).display`)) === 'block', 'Grid shows the Menu button');
  const gridState = () => d.ev(`(() => { const cards = [...${P}.document.querySelectorAll('#cur_slide .grid-card')];
    return { rows: ${P}.document.querySelectorAll('#cur_slide .grid-song').length, cards: cards.map(c => c.dataset.song + ':' + c.dataset.part),
      current: (cards.find(c => c.classList.contains('current')) || {}).dataset?.part,
      next: (c => c ? { song: c.dataset.song, part: c.dataset.part } : {})(cards.find(c => c.classList.contains('space-next'))) }; })()`);
  let grid = await gridState();
  ok(grid.rows === 2 && grid.cards.length === 4 && grid.current === String(drv.part) && grid.next.song === '0' && grid.next.part === '2',
    'Grid: every song in the book, the one on screen open, its part on screen and the next marked', grid);
  await d.shot('8-presenter-grid');
  // opening another song's row shows its parts without changing the screens
  await d.ev(`${P}.document.querySelector('[data-open-song="1"]').click(), 'ok'`);
  grid = await gridState();
  drv = await driverSlide();
  ok(grid.cards.length === 5 && grid.cards.includes('1:0') && drv.part === 1, 'clicking a song\'s row opens it to look at, the screens stay', grid);
  await d.ev(`${P}.document.querySelector('[data-open-song="1"]').click(), 'ok'`);
  await d.ev(`${P}.document.querySelector('#cur_slide .grid-card[data-part="3"]').click(), 'ok'`);
  drv = await driverSlide();
  await f.until(`${F}.current_song.chunk_index === 3`, 'the follower to follow the click', 5000).catch(() => {});
  ok(drv.part === 3 && (await f.ev(`${F}.current_song.chunk_index`)) === 3, 'clicking a card shows that part; the follower follows', drv.part);
  ok((await f.ev(`${F}.document.querySelectorAll('#cur_slide chunk').length`)) === 1, 'the follower still shows one part at a time');
  // after the third verse comes the chorus again; after that, Space goes on to the next song: it opens on its
  // own, the triangle on its first part
  grid = await gridState();
  ok(grid.next.song === '0' && grid.next.part === '1', 'after the third verse, the triangle is on the chorus again', grid);
  await d.ev(`${P}.document.querySelector('#cur_slide .grid-card[data-part="1"]').click(), 'ok'`);
  grid = await gridState();
  ok(grid.cards.includes('1:0') && grid.next.song === '1' && grid.next.part === '0', 'every part sung: the next song opens with its first part marked', grid);
  await d.ev(`${P}.setView('whole'), 'ok'`);
  await d.ev(`${P}.document.querySelector('#cur_slide chunk[data-part="0"]').click(), 'ok'`);
  drv = await driverSlide();
  await f.until(`${F}.current_song.chunk_index === 0`, 'the follower to follow the click', 5000).catch(() => {});
  ok(drv.part === 0 && (await f.ev(`${F}.current_song.chunk_index`)) === 0, 'Whole song: clicking a part shows it; the follower follows', drv.part);
  await d.ev(`${P}.setView('part'), 'ok'`);

  // ---------- handing the screens to a leader ----------
  // This follower is signed in (the same browser as alice), so it counts as a leader: alice on another device
  await d.until(`${P}.eval("leadersHere").length === 1`, 'the presenter to see the leader', 5000).catch(() => {});
  const leaders = await d.ev(`${P}.eval("leadersHere")`);
  ok(leaders.length === 1 && leaders[0].name === 'alice', 'the presenter sees a signed-in leader following', leaders);
  await d.ev(`${P}.handOver(${P}.eval("leadersHere")[0].name, ${P}.eval("leadersHere")[0].tab), 'ok'`);
  await f.until(`${F}.amDriving()`, 'the leader to get the screens', 5000).catch(() => {});
  const lead = await f.ev(`({ driving: ${F}.amDriving(), pill: ${F}.document.getElementById('livePill').textContent, extra: ${F}.document.getElementById('liveExtra').hidden ? '' : ${F}.document.getElementById('liveExtra').textContent })`);
  await f.shot('5-leader-driving');
  ok(lead.driving && /Linked/.test(lead.pill) && lead.extra === 'Give back', 'handed the screens, the leader drives (Linked, Give back)', lead);
  ok(!(await d.ev(`${P}.amDriving()`)), 'the presenter no longer drives');
  await f.ev(`${F}.spaceNext(), 'ok'`);
  fol = await followerSlide();
  await d.until(`${P}.current_song.chunk_index === ${fol.part} && ${P}.current_song.id === ${JSON.stringify(fol.id)}`, 'the presenter to follow the leader', 5000).catch(() => {});
  drv = await driverSlide();
  const dbg = { f: await f.ev(`({ now: ${F}.eval('liveNow'), tab: ${F}.myTab(), was: ${F}.eval('wasDriving') })`), d: await d.ev(`({ now: ${P}.eval('liveNow'), tab: ${P}.myTab() })`) };
  ok(drv.part === fol.part && drv.id === fol.id, 'the presenter\'s screen follows the leader', [drv, fol, dbg]);
  // Linked off: the leader looks ahead alone; on again: the screens catch up
  await f.ev(`${F}.setLinked(false), ${F}.nextChunk(), 'ok'`);
  await sleep(600);
  const ahead = await followerSlide();
  drv = await driverSlide();
  ok(drv.part !== ahead.part || drv.id !== ahead.id, 'not linked: the leader moves alone', [drv.part, ahead.part]);
  await f.ev(`${F}.setLinked(true), 'ok'`);
  await d.until(`${P}.current_song.chunk_index === ${ahead.part} && ${P}.current_song.id === ${JSON.stringify(ahead.id)}`, 'the screens to catch up', 5000).catch(() => {});
  drv = await driverSlide();
  ok(drv.part === ahead.part && drv.id === ahead.id, 'linked again: the screens catch up', [drv.part, ahead.part]);
  // the leader gives the screens back; the presenter drives and the leader follows
  await f.ev(`${F}.giveBack(), 'ok'`);
  await d.until(`${P}.amDriving()`, 'the presenter to drive again', 5000).catch(() => {});
  await d.ev(`${P}.prevChunk(), 'ok'`);
  drv = await driverSlide();
  await f.until(`${F}.current_song.chunk_index === ${drv.part}`, 'the leader to follow again', 5000).catch(() => {});
  fol = await followerSlide();
  ok(!(await f.ev(`${F}.amDriving()`)) && fol.part === drv.part, 'given back: the presenter drives, the leader follows', [drv.part, fol.part]);
  // the presenter hands over again, then takes the screens back
  await d.ev(`${P}.handOver(${P}.eval("leadersHere")[0].name, ${P}.eval("leadersHere")[0].tab), 'ok'`);
  await f.until(`${F}.amDriving()`, 'the leader to get the screens again', 5000).catch(() => {});
  await d.ev(`${P}.takeBack(), 'ok'`);
  await f.until(`!${F}.amDriving()`, 'the leader to lose the screens', 5000).catch(() => {});
  ok(!(await f.ev(`${F}.amDriving()`)) && (await d.ev(`${P}.amDriving()`)), 'take back: the presenter drives again');

  // ---------- suggested songs ----------
  const sugButton = () => f.ev(`!${F}.document.getElementById('liveSuggest').hidden`);
  ok(!(await sugButton()), 'suggestions start off: followers have no Suggest button');
  await d.ev(`${P}.setSuggestions(true), 'ok'`);
  await f.until(`!${F}.document.getElementById('liveSuggest').hidden`, 'the Suggest button', 5000).catch(() => {});
  ok(await sugButton(), 'turned on: followers get a Suggest button');
  await f.ev(`${F}.openSuggest(), ${F}.document.getElementById('sugText').value = "Vera's Song", ${F}.document.getElementById('sugName').value = 'Bridget', 'ok'`);
  await f.shot('6-follower-suggesting');
  await f.ev(`${F}.sendSuggestion().then(() => 'ok')`);
  await d.until(`${P}.eval('suggestionsHere').length === 1`, 'the presenter to get the suggestion', 5000).catch(() => {});
  const card = await d.ev(`(() => { const c = ${P}.document.getElementById('sugCard'); return c && !c.hidden ? c.textContent : ''; })()`);
  ok(/Vera's Song/.test(card) && /Bridget/.test(card) && /Yes/.test(card), 'the presenter sees the suggestion, with Yes and Not now', card);
  await f.until(`(() => { const c = ${F}.document.getElementById('sugCard'); return c && !c.hidden; })()`, 'the leader to see it', 5000).catch(() => {});
  const sugId = await f.ev(`${F}.eval('suggestionsHere')[0] && ${F}.eval('suggestionsHere')[0].id`);
  ok(!!sugId, 'a signed-in leader following sees it too', sugId);
  const countBefore = await d.ev(`${P}.window.songbook.songs.length`);
  const indexBefore = await d.ev(`${P}.window.songbook.song_index`);
  const screenBefore = await d.ev(`${P}.current_song.doc._id + ':' + ${P}.current_song.chunk_index`);
  await f.ev(`${F}.answerSuggestion(${JSON.stringify(sugId)}, 'yes').then(() => 'ok')`);
  // a leader's yes is added by the presenter's page on its own, with no tap there
  await d.until(`${P}.window.songbook.songs.length === ${countBefore + 1}`, 'the yes to be added', 8000).catch(() => {});
  await d.shot('7-presenter-suggestion-added');
  const added = await d.ev(`({ count: ${P}.window.songbook.songs.length, next: ${P}.window.songbook.songs[${indexBefore} + 1].id,
    screen: ${P}.current_song.doc._id + ':' + ${P}.current_song.chunk_index })`);
  ok(added.count === countBefore + 1 && added.next === 's-vera-1', "a leader's yes adds the song right after the one on screen", added);
  ok(added.screen === screenBefore, 'saying yes does not move the screen', { before: screenBefore, after: added.screen });
  ok((await d.ev(`${P}.presentationReport().used.includes('suggestion added')`)), 'analytics notes that a suggestion was added');
  await f.until(`${F}.window.songbook.songs.length === ${countBefore + 1}`, 'the follower to get the longer list', 5000).catch(() => {});
  ok((await f.ev(`${F}.window.songbook.songs.length`)) === countBefore + 1, 'followers get the added song');
  await d.until(`${P}.eval('suggestionsHere').length === 0`, 'the suggestion to go away', 5000).catch(() => {});
  ok((await d.ev(`${P}.eval('suggestionsHere').length`)) === 0, 'an added suggestion goes away');

  // a songbook change reaches the follower (#147)
  const before = await f.ev(`${F}.window.songbook.songs.length`);
  await d.ev(`${P}.updateSongbook(JSON.stringify({ title: 'Live Test Book', songs: ${P}.window.songbook.songs.slice(0, 1) })), 'ok'`);
  await d.ev(`${P}.nextChunk(), 'ok'`);
  await f.until(`${F}.window.songbook.songs.length === 1`, 'the follower to get the shorter book', 5000).catch(() => {});
  ok((await f.ev(`${F}.window.songbook.songs.length`)) === 1 && before >= 2, 'the follower gets the changed songbook', before);

  // stop sharing: the follower is told, and the records are gone
  await d.ev(`${P}.stopShare(), 'ok'`);
  await f.until(`!document.body.classList.contains('following')`, 'the follower to end', 5000).catch(() => {});
  const endText = await f.ev(`document.getElementById('problem').textContent`);
  ok(/stopped sharing/.test(endText), 'the follower says the leader stopped sharing', endText);
  await sleep(500);
  const goneSet = await req('alice', 'GET', `/ycanta_live/set:${code}`);
  ok(goneSet.status === 404, 'the share is gone from the server', goneSet.status);

  // ---------- nothing from the server runs as page code ----------
  const bad = '<img src=x onerror="window.top.hacked=1"><script>window.top.hacked=2</script>';
  await req('alice', 'PUT', `/ycanta_live/set:${evil}`, { type: 'live-set', owner: 'alice', title: 'Evil' + bad, songs: [{ id: 's-x', doc: {
    title: 'Bad' + bad, authors: [bad], scripture_ref: [], key: bad, copyright: bad, content: [[{ type: 'verse" onmouseover="x' }, ['<c>G</c>la' + bad]]] } }] });
  await req('alice', 'PUT', `/ycanta_live/now:${evil}`, { type: 'live-now', owner: 'alice', index: 0, id: 's-x', part: 0, title: 'Bad' + bad, partName: bad });
  await f.ev(`location.hash = ${JSON.stringify(evil)}; 'ok'`);
  await f.until(`document.body.classList.contains('following') && ${F}.current_song && ${F}.current_song.id === 's-x'`, 'the follower to show the bad record', 10000);
  await sleep(500);
  const xss = await f.ev(`({ hacked: window.hacked, imgs: ${F}.document.querySelectorAll('#slides img, #liveBar img').length, chords: ${F}.document.querySelectorAll('#cur_slide c').length })`);
  ok(!xss.hacked && xss.imgs === 0 && xss.chords === 1, 'page code in a shared record shows as text; chords still work', xss);

  ok(d.errors.length === 0, 'no page errors (presenter)', d.errors);
  ok(f.errors.length === 0, 'no page errors (follower)', f.errors);
} catch (err) {
  failed++;
  console.log('  FAIL', err.message);
} finally {
  for (const id of [SONG, BOOK]) {
    const doc = await req('alice', 'GET', '/church_a/' + id);
    if (doc.status === 200) await req('alice', 'DELETE', `/church_a/${id}?rev=${doc.json._rev}`);
  }
  for (const id of ['set:' + evil, 'now:' + evil]) {
    const doc = await req('alice', 'GET', `/ycanta_live/${id}`);
    if (doc.status === 200) await req('alice', 'DELETE', `/ycanta_live/${id}?rev=${doc.json._rev}`);
  }
  browser.kill();
  if (server) server.close();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* the browser may still hold it */ }
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
