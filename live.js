// Shared presentations (#51): one person drives, and other devices follow along by a short code: a TV,
// leaders' tablets, phones. The driver writes two small records in the server's "ycanta_live" database:
//   set:CODE  the title and songs, written when they change
//   now:CODE  the song and part on screen, written on every slide change
// Followers read the set, then hear each change to "now" as soon as the server saves it (CouchDB's
// _changes feed pushes it; nothing waits on a timer). Anyone may read; only the signed-in person who
// started a share may change it (database/live-validate.js). The app and live.html both load this file.
const Live = (() => {
  const DB = 'ycanta_live';
  const LETTERS = 'ACDEFHJKMNPRTWXY3479'; // no look-alikes (0/O, 1/I/L, 5/S, 8/B, 2/Z, 6/G)
  let server = null; // the CouchDB server, ending in /

  // The server is the church database's server: https://host/couch/canaan -> https://host/couch/. A name and
  // password in the address are left out: the app may keep them there, fetch refuses them, and the
  // sign-in cookie is what counts.
  function setServer(url) {
    const address = new URL('./', String(url).replace(/\/+$/, ''));
    address.username = '';
    address.password = '';
    server = address.href;
  }
  function dbUrl(path = '') { return server + DB + (path ? '/' + path : ''); }

  async function request(method, path, body, keepalive = false) {
    const res = await fetch(dbUrl(path), {
      method, credentials: 'include', keepalive, cache: 'no-store',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch (err) { /* empty answer */ }
    if (!res.ok) {
      const err = new Error((json && (json.reason || json.error)) || res.statusText);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  function newCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    return Array.from(bytes, b => LETTERS[b % LETTERS.length]).join('');
  }
  function cleanCode(code) { return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  // ---- The driver ----
  let owner = null, code = null;
  // One record, written in order: a write waits for the one before it, and only the newest waiting
  // version is written (quick key presses don't pile up).
  function recordWriter(id, rev = null) {
    let waiting = null, busy = null;
    async function run() {
      while (waiting) {
        const doc = waiting;
        waiting = null;
        try {
          rev = (await request('PUT', encodeURIComponent(id), rev ? { ...doc, _rev: rev } : doc)).rev;
        } catch (err) {
          if (err.status === 409) { // the server has a newer copy (another tab?): take its version number, write again
            try { rev = (await request('GET', encodeURIComponent(id)))._rev; } catch (e) { rev = null; }
            if (!waiting) waiting = doc;
          } else {
            Live.onProblem(err);
          }
        }
      }
      busy = null;
    }
    return {
      write(doc) { waiting = doc; if (!busy) busy = run(); return busy; },
      async remove() {
        if (busy) await busy;
        if (rev) await request('DELETE', encodeURIComponent(id) + '?rev=' + rev, undefined, true).catch(() => {});
        rev = null;
      },
    };
  }
  let setWriter = null, nowWriter = null;

  // Starts sharing a set ({ title, songs, bible }); gives back the code
  async function start(set) {
    const session = await fetch(server + '_session', { credentials: 'include', cache: 'no-store' }).then(r => r.json());
    owner = session && session.userCtx && session.userCtx.name;
    if (!owner) throw new Error('Sign in to the church server to share.');
    for (let tries = 0; tries < 5; tries++) {
      const tryCode = newCode();
      try {
        const rev = (await request('PUT', 'set:' + tryCode, { type: 'live-set', owner, ...set, started: Date.now() })).rev;
        code = tryCode;
        setWriter = recordWriter('set:' + code, rev);
        nowWriter = recordWriter('now:' + code);
        return code;
      } catch (err) {
        if (err.status !== 409) throw err; // 409: that code is taken, try another
      }
    }
    throw new Error("Couldn't find a free code. Try again.");
  }
  function updateSet(set) { if (code) setWriter.write({ type: 'live-set', owner, ...set, started: Date.now() }); }
  function publish(now) { if (code) nowWriter.write({ type: 'live-now', owner, ...now, at: Date.now() }); }
  async function stop() {
    if (!code) return;
    const writers = [setWriter, nowWriter];
    code = null;
    await Promise.all(writers.map(w => w.remove()));
  }

  // ---- A follower ----
  // Calls onSet(set) and onNow(now) as they come, onEnd() when the driver stops sharing, onProblem(err)
  // when the server can't be reached (it keeps trying). Gives back { stop }.
  async function follow(rawCode, { onSet, onNow, onEnd = () => {}, onProblem = () => {} }) {
    const followCode = cleanCode(rawCode);
    const ids = ['set:' + followCode, 'now:' + followCode];
    let stopped = false, since = null, controller = null;

    async function readAll() {
      since = (await request('GET', '')).update_seq;
      const set = await request('GET', ids[0]); // 404 here means no such share
      onSet(set);
      try { onNow(await request('GET', ids[1])); } catch (err) { if (err.status !== 404) throw err; }
    }
    await readAll().catch(err => {
      if (err.status === 404) err.message = 'No presentation is being shared with that code.';
      throw err;
    });

    (async function listen() {
      while (!stopped) {
        try {
          controller = new AbortController();
          const res = await fetch(dbUrl('_changes?feed=longpoll&filter=_doc_ids&include_docs=true&heartbeat=20000&since=' + encodeURIComponent(since)), {
            method: 'POST', credentials: 'include', cache: 'no-store', signal: controller.signal,
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc_ids: ids }),
          });
          if (!res.ok) throw new Error('The server said ' + res.status);
          const json = await res.json();
          since = json.last_seq;
          for (const row of json.results || []) {
            if (row.deleted) { if (row.id === ids[0]) { stopped = true; onEnd(); } continue; }
            if (row.id === ids[0]) onSet(row.doc);
            else if (row.id === ids[1]) onNow(row.doc);
          }
        } catch (err) {
          if (stopped) break;
          if (err.name !== 'AbortError') {
            onProblem(err);
            await new Promise(r => setTimeout(r, 2000));
          }
          // after a gap (a phone that slept, a dropped connection) read both again so nothing is missed
          try { await readAll(); } catch (e) { if (e.status === 404) { stopped = true; onEnd(); } }
        }
      }
    })();

    // A phone that wakes up reads both again at once, instead of waiting for its old connection to fail
    const wake = () => { if (document.visibilityState === 'visible' && controller) controller.abort(); };
    document.addEventListener('visibilitychange', wake);
    return { code: followCode, stop() { stopped = true; document.removeEventListener('visibilitychange', wake); if (controller) controller.abort(); } };
  }

  return {
    setServer, get server() { return server; }, start, updateSet, publish, stop, follow, cleanCode,
    get code() { return code; },
    onProblem: err => console.error('Sharing:', err),
  };
})();
