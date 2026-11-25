// Shared presentations (#51): one person drives, and other devices follow along by a short code: a TV,
// leaders' tablets, phones. Records in the server's "ycanta_live" database:
//   set:CODE        the title, the settings and the order of the songs, written by the person sharing
//   part:CODE:N     the songs themselves, spread over a few records by song id. The server (nginx in front
//                   of CouchDB) turns down any upload over 1 MB, and a church's whole book of 1,400+ songs is
//                   several MB. Changing one song sends only its part again.
//   now:CODE        the song and part on the screens, written by whoever drives: the person sharing, or a
//                   signed-in leader they handed it to ("driver")
//   lead:CODE:name  a signed-in leader following along, so the person sharing can hand them the screens
//   sug:CODE:id     a song someone suggests (only when the person sharing turned suggestions on); anyone can
//                   send one, and someone signed in answers it once: yes or not now
// Followers read the set, then hear each change as soon as the server saves it (CouchDB's _changes feed
// pushes it; nothing waits on a timer). Anyone may read; database/live-validate.js says who may write.
// The app and live.html both load this file.
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
      const err = new Error(res.status === 413 ? 'The server turned it down as too big.' : (json && (json.reason || json.error)) || res.statusText);
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

  // Who is signed in to the server on this device (the app's sign-in cookie), or null. And this page's own id:
  // the screens follow one page, not one person (someone can share from a laptop and lead from a tablet).
  let me;
  const tab = Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');
  async function whoAmI() {
    if (me !== undefined) return me;
    try {
      const session = await fetch(server + '_session', { credentials: 'include', cache: 'no-store' }).then(r => r.json());
      me = (session && session.userCtx && session.userCtx.name) || null;
    } catch (err) { me = null; }
    return me;
  }

  // One record, written in order: a write waits for the one before it, and only the newest waiting version
  // is written (quick key presses don't pile up). If the server has a newer copy, keepGoing(serverCopy) says
  // whether to write over it (a leader whose screens were taken back stops).
  function recordWriter(id, rev = null, keepGoing = () => true) {
    let waiting = null, busy = null;
    async function run() {
      while (waiting) {
        const { doc, force } = waiting;
        waiting = null;
        try {
          rev = (await request('PUT', encodeURIComponent(id), rev ? { ...doc, _rev: rev } : doc)).rev;
        } catch (err) {
          if (err.status === 409) {
            let current = null;
            try { current = await request('GET', encodeURIComponent(id)); } catch (e) { /* gone */ }
            rev = current ? current._rev : null;
            if (!waiting && (force || !current || keepGoing(current))) waiting = { doc, force };
          } else {
            Live.onProblem(err);
          }
        }
      }
      busy = null;
    }
    return {
      write(doc, force = false) { waiting = { doc, force }; if (!busy) busy = run(); return busy; },
      async remove() {
        if (busy) await busy;
        if (rev) await request('DELETE', encodeURIComponent(id) + '?rev=' + rev, undefined, true).catch(() => {});
        rev = null;
      },
    };
  }

  // ---- The songs, spread over part:CODE:N records ----
  const PART_AIM = 300000, PART_MAX = 700000; // bytes; the server takes up to 1 MB in one upload
  const bytes = text => new TextEncoder().encode(text).length;
  function bucket(id, count) { // the same song always lands in the same part
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    return (h >>> 0) % count;
  }
  // { title, songs, ... } -> the set record's fields (the order, not the songs) and each part's songs
  function splitSet(set, count) {
    const { songs = [], ...rest } = set;
    const parts = Array.from({ length: count }, () => ({}));
    songs.forEach(song => { parts[bucket(String(song.id), count)][song.id] = song; });
    return { head: { ...rest, order: songs.map(song => song.id), parts: count }, parts };
  }
  // Enough parts that each stays well under the server's limit
  function partsFor(set, count = 1) {
    let split = splitSet(set, count);
    while (count < 500 && split.parts.some(part => bytes(JSON.stringify(part)) > PART_MAX)) split = splitSet(set, count *= 2);
    return split;
  }
  const partId = n => 'part:' + code + ':' + n;

  // ---- Sharing (the person sharing) and driving (them, or a leader they hand it to) ----
  let code = null, owner = null, ownerTab = null, setWriter = null, nowWriter = null, sharing = false;
  let partWriters = [], partsSent = []; // each part's writer, and the songs last sent in it (as JSON)
  const nowRecord = (fields, driver, driverTab) => ({ type: 'live-now', ...fields, owner, ownerTab, driver, driverTab, at: Date.now() });
  const partRecord = songs => ({ type: 'live-part', owner, songs });

  // Starts sharing a set ({ title, songs, bible }); gives back the code. The set record goes up first (it
  // claims the code), then the parts; no one can follow until the code is shown, so the order is safe.
  async function start(set) {
    me = undefined; // ask again: whoever is signed in now
    owner = await whoAmI();
    if (!owner) throw new Error('Sign in to the church server to share.');
    const total = bytes(JSON.stringify(set.songs || []));
    const { head, parts } = partsFor(set, Math.max(1, Math.ceil(total / PART_AIM)));
    for (let tries = 0; tries < 5; tries++) {
      const tryCode = newCode();
      let rev;
      try {
        rev = (await request('PUT', 'set:' + tryCode, { type: 'live-set', owner, ...head, started: Date.now() })).rev;
      } catch (err) {
        if (err.status === 409) continue; // that code is taken, try another
        throw err;
      }
      code = tryCode;
      try {
        partWriters = [];
        partsSent = [];
        for (let n = 0; n < parts.length; n++) {
          const partRev = (await request('PUT', partId(n), partRecord(parts[n]))).rev;
          partWriters.push(recordWriter(partId(n), partRev));
          partsSent.push(JSON.stringify(parts[n]));
        }
      } catch (err) {
        const writers = partWriters;
        partWriters = [];
        await Promise.all([recordWriter('set:' + code, rev), ...writers].map(w => w.remove()));
        code = null;
        throw err;
      }
      sharing = true;
      ownerTab = tab;
      setWriter = recordWriter('set:' + code, rev);
      nowWriter = recordWriter('now:' + code, null, current => !current.driverTab || current.driverTab === tab);
      return code;
    }
    throw new Error("Couldn't find a free code. Try again.");
  }
  // The songs changed: send the parts that changed, then the set record (followers put the songs in its order)
  async function updateSet(set) {
    if (!sharing) return;
    const { head, parts } = partsFor(set, partWriters.length);
    const sends = [];
    parts.forEach((songs, n) => {
      const json = JSON.stringify(songs);
      if (json === partsSent[n]) return;
      partsSent[n] = json;
      if (!partWriters[n]) partWriters[n] = recordWriter(partId(n)); // more parts than at the start
      sends.push(partWriters[n].write(partRecord(songs)));
    });
    await Promise.all(sends);
    if (sharing) setWriter.write({ type: 'live-set', owner, ...head, started: Date.now() });
  }
  // The part on screen, from whoever drives
  function publish(fields) { if (nowWriter) nowWriter.write(nowRecord(fields, me, tab)); }
  // The person sharing hands the screens to a signed-in leader's page, or takes them back
  function handOver(name, leaderTab, fields) { if (sharing) nowWriter.write(nowRecord(fields, name, leaderTab), true); }
  function takeBack(fields) { if (sharing) nowWriter.write(nowRecord(fields, owner, tab), true); }
  // A leader who was handed the screens: their moves go to now:CODE
  function drive(shareCode, now) {
    if (sharing || code === shareCode) return;
    code = shareCode;
    owner = now.owner;
    ownerTab = now.ownerTab;
    nowWriter = recordWriter('now:' + code, null, current => current.driverTab === tab);
  }
  // A leader gives the screens back to the person sharing
  function giveBack(fields) { if (nowWriter && !sharing) { nowWriter.write(nowRecord(fields, owner, ownerTab), true); stopDriving(); } }
  function stopDriving() { if (!sharing) { code = null; nowWriter = null; } }
  async function stop() {
    if (!sharing) return;
    const writers = [setWriter, nowWriter, ...partWriters], ended = code;
    sharing = false;
    code = null;
    nowWriter = null;
    partWriters = [];
    partsSent = [];
    await Promise.all(writers.map(w => w.remove()));
    // and the suggestions sent to it
    try {
      const prefix = 'sug:' + ended + ':';
      const rows = (await request('GET', '_all_docs?startkey=' + encodeURIComponent(JSON.stringify(prefix)) + '&endkey=' + encodeURIComponent(JSON.stringify(prefix + '￰')))).rows;
      await Promise.all(rows.map(row => request('DELETE', encodeURIComponent(row.id) + '?rev=' + row.value.rev, undefined, true).catch(() => {})));
    } catch (err) { /* left for later */ }
  }

  // ---- Suggestions ----
  async function suggest(shareCode, text, name) {
    const id = 'sug:' + shareCode + ':' + Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');
    const doc = { type: 'live-sug', text: String(text).trim().slice(0, 120), status: 'new', at: Date.now() };
    if (String(name || '').trim()) doc.name = String(name).trim().slice(0, 40);
    await request('PUT', encodeURIComponent(id), doc);
  }
  // Yes or not now, once; false if someone answered first
  async function answer(id, status) {
    const doc = await request('GET', encodeURIComponent(id));
    if (doc.status !== 'new') return false;
    try {
      await request('PUT', encodeURIComponent(id), { ...doc, status, by: await whoAmI() });
      return true;
    } catch (err) {
      if (err.status === 409 || err.status === 403) return false;
      throw err;
    }
  }
  // A suggestion that was added to the songs (or isn't needed any more) goes away
  async function dismiss(id) {
    try {
      const doc = await request('GET', encodeURIComponent(id));
      await request('DELETE', encodeURIComponent(id) + '?rev=' + doc._rev);
    } catch (err) { /* already gone */ }
  }

  // ---- A signed-in leader following along says so, so the person sharing can hand them the screens ----
  let leadId = null;
  async function announce(shareCode) {
    const name = await whoAmI();
    if (!name) return null;
    leadId = 'lead:' + shareCode + ':' + name;
    let rev = null;
    try { rev = (await request('GET', encodeURIComponent(leadId)))._rev; } catch (err) { /* new */ }
    try {
      await request('PUT', encodeURIComponent(leadId), { type: 'live-lead', owner: name, tab, ...(rev ? { _rev: rev } : {}), at: Date.now() });
    } catch (err) { console.error('Follow along: couldn\'t say a leader is here:', err); }
    return name;
  }
  async function unannounce() {
    if (!leadId) return;
    const id = leadId;
    leadId = null;
    try {
      const rev = (await request('GET', encodeURIComponent(id)))._rev;
      await request('DELETE', encodeURIComponent(id) + '?rev=' + rev, undefined, true);
    } catch (err) { /* already gone */ }
  }

  // ---- Following ----
  // Calls onSet(set) and onNow(now) as they come, onLeaders([{ name, tab }]) when the signed-in leaders following
  // change, onEnd() when sharing stops, onProblem(err) when the server can't be reached (it keeps trying).
  // Without onSet the songs aren't read at all (the person sharing has them already). Gives back { stop }.
  async function follow(rawCode, { onSet, onNow = () => {}, onLeaders = () => {}, onSuggestions = () => {}, onEnd = () => {}, onProblem = () => {} }) {
    const followCode = cleanCode(rawCode);
    const setId = 'set:' + followCode, nowId = 'now:' + followCode, leadPrefix = 'lead:' + followCode + ':', sugPrefix = 'sug:' + followCode + ':';
    const partPrefix = 'part:' + followCode + ':';
    let stopped = false, since = null, controller = null;
    const leaders = new Map(), suggestions = new Map();
    // The set record and its parts, put back together: { title, ..., songs } in the set's order. A set from
    // before the parts (songs in the set record) still works.
    let head = null;
    const parts = new Map();
    function tellSet() {
      if (!onSet || !head) return;
      if (!Array.isArray(head.order)) return onSet(head);
      const byId = {};
      parts.forEach(part => Object.assign(byId, part.songs));
      const { order, parts: count, ...rest } = head;
      onSet({ ...rest, songs: order.map(id => byId[id]).filter(Boolean) });
    }
    const tellLeaders = () => onLeaders([...leaders.values()].sort((a, b) => a.name.localeCompare(b.name)));
    const tellSuggestions = () => onSuggestions([...suggestions.values()].sort((a, b) => a.at - b.at));
    const sugFrom = doc => ({ id: doc._id, text: String(doc.text || ''), name: String(doc.name || ''), status: doc.status, by: doc.by || '', at: Number(doc.at) || 0 });
    const range = prefix => '_all_docs?include_docs=true&startkey=' + encodeURIComponent(JSON.stringify(prefix)) + '&endkey=' + encodeURIComponent(JSON.stringify(prefix + '￰'));

    async function readAll() {
      since = (await request('GET', '')).update_seq;
      head = await request('GET', setId); // 404 here means no such share
      if (onSet) {
        parts.clear();
        (await request('GET', range(partPrefix))).rows.forEach(row => { if (row.doc) parts.set(row.id, row.doc); });
        tellSet();
      }
      try { onNow(await request('GET', nowId)); } catch (err) { if (err.status !== 404) throw err; }
      const rows = (await request('GET', range(leadPrefix))).rows;
      leaders.clear();
      rows.forEach(row => leaders.set(row.id, { name: row.id.slice(leadPrefix.length), tab: row.doc && row.doc.tab }));
      tellLeaders();
      suggestions.clear();
      (await request('GET', range(sugPrefix))).rows.forEach(row => { if (row.doc) suggestions.set(row.id, sugFrom(row.doc)); });
      tellSuggestions();
    }
    await readAll().catch(err => {
      if (err.status === 404) err.message = 'No presentation is being shared with that code.';
      throw err;
    });

    const selector = { _id: { $regex: '^(set|now):' + followCode + '$|^(lead|sug' + (onSet ? '|part' : '') + '):' + followCode + ':' } };
    (async function listen() {
      while (!stopped) {
        try {
          controller = new AbortController();
          const res = await fetch(dbUrl('_changes?feed=longpoll&filter=_selector&include_docs=true&heartbeat=20000&since=' + encodeURIComponent(since)), {
            method: 'POST', credentials: 'include', cache: 'no-store', signal: controller.signal,
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selector }),
          });
          if (!res.ok) throw new Error('The server said ' + res.status);
          const json = await res.json();
          since = json.last_seq;
          let setChanged = false, nowDoc = null; // the parts and the set record often come together: put them together once
          for (const row of json.results || []) {
            if (row.id.startsWith(partPrefix)) {
              if (row.deleted) parts.delete(row.id); else parts.set(row.id, row.doc);
              setChanged = true;
            } else if (row.id.startsWith(sugPrefix)) {
              if (row.deleted) suggestions.delete(row.id); else suggestions.set(row.id, sugFrom(row.doc));
              tellSuggestions();
            } else if (row.id.startsWith(leadPrefix)) {
              if (row.deleted) leaders.delete(row.id); else leaders.set(row.id, { name: row.id.slice(leadPrefix.length), tab: row.doc.tab });
              tellLeaders();
            } else if (row.deleted) {
              if (row.id === setId) { stopped = true; onEnd(); }
            } else if (row.id === setId) { head = row.doc; setChanged = true; }
            else if (row.id === nowId) nowDoc = row.doc;
          }
          if (setChanged && !stopped) tellSet();
          if (nowDoc && !stopped) onNow(nowDoc); // after the songs, so a song just added is there
        } catch (err) {
          if (stopped) break;
          if (err.name !== 'AbortError') {
            onProblem(err);
            await new Promise(r => setTimeout(r, 2000));
          }
          // after a gap (a phone that slept, a dropped connection) read everything again so nothing is missed
          try { await readAll(); } catch (e) { if (e.status === 404) { stopped = true; onEnd(); } }
        }
      }
    })();

    // A phone that wakes up reads everything again at once, instead of waiting for its old connection to fail
    const wake = () => { if (document.visibilityState === 'visible' && controller) controller.abort(); };
    document.addEventListener('visibilitychange', wake);
    return { code: followCode, stop() { stopped = true; document.removeEventListener('visibilitychange', wake); if (controller) controller.abort(); } };
  }

  return {
    setServer, cleanCode, whoAmI, start, updateSet, publish, handOver, takeBack, drive, giveBack, stopDriving, stop,
    announce, unannounce, follow, suggest, answer, dismiss,
    get server() { return server; },
    get code() { return code; },
    get sharing() { return sharing; },
    get me() { return me; },
    tab,
    onProblem: err => console.error('Sharing:', err),
  };
})();
window.Live = Live; // the presentation (in a frame) reaches it as window.parent.Live
