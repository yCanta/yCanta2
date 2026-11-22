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
  const VK = { C: 67, ArrowRight: 39, Enter: 13 };
  const key = async k => {
    const base = { key: k, code: k.length === 1 ? 'Key' + k : k, windowsVirtualKeyCode: VK[k], modifiers: k === 'C' ? 8 : 0 };
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
try {
  // ---------- the driver: alice presents Eddie's Songbook ----------
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
  await d.ev(`location.hash = '#sb-eddie-1'; 'ok'`);
  await d.until(`window.songbook && window.songbook._id === 'sb-eddie-1'`, 'the songbook', 20000);
  await d.ev(`location.hash = '#sb-eddie-1?present'; 'ok'`);
  await d.until(`!!document.getElementById('presentation') && !!document.getElementById('presentation').contentWindow.presentationReady`, 'the presentation', 20000);
  await d.ev(`document.getElementById('presentation').contentWindow.presentationReady.then(() => 'ok')`);
  const P = `document.getElementById('presentation').contentWindow`;
  ok(true, 'alice presents Eddie\'s Songbook');

  // ---------- the setup panel ----------
  await d.ev(`${P}.toggleHelp(), 'ok'`);
  await sleep(300);
  const panel = await d.ev(`(() => { const h = ${P}.document.getElementById('help'); return { html: h.innerHTML, text: h.textContent }; })()`);
  ok(!/Child Windows|data:image\/svg|Image backgrounds|<select/.test(panel.html), 'setup panel: no cast icon or dead controls');
  ok(/This screen/.test(panel.text) && /Open a mirror/.test(panel.text) && /Share with other devices/.test(panel.text), 'setup panel: this screen, a mirror, share', panel.text.slice(0, 200));

  // ---------- share ----------
  await d.ev(`${P}.startShare().then(() => 'ok')`);
  const code = await d.ev(`${P}.liveHost().Live.code`);
  ok(/^[A-Z0-9]{4}$/.test(code || ''), 'sharing gives a code', code);
  const shown = await d.ev(`${P}.document.querySelector('#share .share-code') && ${P}.document.querySelector('#share .share-code').textContent`);
  ok(shown === code, 'the panel shows the code', shown);
  const link = await d.ev(`${P}.document.querySelector('#share a').href`);
  ok(link.startsWith(APP + '/live.html?server=') && link.endsWith('#' + code), 'the panel links to live.html with the server', link);
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

  // the driver moves: the follower follows
  await d.ev(`${P}.nextChunk(), 'ok'`);
  drv = await driverSlide();
  const t0 = Date.now();
  await f.until(`${F}.current_song.id === ${JSON.stringify(drv.id)}`, 'the follower to follow', 5000);
  ok(true, `the follower follows the next slide (${Date.now() - t0} ms)`);
  await d.ev(`${P}.prevChunk(), 'ok'`); // back to the first song
  drv = await driverSlide();
  await f.until(`${F}.current_song.id === ${JSON.stringify(drv.id)}`, 'the follower to follow back', 5000);

  // the follower wanders on its own, and the leader changes song
  await f.ev(`${F}.focus(), 'ok'`);
  await f.key('ArrowRight');
  fol = await followerSlide();
  ok(fol.wandering && fol.id !== drv.id && /Back to live/.test(fol.pill), 'a follower that moves stops following', fol);
  await d.ev(`${P}.nextChunk(), 'ok'`);
  drv = await driverSlide();
  await f.until(`/${drv.id === 's-vera-1' ? 'Vera' : 'Eddie'}/.test(${F}.document.getElementById('livePill').textContent)`, 'the pill to name the new song', 5000);
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

  // a songbook change reaches the follower (#147)
  const before = await f.ev(`${F}.window.songbook.songs.length`);
  await d.ev(`${P}.updateSongbook(JSON.stringify({ title: 'Eddie\\'s Songbook', songs: ${P}.window.songbook.songs.slice(0, 1) })), 'ok'`);
  await d.ev(`${P}.nextChunk(), 'ok'`);
  await f.until(`${F}.window.songbook.songs.length === 1`, 'the follower to get the shorter book', 5000).catch(() => {});
  ok((await f.ev(`${F}.window.songbook.songs.length`)) === 1 && before === 2, 'the follower gets the changed songbook', before);

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
