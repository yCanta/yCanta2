//initialize global variable.
var db, syncHandler, remoteDb;
var sessionPwd = null; // the remote password, in memory only, for the account helper
window.users = {}; // Initialize empty users object

function updateOnlineStatus(event) {
  const condition = navigator.onLine ? "online" : "offline";
  document.documentElement.classList.add(condition);
  document.documentElement.classList.remove(condition === "online" ? "offline" : "online");

  console.log(`Event: ${event.type}; Status: ${condition}`);
  logData('connection', condition);
}
// Keep the screen from going dark while yCanta is open (songs are read from it). The browser drops the lock
// whenever the page is hidden, so ask again each time it comes back. Browsers without it (iOS before 16.4)
// and a refusal (low battery, a hidden page) just mean the screen sleeps as usual.
async function keepScreenOn() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || window.currentWakeLock && !window.currentWakeLock.released) return;
  try {
    window.currentWakeLock = await navigator.wakeLock.request('screen');
  } catch (err) {
    console.info("The screen may go dark: the browser didn't keep it on.", err.name);
  }
}
document.addEventListener('visibilitychange', keepScreenOn);

window.addEventListener('load', function() {
  // Update Online status
  updateOnlineStatus(event);
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  keepScreenOn();

  // Login listener
  const dbSelect = document.getElementById('db_select');
  dbSelect.addEventListener('change', async function(e) {
    const loginElement = document.getElementById('login');
    const selectedValue = e.target.value;

    // Clear all classes first
    loginElement.className = '';
    
    // Add appropriate class based on selection
    if (selectedValue === 'create_local') {
      loginElement.classList.add('create_local');
    } else if (selectedValue === 'connect_remote') {
      loginElement.classList.add('connect_remote');
    } else if (selectedValue === 'demo(local)') {
      loginElement.classList.add('login_demo'); // no name or PIN to type: its Login button starts it
    } else if (selectedValue.endsWith('(local)')) {
      loginElement.classList.add('login_local');
    } else if (selectedValue.endsWith('(remote)')) {
      loginElement.classList.add('login_remote');
    }

    // Picking the demo from the list starts it. The demo is also what's picked to start with on a first visit,
    // so a change made by the page itself (not the person) never starts it: that waits for its Login button.
    if (selectedValue === 'demo(local)' && e.isTrusted && !e.fromLoginRoute) startDemo();
  });

  // Trigger initial change event
  setTimeout(() => {
    dbSelect.dispatchEvent(new Event('change'));
  }, 50);
});
// The demo: Public Domain songs on this device, signed in as Johannes Gutenberg with nothing to type
async function startDemo() {
  const databases = JSON.parse(localStorage.getItem('databases'));
  const username = 'Johannes Gutenberg';
  const pin = '42';

  notyf.info('<b>Login Info</b><br>Username: Johannes Gutenberg<br> Pin: 42');

  const made = !!(databases && databases['demo(local)']);
  await dbLogin(made ? 'login_local' : 'create_local', 'demo(local)', username, pin);
  // The Public Domain songs: when the demo is first made, and again if that load never got them (no songs yet)
  let empty = !made;
  if (made) {
    try { empty = !(await db.allDocs({ startkey: 's-', endkey: 's-￿', limit: 1 })).rows.length; } catch (err) { empty = false; }
  }
  if (empty) {
    try {
      const response = await fetch('https://ycanta.canaanf.org/Public Domain.json');
      if (!response.ok) throw new Error('the server answered ' + response.status);
      const blob = await response.blob();
      const file = new File([blob], 'Public Domain.json', { type: 'TEXT/JSON' });

      setTimeout(() => {
        handleFile(file);
        notyf.info('Imported Public Domain songs');
      }, 500);
    } catch (error) {
      console.error('Error fetching file:', error);
      notyf.error("Couldn't load the demo songs. Check the internet connection, then log out and sign in to the demo again.");
    }
  }
}
async function loginRemoteDb(remote_url, username, pwd) {
  remoteDb = new PouchDB(remote_url, {skip_setup: true});
  const ajaxOpts = {
    ajax: {
      headers: {
        Authorization: getBasicAuthHeader(username, pwd),
      },
    },
  };
  const batman = await remoteDb.logIn(username, pwd, ajaxOpts);
  console.log("I'm Batman.", batman);
  // The server decides who may open a church: its own lists. Someone not on them gets a 403 here.
  try {
    await remoteDb.info();
  } catch (err) {
    if (err.status === 403 || err.status === 401) {
      const noAccess = new Error('You do not have access to this database. Ask your church admin to add you.');
      noAccess.name = 'no_access';
      throw noAccess;
    }
    throw err;
  }
  window.roles = batman.roles.reduce((a, v) => ({ ...a, [v]: true}), {});
  sessionPwd = pwd; // kept in memory only, for the account helper (see callAccountsHelper)
}
// Each person gets their own copy of a church from the server on a device (#139): "canaan(remote)~vera".
// On a shared device, a change the server refused for one person (it stays in their copy) can't be sent
// again later under someone else's sign-in. A church made on this device ("(local)") stays one copy.
function deviceCopyName(dbName, username) {
  return dbName.endsWith('(remote)') ? `${dbName}~${username}` : dbName;
}

// Before #139 everyone on a device shared one copy, named like the church ("canaan(remote)"). The first
// time someone signs in after that, their own copy starts from it instead of downloading everything again,
// but only with what the server already has: a change it never got (maybe refused for whoever made it)
// stays behind, and that item comes fresh from the server. Device records ("_local/u-...", for signing in
// offline) don't copy: this sign-in has just written this person's own. Returns how many items it copied.
async function copyFromSharedCopy(dbName, username) {
  if (!dbName.endsWith('(remote)') || db.adapter === 'memory' || !remoteDb) return 0;
  if (!indexedDB.databases) return 0; // can't tell whether there is one: download as usual
  const names = (await indexedDB.databases()).map(info => info.name);
  if (!names.includes('_pouch_' + dbName)) return 0;
  const shared = new PouchDB(dbName);
  const { rows } = await shared.allDocs();
  if (!rows.length) return 0;
  const missing = await remoteDb.revsDiff(Object.fromEntries(rows.map(row => [row.id, [row.value.rev]])));
  const ids = rows.map(row => row.id).filter(id => !missing[id]);
  if (ids.length) await shared.replicate.to(db, { doc_ids: ids, batch_size: 250 });
  window.copiedFromShared = ids.length; // for the app test
  console.log(`Copied ${ids.length} of ${rows.length} items from this device's shared copy; ${rows.length - ids.length} come from the server instead.`);
  return ids.length;
}

function clearAllData() {
  try {
    window.indexedDB.databases().then((r) => {
        for (var i = 0; i < r.length; i++) window.indexedDB.deleteDatabase(r[i].name);
    }).then(() => {
        localStorage.clear();
        location.reload();
    });
  }
  catch (error) { //If there's an error, we fall back to our local storage list of databases, and do our best to clear.
    console.log(error.message);
    let databases = JSON.parse(localStorage.getItem('databases'));
    for (db of Object.keys(databases)) { //iterate through our listed databases and remove all we know of.
      removeDbfromLocalStorage(databases[db].name);
    }
    localStorage.clear();
    location.reload();
  }
}
// What a presentation shows: the book's songs in order, their text as text (displaySong), and its readings
// as their verses (#157). Sections, deleted songs and readings that can't load (offline) are left out.
async function presentationData(songbook) {
  const result = await db.allDocs({ include_docs: true, keys: songbook.songrefs.map(row => row.id) });
  const translation = await churchBible();
  const items = await Promise.all(result.rows.map(async (row, i) => {
    const ref = songbook.songrefs[i];
    if (ref.id === 'reading') return readingItem(ref.ref, translation);
    return row.key != 'section' && row.doc ? { ...row, doc: displaySong(row.doc) } : null;
  }));
  const songs = items.filter(Boolean);
  const langNames = await addPresentationVersions(songs);
  // Bible verses (#157): where the book files are (the presentation window has no address of its own to go
  // by) and the church's translation. The books the songs cite are fetched ahead, so they work offline.
  const refs = result.rows.flatMap(row => (row.doc && Array.isArray(row.doc.scripture_ref) ? row.doc.scripture_ref : []));
  Bible.prefetch(refs, translation).catch(() => {});
  const bible = { base: new URL('bible/', location.href).href, translation };
  return { songs, title: songbook.title, bible, langNames };
}

// Two languages on a slide (#90): each song gets its languages (`langs`, the church's usual one if none) and its
// versions in other languages (`versions`: { id, rev, lang, doc }), so the presentation can show a part in a
// second language under it. `lang` is the version's first language the song isn't in. Versions in only the
// song's own languages (a shorter English one) are left out. Gives back the languages' names by code.
// window.presentedVersionIds keeps which songs went along, so a change to one updates the presentation.
async function addPresentationVersions(songs) {
  const langsOf = doc => { const codes = songLangs(doc); return codes.length ? codes : [churchLang()]; };
  const names = {};
  const named = code => { names[code] = languageName(code).label; return code; };
  const ids = new Set();
  try {
    await versionGroupsRead();
    songs.forEach(song => {
      if (!song.doc || song.reading) return;
      groupsOfSong(song.id).forEach(group => Object.keys(group.songs).forEach(id => { if (id !== song.id) ids.add(id); }));
    });
  } catch (err) {
    console.warn("Couldn't read the version groups for the presentation:", err);
  }
  const docs = new Map();
  if (ids.size) {
    (await db.allDocs({ keys: [...ids], include_docs: true })).rows
      .forEach(row => { if (row.doc && !row.doc._deleted && row.doc._id.startsWith('s-')) docs.set(row.id, row.doc); });
  }
  window.presentedVersionIds = new Set(docs.keys());
  songs.forEach(song => {
    if (!song.doc || song.reading) return;
    const own = langsOf(song.doc).map(named);
    song.langs = own;
    const others = [...new Set(groupsOfSong(song.id).flatMap(group => Object.keys(group.songs)))]
      .filter(id => id !== song.id && docs.has(id)).map(id => docs.get(id));
    const versions = others.map(doc => {
      const lang = langsOf(doc).find(code => !own.includes(code));
      if (!lang) return null;
      const { title, authors, scripture_ref, key, copyright, content } = displaySong(doc); // what a slide shows
      return { id: doc._id, rev: doc._rev, lang: named(lang), doc: { title, authors, scripture_ref, key, copyright, content } };
    }).filter(Boolean).sort((a, b) => names[a.lang].localeCompare(names[b.lang]) || String(a.doc.title).localeCompare(String(b.doc.title)));
    if (versions.length) song.versions = versions;
  });
  return names;
}

// A reading in a songbook (#157), as its verses: { id, reading: true, passage }, or null if they can't load
async function readingItem(ref, translation) {
  try {
    const passage = await Bible.passage(String(ref ?? ''), translation);
    return passage.verses.length ? { id: 'reading:' + passage.label, reading: true, passage } : null;
  } catch (err) {
    console.error(`Couldn't load the reading "${ref}":`, err);
    return null;
  }
}

// A reading as a song, for the PDF (#157): the reference as its title, a verse to a line (its number first,
// poetry on more lines), the translation's credit as its copyright. null if its verses can't load.
async function readingSongDoc(ref, translation) {
  const item = await readingItem(ref, translation);
  if (!item) return null;
  const vs = item.passage.verses;
  const chapters = new Set(vs.map(v => v.book + v.chapter)).size > 1; // then each chapter's first verse says which
  // each verse its own part, so a long reading flows from page to page (and column to column) the way a song's
  // parts do, its title staying with the first verse; one part for the whole chapter was taller than a page
  const content = vs.map((v, i) => {
    const num = chapters && (i === 0 || v.chapter !== vs[i - 1].chapter) ? `${v.chapter}:${v.verse}` : v.verse;
    return [{ type: 'no label' }, v.text.split('\n').map(line => line.trim()).filter(Boolean).map((line, j) => (j ? '    ' : num + ' ') + line)];
  }).filter(([, lines]) => lines.length);
  return songShape({ _id: 'reading', title: item.passage.label, authors: [], scripture_ref: [],
    copyright: item.passage.translation.credit, content });
}

// The church's Bible translation for presentations (#157): its "settings" doc, which church admins set in the
// Admin panel. The Berean Standard Bible until one is picked.
async function churchBible() {
  try {
    return (await db.get('settings')).bible || 'BSB';
  } catch (err) {
    return 'BSB';
  }
}

// The Admin panel's Bible menu: the translations there are, the church's picked
async function loadChurchBible() {
  const select = document.getElementById('church_bible');
  try {
    await Bible.ready();
  } catch (err) {
    select.innerHTML = '<option>Connect once to load the Bible list</option>';
    select.disabled = true;
    return;
  }
  const picked = await churchBible();
  select.disabled = false;
  select.innerHTML = Bible.translations().map(t =>
    `<option value="${escapeHtml(t.id)}"${t.id === picked ? ' selected' : ''}>${escapeHtml(t.name)} (${escapeHtml(t.id)})</option>`).join('');
}

// A church admin picks it: kept in the church's "settings" doc, so every device uses it
async function setChurchBible(select) {
  try {
    await db.upsert('settings', doc => ({ ...doc, bible: select.value }));
    notyf.success('Presentations use the ' + select.selectedOptions[0].text + '.', 'var(--song-color)');
  } catch (err) {
    reportDbError(err, 'change the Bible for presentations');
    loadChurchBible();
  }
}

// The Admin panel's "Usual language of songs" (#90): what a song with no language picked counts as
async function loadChurchLangSetting() {
  const select = document.getElementById('church_lang');
  const picked = await loadChurchLang();
  select.innerHTML = [...knownLanguageCodes()].sort((a, b) => languageName(a).english.localeCompare(languageName(b).english))
    .map(code => `<option value="${code}"${code === picked ? ' selected' : ''}>${escapeHtml(languageName(code).label)}</option>`).join('');
}
async function setChurchLang(select) {
  try {
    await db.upsert('settings', doc => ({ ...doc, lang: select.value }));
    window.churchLanguage = select.value;
    notyf.success(`Songs with no language picked count as ${languageName(select.value).english}.`, 'var(--song-color)');
    renderSongFilter('book');
  } catch (err) {
    reportDbError(err, 'change the usual language of songs');
    loadChurchLangSetting();
  }
}

// A presentation that's open gets changes to its book or the book's songs right away (#147)
let presentationUpdates = 0;
async function updatePresentation(change) {
  const frame = window.presentationFrame;
  const book = window.presentedSongbook;
  try {
    if (!frame || frame.closed || !book || typeof frame.updateSongbook !== 'function') return;
  } catch (err) {
    return; // the presentation window is gone
  }
  const bookChanged = change.id === book._id;
  // a version group, or a song shown as another song's second language (#90), changes the slides too
  const versionChanged = change.id.startsWith('v-') || !!window.presentedVersionIds?.has(change.id);
  if (!bookChanged && !versionChanged && !book.songrefs.some(ref => ref.id === change.id)) return;
  if (bookChanged && change.deleted) return; // the main page already leaves a deleted book
  if (bookChanged) {
    window.presentedSongbook = { _id: book._id, title: change.doc.title, songrefs: change.doc.songrefs };
  }
  const mine = ++presentationUpdates;
  try {
    const data = JSON.stringify(await presentationData(window.presentedSongbook));
    if (mine !== presentationUpdates) return; // a newer change is on its way
    frame.updateSongbook(data);
  } catch (err) {
    console.error('Could not update the presentation:', err);
  }
}

function dbChanges() {
  window.changeHandler = db.changes({
    since: 'now',
    live: true,
    include_docs: true
  }).on('change', function (change) {
    if (change.id.startsWith('h-')) return; // a kept old version (#138): nothing to show
    if (change.id.startsWith('v-')) { // a version group (#90), added, changed or deleted
      versionGroupsChanged();
      versionGroupsRead().then(() => updatePresentation(change), () => {}); // (the read just started) its songs' second languages
      return;
    }
    updatePresentation(change);
    // A song or songbook was deleted or restored: keep an open Trash current (#138)
    if (/^(s|sb)-/.test(change.id) && document.querySelector('#trash:not(.closed)')) {
      loadTrash();
    }
    // Handle deleted documents
    // A deleted doc only has _id and _rev, so take it out of the lists instead of updating them
    if (change.deleted) {
      const id = change.doc._id;
      console.log('deleted: ' + id);
      const isOpen = id !== window.deletingId && location.hash.replace('#', '').split('&').some(part => part.split('?')[0] === id);
      if (id.startsWith('s-')) {
        loadRecentSongs();
        window.songbook_list?.remove('song-id', id);
        window.songbook_edit_togglesongs_list?.remove('song-id', id);
        if (isOpen) { // someone deleted the song we're looking at (or editing): show it deleted, with Restore (#69)
          window.songEditing = false;
          notyf.error('This song was deleted', 'red');
          const viewHash = '#' + formatSbID(window.songbook?._id || 'sb-allSongs') + '&' + id;
          if (location.hash !== viewHash) window.location.hash = viewHash; // leave the editor
          loadSong(id).catch(() => {}); // a failure is already reported
        }
      } else if (id.startsWith('sb-')) {
        window.songbooks_list?.remove('songbook-id', id);
        if (isOpen) {
          window.songbookEditing = false;
          window.songEditing = false;
          notyf.error('This songbook was deleted', 'red');
          window.location.hash = '#songbooks';
        }
      } else if (id.startsWith('cfg-') && id.includes(window.user._id)) {
        notyf.info('Format deleted', 'var(--export-color)');
      }
      return;
    }

    // Song changes
    if (change.doc._id.startsWith('s-')) {
      loadRecentSongs();
      
      // If currently viewing this song
      const isCurrentSong = window.song?._id === change.doc._id &&
                          document.body.classList.contains('song') &&
                          !location.hash.includes('&r-'); // not while a reading is open there instead (#157)
      
      if (isCurrentSong) {
        delete window.song;
        Promise.all([loadSong(change.doc._id)])
          .then(() => {
            updateAllLinks();
            highlightText();
          })
          .catch(() => {}); // a failure is already reported
        notyf.info('Song updated', 'var(--song-color)');
      } else {
        notyf.info(
          `Song "${escapeHtml(change.doc.title)}" updated by ${escapeHtml(window.users[change.doc.editedBy] || String(change.doc.editedBy || 'someone').replace(/^u-/, ''))}`,
          'var(--song-color)',
          `#${window.songbook._id}&${change.doc._id}`
        );
      }

      // Update song lists
      const songData = mapSongRowToValue(change);
      
      // Update songbook list if exists
      if (window.songbook_list) {
        window.songbook_list.get('song-id', change.doc._id)
          .forEach(song => {
            const newValues = {...songData, 'song-status': song.values()['song-status']};
            song.values(newValues);
          });
      }

      // Update edit toggle songs list if exists
      if (window.songbook_edit_togglesongs_list) {
        window.songbook_edit_togglesongs_list.get('song-id', change.doc._id)
          .forEach(song => song.values(songData));
        // not there: restored from the Trash (the delete took it out), or new
        if (!window.songbook_edit_togglesongs_list.get('song-id', change.doc._id).length) addToSongAdder(songData);
      }

      // Reload the open songbook: All Songs on any change, and another book when it holds this song but its
      // list doesn't show it (restored from the Trash, maybe on another device: the delete took it out).
      // Not while the book is being edited, which would throw the edits away.
      const holdsSong = window.songbook?.songrefs?.some(ref => ref.id === change.doc._id);
      const listShowsSong = window.songbook_list?.get('song-id', change.doc._id).length;
      if (window.songbook?._id === 'sb-allSongs' || (holdsSong && !listShowsSong && !window.songbookEditing)) {
        loadSongbook(window.songbook._id, true).catch(() => {}); // a failure is already reported
      } else if (songFilterOn('book') && !window.songbookEditing) {
        applySongFilter('book'); // the changed song may not match the filter now (#84)
      }
      if (window.songbook_edit_togglesongs_list && songFilterOn('adder')) applySongFilter('adder');
    }
    // Songbook changes
    else if (change.doc._id.startsWith('sb-')) {
      const isCurrentSongbook = window.songbook?._id === change.doc._id && 
                              (document.body.classList.contains('songList') || 
                               document.body.classList.contains('song'));

      if (isCurrentSongbook) {
        window.songbook = '';
        loadSongbook(change.doc._id).catch(() => {}); // a failure is already reported
        notyf.info('Songbook updated', 'var(--songList-color)');
      } else {
        notyf.info(
          `Songbook "${escapeHtml(change.doc.title)}" updated by ${escapeHtml(window.users[change.doc.editedBy] || String(change.doc.editedBy || 'someone').replace(/^u-/, ''))}`,
          'var(--songList-color)',
          `#${change.doc._id}`
        );
      }

      // Update songbooks list if exists
      if (window.songbooks_list) {
        const rows = window.songbooks_list.get('songbook-id', change.doc._id);
        if (!rows.length) { // restored from the Trash, or new, maybe on another device
          initializeSongbooksList();
        } else {
          rows.forEach(songbook => songbook.values(mapSongbookRowToValue(change)));
          window.songbooks_list.sort('user-fav', {order: 'desc', sortFunction: sortFavSongbooks});
        }
      }
    }
    // Comment changes
    else if (change.doc._id.startsWith('c_')) {
      // In the open book, with its comments showing: show the change, and say when someone else just commented
      const songId = window.songbook?._id && change.doc._id.startsWith(`c_${window.songbook._id}_`) ? songIdOfComment(change.doc) : null;
      const row = songId && document.querySelector(`#songbook_content .list li[data-song-id="${CSS.escape(songId)}"]`);
      if (row?.querySelector(':scope > .toggle_comment')) { // the book's comments are showing
        loadSongbookComments(songId);
        const c = Array.isArray(change.doc.comments) ? change.doc.comments.at(-1) : change.doc;
        const justWritten = c && !c.removed && !c.edited && !change.doc._deleted && Date.now() - (c.date || 0) < 10 * 60 * 1000;
        if (justWritten && c.user !== window.user._id) {
          const title = row.querySelector('a')?.textContent.trim() || 'a song';
          notyf.open({
            type: 'info',
            message: `${escapeHtml(personName(c.user))} commented on "${escapeHtml(title)}"`,
            background: 'var(--songList-color)',
            className: 'clickable-note',
          }).on('click', () => openComments(songId));
        }
      }
    }
    // User changes
    else if (change.doc._id.startsWith('u-')) {
      if (!window.users) window.users = {};
      window.users[change.doc._id] = change.doc.name;

      if (change.doc._id === window.user._id) {
        window.user = change.doc;
        updateUser();
        if (!ownUserRevs.saving && !ownUserRevs.has(change.doc._rev)) { // not a setting just saved here (lib.js saveUserSettings)
          notyf.info(`User Updated "${escapeHtml(change.doc.name)}"`, 'var(--edit-color)');
        }
        
        // Update favorites display
        const favSongbooks = change.doc.fav_sbs || [];
        
        // Update current songbook favorite status
        const songbookHeader = document.querySelector('#songbook_header .title');
        if (songbookHeader) {
          songbookHeader.dataset.userFav = favSongbooks.includes(window.songbook?._id);
        }
        
        // Update current song favorite status
        const currentSong = document.querySelector('#song .song-card');
        if (currentSong) {
          currentSong.dataset.userFav = window.user.fav_songs.includes(currentSong.dataset.id);
        }
        
        // Refresh lists if they exist
        if (window.songbooks_list) {
          // Set it on the List.js items, not the li elements: a search takes the hidden rows out of the page,
          // so reIndex dropped them from the list until a reload (issue #132)
          window.songbooks_list.items.forEach(item => {
            item.values({'user-fav': String(favSongbooks.includes(item.values()['songbook-id']))});
          });
          window.songbooks_list.sort('user-fav', {order: 'desc', sortFunction: sortFavSongbooks});
        }
        
        if (window.songbook?._id === 'sb-favoriteSongs') {
          window.songbook._id = '';
          loadSongbook('sb-favoriteSongs').catch(() => {}); // a failure is already reported
        }
      }
    }
    // Config changes
    else if (change.doc._id.startsWith('cfg-') && change.doc._id.includes(window.user._id)) {
      notyf.info(
        escapeHtml(change.doc.name || 'Default') + ' format ' + (change.deleted ? 'deleted' : 'saved'),
        'var(--export-color)'
      );
    }
    // Other changes
    else {
      console.log('changed:', change.doc._id);
    }
  }).on('error', function (err) {
    console.error('Error in db.changes:', err);
  });
}

async function destroyDb(dbName){
  new PouchDB(dbName).destroy().then(function() {
    console.log('Database deleted:', dbName);
    removeDbfromLocalStorage(dbName);
    location.reload(); // Reload immediately after successful deletion
  }).catch(function(err) {
    console.error('Error deleting database:', err); // Log the error for debugging
    reportDbError(err, `delete ${dbName} from this device`);
  });
}

async function dbLogin(type, dbName=false, username=false, pin=false, pwd=false, remote_url=false) {
  try {
    // Get form values
    const keepLoggedIn = document.getElementById('keep_logged_in').checked;
    // Use disk storage if "keep me logged in" is checked, or on auto-login
    // (a remote_url is only stored when the user chose to stay logged in)
    const usePersistentStorage = keepLoggedIn || remote_url !== false;
    dbName = dbName || document.getElementById('db_select').value;
    
    // Determine login type
    if (type === "login") {
      type += dbName.endsWith('(local)') ? '_local' : '_remote';
    }

    username = username || document.getElementById('username').value.trim();
    pin = pin || document.getElementById('pin').value.trim();
    pwd = pwd || document.getElementById('pwd').value.trim();

    // Get remote URL if needed
    if (!remote_url) {
      if (type === 'connect_remote') {
        remote_url = document.getElementById('remote_url').value;
      } else if (type === 'login_remote') {
        const selectedOption = document.getElementById('db_select').selectedOptions[0];
        remote_url = selectedOption?.dataset.url;
      }
    }

    // Handle different login types
    switch(type) {
      case "create_local":
        dbName = (dbName === 'create_local' 
          ? document.getElementById('newDbName').value.trim() + '(local)' 
          : dbName);
        
        db = new PouchDB(dbName);
        addDBtoLocalStorage(dbName, 'local');
        window.roles = { '_admin': true, 'editor': true };
        await takeNextStep(username, dbName);
        break;

      case "login_local":
        db = new PouchDB(dbName);
        try {
          const localUser = await db.get('_local/u-'+username);
          if (localUser.pin == pin) { // loose compare: old demo DBs stored the number 42
            window.roles = { '_admin': true, 'editor': true };
            await takeNextStep(username, dbName);
          } else {
            throw new Error('Invalid credentials');
          }
        } catch (err) {
          if (err.duringSetup) throw err; // the PIN was right; loading the data failed, and the outer catch says so
          console.error('Local login error:', err);
          showError('That username or PIN is wrong.');
          dbLogout();
          return false;
        }
        break;

      case "connect_remote":
        remote_url = parseUrl(remote_url, username, pwd);
        try {
          await loginRemoteDb(remote_url, username, pwd);
          addDBtoLocalStorage(dbName, 'remote', remote_url);

          db = new PouchDB(deviceCopyName(dbName, username), {
            adapter: usePersistentStorage ? undefined : 'memory'
          });
          await takeNextStep(username, dbName);
        } catch (error) {
          console.error('Remote connection error:', error);
          dbLogout();
          const message = error.name === 'no_access' ? error.message
            : error.duringSetup ? `Signed in, but couldn't finish setting up. Check your internet connection and try again.\n\n(Details: ${error.message})`
            : error.name === 'unauthorized' || error.name === 'forbidden'
            ? 'That username or password is wrong.'
            : 'Please check your sign-in details.';
          showError(message, { stay: !!error.duringSetup }); // the one with details stays to be read
          return false;
        }
        break;

      case "login_remote":
        db = new PouchDB(deviceCopyName(dbName, username), {
          adapter: usePersistentStorage ? undefined : 'memory'
        });

        if (navigator.onLine) {
          remote_url = parseUrl(remote_url, username, pwd);
          try {
            await loginRemoteDb(remote_url, username, pwd);
          } catch (err) {
            // "Online" doesn't mean the server answers (hotel wifi, the server down): use this device's copy
            if (!serverUnreachable(err)) throw err;
            console.warn("Can't reach the server, logging in from this device's copy:", err);
            await loginFromDevice(username, pwd);
            break;
          }
          await takeNextStep(username, dbName);
        } else {
          await loginFromDevice(username, pwd);
        }
        break;

      default:
        throw new Error('Invalid login type');
    }

    // Clear login inputs on success
    document.querySelectorAll('#login input').forEach(input => {
      input.value = '';
    });
    
    return true;
  } catch (error) {
    console.error('Login error:', error);
    dbLogout();
    
    if(error.duringSetup) {
      showError(`Signed in, but couldn't finish setting up. Check your internet connection and try again.\n\n(Details: ${error.message || error.name})`, { stay: true });
    } else if(error.name === 'unauthorized' || error.name === 'forbidden') {
      showError('That username or password is wrong.');
    } else {
      showError(`Couldn't sign in. Please try again.${error.message ? `\n\n(Details: ${error.message})` : ''}`, { stay: !!error.message });
    }
    
    return false;
  }

  // Logs in from the copy saved on this device, when the server can't be reached. Only a login made
  // with "Keep me logged in" saves that copy and the password to check against. reconnectSync starts
  // syncing once the server answers again.
  async function loginFromDevice(username, pwd) {
    remoteDb = null; // drop the half-made connection from a failed attempt, so nothing tries to use it
    let localUser = null;
    try {
      localUser = await db.get('_local/u-'+username);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    // No own copy yet (#139) but the device's old shared one has this person's record: use that this
    // time. Their own copy is made at the next sign-in with the server.
    if (!localUser && db.name !== dbName && db.adapter !== 'memory' && indexedDB.databases &&
        (await indexedDB.databases()).some(info => info.name === '_pouch_' + dbName)) { // (opening one would make it)
      try {
        const shared = new PouchDB(dbName);
        localUser = await shared.get('_local/u-'+username);
        db = shared;
      } catch (err) {
        if (err.status !== 404) throw err;
      }
    }
    if (!localUser?.pwd) {
      throw new Error("Can't reach the server, and this device has no saved copy to use offline. " +
        'To use yCanta offline, log in once while connected, with "Keep me logged in" checked.');
    }
    if (localUser.pwd !== pwd) {
      throw new Error('Wrong password (checked against the copy saved on this device).');
    }
    window.roles = localUser.roles;
    window.church = localUser.church; // what the church's lists said at the last online login
    notyf.info('Offline: using the songs saved on this device');
    await takeNextStep(username, dbName);
  }

  async function takeNextStep(username, dbName) {
    // Initialize window objects
    window.songbook = {};
    window.song = {};
    window.dbChoice = dbName; // the church as chosen ("canaan(remote)"); db.name is this person's copy of it (#139)

    const categories = {
      _id: 'categories',
      categories: ["----- Topics", "Adoration", "Aspiration/Desire", "Assurance", "Atonement", "Awe", "Bereavement", "Brokenness", "Calvary", "Celebration", "Christ as Bridegroom", "Christ as King", "Christ as Lamb", "Christ as Redeemer", "Christ as Savior", "Christ as Shepherd", "Christ as Son", "Christ's Blood", "Christ's Return", "Church as Christ's Body", "Church as Christ's Bride", "Church as God's House", "Cleansing", "Comfort", "Commitment", "Compassion", "Condemnation", "Consecration", "Conviction of Sin", "Courage", "Creation", "The Cross", "Dedication/Devotion", "Dependence on God", "Encouragement", "Endurance", "Eternal Life", "Evangelism", "Faith", "Faithfulness", "Fear", "Fear of God", "Fellowship", "Forgiveness", "Freedom", "God as Creator", "God as Father", "God as Friend", "God as Refuge", "God's Creation", "God's Faithfulness", "God's Glory", "God's Goodness", "God's Guidance", "God's Harvest", "God's Holiness", "God's Love", "God's Mercy", "God's Power", "God's Presence", "God's Strength", "God's Sufficiency", "God's Timelessness", "God's Victory", "God's Wisdom", "God's Word", "Godly Family", "Grace", "Gratefulness", "Healing", "Heaven", "Holiness", "Holy Spirit", "Hope", "Humility", "Hunger/Thirst for God", "Incarnation", "Invitation", "Jesus as Messiah", "Joy", "Kingdom of God", "Knowing Jesus", "Lordship of Christ", "Love for God", "Love for Jesus", "Love for Others", "Majesty", "Meditation", "Mercy", "Missions", "Mortality", "Neediness", "New Birth", "Obedience", "Oneness in Christ", "Overcoming Sin", "Patience", "Peace", "Persecution", "Praise", "Prayer", "Proclamation", "Provision", "Purity", "Purpose", "Quietness", "Redemption", "Refreshing", "Repentance", "Rest", "Resurrection", "Revival", "Righteousness", "Salvation", "Sanctification", "Security", "Seeking God", "Service", "Servanthood", "Sorrow", "Spiritual Warfare", "Submission to God", "Suffering for Christ", "Surrender", "Temptation", "Trials", "Trust", "Victorious Living", "Waiting on God", "Worship", "----- Seasons", "Christmas", "Easter", "Good Friday", "Palm Sunday", "Thanksgiving", "----- Occasions", "Baptism", "Birth", "Closing Worship", "Communion", "Death", "Engagement", "Opening Worship", "Table Songs", "Wedding", "----- Song types", "Children's Songs", "Rounds", "Scripture Reading", "Scripture Songs", "----- Work to do", "Needs Work", "Needs Chord Work", "Needs Categorical Work", "Duplicate", "----- Other", "Secular", "Spanish words"]
    };

    // Setup user document
    const user = {
      _id: 'u-'+username,
      name: username,
      fav_sbs: [],
      fav_songs: []
    };

    try {
      // Put user and categories documents
      if(remoteDb) {
        await remoteDb.putIfNotExists(user);
        try {
          await remoteDb.putIfNotExists(categories);
        } catch (err) {
          // only editors may create the category list; a viewer can still log in to a church without one
          if (err.status !== 403) throw err;
        }
        window.user = await remoteDb.get('u-'+username);
        window.info = await remoteDb.info();
        window.church = await loadChurchAccess(username);
      } else {
        await db.putIfNotExists(user);
        await db.putIfNotExists(categories);
        window.user = await db.get('u-'+username);
        // a local database is all yours; an offline remote login keeps what the lists said last time
        if (dbName.endsWith('(local)') || !window.church) {
          window.church = churchAccessFrom({}, window.roles, username, dbName.replace(/\(.+?\)/, ''));
        }
      }

      // Set user preferences
      const userId = window.user._id;
      const fontSize = localStorage.getItem(userId+'fontSize') || 16;
      const darkMode = localStorage.getItem(userId+'darkMode') || 'auto';
      // Analytics on or off is the person's choice, on their user record so it follows them to every device.
      // A record without it yet takes this device's old setting, if it had one.
      const deviceAnalytics = localStorage.getItem(userId+'analytics');
      if (typeof window.user.analytics !== 'boolean' && (deviceAnalytics === 'true' || deviceAnalytics === 'false')) {
        saveUserSettings({ analytics: deviceAnalytics === 'true' }); // not awaited: sign-in doesn't wait on it
      }

      document.getElementById(darkMode+'Radio').checked = true;
      handleDarkMode();
      document.documentElement.style.fontSize = fontSize + 'px';
      document.getElementById('fontSize').value = fontSize;
      document.getElementById('fontSizeOutput').textContent = fontSize + 'px';
      document.getElementById('analytics').checked = window.user.analytics !== false;

      document.body.classList.remove('loading');

      // Store login status
      localStorage.setItem('defaultdbName', dbName);
      const userData = {
        dbName,
        username,
        roles: window.roles,
        church: window.church
      };

      const keepLoggedIn = document.getElementById('keep_logged_in').checked;

      if (dbName.endsWith("(local)")) {
        userData.pin = pin; // the input box is empty on auto-login and demo login
      } else if (keepLoggedIn && dbName.endsWith("(remote)")) {
        userData.pwd = pwd; // trimmed, so offline login matches
        userData.remote_url = remote_url;
      }

      if(!localStorage.getItem('loggedin')){
        localStorage.setItem('loggedin', JSON.stringify(userData));
      }

      // Update local user document
      await db.upsert('_local/u-'+username, (doc) => {
        Object.keys(userData).forEach(key => {
          if(key !== 'username' && key !== 'dbName') {
            doc[key] = userData[key];
          }
        });
        return doc;
      });

      // A first download into an empty device copy (without "Keep me logged in"): wait for it before
      // opening the page the link points to, or a song linked to is "not found". A device that already
      // has the songs opens right away and catches up while it's in use.
      const willDownload = !!(remoteDb && navigator.onLine && dbName.endsWith('(remote)'));
      let firstDownload = false;
      if (willDownload) {
        try {
          firstDownload = (await db.info()).doc_count === 0;
          // an empty own copy (#139) starts from the device's old shared copy, when there is one
          if (firstDownload && await copyFromSharedCopy(dbName, username).catch(err => {
            console.warn("Could not start from this device's shared copy; downloading instead:", err);
            return 0;
          })) firstDownload = false;
        } catch (err) {
          console.warn('Could not count the songs on this device:', err);
        }
      }
      setLoginState({ route: !firstDownload });

      // Setup sync for remote databases
      if(willDownload) { // no remoteDb: logged in from this device's copy
        console.log('doing a onetime sync...');
        const status = downloadStatus({ first: firstDownload, tip: firstDownload && !keepLoggedIn });
        let downloaded = true;
        // the lists are empty while a first download runs: their "nothing here yet" notes wait (style.css)
        document.documentElement.classList.toggle('first-download', firstDownload);
        try {
          await db.sync(remoteDb, SYNC_OPTIONS).on('denied', reportDenied).on('change', status.update);
        } catch (error) {
          // Not fatal: the app goes on with the copy on this device, and the live sync below keeps trying
          downloaded = false;
          reportDbError(error, 'download the latest songs');
        }
        document.documentElement.classList.remove('first-download');
        status.finish(downloaded);
        console.log('sync complete');
        await setUpSyncHandler();
        setLoginState();
      }

      // Setup db changes listener
      dbChanges();
      window.dbName = dbName.replace(/\(.+?\)/,'');

      // Clear login inputs
      document.querySelectorAll('#login input').forEach(input => {
        input.value = '';
      });

      // Role classes show the edit controls, so set them before analytics can fail
      document.documentElement.classList.add(...Object.keys(window.roles));
      showChurchLevel();

      // Analytics: a failure here must never break login
      try {
        // The notice is for new people only: a device with an id already showed the old one (it showed once
        // per device), so that person counts as having seen it
        if (localStorage.getItem('analyticID')) {
          if (!window.user.analyticsNoticed) saveUserSettings({ analyticsNoticed: Date.now() });
        } else {
          localStorage.setItem('analyticID', newAnalyticsId()); // this device's id in the Sessions tab
          showAnalyticsNotice(); // once for each person, on whichever device they use first
        }

        // One row in the Sessions tab per visit
        setSessionInfo({
          user: window.user._id,
          db: dbName,
          platform: getOS(),
          screen: getScreenSize(),
          touch: isTouchCapable(),
          installed: isInstalled(),
          online: navigator.onLine,
          darkMode: localStorage.getItem(window.user._id+'darkMode') || 'def',
          fontSize: localStorage.getItem(window.user._id+'fontSize') || 'def'
        });

        if(window.loadData) {
          setSessionInfo({ loadMs: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart });
          delete window.loadData;
        }
        updateAnalyticsLocation(); // not awaited, so login doesn't wait on a third-party lookup
        submitLogData(); // send the visit now; the rest goes when the page is hidden
      } catch (error) {
        console.error('Analytics error during login:', error);
      }

      return true;
    } catch (error) {
      // Throw, so dbLogin logs out and shows it (it used to return false, which nothing checked: login hung)
      console.error('Error in takeNextStep:', error);
      error.duringSetup = true;
      throw error;
    }
  }
}
// Up: everything, kept old versions included. Down: everything but kept old versions (h- docs), which
// only the history view reads, from the server, when it's opened (#138). The server does the filtering.
// A device keeps its own copies after sending them: deleting them here would delete them on the server.
const SYNC_OPTIONS = { pull: { selector: { _id: { $not: { $regex: '^h-' } } } } };

// The card that shows a sign-in's download from the server. A first download (nothing on this device yet,
// and the page waits for it) gets a card in the middle of the screen; catching up (the songs are already
// here) a slim card at the bottom, and only if it takes more than a second.
//
// Progress counts rows of the server's change list: one per doc, deleted ones too, and each batch says
// how many are left ("pending"). (It used to divide the change number by the server's latest one, but that
// number counts every edit ever made: docs saved again in bulk all sit near the end, so the first batch
// already showed about 70%.)
function downloadStatus({ first, tip }) {
  const started = Date.now();
  let total = first ? (window.info?.doc_count || 0) + (window.info?.doc_del_count || 0) : 0;
  let card = null;
  const show = () => {
    card = document.createElement('div');
    card.id = 'download_status';
    card.className = first ? 'first' : 'catching-up';
    card.innerHTML = `<div class="download-card" role="status">
        <h4>${first ? 'Getting your songs' : 'Updating songs'}</h4>
        <div class="download-track"><div class="download-fill"></div></div>
        <div class="download-meta"><span class="download-count"></span><span class="download-percent">0%</span></div>
        ${tip ? '<p class="download-tip">Tip: tick "Keep me logged in" and this device keeps its songs, so next time you can skip this.</p>' : ''}
      </div>`;
    document.body.append(card);
    requestAnimationFrame(() => card.classList.add('open'));
  };
  const draw = (done, percent) => {
    card.querySelector('.download-fill').style.width = `${percent}%`;
    card.querySelector('.download-percent').textContent = `${percent}%`;
    if (first && total) card.querySelector('.download-count').textContent = `${Math.min(done, total).toLocaleString()} of ${total.toLocaleString()}`;
  };
  if (first) show();
  return {
    update(change) {
      if (change.direction !== 'pull') return; // this device sending its own changes up
      const left = typeof change.change.pending === 'number' ? change.change.pending : null; // missing on old servers
      if (!total) total = (left || 0) + (change.change.docs_read || 0);
      if (!card) {
        if (Date.now() - started < 1000) return; // a quick catch-up shows nothing
        show();
      }
      const done = left === null ? change.change.docs_read : total - left;
      draw(done, total ? Math.max(0, Math.min(99, Math.floor(done / total * 100))) : 0); // 100 is when it's finished
    },
    finish(done = true) {
      if (!card) return;
      if (done) draw(total, 100); // a failed download just closes, with its error showing
      setTimeout(() => {
        card.classList.remove('open');
        setTimeout(() => card.remove(), 400);
      }, 400);
    },
  };
}
function setUpSyncHandler() {
  try {
    syncHandler = db.sync(remoteDb, {
      ...SYNC_OPTIONS,
      live: true,
      retry: true
    }).on('denied', reportDenied).on('change', function (change) {
      console.log('Synced some stuff:', change.direction, change.change.docs_written, 'docs');
      // yo, something changed!
    }).on('paused', function (info) {
      // replication was paused, usually because of a lost connection
    }).on('active', function (info) {
      // replication was resumed
    }).on('complete', function (err) {
      //replication canceled
      console.log('complete');
    }).on('error', function (err) {
      // Sync gave up. Lost connections don't come here (retry: true waits and tries again).
      if (err.name == 'unauthorized' || err.name == 'forbidden') {
        showError('Your sign-in has run out. Please sign in again.', { stay: true });
        dbLogout();
      } else {
        syncHandler = null; // so reconnectSync can start it again
        // Stays on screen (#137): changes made now stay on this device until sync is back
        reportDbError(err, 'keep syncing with the server', {
          stay: true,
          more: 'Your changes stay on this device until it syncs again.',
          onClick: () => {
            if (remoteDb && !syncHandler) setUpSyncHandler();
            else reconnectSync();
          },
        });
      }
    });
    // Quiet on a normal start (the green line along the bottom says you're online, #159). After a note said
    // syncing had stopped, that note goes and a short one says it's back.
    if (clearStickyError('keep syncing with the server')) notyf.info('Syncing with the server again');
  }
  catch(err) {
    reportDbError(err, 'start syncing with the server');
    dbLogout();
  }
}

// True for a failure to reach the server at all, as opposed to the server saying no
function serverUnreachable(err) {
  return err?.status === 0 || err?.name === 'unknown_error' || err instanceof TypeError ||
    err?.status >= 500 || /failed to fetch|networkerror|load failed/i.test(err?.message || '');
}

// A login from this device's copy (offline, or the server didn't answer) starts without sync.
// Connect and start syncing when the browser comes back online, and every minute meanwhile,
// so edits made offline reach the server without a reload.
let reconnecting = false;
async function reconnectSync() {
  if (reconnecting || syncHandler || !window.loggedin || !navigator.onLine || !db?.name?.endsWith('(remote)')) return;
  reconnecting = true;
  try {
    const username = ownName();
    const localUser = await db.get('_local/u-'+username);
    if (!localUser.pwd || !localUser.remote_url) return; // no saved login to reconnect with
    await loginRemoteDb(localUser.remote_url, username, localUser.pwd);
    window.info = await remoteDb.info();
    // the church's lists may have changed while this device was offline
    window.church = await loadChurchAccess(username);
    showChurchLevel();
    await db.upsert('_local/u-' + username, doc => ({ ...doc, church: window.church }));
    setUpSyncHandler(); // clears the note that said syncing stopped
  } catch (err) {
    remoteDb = null;
    console.warn('Still no connection to the server; trying again in a minute:', err?.message || err);
  } finally {
    reconnecting = false;
  }
}
window.addEventListener('online', reconnectSync);
setInterval(reconnectSync, 60 * 1000);
async function dbLogout() {
  if (!confirmWhenEditing()) {
    try {
      // Stop sync first: closing the database under a live sync makes it report an error
      syncHandler?.cancel();
      syncHandler = null;
      await db.close();
      console.log("Closed local database");
      if (remoteDb) { // Check if remoteDb is initialized
        await remoteDb.close();
        console.log("Closed remote database");
        remoteDb = null; // Explicitly set to null
        syncHandler = null; // Explicitly set to null
      }
    } catch (err) {
      console.error("Error closing databases:", err); 
    }
    remoteDb = null; // even if closing failed, so the next login doesn't reuse this connection
    syncHandler = null;
    forgetRecoveryEmail(); // the next person on this device doesn't see it
    setLogoutState();
  }
}

function loadUsersObject() {
  // Ensure window.users exists
  window.users = window.users || {};
  
  return db.allDocs({
    include_docs: true,
    startkey: 'u-',
    endkey: 'u-\ufff0',
  }).then(function(result){
    result.rows.forEach(row => {
      if (row.doc) {
        window.users[row.doc._id] = row.doc.name;
      }
    });
    return window.users;
  }).catch(function(err){
    console.error("Error loading users:", err);
    return window.users; // Return existing users even if error occurs
  });
}

function loadRecentSongs(days = 1000, number = 15) {
  db.changes({
    include_docs: true,
    startkey: 's-',
    endkey: 's-\ufff0',
    since: 0,
    filter: function(doc) {
      // A deleted song keeps its title and edit date now (#138), so leave it out by name
      if (doc._deleted || !doc._id.startsWith('s-')) return false; // and kept old versions (h-s-...)
      return (doc.edited > (new Date().getTime() - days * 24 * 60 * 60 * 1000)) * !doc._id.includes('sb');
    }
  }).then(function(result) {
    // Sort by edit date (newest first)
    result.results.sort((a, b) => {
      if (!a.doc || !b.doc) return 0;
      return b.doc.edited - a.doc.edited;
    });

    // Get top N songs
    const recentSongs = result.results.slice(0, number);
    const listElement = document.querySelector('.updatedSongs .list');
    
    // Clear existing content
    listElement.innerHTML = '';

    // Build HTML for each song
    let lastDateHour = '';
    recentSongs.forEach(song => {
      if (!song.doc) return;
      
      const date = new Date(song.doc.edited);
      const dateHour = date.toLocaleTimeString(undefined, { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit'
      });

      // Add date header if changed
      if (dateHour !== lastDateHour) {
        const dateHeader = document.createElement('div');
        dateHeader.style.marginTop = '1rem';
        dateHeader.style.fontWeight = 'bold';
        dateHeader.textContent = dateHour;
        listElement.appendChild(dateHeader);
        lastDateHour = dateHour;
      }

      // Create song list item
      const listItem = document.createElement('li');
      const link = document.createElement('a');
      link.className = 'link';
      link.href = `#sb-allSongs&${song.doc._id}`;
      link.textContent = song.doc.title;
      
      listItem.appendChild(link);
      listElement.appendChild(listItem);
    });
  }).catch(function(err) {
    console.error('Error loading recent songs:', err);
  });
}

function initializeSongbooksList(){
  db.allDocs({
    include_docs: true,
    startkey: 'sb-',
    endkey: 'sb-\ufff0',
  }).then(function(result){
    //first delete all songbooks in list
    if(window.songbooks_list != undefined){
      window.songbooks_list.clear();
    }
    //then add and update the new ones
    function buildSongbooksList(songbooks) {
      let user_sb_favs = window.user.fav_sbs;
      var options = {    
        valueNames: [
          { data: ['songbook-id'] },
          { data: ['songbook-rev'] },
          { data: ['songbook-title'] },
          { data: ['user-fav'] },
          //{ data: ['songbook-authors'] },
          //{ data: ['songbook-categories'] },
          //{ data: ['songbooks-songs'] },
          //{ data: ['songbook-copyright'] },
          { name: 'link', attr: 'href'},
          'name'
        ],
        item: 'songbook-item-template'
      };
      var values = [{'songbook-id': 'sb-allSongs',
                     'songbook-rev': 'n/a',
                     'songbook-title': 't:All Songs',
                     'user-fav': 'false',
                     'link': '#sb-allSongs',
                     'name': 'All Songs'},
                    {'songbook-id': 'sb-favoriteSongs',
                     'songbook-rev': 'n/a',
                     'songbook-title': 't:Favorite Songs',
                     'user-fav': 'false',
                     'link': '#sb-favoriteSongs',
                     'name': 'Favorite Songs'}];
      songbooks.forEach(function(row) { try { // one bad songbook record is left out, not the whole list
        if(window.songbooks_list != undefined){
          var songbookIdInList = window.songbooks_list.get('songbook-id',row.doc._id);
          if(songbookIdInList.length > 0){
            // we need to update if the revision is different.
            var songbookRevInList = window.songbooks_list.get('songbook-rev', row.doc._rev);
            if(songbookRevInList < 1){
              let sb_vals = mapSongbookRowToValue(row);
              sb_vals['user-fav'] = (user_sb_favs.indexOf(row.doc._id) == -1 ? 'false' : 'true');
              songbookIdInList[0].values(sb_vals);
            }
            return
          }
        }
        let sb_vals = mapSongbookRowToValue(row);
        sb_vals['user-fav'] = (user_sb_favs.indexOf(row.doc._id) == -1 ? 'false' : 'true');
        values.push(sb_vals);
      } catch (err) {
        console.warn('Left a songbook out of the list (it has missing or odd fields):', row?.id, err);
      } });
      //Creates list.min.js list for viewing all the songbooks
      // index.html renamed it from "songbooks"; accept both for the one load where the browser has an old copy cached
      const containerId = document.getElementById('songbooks_container') ? 'songbooks_container' : 'songbooks';
      // One list, emptied and refilled: a new List each time added search listeners that never went away
      if (window.songbooks_list) {
        window.songbooks_list.clear(); // again: an overlapping rebuild may have filled it since
        window.songbooks_list.add(values);
      } else {
        window.songbooks_list = new List(containerId, options, values);
        bindSearchToList(window.songbooks_list, '#' + containerId);
      }
      window.songbooks_list.sort('user-fav', {order: 'desc', sortFunction: sortFavSongbooks});
      document.querySelector('#' + containerId + ' .search')?.dispatchEvent(new KeyboardEvent('keyup')); // the search box's words, on the new list
      return
    }
    buildSongbooksList(result.rows);
  }).catch(function(err){
    reportDbError(err, 'load the songbooks');
  });
}

// ---- Church access and people ----
// Each church database lists its own people in its security settings: "admins" (church admins),
// "members" (everyone who may open it) and "editors" (members who may change anyone's songs). The
// server enforces the same lists on every save with _design/auth (database/validate.js); canEdit()
// mirrors it for the buttons. (The older "<db>-viewer"/"-editor"/"-admin" account tags no longer count, #144.)

// the yCanta Accounts web app (accounts-backend/), deployed from info.ycanta@gmail.com
window.accountsURL = 'https://script.google.com/macros/s/AKfycbzQvNIHM0lvuhT-yXVEjSKHvO9nHGMmithevWRmNgiFlZhFj-8T7MDY4DxuP3M7vDai9A/exec';

// What this person may do in this church, from its security lists (and whether they're a server admin)
function churchAccessFrom(sec, roles, name, dbId) {
  roles = roles || {};
  const inGroup = group => !!group && ((group.names || []).includes(name) || (group.roles || []).some(role => roles[role]));
  const serverAdmin = !!roles._admin;
  const admin = serverAdmin || inGroup(sec.admins);
  const editor = admin || inGroup(sec.editors);
  return { db: dbId, serverAdmin, admin, editor };
}

// The churchAdmin and churchEditor classes show the Admin panel and the editor-only buttons
function showChurchLevel() {
  document.documentElement.classList.toggle('churchAdmin', !!window.church?.admin);
  document.documentElement.classList.toggle('churchEditor', !!window.church?.editor);
}

async function loadChurchAccess(username) {
  const dbId = window.info?.db_name || window.dbName;
  try {
    return churchAccessFrom(await getChurchSecurity(), window.roles, username, dbId);
  } catch (err) {
    // Keep what the lists said at the last good sign-in on this device, rather than quietly taking
    // someone's level away (and saving that) because one request failed
    console.warn("Could not read the church's people list; using this device's last copy:", err);
    try {
      const saved = (await db.get('_local/u-' + username)).church;
      if (saved?.db === dbId) return saved;
    } catch (e) {
      // no saved copy
    }
    return churchAccessFrom({}, window.roles, username, dbId);
  }
}

async function getChurchSecurity() {
  // never a cached copy: saving a stale list would drop whoever was added since (the "b2" bug)
  const res = await remoteDb.fetch('_security', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not read the church's people list (${res.status})`);
  return res.json();
}

// Change people's levels: read the list fresh, change it, save it right away, then read it back to
// make sure the change is really there. changes: [[name, 'admin'|'editor'|'viewer'|'none'], ...]
async function updateChurchPeople(changes) {
  const sec = await getChurchSecurity();
  for (const [name, level] of changes) setPersonLevel(sec, name, level);
  await putChurchSecurity(sec);
  const saved = churchPeople(await getChurchSecurity());
  const missed = changes.filter(([name, level]) => (saved.get(name) || 'none') !== level).map(([name]) => name);
  if (missed.length) throw new Error(`The people list didn't save for ${missed.join(', ')}. Please try again.`);
}

async function putChurchSecurity(sec) {
  // CouchDB opens a database to everyone when its member list is empty, so always keep a role there
  sec.members = sec.members || { names: [], roles: [] };
  sec.members.roles = Array.from(new Set([...(sec.members.roles || []), '_admin']));
  const res = await remoteDb.fetch('_security', {
    method: 'PUT',
    headers: new Headers({ 'Content-Type': 'application/json' }), // PouchDB 7.0 calls headers.set()
    body: JSON.stringify(sec),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.reason || `Could not save the church's people list (${res.status})`);
  }
}

// The CouchDB server admins' names (only server admins can read them). null if they can't be read.
async function getServerAdminNames() {
  try {
    const res = await serverAdminFetch('_node/_local/_config/admins');
    return res.ok ? Object.keys(await res.json()) : null;
  } catch (err) {
    console.warn('Could not read the server admins:', err);
    return null;
  }
}

// name -> 'admin' | 'editor' | 'viewer', from the lists (not from account tags)
function churchPeople(sec) {
  const people = new Map();
  (sec.members?.names || []).forEach(name => people.set(name, 'viewer'));
  (sec.editors?.names || []).forEach(name => people.set(name, 'editor'));
  (sec.admins?.names || []).forEach(name => people.set(name, 'admin'));
  return people;
}

function setPersonLevel(sec, name, level) {
  sec.admins = { names: [], roles: [], ...sec.admins };
  sec.members = { names: [], roles: [], ...sec.members };
  sec.editors = { names: [], ...sec.editors };
  for (const group of [sec.admins, sec.members, sec.editors]) {
    group.names = (group.names || []).filter(n => n !== name);
  }
  if (level === 'admin') sec.admins.names.push(name);
  if (level === 'editor') sec.editors.names.push(name);
  if (level === 'editor' || level === 'viewer') sec.members.names.push(name);
  return sec;
}

const levelLabels = { viewer: 'User', editor: 'Editor', admin: 'Church admin' };

// The Admin panel: this church's people
async function loadAllUsers() {
  const box = document.getElementById('all_users');
  if (!remoteDb) {
    box.innerHTML = '<p>This database is only on this device, so there are no people to manage.</p>';
    return;
  }
  if (!navigator.onLine) {
    box.innerHTML = '<p>Managing people needs a connection to the server.</p>';
    return;
  }
  let sec;
  try {
    sec = await getChurchSecurity();
  } catch (err) {
    box.textContent = err.message;
    return;
  }
  const me = ownName();
  // Church admins first, then editors, then users; A-Z within each (ignoring upper/lower case)
  const levelOrder = { admin: 0, editor: 1, viewer: 2 };
  const people = [...churchPeople(sec)].sort((a, b) =>
    levelOrder[a[1]] - levelOrder[b[1]] || a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }));
  // Server admins may reset a church admin's password too, unless that person is also a server admin
  // (their sign-in lives in the server's settings, so resetting their account wouldn't change it)
  const serverAdmins = window.church.serverAdmin ? await getServerAdminNames() : null;
  const canReset = (name, level) => name !== me && (level !== 'admin' || (serverAdmins && !serverAdmins.includes(name)));

  let html = `<div class="people-header"><b>Users in this church</b><button class="btn btn-small" onclick="addChurchPerson()">+ Add</button></div>`;
  if (people.length > 5) {
    html += `<input type="search" class="people-search" placeholder="Search users" aria-label="Search users" value="${escapeHtml(peopleSearch)}" oninput="filterChurchPeople(this.value)">`;
  }
  html += '<ul class="people-list">' + people.map(([name, level]) => {
    const self = name === me;
    const options = Object.entries(levelLabels)
      .map(([value, label]) => `<option value="${value}"${value === level ? ' selected' : ''}>${label}</option>`).join('');
    // Fixed columns (name, password, level, remove), with an empty spot where a button doesn't apply,
    // so the level menus line up in every row
    return `<li data-name="${escapeHtml(name)}">
      <span class="person-name">${escapeHtml(name)}${self ? ' (you)' : ''}</span>
      ${canReset(name, level) ? `<button onclick="resetChurchPassword(this)" title="Set a new password for ${escapeHtml(name)}">${icon('reset')} Reset password</button>` : '<span></span>'}
      <select aria-label="Level for ${escapeHtml(name)}" onchange="setChurchPersonLevel(this)"${self && !window.church.serverAdmin ? ' disabled title="Ask another church admin to change your own level"' : ''}>${options}</select>
      ${self ? '<span></span>' : '<button onclick="removeChurchPerson(this)">' + icon('trash') + ' Remove</button>'}
    </li>`;
  }).join('') + '</ul>';
  if (!people.length) html += '<p>Nobody is on the list yet.</p>';
  else html += '<p class="people-none" hidden>No one matches that search.</p>';
  html +='<p class="backup-tools"><button class="btn btn-small" onclick="restoreFromBackup()">' + icon('undo') + ' Restore from a backup</button></p>';
  if (window.church.serverAdmin) {
    const rules = await saveRulesStatus();
    const rulesLine = {
      latest: 'Save rules: up to date.',
      outdated: 'Save rules: an update is available.',
      missing: 'Save rules: not installed. The server lets members change anything.',
      unknown: "Save rules: couldn't check.",
    }[rules.state];
    const rulesButton = rules.state === 'latest' ? '' :
      `<button class="btn btn-small" onclick="installSaveRules()">${rules.state === 'outdated' ? 'Update' : 'Install'} the save rules</button>`;
    html += `<div class="server-tools"><b>Server admin tools</b>
      <p>${rulesLine} ${rulesButton}</p></div>`;
  }
  box.innerHTML = html;
  filterChurchPeople(people.length > 5 ? peopleSearch : '');
}

// The Admin list's search box: show only names containing what's typed (any case). Kept while the
// list redraws after a change.
let peopleSearch = '';
function filterChurchPeople(text) {
  peopleSearch = text;
  const words = text.toLowerCase().trim();
  let shown = 0;
  document.querySelectorAll('#all_users .people-list li').forEach(li => {
    const match = !words || li.dataset.name.toLowerCase().includes(words);
    li.hidden = !match;
    if (match) shown++;
  });
  const none = document.querySelector('#all_users .people-none');
  if (none) none.hidden = shown > 0 || !words;
}

// ---- The account helper ----

// Church admins who aren't server admins go through the account helper, which checks they are a
// church admin before it creates an account or resets a password.
async function postToHelper(body) {
  if (!window.accountsURL) {
    throw new Error("Making accounts this way isn't set up on this site yet. A server admin can add the person.");
  }
  // a plain-text body keeps this a "simple" request, which Apps Script web apps accept from any page
  let reply;
  try {
    const res = await fetch(window.accountsURL, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    reply = await res.json();
  } catch (err) {
    throw new Error(err?.name === 'TimeoutError'
      ? "The account helper didn't answer. Please try again in a minute."
      : "Couldn't reach the account helper. Check your connection and try again.");
  }
  if (!reply.ok) throw new Error(reply.error || 'The account helper refused');
  return reply;
}

// The name this person signed in with ("u-carl hempel" -> "carl hempel")
function ownName() {
  return window.user._id.slice(2);
}

// The password this person signed in with (kept in memory only, see loginRemoteDb)
function ownPassword() {
  if (!sessionPwd) throw new Error('Please sign out and sign in again first.');
  return sessionPwd;
}

// Server admins: read something outside this church's database, such as the accounts. path starts at
// the server root ('_users/...'). Sends this person's own sign-in, not the one inside the database URL.
function serverAdminFetch(path) {
  const url = new URL(remoteDb.getUsersDatabaseUrl().replace(/_users\/?$/, path));
  url.username = '';
  url.password = '';
  return fetch(url.href, {
    cache: 'no-store',
    headers: { Authorization: getBasicAuthHeader(ownName(), ownPassword()) },
  });
}

async function callAccountsHelper(body) {
  return postToHelper({ ...body, db: window.church.db, adminName: ownName(), adminPassword: ownPassword() });
}

// Your own account (CouchDB 3 doesn't let regular users read or change their own account record)
async function callOwnAccount(body) {
  return postToHelper({ ...body, name: ownName(), ownPassword: ownPassword() });
}

// The "new password" and "again" fields every password step uses
function newPasswordFields(label = 'New password') {
  return [
    { name: 'password', label, type: 'password', autocomplete: 'new-password', minlength: 6, help: 'At least 6 characters.' },
    { name: 'password2', label: 'Type it again', type: 'password', autocomplete: 'new-password', match: 'password' },
  ];
}

function checkSignInName(name) {
  if (!name || name.startsWith('_') || name.includes(':') || name.length > 64) {
    throw new Error('Please use a different name. It can\'t start with "_" or contain ":".');
  }
}

// ---- Recovery email (profile) and "Forgot password?" (login page) ----

// The profile is drawn more than once at sign-in, so ask the helper once per person per session and
// reuse the answer (or the request still on its way). Changing or removing the email asks again.
let recoveryEmailLookup = null;

// The last answer is kept on this device (until sign out), so the card shows it at once and the helper, which
// can take a while to wake, only checks it. CouchDB 3 doesn't let a person read their own account record,
// where the email is, so the helper is the only way to ask.
const recoveryEmailKey = userId => 'recoveryEmail.' + userId;
function keptRecoveryEmail(userId) {
  try { return localStorage.getItem(recoveryEmailKey(userId)); } catch { return null; } // null: never asked here
}
function keepRecoveryEmail(userId, email) {
  try { localStorage.setItem(recoveryEmailKey(userId), email || ''); } catch {}
}
function forgetRecoveryEmail() {
  try { if (window.user?._id) localStorage.removeItem(recoveryEmailKey(window.user._id)); } catch {}
  recoveryEmailLookup = null;
}

// The address with its pencil and trash, or a way to add one
function recoveryEmailHtml(email) {
  return email
    // the pencil and trash beside the address change or remove just the address
    ? `<p>${escapeHtml(email)}<span class="nowrap"><button type="button" class="inline-icon" onclick="setRecoveryEmail()" aria-label="Change your recovery email" title="Change your recovery email">${icon('edit')}</button>`
      + `<button type="button" class="inline-icon" onclick="clearRecoveryEmail()" aria-label="Remove your recovery email" title="Remove your recovery email">${icon('trash')}</button></span>`
      + `<br><small>Used only to reset your password if you forget it.</small></p>`
    : `<p>None yet. Add one so you can reset your password if you forget it.</p><button class="btn" onclick="setRecoveryEmail()">Add email</button>`;
}

async function loadRecoveryEmail({ fresh = false } = {}) {
  const box = document.getElementById('recovery_email');
  if (!box) return;
  if (!window.accountsURL) {
    box.innerHTML = '<p>Password recovery by email isn\'t turned on yet.</p>';
    return;
  }
  const userId = window.user._id;
  const kept = keptRecoveryEmail(userId); // fresh still shows it: a change or a remove keeps its result first
  if (kept !== null) box.innerHTML = recoveryEmailHtml(kept); // at once; the helper's answer replaces it if it changed
  if (fresh || recoveryEmailLookup?.userId !== userId) {
    if (!navigator.onLine) {
      if (kept === null) box.innerHTML = '<p>Connect to the internet to see or change it.</p>';
      return;
    }
    recoveryEmailLookup = { userId, reply: callOwnAccount({ action: 'getEmail' }) };
  }
  const lookup = recoveryEmailLookup;
  // with nothing kept: say it's asking, and say so again if the helper is slow to wake
  let slow;
  if (kept === null) {
    box.innerHTML = '<p class="hint">Loading…</p>';
    slow = setTimeout(() => {
      const now = document.getElementById('recovery_email');
      if (now && recoveryEmailLookup === lookup && now.querySelector('.hint')) now.innerHTML = '<p class="hint">Still asking the account helper…</p>';
    }, 8000);
  }
  // the answer goes in the box on the page when it comes: the profile can be drawn again while it's on its way
  const target = () => document.getElementById('recovery_email');
  try {
    const { email } = await lookup.reply;
    clearTimeout(slow);
    if (recoveryEmailLookup !== lookup) return; // a newer ask (a change) will fill it
    keepRecoveryEmail(userId, email);
    const box = target();
    if (box) box.innerHTML = recoveryEmailHtml(email);
  } catch (err) {
    clearTimeout(slow);
    if (recoveryEmailLookup !== lookup) return; // a newer ask will fill it
    recoveryEmailLookup = null; // try again next time
    if (kept !== null) return; // the kept answer stays on the card; the next look asks again
    const box = target();
    if (box) box.innerHTML = `<p>${escapeHtml(err.message)}</p><button class="btn" onclick="loadRecoveryEmail({ fresh: true })">${icon('reset')} Try again</button>`;
  }
}

async function setRecoveryEmail() {
  const dialog = new TaskDialog('Recovery email');
  let email;
  const sent = await dialog.run({
    text: "If you forget your password, yCanta can email a code to this address. We'll send a code there first to check it's yours.",
    fields: [{ name: 'email', label: 'Email address', type: 'email', autocomplete: 'email', maxlength: 200 }],
    submit: 'Send code',
    working: 'Sending the code…',
    action: async values => {
      email = values.email;
      await callOwnAccount({ action: 'startEmail', email });
    },
  });
  if (sent === null) return;
  const saved = await dialog.run({
    text: `We emailed a code to ${email}. It lasts 20 minutes.`,
    fields: [{ name: 'code', label: 'Code from the email', autocomplete: 'one-time-code', maxlength: 12 }],
    submit: 'Confirm',
    working: 'Checking the code…',
    action: values => callOwnAccount({ action: 'confirmEmail', code: values.code }),
  });
  if (saved === null) return;
  keepRecoveryEmail(window.user._id, saved.email || email); // shown now, even if the check after it fails
  loadRecoveryEmail({ fresh: true });
  await dialog.finish(`Your recovery email is now ${saved.email}.`);
}

async function clearRecoveryEmail() {
  const dialog = new TaskDialog('Remove recovery email');
  const done = await dialog.run({
    text: "Without a recovery email you can't reset a forgotten password yourself. A church admin can still reset it for you.",
    submit: 'Remove',
    danger: true,
    working: 'Removing…',
    action: () => callOwnAccount({ action: 'clearEmail' }),
  });
  if (done === null) return;
  dialog.close();
  notyf.info('Recovery email removed');
  keepRecoveryEmail(window.user._id, '');
  loadRecoveryEmail({ fresh: true });
}

// A forgotten PIN for songs kept on this device (UX audit #4). There's no server to check who's asking: the PIN
// is kept with the songs here, so anyone using this device could set a new one. It keeps the songs from being
// opened by mistake, not from someone who has the device, and the dialog says so.
async function forgotPin() {
  const dbName = document.getElementById('db_select').value;
  if (!dbName.endsWith('(local)') || dbName === 'demo(local)') return;
  const songs = new PouchDB(dbName);
  let names = [];
  try {
    names = (await songs.allDocs({ startkey: 'u-', endkey: 'u-￿' })).rows.map(row => row.id.slice(2));
  } catch (err) {
    console.error('Could not read the names for', dbName, err);
  }
  const typed = document.getElementById('username').value.trim();
  const name = typed || (names.length === 1 ? names[0] : '');
  const label = dbName.replace(/\(local\)$/, '');
  const dialog = new TaskDialog('Set a new PIN');
  const done = await dialog.run({
    text: `"${label}" is kept only on this device, so there's no server to ask. yCanta can set a new PIN here. `
      + `The PIN keeps these songs from being opened by mistake; it doesn't lock them from someone who has this device.`
      + (names.length ? `\n\nUsernames for these songs: ${names.join(', ')}.` : ''),
    fields: [
      { name: 'username', label: 'Username', value: name, autocomplete: 'username' },
      { name: 'pin', label: 'New PIN', type: 'password', autocomplete: 'new-password' },
      { name: 'pin2', label: 'New PIN again', type: 'password', match: 'pin', autocomplete: 'new-password' },
    ],
    submit: 'Set PIN',
    working: 'Saving…',
    action: async ({ username, pin }) => {
      if (!pin.trim()) throw new Error('Please type a PIN.');
      // only a name these songs already know (its device record, or its profile)
      const known = await songs.get('_local/u-' + username).then(() => true, () => names.includes(username));
      if (!known) throw new Error(`No one named "${username}" uses these songs.` + (names.length ? ` Try ${names.join(' or ')}.` : ''));
      await songs.upsert('_local/u-' + username, doc => ({ ...doc, pin: pin.trim() }));
      return username;
    },
  });
  if (done === null) return;
  dialog.close();
  document.getElementById('username').value = done;
  document.getElementById('pin').value = '';
  document.getElementById('pin').focus();
  notyf.info('PIN changed. Sign in with the new one.', 'var(--edit-color)');
}

async function forgotPassword() {
  const dialog = new TaskDialog('Forgot password');
  let who, message;
  const asked = await dialog.run({
    text: "Enter your yCanta name, or the recovery email on your account. We'll email you a code.",
    fields: [{ name: 'who', label: 'Name or email', autocomplete: 'username', value: document.getElementById('username').value.trim(), maxlength: 200 }],
    submit: 'Email me a code',
    working: 'Sending…',
    action: async values => {
      who = values.who;
      ({ message } = await postToHelper({ action: 'requestReset', who }));
    },
  });
  if (asked === null) return;
  const byEmail = who.includes('@');
  let name = byEmail ? '' : who;
  const changed = await dialog.run({
    text: `${message} If nothing arrives, check your spam folder, or ask your church admin to reset it.`,
    fields: [
      ...(byEmail ? [{ name: 'name', label: 'Your yCanta name', help: 'The email shows it next to "Your name".', autocomplete: 'username' }] : []),
      { name: 'code', label: 'Code from the email', help: 'Next to "Your code".', autocomplete: 'one-time-code', maxlength: 12 },
      ...newPasswordFields(),
    ],
    submit: 'Change password',
    working: 'Changing your password…',
    action: async values => {
      if (byEmail) name = values.name;
      await postToHelper({ action: 'confirmReset', name, code: values.code, password: values.password });
    },
  });
  if (changed === null) return;
  document.getElementById('username').value = name;
  document.getElementById('pwd').value = '';
  await dialog.finish('Your password is changed. Sign in with it now.');
  document.getElementById('pwd').focus();
}

// ---- Managing a church's people (Admin panel) ----

async function addChurchPerson() {
  const dialog = new TaskDialog('Add someone');
  let added;
  const madeHere = new Set(); // accounts this dialog created, in case saving the list failed and they retry
  const result = await dialog.run({
    text: "If they already have a yCanta account (for example from another church), it stays as it is and the password below isn't used.",
    fields: [
      { name: 'name', label: 'The name they sign in with', maxlength: 64 },
      ...newPasswordFields('Password for their new account'),
    ],
    submit: 'Add',
    working: 'Adding…',
    action: async values => {
      checkSignInName(values.name);
      if (churchPeople(await getChurchSecurity()).has(values.name)) throw new Error(`${values.name} is already on the list.`);
      let existed;
      if (window.church.serverAdmin) {
        try {
          await remoteDb.signUp(values.name, values.password, { metadata: { created_for: window.church.db } });
          existed = false;
        } catch (err) {
          if (err.name !== 'conflict') throw err;
          existed = true;
        }
      } else {
        existed = (await callAccountsHelper({ action: 'createAccount', name: values.name, password: values.password })).existed;
      }
      if (!existed) madeHere.add(values.name);
      await updateChurchPeople([[values.name, 'viewer']]);
      added = values.name;
      return { existed: existed && !madeHere.has(values.name) };
    },
  });
  if (result === null) return;
  loadAllUsers();
  await dialog.finish(result.existed
    ? `${added} already had a yCanta account, so their password didn't change. They're now a user in this church.`
    : `Added ${added} as a user. Let them know their sign-in name and password. They can add a recovery email in their profile.`);
}

async function setChurchPersonLevel(select) {
  const name = select.closest('li').dataset.name;
  select.disabled = true;
  try {
    await updateChurchPeople([[name, select.value]]);
    notyf.info(`${escapeHtml(name)} is now: ${levelLabels[select.value]}`);
  } catch (err) {
    await TaskDialog.message('Could not change that', err.message || String(err));
  }
  loadAllUsers();
}

async function removeChurchPerson(button) {
  const name = button.closest('li').dataset.name;
  const dialog = new TaskDialog(`Remove ${name}?`);
  const done = await dialog.run({
    text: `${name} won't be able to open this church anymore. Their account stays, so another church can still use it.`,
    submit: 'Remove',
    danger: true,
    working: 'Removing…',
    action: () => updateChurchPeople([[name, 'none']]),
  });
  if (done === null) return;
  dialog.close();
  notyf.info(`Removed ${escapeHtml(name)}`);
  loadAllUsers();
}

async function resetChurchPassword(button) {
  const name = button.closest('li').dataset.name;
  const dialog = new TaskDialog(`New password for ${name}`);
  const done = await dialog.run({
    fields: newPasswordFields(),
    submit: 'Change password',
    working: 'Changing the password…',
    action: async values => {
      if (window.church.serverAdmin) {
        await remoteDb.changePassword(name, values.password);
      } else {
        await callAccountsHelper({ action: 'resetPassword', name, password: values.password });
      }
    },
  });
  if (done === null) return;
  await dialog.finish(`Changed. Let ${name} know the new password.`);
}

// Server admins: is database/validate.js this church's save rules (_design/auth)?
// { state: 'latest' | 'outdated' | 'missing' | 'unknown', source, rev }
async function saveRulesStatus() {
  const same = (a, b) => (a || '').replace(/\r\n/g, '\n').trim() === (b || '').replace(/\r\n/g, '\n').trim();
  try {
    // Not in a folder whose name starts with "couch": the church sites send every /couch... address to
    // CouchDB, which answered this file with "Authentication required"
    const file = await fetch('database/validate.js', { cache: 'no-store' });
    const source = file.ok ? await file.text() : '';
    if (!source.trim().startsWith('function')) throw new Error(`Could not load the save rules file, database/validate.js (${file.status})`);
    // never a cached copy (the browser can hand back an old one, as with the people list)
    const res = await remoteDb.fetch('_design/auth', { cache: 'no-store' });
    if (res.status === 404) return { state: 'missing', source };
    if (!res.ok) throw new Error(`Couldn't read the save rules (${res.status})`);
    const current = await res.json();
    return { state: same(current.validate_doc_update, source) ? 'latest' : 'outdated', source, rev: current._rev };
  } catch (err) {
    console.warn("Couldn't check the save rules:", err);
    return { state: 'unknown', error: err };
  }
}

// Server admins: install database/validate.js as this church's save rules
async function installSaveRules() {
  const dialog = new TaskDialog('Save rules');
  dialog.working('Checking…');
  const rules = await saveRulesStatus();
  if (rules.state === 'unknown') {
    await dialog.finish(rules.error?.message || "Couldn't check the save rules.", { error: true });
    return;
  }
  if (rules.state === 'latest') {
    loadAllUsers();
    await dialog.finish(`${window.church.db} already has the latest save rules.`);
    return;
  }
  const update = rules.state === 'outdated';
  const done = await dialog.run({
    text: `${update ? 'Update' : 'Install'} the save rules for ${window.church.db}? From then on the server checks every save: editors and church admins can change anything, everyone else only what they added.`,
    submit: update ? 'Update' : 'Install',
    working: 'Installing…',
    action: () => remoteDb.put({ _id: '_design/auth', ...(update ? { _rev: rules.rev } : {}), validate_doc_update: rules.source }),
  });
  if (done === null) return;
  loadAllUsers();
  await dialog.finish('The save rules are installed.');
}

// The server refused something this device saved (see database/validate.js). Say so once per doc.
const deniedShown = new Set();
let deniedRecent = []; // the refusals the message on screen lists; a new list once it's closed
let deniedTimer = null;
let deniedNotice = null;
async function reportDenied(event) {
  const err = event?.doc || event || {}; // sync wraps the refusal as {direction, doc}
  const id = err.id || err._id || '';
  if (deniedShown.has(id)) return;
  deniedShown.add(id);
  if (id.startsWith('h-')) { // an old version this server's save rules don't take yet
    console.warn('Server did not keep an old version:', JSON.stringify(err));
    return;
  }
  console.warn('Server refused a save:', JSON.stringify(err));
  let title = id;
  try {
    title = (await db.get(id)).title || id;
  } catch (e) {
    // fine, use the id
  }
  // One message that stays until closed (#137), for every refusal that comes in close together
  deniedRecent.push({ title, reason: err.reason || err.message || 'not allowed' });
  clearTimeout(deniedTimer);
  deniedTimer = setTimeout(() => {
    const names = deniedRecent.slice(0, 3).map(d => `"${escapeHtml(d.title)}"`).join(', ') + (deniedRecent.length > 3 ? ` and ${deniedRecent.length - 3} more` : '');
    const reasons = [...new Set(deniedRecent.map(d => d.reason))];
    deniedNotice = null; // replacing it isn't closing it: the list goes on
    const notice = stickyError(`The server did not save ${names}: ${escapeHtml(reasons.length === 1 ? reasons[0] : reasons[0] + ' (and other reasons)')}`, null, 'server refused');
    deniedNotice = notice;
    notice.on('dismiss', () => {
      if (deniedNotice !== notice) return;
      deniedNotice = null;
      deniedRecent = []; // closed: the next refusal starts a new message
    });
  }, 500);
}

// Your own password, from the profile. Server admins live in the server's settings, so theirs is
// replaced through a short-lived helper admin; everyone else changes the password on their account.
async function changeAdminPassword(username) {
  await changeOwnPassword(username, async password => {
    const tempAdminName = username + '-temp3';
    const ajaxOpts = { ajax: { headers: { Authorization: null } } };
    await remoteDb.signUpAdmin(tempAdminName, 'brucewayne');
    // Ensure temp admin login is successful BEFORE logging out the current user
    ajaxOpts.ajax.headers.Authorization = getBasicAuthHeader(tempAdminName, 'brucewayne');
    await remoteDb.logOut();
    await remoteDb.logIn(tempAdminName, 'brucewayne', ajaxOpts);
    await remoteDb.deleteAdmin(username);
    await remoteDb.signUpAdmin(username, password);
    await remoteDb.logOut();
    ajaxOpts.ajax.headers.Authorization = getBasicAuthHeader(username, password); // original username, new password
    await remoteDb.logIn(username, password, ajaxOpts);
    await remoteDb.deleteAdmin(tempAdminName);
  });
}

async function changeUserPassword(username) {
  await changeOwnPassword(username, async password => {
    if (window.accountsURL && !window.church?.serverAdmin) {
      await callOwnAccount({ action: 'changeOwnPassword', password }); // see callOwnAccount
    } else {
      await remoteDb.changePassword(username, password);
    }
  });
}

async function changeOwnPassword(username, change) {
  const dialog = new TaskDialog('Change your password');
  const done = await dialog.run({
    fields: newPasswordFields(),
    submit: 'Change password',
    working: 'Changing your password…',
    action: async values => {
      await change(values.password);
      sessionPwd = values.password;
      const stored = JSON.parse(localStorage.getItem('loggedin') || 'null');
      if (stored?.pwd) { // only where "Keep me logged in" already keeps it
        stored.pwd = values.password;
        localStorage.setItem('loggedin', JSON.stringify(stored));
      }
      // "Keep me logged in" reconnects with the password saved on this device; keep it current
      await db.upsert('_local/' + window.user._id, doc => (doc.pwd ? { ...doc, pwd: values.password } : false));
    },
  });
  if (done === null) return;
  dialog.working('Changed. Signing you back in…');
  location.reload();
}

// songElement: the open song's card (its title is in the card's header), or a song read from a yCanta v1 file
// (its title is in <stitle>)
function saveSong(song_id, songElement = document.querySelector('#song .song-card'), change_url = true) {

  return new Promise(async (resolve, reject) => {
    let new_song = false;
    
    async function loadSongContent(song) {
      if (song._rev !== undefined) {
        song._rev = songElement.dataset.rev;
      }

      // Missing tags (e.g. empty tags stripped on V1 import) read as ''
      const fieldText = selector => songElement.querySelector(selector)?.textContent ?? '';
      // The editor flattens <author>, <scrip_ref> and <cat> into comma text, so split the parent text
      const fieldList = (selector, separators = /,/) => fieldText(selector).split(separators).map(item => item.trim());

      const stitle = fieldText('.song-title, stitle').trim();
      song.title = stitle || "New Song";
      song.authors = fieldList('authors', /[,|]/);
      song.scripture_ref = joinScriptureRefs(fieldList('scripture_ref')); // "Ps 95:1,2" stays one ref
      song.introduction = fieldText('introduction');
      song.key = fieldText('key');
      song.categories = fieldList('categories').sort();

      const cclis = fieldText('cclis');
      song.cclis = (cclis && !isNaN(cclis)) ? cclis : (cclis ? 'on' : false);

      // Check for YouTube links
      const regex = /(https?:\/\/)?(?:www\.)?(youtu(?:\.be\/([-\w]+)|be\.com\/watch\?v=([-\w]+)))\w/g;
      const lineText = Array.from(songElement.querySelectorAll('line')).map(line => line.textContent).join('\n');
      song.yt = (regex.test(lineText) ? lineText.match(regex).length : '');

      song.chords = (songElement.querySelectorAll('c').length > 0 ? 'chords' : '');
      song.copyright = fieldText('copyright').replace(/\([cC]\)/, '©');

      // Compile song content
      song.content = Array.from(songElement.querySelectorAll('chunk')).map(chunk => {
        return [
          { type: (chunk.getAttribute('type') || 'verse').toLowerCase() },
          Array.from(chunk.querySelectorAll('line'))
            .filter(line => line.innerHTML.trim().length != 0)
            .map(line => line.innerHTML.replace(/\n/g, ""))
        ];
      });

      // Its languages (#90), from the editor's language row (a yCanta 1 file has none: the song keeps its own)
      const langRow = songElement.querySelector('.lang-row');
      if (langRow) {
        const langs = [...new Set([...langRow.querySelectorAll('[data-lang]')].map(chip => chip.dataset.lang))];
        if (langs.length) song.langs = langs;
        else delete song.langs; // the church's usual language
      }

      // The search text is built when the song is shown (#90, songSearchText in lib.js), not saved
      delete song.search;

      const saved = () => {
        console.log('saved:', song.title);
        if (change_url) {
          window.location.hash = `#${formatSbID(window.songbook._id)}&${song._id}`;
        }
        resolve(song._id);
        logData('edited', song._id);
      };
      // A failed save rejects (#1). It used to resolve as if it had worked, so the edit was lost without a word.
      try {
        await saveWithHistory(song);
        saved();
      } catch (err) {
        if (new_song && err.name === 'conflict') {
          // another song got this id in the same millisecond: take a slightly different one
          song._id += Math.random().toString(36).substring(7, 9);
          await db.put(song);
          saved();
        } else {
          throw err;
        }
      }
    }

    // Handle new song case
    if (song_id === 's-new-song') {
      new_song = true;
      const time = new Date().getTime();
      song_id = `s-${time}`;
      const song = {
        _id: song_id,
        added: time,
        addedBy: window.user._id,
        edited: time,
        editedBy: window.user._id
      };
      try {
        await loadSongContent(song);
        await addSongToSongbook(song._id);
      } catch (err) {
        reject(err);
      }
      return;
    }

    // Handle non-standard song ID
    if (!song_id.startsWith('s-')) {
      const time = new Date().getTime();
      song_id = `s-${song_id}`;
      const song = {
        _id: song_id,
        added: time,
        addedBy: window.user._id,
        edited: time,
        editedBy: window.user._id
      };
      try {
        await loadSongContent(song);
      } catch (err) {
        reject(err);
      }
      return;
    }

    // Existing song case
    try {
      const song = await db.get(song_id);
      song.edited = new Date().getTime();
      song.editedBy = window.user._id;
      await loadSongContent(song);
    } catch (err) {
      reject(err);
    }
  });
}

// beside: open another version of the open song as a card beside it (#117), leaving the open song as it is
function loadSong(song_id, song_rev = false, { beside = false } = {}) {
  // Validate song_id format
  if (song_id && !song_id.startsWith('s-')) {
    console.error('Invalid song ID format:', song_id);
    return Promise.reject(new Error('Invalid song ID format'));
  }
  const side = song_rev || beside; // a card beside the song: an old version or another version

  return new Promise(async (resolve, reject) => {
    async function createSongHtml(song, deleted = false) {
      if (!beside) {
        window.song_rev = song._rev;
        document.querySelectorAll('.current_rev').forEach(el => el.classList.remove('current_rev'));
      }

      if (!side) {
        window.song = song;
        window.song._revs_info = song._revs_info ? song._revs_info.filter(rev => rev.status === 'available') : [];
      }

      // Build song element class list (a deleted song says so in its .deleted-note line)
      const songElClassList = [];
      if (deleted) songElClassList.push('deleted-song');
      if (song_rev) {
        songElClassList.push('revision', 'current_rev');
        document.body.classList.add('revision');
      }
      if (beside) songElClassList.push('version-card');

      // Build float menu if not a revision
      let floatMenu = '';
      if (!side) {
        const editable = canEdit(song) && !deleted; // a deleted song is restored, not edited (#69)
        floatMenu = `
          ${editable ? '<button data-songbook onclick="deleteSong(window.song._id)" class="float-menu-item deleteSong"><span class="float-menu-icon">' + icon('trash') + '</span>Delete</button>' : ''}
          <a data-song-export class="float-menu-item"><span class="float-menu-icon">${icon('export')}</span>Export</a>
          ${editable ? '<a data-song-edit class="float-menu-item"><span class="float-menu-icon">' + icon('edit') + '</span>Edit</a>' : ''}
          <span class="float-menu-item float-menu-toggle"><button type="button" class="float-menu-icon" aria-label="Actions" title="Actions: export, edit, delete">${icon('plus')}</button></span>
        `;
        document.querySelector('#song .float-menu').innerHTML = floatMenu;
      }

      // Build song HTML, from a copy whose text shows as text (see displaySong in lib.js). Each song shown is
      // a card: the column's usual header (its title and buttons), then <song>, the song itself. An old
      // version opens as another card beside it, with its own header (Restore, ×).
      const shown = displaySong(song);
      let songHtml = `
        <section class="song-card ${songElClassList.join(' ')}"
              data-rev="${escapeHtml(song._rev)}"
              data-id="${escapeHtml(song._id)}"
              data-user-fav="${window.user.fav_songs.includes(song._id) ? 'true' : 'false'}">
          <div class="column_header">
            <div class="title">
              <h3 class="song-title">${beside ? `<a class="title_link" href="#${escapeHtml(window.songbook?._id || 'sb-allSongs')}&${escapeHtml(song._id)}" title="Open this version">${shown.title}</a>` : `<a data-song class="title_link">${shown.title}</a>`}</h3>
              <span class="buttonsRight">
                ${beside ? `<button type="button" onclick="closeVersionBeside(this.closest('.song-card'))" class="close-x" aria-label="Close" title="Close">${icon('close')}</button>`
                : song_rev ? `${canEdit(window.song) ? `<button onclick="restoreSongRev('${escapeHtml(song._rev)}')" class="btn btn-tiny" title="Make this the current version">${icon('undo')} Restore</button>` : ''}<button type="button" onclick="this.closest('.song-card').remove()" class="close-x" aria-label="Close" title="Close">${icon('close')}</button>` : `
                  <span class="star" role="button" tabindex="0" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.click(); }" aria-label="Favorite song" title="Favorite" onclick="event.stopPropagation(); toggleFavorite(this.closest('.song-card').dataset.id,'fav_songs')"></span>
                  <info role="button" tabindex="0" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.click(); }" aria-label="Song info" title="Info" onclick="event.stopPropagation(); loadInfo();"></info>
                  <span class="fsButton" role="button" tabindex="0" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.click(); }" aria-label="Full width" title="Full width" onclick="toggleFullscreen(this)"></span>
                `}
              </span>
            </div>
          </div>
          <song>
          ${beside ? `<p class="version-note"><small>${escapeHtml(songLangLabel(song))} version</small></p>` : ''}
          ${song_rev ? `<p class="rev-note">Old version${song.editedBy ? ', saved by ' + escapeHtml(window.users?.[song.editedBy] || song.editedBy.replace(/^u-/, '')) : ''}${song.edited ? ', ' + formatDate(song.edited) : ''}.</p>` : ''}
          ${deleted ? `<p class="deleted-note">Deleted${song.deletedBy ? ' by ' + escapeHtml(window.users?.[song.deletedBy] || song.deletedBy.replace(/^u-/, '')) : ''}${song.deletedAt ? ', ' + formatDate(song.deletedAt) : ''}.
            ${song.deletedAt && canEdit(song) ? `<button class="btn btn-tiny" onclick="restoreOpenSong(this)">${icon('undo')} Restore</button>` : ''}</p>` : ''}
          <authors><author>${shown.authors.join('</author>, <author>')}</author></authors>
          <scripture_ref><scrip_ref>${shown.scripture_ref.join('</scrip_ref>, <scrip_ref>')}</scrip_ref></scripture_ref>
          ${!side ? `<span id="keyToggleContainer"><span id="keyToggleFilter">` : ''}<key>${shown.key}</key>${!side ? `<button id="keyToggle" type="button" aria-expanded="false" title="Change the key">Key: <b class="key-name">${shown.key}</b><span class="chevron" aria-hidden="true"></span></button><label class="switch" hidden><input type="checkbox" id="chordSwitch"><span class="switch-track" aria-hidden="true"></span>Chords</label></span></span>` : ''}
          <categories><cat>${shown.categories.sort().join('</cat>, <cat>')}</cat></categories>
          <cclis>${(song.cclis ? (!isNaN(song.cclis) ? 'CCLI Song #: ' + shown.cclis : 'In CCLI') : '')}</cclis>
          ${!side && song._id !== 's-new-song' ? '<div class="filter-chips version-chips" hidden></div>' : ''}
          <introduction>${shown.introduction}</introduction>
      `;

      // Add song content chunks
      shown.content.forEach(chunk => {
        songHtml += `<chunk type="${chunk[0].type.toLowerCase()}">`;
        chunk[1].forEach(line => {
          songHtml += `<line dir="${lineDir(line)}">${line}</line>`; // an Arabic line reads right to left (#90)
        });
        songHtml += '</chunk>';
      });

      songHtml += `<copyright>${shown.copyright}</copyright></song></section>`;

      // Insert song HTML
      const songContainer = document.querySelector('#song .content');
      if (beside) {
        if ([...songContainer.querySelectorAll(':scope > .version-card')].some(el => el.dataset.id === song._id)) {
          resolve('song_loaded'); // already open beside it
          return;
        }
        songContainer.insertAdjacentHTML('beforeend', songHtml);
      } else if (song_rev && !document.querySelector(`[data-rev="${song_rev}"]`)) {
        songContainer.insertAdjacentHTML('beforeend', songHtml);
      } else if (!song_rev) {
        songContainer.innerHTML = songHtml;
      } else {
        document.querySelectorAll(`.song-card[data-rev="${song._rev}"]`).forEach(el => {
          el.classList.add('current_rev');
        });
        if (document.getElementById('dialog').style.display === "block" && document.getElementById('dialog').dataset.use === "info") {
          loadInfo();
        }
        return;
      }
      
      // The song just put in: the last song card in the column. Not looked up by its rev, since a new song has none (#150).
      const songEl = songContainer.querySelector(':scope > .song-card:last-of-type');
      const urlRegex = /(((http|https|ftp):\/\/)*[\w?=&.\/-;#~%-]+\.[\w?=&.\/-;#~%-]+(?![\w\s?&.\/;#~%"=-]*>))/g;
      const commentChunks = songEl.querySelectorAll('chunk[type="comment"]');

      commentChunks.forEach(function(chunk) {
        chunk.innerHTML = chunk.innerHTML.replace(urlRegex, '<a href="$1" target="_blank">$1</a> ');
      });

      // Set YouTube links
      let regex = /(https?:\/\/)?(?:www\.)?(youtu(?:\.be\/([-\w]+)|be\.com\/watch\?v=([-\w]+)))\w/g;
      const textContent = songEl.textContent;
      if (beside) { // the open song keeps its videos, Key and Chords; this card just shows the other version
        resolve('song_loaded');
        return;
      }
      window.youtube_links = textContent.match(regex) || [];
      // Every song gets ▶ (#151): one with links plays them; one without searches YouTube, marked with a badge
      if (!song_rev) {
        const keyElement = songEl.querySelector('key');
        const youtubeButton = document.createElement('button');
        youtubeButton.className = 'btn yt-play';
        youtubeButton.classList.toggle('yt-search', window.youtube_links.length === 0);
        youtubeButton.title = window.youtube_links.length ? "Play this song's videos" : 'Search YouTube for this song';
        youtubeButton.innerHTML = icon('play');
        youtubeButton.onclick = loadSongPlayer;
        keyElement.before(youtubeButton);
      }

      // Update song placement in songbook
      if (window.songbook_list) {
        setTimeout(() => {
          const songPlacement = [...window.songbook_list.visibleItems].findIndex(
            el => el._values['song-id'] === window.song._id
          ) + 1;
          const placementElement = document.querySelector('#songbook_content .search + span');
          if (placementElement) {
            placementElement.dataset.numberVisible =
              `${songPlacement ? songPlacement + '/' : ''}${window.songbook_list.visibleItems.length}`;
          }
        }, 300);
      }

      resolve("song_loaded");
      document.querySelector('#song .edit_buttons')?.remove();

      if (!song_rev) {
        bindKeyAndChords();
        showVersionChips(); // its other versions (#90), once they're read
      }
      if (document.getElementById('dialog').style.display === "block" && 
          document.getElementById('dialog').dataset.use === "info") {
        loadInfo();
      }
    }

    // Handle new song case
    if (song_id === 's-new-song') {
      const timestamp = Date.now();
      const song = {
        _id: 's-new-song',
        title: '',
        authors: [''],
        scripture_ref: [''],
        introduction: '',
        key: '',
        categories: [""],
        cclis: false,
        content: [[{type: 'verse'}, [""]]],
        copyright: '',
        added: timestamp,
        addedBy: window.user._id,
        edited: timestamp,
        editedBy: window.user._id
      };
      await createSongHtml(song);
      return;
    }

    // Existing song case
    try {
      const options = { revs_info: true };
      if (song_rev) options.rev = song_rev;
      
      // an old version kept in the history (#138) is already loaded; older revisions come from this device
      const kept = song_rev && window.song?._versions?.list.find(v => v.rev === song_rev && v.doc);
      const song = kept ? kept.doc : await db.get(song_id, options);
      // Stepping back up to an open deleted song's own delete: that's the version on screen, not one to skip
      const openDelete = song_rev && song._deleted && song._rev === window.song?._rev;
      if (song._deleted && !openDelete) {
        if (window.song?._versions) { // a deleted revision: take it out of the list and step past it
          const list = window.song._versions.list;
          const at = list.findIndex(version => version.rev === song._rev);
          if (at !== -1) list.splice(at, 1);
          if (list[at]) loadSong(song_id, list[at].rev).catch(() => {});
        }
        resolve('song_loaded');
      } else {
        await createSongHtml(song, openDelete);
      }
    } catch (err) {
      if (beside) { // the open song stays as it is
        if (err.status === 404) notyf.error('That version was deleted', 'red');
        else reportDbError(err, 'open the version');
        reject(err);
        return;
      }
      // A deleted song opens read-only with a Restore button, when its delete kept the song (#69)
      if (err.status === 404 && !song_rev) {
        const tombstone = await currentDoc(song_id).catch(() => null);
        if (tombstone?._deleted && tombstone.content) {
          await createSongHtml(tombstone, true);
          return;
        }
        if (tombstone?._deleted) { // deleted before deletes kept the song: nothing to show
          notyf.error('This song was deleted', 'red');
          window.location.hash = '#' + formatSbID(window.songbook._id);
          reject(err);
          return;
        }
      }
      if (err.status === 404) {
        // Song not found - show error message and redirect
        console.error("Error loading song:", err);
        notyf.error(`Song not found (ID: ${song_id})`, 'red');
        window.location.hash = '#' + formatSbID(window.songbook._id);
      } else {
        reportDbError(err, 'open the song');
      }
      reject(err); // already reported: callers only need to stop (a 404 used to leave them waiting forever)
    }
  });
}
// ---- Version history (#138 phase 2) ----
// Every save of a song or songbook first keeps a full copy of the version it replaces, as its own doc:
//   h-<doc id>|<revision number, 6 digits>-<revision hash>
// Other docs (profiles, export setups, the category list, comments) have no history here: the nightly
// backups cover them (backups/Backup.gs).
// The id sorts one doc's versions in order, and saving the same version twice hits the same id, so a
// retry can't make a copy twice. Devices send these up but never download them (see SYNC_OPTIONS); the
// history view asks the server for one doc's range when it's opened. database/validate.js lets anyone
// add a copy of a change they made, and only church admins change or remove one.
const HISTORY_KEPT = /^(s|sb)-/;

function historyId(id, rev) {
  let [num, hash] = rev.split('-');
  while (num.length < 6) num = '0' + num;
  return `h-${id}|${num}-${hash}`;
}
function historyRange(id) {
  return { startkey: `h-${id}|`, endkey: `h-${id}|￰`, include_docs: true };
}

// Keep a copy of version `rev` of doc `id`, from this device's copy of the database
async function keepHistory(id, rev) {
  if (!rev || !HISTORY_KEPT.test(id)) return;
  let old;
  try {
    old = await db.get(id, { rev });
  } catch (err) {
    if (err.status === 404) return; // this device never had that version: nothing to copy
    throw err;
  }
  const { _id, _rev, _deleted, _revisions, _revs_info, _conflicts, _attachments, ...version } = old;
  const entry = { _id: historyId(id, rev), of: id, rev, replacedAt: Date.now(), replacedBy: window.user._id, version };
  if (_deleted) entry.deleted = true;
  try {
    await db.put(entry);
  } catch (err) {
    if (err.status !== 409) throw err; // 409: already kept
  }
}

// Save a song or songbook to this device's database, keeping a copy of the version it replaces. Use it for
// every song and songbook save, so no change is missed (other docs pass straight through). A failure to keep the copy is reported but doesn't stop
// the save: losing someone's edit would be worse than losing one old version.
async function saveWithHistory(doc) {
  // A song's search text is built when it's shown (#90, songSearchText in lib.js): the old saved one drops
  // out as songs get saved (restores, owner and category changes too). Kept old versions keep theirs.
  if (/^s-/.test(doc._id)) delete doc.search;
  if (doc._rev) {
    try {
      await keepHistory(doc._id, doc._rev);
    } catch (err) {
      console.error('Could not keep the old version of ' + doc._id, err);
      reportDbError(err, 'keep a copy of the old version');
    }
  }
  return db.put(doc);
}

// One doc's saved versions, newest first: this device's copies, plus the server's when it can be reached.
// complete is false when only this device's copies could be read.
async function loadHistory(id) {
  const found = new Map();
  const add = result => result.rows.forEach(row => row.doc && found.set(row.id, row.doc));
  add(await db.allDocs(historyRange(id)));
  let complete = !window.dbChoice?.endsWith('(remote)'); // a local database has everything on this device
  if (window.remoteDb && navigator.onLine) {
    try {
      add(await remoteDb.allDocs(historyRange(id)));
      complete = true;
    } catch (err) {
      console.warn('Could not read the history on the server:', err?.message || err);
    }
  }
  const entries = [...found.values()].sort((a, b) => (a._id < b._id ? 1 : -1));
  return { entries, complete };
}

// The doc as it is now, deleted or not, or null if this device has never had it
async function currentDoc(id) {
  const row = (await db.allDocs({ keys: [id] })).rows[0];
  if (!row || row.error) return null;
  if (!row.value.deleted) return db.get(id);
  return db.get(id, { rev: row.value.rev });
}

// Make an old version the current one again, as a new save, so the version it replaces is kept too.
// entry is an h- doc from loadHistory.
// Putting something back is a save by whoever does it, so the old versions list names them
function savedByMe(doc) {
  doc.edited = Date.now();
  doc.editedBy = window.user._id;
  return doc;
}
async function restoreVersion(entry) {
  const id = entry.of;
  if (entry.deleted) throw new Error('That version is a delete. Use the Trash to bring it back.');
  const now = await currentDoc(id);
  const restored = savedByMe({ ...entry.version, _id: id });
  if (now) restored._rev = now._rev;
  if (now?.addedBy && !now._deleted) { // the words come back; who it belongs to stays (#120)
    restored.addedBy = now.addedBy;
  }
  if (!canEdit(now || restored) || !canEdit(restored)) throw new Error("You're not allowed to change this.");
  return saveWithHistory(restored); // the change feed puts a deleted one back in the open lists
}

// Text of a song line without its chords or markup. A <template> doesn't run anything put into it.
function lineText(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('c').forEach(chord => chord.remove());
  return template.content.textContent;
}
function personName(userId) {
  return window.users?.[userId] || (userId || 'someone').replace(/^u-/, '');
}

// A readable view of one saved version of a song or songbook
function versionSummary(id, v, titles) {
  if (id.startsWith('s-')) {
    const chunks = (v.content || []).map(([info, lines]) =>
      `<p><small>${escapeHtml(info?.type || 'verse')}</small><br>${(lines || []).map(line => escapeHtml(lineText(line))).join('<br>')}</p>`);
    return `<p><b>${escapeHtml(v.title || '')}</b>${v.key ? ` <small>Key: ${escapeHtml(v.key)}</small>` : ''}<br>
      <small>${escapeHtml((v.authors || []).filter(Boolean).join(', '))}</small></p>${chunks.join('')}`;
  }
  const songs = (v.songrefs || []).map(ref => ref.id === 'section' ? escapeHtml(`— ${ref.title || 'Section'} —`)
    : ref.id === 'reading' ? `${icon('book')} ${escapeHtml(ref.ref || 'Reading')}` : escapeHtml(titles.get(ref.id) || ref.id));
  return `<p><b>${escapeHtml(v.title || '')}</b></p><ol>${songs.map(s => `<li>${s}</li>`).join('')}</ol>`;
}

// When a version was made and by whom
function versionLabel(entry) {
  const num = parseInt(entry.rev);
  const v = entry.version;
  if (entry.deleted) return `Version ${num}: deleted by ${escapeHtml(personName(v.deletedBy || entry.replacedBy))}, ${formatDate(v.deletedAt || entry.replacedAt)}`;
  if (v.edited) return `Version ${num}: saved by ${escapeHtml(personName(v.editedBy))}, ${formatDate(v.edited)}`;
  return `Version ${num}: replaced ${formatDate(entry.replacedAt)} by ${escapeHtml(personName(entry.replacedBy))}`;
}

// Titles of the songs a songbook's versions list, deleted ones included
async function titlesFor(entries) {
  const ids = new Set();
  for (const { version: v } of entries) {
    (v.songrefs || []).forEach(ref => !isBookExtra(ref.id) && ids.add(ref.id));
  }
  const titles = new Map();
  if (!ids.size) return titles;
  const rows = (await db.allDocs({ keys: [...ids], include_docs: true })).rows;
  await Promise.all(rows.map(async row => {
    if (row.doc) titles.set(row.key, row.doc.title);
    else if (row.value?.deleted) titles.set(row.key, `${(await deletedTitle(row.key, row.value.rev)) || row.key} (deleted)`);
  }));
  return titles;
}

// The "Old versions" window for a song or songbook: each version can be opened, and made current again
async function showHistory(id, label) {
  const dialog = new TaskDialog(`Old versions: ${label}`);
  dialog.working('Looking for old versions…');
  let history, now, titles;
  try {
    [history, now] = await Promise.all([loadHistory(id), currentDoc(id)]);
    titles = await titlesFor(history.entries);
  } catch (err) {
    console.error(err);
    await dialog.finish(`Couldn't load the old versions: ${err?.message || err}`, { error: true });
    return;
  }
  const { entries, complete } = history;
  const mayRestore = canEdit(now || {});
  const offline = complete ? '' : '<p class="history-note">Only the old versions saved on this device are shown. Connect to the internet to see them all.</p>';
  if (!entries.length) {
    dialog.render({ html: `${offline}<p>No old versions yet. From now on, every save keeps the version it replaces.</p>`, cancel: 'Close' });
    return;
  }
  dialog.render({
    cancel: 'Close',
    html: `${offline}<ol class="history-list">${entries.map((entry, i) => `
      <li><details>
        <summary>${versionLabel(entry)}</summary>
        <div class="history-version">${versionSummary(id, entry.version, titles)}</div>
        ${mayRestore && !entry.deleted ? `<button type="button" class="btn" data-restore="${i}">${icon('undo')} Make this the current version</button>` : ''}
      </details></li>`).join('')}</ol>`,
  });
  dialog.body.querySelectorAll('[data-restore]').forEach(button => button.addEventListener('click', async () => {
    const entry = entries[button.dataset.restore];
    dialog.working('Saving that version as the current one…');
    try {
      await restoreVersion(entry);
      await dialog.finish(`Version ${parseInt(entry.rev)} is the current version again. The version it replaced is kept too.`);
    } catch (err) {
      console.error(err);
      await dialog.finish(`Couldn't restore it: ${err?.message || err}`, { error: true });
    }
  }));
}

// The song page's "Edit N / M", newest first: the current song, the kept old versions, and any older
// revisions still on this device (from before #138, or not compacted yet). Loaded once per song version.
async function songVersions() {
  const song = window.song;
  if (song._versions) return song._versions;
  const byRev = new Map([[song._rev, { rev: song._rev, doc: song }]]);
  let complete = false;
  try {
    const history = await loadHistory(song._id);
    complete = history.complete;
    for (const entry of history.entries) {
      if (!entry.deleted && !byRev.has(entry.rev)) {
        byRev.set(entry.rev, { rev: entry.rev, doc: { ...entry.version, _id: song._id, _rev: entry.rev }, entry });
      }
    }
  } catch (err) {
    console.warn('Could not load the old versions:', err?.message || err);
  }
  for (const info of song._revs_info || []) {
    if (!byRev.has(info.rev)) byRev.set(info.rev, { rev: info.rev });
  }
  const list = [...byRev.values()].sort((a, b) => parseInt(b.rev) - parseInt(a.rev) || (a.rev < b.rev ? 1 : -1));
  song._versions = { list, complete };
  return song._versions;
}

// "↶ Restore" on an old version of the open song
async function restoreSongRev(rev) {
  const id = window.song._id;
  let entry = window.song._versions?.list.find(v => v.rev === rev)?.entry;
  const dialog = new TaskDialog('Restore an old version');
  if (!entry) { // an older revision on this device: make it look like a kept version
    try {
      const { _id, _rev, _revs_info, _revisions, _deleted, ...version } = await db.get(id, { rev });
      entry = { of: id, rev, version };
    } catch (err) {
      await dialog.finish(`Couldn't load that version: ${err?.message || err}`, { error: true });
      return;
    }
  }
  const done = await dialog.run({
    text: `Make version ${parseInt(rev)} of "${window.song.title}" the current version?\n\nThe version it replaces is kept too, so you can switch back.`,
    submit: 'Restore',
    working: 'Saving…',
    action: () => restoreVersion(entry),
  });
  if (done === null) return;
  await dialog.finish('Done. That version is the current one again.');
}

// ---- Restore from a backup (#138 phase 3) ----
// The nightly backups (backups/Backup.gs) are gzipped JSON files in the info.ycanta Google Drive:
// { yCantaBackup: 1, db, takenAt, security, docs: [every doc, deleted ones and kept old versions too] }

async function readBackupFile(file) {
  if (!file) throw new Error('Please choose a backup file.');
  let stream = file.stream();
  if (file.name.endsWith('.gz')) stream = stream.pipeThrough(new DecompressionStream('gzip'));
  let backup;
  try {
    backup = JSON.parse(await new Response(stream).text());
  } catch (err) {
    throw new Error("That file couldn't be read. Please choose a .json.gz file from the yCanta backups folder.");
  }
  if (!backup?.yCantaBackup || !Array.isArray(backup.docs)) throw new Error("That isn't a yCanta backup file.");
  return backup;
}

// The same content, ignoring revisions and key order
function sameContent(a, b) {
  const plain = value => {
    if (Array.isArray(value)) return value.map(plain);
    if (value && typeof value === 'object') {
      return Object.keys(value).filter(key => key !== '_rev' && key !== '_revisions').sort()
        .reduce((out, key) => { out[key] = plain(value[key]); return out; }, {});
    }
    return value;
  };
  return JSON.stringify(plain(a)) === JSON.stringify(plain(b));
}

// What the backup has that's different now: changed since, deleted since, or gone. Things added since the
// backup are left alone, as are kept old versions and the save rules.
async function backupDifferences(backup) {
  const now = new Map();
  const changes = await db.changes({ since: 0, include_docs: true, style: 'main_only' });
  changes.results.forEach(change => change.doc && now.set(change.id, change.doc));
  return backup.docs
    .filter(doc => !doc._deleted && !/^(_|h-)/.test(doc._id))
    .map(doc => {
      const current = now.get(doc._id);
      const status = !current ? 'gone now' : current._deleted ? 'deleted since' : sameContent(doc, current) ? null : 'changed since';
      return status && { doc, current, status };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.doc.title || a.doc.name || a.doc._id).localeCompare(String(b.doc.title || b.doc.name || b.doc._id)));
}

function backupItemKind(id) {
  return id.startsWith('sb-') ? 'songbook' : id.startsWith('s-') ? 'song' : id.startsWith('u-') ? 'profile'
    : id.startsWith('cfg-') ? 'export setup' : id.startsWith('c_') ? 'comments' : id.startsWith('v-') ? 'versions of a song'
    : id === 'categories' ? 'category list' : 'other';
}

// Put one doc back as it was in the backup, as a new save, so what it replaces is kept in the history
function restoreBackupItem({ doc, current }) {
  const { _rev, _revisions, ...content } = doc;
  if (current) content._rev = current._rev;
  return saveWithHistory(/^(s|sb)-/.test(content._id) ? savedByMe(content) : content); // only these say who saved
}

async function restoreFromBackup() {
  const dialog = new TaskDialog('Restore from a backup');
  let backup;
  const opened = await dialog.run({
    html: '<p>Backups are in the <b>yCanta backups</b> folder in the info.ycanta Google Drive: one file per church per night. Download the one you want, then choose it here.</p>',
    fields: [{ name: 'file', label: 'Backup file', type: 'file', accept: '.gz,.json' }],
    submit: 'Open',
    working: 'Reading the backup…',
    action: async () => { backup = await readBackupFile(dialog.form.elements.file.files[0]); },
  });
  if (opened === null) return;
  dialog.working('Comparing it with now…');
  let diffs;
  try {
    diffs = await backupDifferences(backup);
  } catch (err) {
    await dialog.finish(`Couldn't compare: ${err?.message || err}`, { error: true });
    return;
  }
  const otherChurch = backup.db !== window.dbName
    ? `<p class="task-error">This backup is of <b>${escapeHtml(backup.db)}</b>, and you're in <b>${escapeHtml(window.dbName)}</b>.</p>` : '';
  const whole = window.church?.serverAdmin
    ? `<p><small>Server lost? In a new, empty database, <button type="button" class="btn btn-small" data-whole>copy the whole backup in</button> instead: every song, old version and list, exactly as it was.</small></p>` : '';
  const intro = `<p>Backup of <b>${escapeHtml(backup.db)}</b>, taken ${formatDate(backup.takenAt)}.</p>${otherChurch}`;
  if (!diffs.length) {
    dialog.render({ html: `${intro}<p>Everything in it is the same now. Nothing to restore.</p>${whole}`, cancel: 'Close' });
    dialog.body.querySelector('[data-whole]')?.addEventListener('click', () => copyWholeBackup(dialog, backup));
    return;
  }
  const rows = diffs.map((item, i) => {
    const name = item.doc.title || item.doc.name || item.doc._id;
    return `<li data-search="${escapeHtml(name.toLowerCase())}"><label><input type="checkbox" value="${i}">
      ${escapeHtml(name)} <small>(${backupItemKind(item.doc._id)}, ${item.status})</small></label></li>`;
  }).join('');
  const picked = () => [...dialog.body.querySelectorAll('.backup-list input:checked')].map(box => diffs[box.value]);
  const restore = dialog.run({
    html: `${intro}<p>${diffs.length} ${diffs.length === 1 ? 'thing is' : 'things are'} different now. Choose what to put back as it was. Whatever it replaces is kept in its old versions.</p>
      <input type="search" class="backup-search" placeholder="Search" aria-label="Search the backup">
      <label class="backup-all"><input type="checkbox"> Choose all shown</label>
      <ul class="backup-list">${rows}</ul>${whole}`,
    submit: 'Restore the chosen ones',
    working: 'Restoring…',
    action: async () => {
      const items = picked();
      if (!items.length) throw new Error('Please choose at least one.');
      const failed = [];
      for (const [n, item] of items.entries()) {
        dialog.setBusy(`Restoring ${n + 1} of ${items.length}…`);
        try {
          await restoreBackupItem(item);
        } catch (err) {
          failed.push(`${item.doc.title || item.doc._id}: ${err?.message || err}`);
        }
      }
      if (items.some(item => item.doc._id.startsWith('sb-'))) initializeSongbooksList();
      return { done: items.length - failed.length, failed };
    },
  });
  const search = dialog.body.querySelector('.backup-search');
  search.addEventListener('input', () => {
    const words = search.value.toLowerCase().trim();
    dialog.body.querySelectorAll('.backup-list li').forEach(li => { li.hidden = !!words && !li.dataset.search.includes(words); });
  });
  dialog.body.querySelector('.backup-all input').addEventListener('change', event => {
    dialog.body.querySelectorAll('.backup-list li:not([hidden]) input').forEach(box => { box.checked = event.target.checked; });
  });
  dialog.body.querySelector('[data-whole]')?.addEventListener('click', () => dialog.resolveWith('whole'));
  const result = await restore;
  if (result === 'whole') return copyWholeBackup(dialog, backup);
  if (!result) return; // closed
  const { done, failed } = result;
  await dialog.finish(`Restored ${done}.${failed.length ? ` ${failed.length} couldn't be:\n\n${failed.join('\n')}` : ''} They reach everyone's devices with the next sync.`, { error: failed.length > 0 });
}

// Server admins, after losing a server: load a backup into a new, empty database exactly as it was,
// revisions, deleted docs, kept old versions, save rules and lists included
async function copyWholeBackup(dialog, backup) {
  const info = await remoteDb.info().catch(() => null);
  const count = info?.doc_count ?? '?';
  const go = await dialog.run({
    text: `Copy all ${backup.docs.length} things from the backup of ${backup.db} into ${window.dbName}?\n\n` +
      `This is for a new, empty database. ${window.dbName} has ${count} things in it now. Anything in both keeps whichever version CouchDB picks, and the other is kept as a conflict.`,
    fields: [{ name: 'lists', label: "Put back the church's lists too", type: 'checkbox', required: false }],
    submit: 'Copy everything',
    danger: true,
    working: 'Copying…',
    action: async values => {
      const docs = backup.docs.map(({ _revisions, ...doc }) => doc);
      const failed = [];
      for (let start = 0; start < docs.length; start += 200) {
        dialog.setBusy(`Copying ${Math.min(start + 200, docs.length)} of ${docs.length}…`);
        const results = await remoteDb.bulkDocs(docs.slice(start, start + 200), { new_edits: false });
        for (const r of results) if (r.error) failed.push(`${r.id}: ${r.reason || r.error}`); // bulkDocs reports each doc that failed
      }
      if (values.lists && backup.security) await putChurchSecurity(structuredClone(backup.security));
      return failed;
    },
  });
  if (go === null) return;
  if (go.length) {
    await dialog.finish(`Copied all but ${go.length}. These couldn't be copied:\n\n${go.slice(0, 20).join('\n')}${go.length > 20 ? `\n…and ${go.length - 20} more` : ''}`, { error: true });
    return;
  }
  await dialog.finish(`Copied. This device downloads it with the next sync.`);
}

// A delete that keeps the whole doc, so lists can still name what was deleted (#69) and the Trash can
// restore it (#138). CouchDB keeps the fields of a deleted doc, unlike db.remove(), which keeps only _id
// and _rev. A deleted doc still drops out of allDocs, lists and searches on its own.
function deletedDoc(doc) {
  return { ...doc, _deleted: true, deletedBy: window.user._id, deletedAt: Date.now() };
}

// Deleted songs and songbooks that can be restored: ones deleted with their body kept (deletedAt is set),
// that this user is allowed to edit. Newest delete first. (#138)
async function listTrash() {
  const changes = await db.changes({ since: 0, include_docs: true, style: 'main_only' });
  return changes.results
    .filter(c => c.deleted && c.doc?.deletedAt && /^(s|sb)-/.test(c.id) && canEdit(c.doc))
    .map(c => ({
      id: c.id,
      rev: c.doc._rev,
      type: c.id.startsWith('sb-') ? 'songbook' : 'song',
      title: c.doc.title,
      deletedBy: c.doc.deletedBy,
      deletedAt: c.doc.deletedAt,
    }))
    .sort((a, b) => b.deletedAt - a.deletedAt);
}

// Bring a deleted song or songbook back, exactly as it was, as a new revision on top of the delete. (#138)
// Church admins: who a song or songbook belongs to (#120). Its owner can change and delete it without
// being an editor. The save is recorded as this admin's, and the version it replaces is kept.
async function changeOwner(isSong) {
  const current = isSong ? window.song : window.songbook;
  if (!window.church?.admin || !current?._rev || current._deleted) return;
  const id = current._id;
  // Everyone on the church's list (online), and everyone with a profile on this device
  const names = new Map(Object.entries(window.users || {}));
  try {
    if (remoteDb && navigator.onLine) for (const name of churchPeople(await getChurchSecurity()).keys()) if (!names.has('u-' + name)) names.set('u-' + name, name);
  } catch (err) {
    console.warn("Couldn't read the church's list of people:", err);
  }
  const people = [...names].sort((a, b) => String(a[1]).localeCompare(String(b[1]), undefined, { sensitivity: 'base' }));
  if (current.addedBy && !people.some(([userId]) => userId === current.addedBy)) people.unshift([current.addedBy, current.addedBy.replace(/^u-/, '')]);
  const options = people.map(([userId, name]) =>
    `<option value="${escapeHtml(userId)}"${userId === current.addedBy ? ' selected' : ''}>${escapeHtml(name || userId.replace(/^u-/, ''))}</option>`).join('');
  const dialog = new TaskDialog(`Who "${current.title}" belongs to`);
  const result = await dialog.run({
    text: `The person it belongs to can change and delete it, even if they aren't an editor. It shows as "Added by" in its info.`,
    html: `<label>Belongs to<select name="owner" required>${options}</select></label>`,
    submit: 'Change',
    working: 'Saving…',
    action: async ({ owner }) => {
      const doc = await db.get(id); // the newest, in case it changed since it was opened
      if (owner === doc.addedBy) return 'same';
      doc.addedBy = owner;
      await saveWithHistory(savedByMe(doc));
      if (isSong) { // its version group (#90) says who added each song, for the save rule
        await readVersionGroups();
        for (const group of groupsOfSong(id)) await db.put({ ...group, songs: { ...group.songs, [id]: owner } });
      }
      return owner;
    },
  });
  if (result === null) return;
  await dialog.finish(result === 'same' ? 'It already belongs to them, so nothing changed.'
    : `"${current.title}" now belongs to ${window.users?.[result] || result.replace(/^u-/, '')}.`);
}

async function restoreDeleted(id, rev) {
  const tombstone = await db.get(id, { rev });
  if (!tombstone._deleted || !tombstone.deletedAt) throw new Error(`${id} has nothing to restore`);
  if (!canEdit(tombstone)) throw new Error(`Not allowed to restore ${id}`);
  const { _deleted, deletedBy, deletedAt, ...doc } = tombstone;
  return saveWithHistory(savedByMe(doc)); // the change feed puts it back in the open lists
}

// The Restore button on an open deleted song (#69). The change feed then reloads the song and its list item.
async function restoreOpenSong(button) {
  const { _id, _rev, title } = window.song;
  button.disabled = true;
  try {
    await restoreDeleted(_id, _rev);
    notyf.info(`Restored "${escapeHtml(title)}"`, 'var(--song-color)');
  } catch (err) {
    console.error('Error restoring:', err);
    notyf.error(`Could not restore "${escapeHtml(title)}"`, 'red');
    button.disabled = false;
  }
}

// The Trash in the user menu: deleted songs and songbooks this user may restore (#138).
// (Added in 5630138; lost in the merge that moved loadAllUsers to db.js, so the Trash did nothing.)
async function loadTrash() {
  const box = document.getElementById('trash_content');
  let items;
  try {
    items = await listTrash();
  } catch (err) {
    console.error('Error loading the trash:', err);
    box.textContent = 'Could not load the trash.';
    return;
  }
  if (!items.length) {
    box.innerHTML = '<i>Nothing in the trash.</i>';
    return;
  }
  box.innerHTML = '<ul class="trash-list">' + items.map(t => `
    <li>
      <span class="trash-title"><b>${escapeHtml(t.title)}</b> <small>(${t.type})</small><br>
      <small>Deleted by ${escapeHtml(window.users?.[t.deletedBy] || t.deletedBy?.replace(/^u-/, ''))}, ${formatDate(t.deletedAt)}</small></span>
      <button class="btn" data-id="${escapeHtml(t.id)}" data-rev="${escapeHtml(t.rev)}" onclick="restoreFromTrash(this)">${icon('undo')} Restore</button>
    </li>`).join('') + '</ul>';
}

async function restoreFromTrash(button) {
  const { id, rev } = button.dataset;
  const title = button.closest('li').querySelector('.trash-title b').textContent;
  button.disabled = true;
  try {
    await restoreDeleted(id, rev);
    notyf.info(`Restored "${escapeHtml(title)}"`, 'var(--song-color)', id.startsWith('sb-') ? `#${id}` : `#sb-allSongs&${id}`);
  } catch (err) {
    console.error('Error restoring:', err);
    notyf.error(`Could not restore "${escapeHtml(title)}"`, 'red');
  }
  loadTrash();
}

// The title of a deleted doc: from the delete itself (deletedDoc), or else from the revision just before it.
// That revision is gone once the database is compacted, so this can return null.
async function deletedTitle(id, rev) {
  for (const source of [db, window.remoteDb].filter(Boolean)) {
    try {
      const tombstone = await source.get(id, { rev, revs: true });
      if (tombstone.title) return tombstone.title;
      const { start, ids } = tombstone._revisions;
      if (ids.length > 1) {
        const before = await source.get(id, { rev: `${start - 1}-${ids[1]}` });
        if (before.title) return before.title;
      }
    } catch (err) {
      // not on this copy of the database; try the next
    }
  }
  return null;
}

async function deleteSong(song_id) {
  let sbs;
  try {
    sbs = await songInSongbooks(song_id);
  } catch (err) {
    reportDbError(err, 'check which songbooks use this song, so it was not deleted'); // never delete without checking
    return;
  }
  if(sbs.length) {
    showError(`"${window.song.title}" can't be deleted, because it's in these songbooks. Take it out of them first:\n - ${sbs.map(sb => sb.doc.title).join('\n - ')}`, { stay: true });
  }
  else if (confirm(`Move this song to the Trash?\n\n - ${window.song.title}\n\nYou can restore it from the Trash in Settings.`)) {
    try {
      const doc = await db.get(song_id);
      window.deletingId = song_id; // our own delete: the change feed should not warn about it
      const where = window.location.hash.replace(/\?.*$/, ''); // the song, to come back to on Undo
      const saved = await saveWithHistory(deletedDoc(doc));
      window.location.hash = "#" + formatSbID(window.songbook._id);
      console.log("Deleted:", window.song.title);
      offerUndo(doc.title, song_id, saved.rev, where);
    } catch (err) {
      reportDbError(err, 'delete the song');
    }
  }
}

// Right after a delete: a note for a few seconds that a click turns into Undo, putting it back where it was.
// After that, the Trash in Settings still has it (UX audit #19).
function offerUndo(title, id, rev, where) {
  const toast = notyf.open({
    type: 'info',
    duration: 8000,
    background: 'var(--songbookList-color)',
    className: 'clickable-note',
    message: `Moved "${escapeHtml(title)}" to the Trash. <u>Undo</u>`,
  });
  toast.on('click', async () => {
    notyf.dismiss(toast);
    try {
      await restoreDeleted(id, rev);
      if (id.startsWith('sb-')) initializeSongbooksList();
      notyf.info(`Restored "${escapeHtml(title)}"`, 'var(--song-color)');
      if (where) window.location.hash = where;
    } catch (err) {
      console.error('Error restoring:', err);
      notyf.error(`Could not put "${escapeHtml(title)}" back. It's still in the Trash in Settings.`);
    }
  });
}

async function deleteSongbook(songbook_id) {
  if (confirm(`Move this songbook to the Trash?\n\n - ${window.songbook.title}\n\nYou can restore it from the Trash in Settings. The songs in it stay in All Songs.`)) {
    try {
      const doc = await db.get(songbook_id);
      window.deletingId = songbook_id;
      const saved = await saveWithHistory(deletedDoc(doc));
      initializeSongbooksList();
      window.location.hash = '#songbooks';
      console.log("Deleted:", window.songbook.title);
      offerUndo(doc.title, songbook_id, saved.rev, '#' + songbook_id);
    } catch (err) {
      reportDbError(err, 'delete the songbook');
    }
  }
}

function saveSongbook(songbook_id, songbook_html = document.getElementById('songbook_content'), change_url = true) {
    if(document.getElementById('songbook_title').textContent.trim() === ''){
    showError('Give the songbook a title before you save.');
    return;
  }
  else{
    window.songbookEditing=false;
  }
  var new_songbook = false;
  return new Promise(async (resolve, reject) => {
    let new_songbook = false;
    
    async function loadSongbookContent(songbook) {
      // Set revision if updating
      if (songbook._rev !== undefined) {
        const titleElement = songbook_html.querySelector('#songbook_title');
        songbook._rev = titleElement ? titleElement.dataset.rev : undefined;
      }

      // Get title and settings
      const titleElement = songbook_html.querySelector('#songbook_title');
      if (titleElement) {
        songbook.title = titleElement.textContent.trim() || "New Songbook";
        songbook.showStatus = songbook_html.classList.contains('showStatus');
        songbook.showComments = songbook_html.classList.contains('showComments');
      } else {
        // Fallback for V1 import
        const v1Title = songbook_html.querySelector('title');
        songbook.title = v1Title ? v1Title.textContent.trim() : "New Songbook";
      }

      // Compile song references
      const songItems = songbook_html.querySelectorAll('.list li');
      songbook.songrefs = [];

      songItems.forEach(item => {
        const songId = item.dataset.songId;
        if (songId === "section") {
          const link = item.querySelector('a');
          songbook.songrefs.push({
            id: songId,
            title: link ? link.textContent : ""
          });
        } else if (songId === "reading") { // a Bible reading (#157): its reference
          const ref = item.querySelector('a')?.textContent.trim();
          if (ref && ref !== 'New Reading') songbook.songrefs.push({ id: songId, ref });
        } else {
          songbook.songrefs.push({
            id: songId,
            status: item.dataset.songStatus || 'n',
            key: 'Am'
          });
        }
      });

      // Handle V1 songrefs if no list items found
      if (songItems.length === 0) {
        const v1Songrefs = songbook_html.querySelectorAll('songref, section');
        v1Songrefs.forEach(ref => {
          if (ref.nodeName.toLowerCase() === "section") {
            songbook.songrefs.push({
              id: "section",
              title: ref.getAttribute('title') || ""
            });
          } else {
            songbook.songrefs.push({
              id: ref.getAttribute('ref'),
              status: ref.getAttribute('status') || 'n',
              key: 'Am'
            });
            if (ref.getAttribute('status') !== 'n') {
              songbook.showStatus = true;
            }
          }
        });
      }

      const saved = () => {
        window.songbook = songbook;
        console.log('saved:', songbook.title);

        if (change_url) {
          window.location.hash = `#${window.songbook._id}`;
          // the editors' bands only: the export's band is part of the page (index.html)
          document.querySelectorAll('#songList .edit_buttons, #song .edit_buttons').forEach(el => el.remove());
          initializeSongbooksList();
        }

        resolve(window.songbook._id);
        logData('edited', songbook._id);
      };
      // A failed save rejects (#1). It used to resolve 'save_failed', which no caller checked.
      try {
        await saveWithHistory(songbook);
        saved();
      } catch (err) {
        if (new_songbook && err.name === 'conflict') {
          // another songbook got this id in the same millisecond: take a slightly different one
          songbook._id += Math.random().toString(36).substring(7, 9);
          await db.put(songbook);
          saved();
        } else {
          throw err;
        }
      }
    }

    // Handle new songbook case
    if (songbook_id === 'sb-new-songbook') {
      new_songbook = true;
      const time = new Date().getTime();
      songbook_id = `sb-${time}`;
      const songbook = {
        _id: songbook_id,
        added: time,
        addedBy: window.user._id,
        edited: time,
        editedBy: window.user._id
      };
      await loadSongbookContent(songbook).catch(reject);
      return;
    }

    // Handle non-standard songbook ID
    if (!songbook_id.startsWith('sb-')) {
      const time = new Date().getTime();
      songbook_id = `sb-${songbook_id}`;
      const songbook = {
        _id: songbook_id,
        added: time,
        addedBy: window.user._id,
        edited: time,
        editedBy: window.user._id
      };
      await loadSongbookContent(songbook).catch(reject);
      return;
    }

    // Existing songbook case
    try {
      const songbook = await db.get(songbook_id);
      songbook.edited = new Date().getTime();
      songbook.editedBy = window.user._id;
      await loadSongbookContent(songbook);
    } catch (err) {
      reject(err);
    }
  });
}

async function loadSongbook(songbook_id, forceReload=false) {
  try {
    // Early return if already loaded
    if (songbook_id === window.songbook._id && !forceReload) {
      return 'songbook already loaded';
    }

    // The list isn't emptied here: buildSongbookList swaps the old rows for the new ones in one go, once the new
    // book has loaded. Emptying it first left a moment with no rows, and on a phone the songbook bar above an
    // open song went blank for a frame when switching books (#148).

    // Handle special songbooks (All Songs/Favorites)
    if (!songbook_id || songbook_id === 'sb-allSongs' || songbook_id === 'sb-favoriteSongs') {
      return await handleSpecialSongbooks(songbook_id);
    }

    // Handle new songbook case
    if (songbook_id === 'sb-new-songbook') {
      handleNewSongbook();
      return 'loaded blank new songbook';
    }

    // Regular songbook loading
    return await loadRegularSongbook(songbook_id);
  } catch (err) {
    reportDbError(err, 'open the songbook'); // callers only need to stop
    throw err;
  } finally {
    document.querySelectorAll('#songList .edit_buttons').forEach(el => el.remove());
  }

  async function handleSpecialSongbooks(sbId) {
    sbId = sbId || 'sb-allSongs';
    const options = {
      include_docs: true,
      startkey: sbId === 'sb-favoriteSongs' ? undefined : 's-',
      endkey: sbId === 'sb-favoriteSongs' ? undefined : 's-\ufff0',
      keys: sbId === 'sb-favoriteSongs' ? window.user.fav_songs : undefined
    };

    window.songbook = {
      _id: sbId,
      title: sbId === 'sb-favoriteSongs' ? "Favorite Songs" : "All Songs", 
      _rev: ''
    };

    const result = await db.allDocs(options);
    result.rows = result.rows.filter(row => row.key !== '');
    
    // Sort songs alphabetically by title
    result.rows.sort((a, b) => {
      if (!a.doc || !b.doc) return 0;
      return String(a.doc.title ?? '').localeCompare(String(b.doc.title ?? '')); // a bad record's title may be a number
    });

    window.songbook.songrefs = result.rows.map(row => ({id: row.id, status: 'n'}));
    
    buildSongbookList(result.rows);
    setSongbookInfo(window.songbook);
    return 'loaded special songbook';
  }

  function handleNewSongbook() {
    // A fresh object, so the new book doesn't start with the last book's status and comment switches
    window.songbook = {title: '', _id: 'sb-new-songbook', songrefs: []};
    window.songbook_list?.clear(); // a new book starts empty
    setSongbookInfo(window.songbook);
  }

  async function loadRegularSongbook(sbId) {
    const result = await db.get(sbId);
    // A bad record may have no song list, or empty spots in it: leave those out rather than fail to open
    result.songrefs = (Array.isArray(result.songrefs) ? result.songrefs : [])
      .filter(ref => ref && typeof ref.id === 'string');
    window.songbook = result;

    const songIds = result.songrefs.map(row => row.id);

    const songResult = await db.allDocs({
      include_docs: true,
      keys: songIds
    });

    const songbookData = result.songrefs.map(item => {
      if (item.id === "section" || item.id === "reading") return item;

      const songDoc = songResult.rows.find(row => row.id === item.id);
      if (songDoc) {
        return {...songDoc, status: item.status}; // a copy, so a song in the book twice keeps both statuses
      }
      return null;
    }).filter(Boolean);

    // A deleted song keeps its place in the book, named by its old title when that can be found (#69)
    await Promise.all(songbookData.filter(row => row.value?.deleted).map(async row => {
      row.deletedTitle = await deletedTitle(row.id, row.value.rev);
    }));

    buildSongbookList(songbookData);

    if (result.showComments && !window.songbookEditing) {
      await loadSongbookComments();
    }
    
    setSongbookInfo(result);
    
    const titleEl = document.querySelector('#songbook_header .title');
    if (titleEl) {
      titleEl.dataset.userFav = window.user.fav_sbs.includes(result._id) ? 'true' : 'false';
    }
    
    return 'loaded songbook';
  }
}

// Comments on a song in a songbook. Each comment is its own record, "c_<book>_<song>|<when>", so two people
// commenting at once can't lose one. Older ones sit together, one record per song, "c_<book>_<song>" with a
// list, and still show. You change or remove your own; a church admin removes any (database/validate.js).
// A removed comment stays as a cleared stub: it shows as "Comment removed" while a later comment needs it to
// make sense, and not at all once nothing comes after it.
const commentRefs = new Map(); // each shown comment, by its data-key: what it says and where it's saved

// The records for one song in this book, or for the whole book
function commentRange(songId) {
  const base = `c_${window.songbook._id}_${songId || ''}`;
  return { startkey: base, endkey: base + (songId ? '|￰' : '￰') };
}
function songIdOfComment(doc) {
  if (doc.song) return doc.song;
  const prefix = `c_${window.songbook?._id}_`;
  return doc._id.startsWith(prefix) ? doc._id.slice(prefix.length).split('|')[0] : null;
}
// Every comment in these records, oldest first, each knowing where it's saved
function commentsFrom(docs) {
  const list = [];
  docs.forEach(doc => {
    if (!doc || doc._deleted) return;
    if (Array.isArray(doc.comments)) doc.comments.forEach(c => c && list.push({ ...c, key: `${doc._id}#${c.user}#${c.date}`, thread: doc._id }));
    else if (typeof doc.comment === 'string') list.push({ ...doc, key: doc._id });
  });
  return list.sort((a, b) => (a.date || 0) - (b.date || 0));
}

// A song row's comment button (with how many). Its comments box is made the first time it's opened: a box on
// every row of a long book, most never opened, made the page much bigger and slower to change.
function addCommentUI(li) {
  if (li.querySelector(':scope > .toggle_comment') || !li.querySelector('a')) return;
  li.querySelector('a').insertAdjacentHTML('afterend', `<button type="button" class="toggle_comment" onclick="toggleComments(this)" aria-expanded="false" aria-label="Comments" title="Comments">${icon('comment')}</button>`);
}
function commentBox(li) {
  let box = li.querySelector(':scope > .commentsContainer');
  if (!box) {
    li.insertAdjacentHTML('beforeend', `
      <div class="commentsContainer" hidden>
        <div class="comments"></div>
        <p class="comment-note">Comments save right away, apart from the songbook's Save.</p>
        <textarea class="comment" rows="2" placeholder="Add a comment" aria-label="Add a comment"></textarea>
        <div class="comment-buttons"><button type="button" class="btn btn-small primary comment-post" disabled onclick="addComment(this)">Post</button></div>
      </div>`);
    box = li.querySelector(':scope > .commentsContainer');
    if (li.commentList) drawComments(li, li.commentList); // the comments already read for this row
  }
  return box;
}
function toggleComments(btn, open) {
  const box = commentBox(btn.closest('li'));
  const show = open ?? box.hidden;
  box.hidden = !show;
  btn.setAttribute('aria-expanded', show);
}
// From a note about a new comment: open that song's comments
function openComments(songId) {
  const li = document.querySelector(`#songbook_content .list li[data-song-id="${CSS.escape(songId)}"]`);
  const btn = li?.querySelector(':scope > .toggle_comment');
  if (!btn) return;
  toggleComments(btn, true);
  li.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// Shows the comments for one song (songId) or for every song in the book
async function loadSongbookComments(songId) {
  if (!window.songbook?._id || window.songbook._id === 'sb-new-songbook') return; // a book not saved yet has none
  const rows = [...document.querySelectorAll('#songbook_content .list li:not([data-song-id="section"], [data-song-id="reading"])')]
    .filter(li => !songId || li.dataset.songId === songId);
  rows.forEach(addCommentUI);
  let result;
  try {
    result = await db.allDocs({ include_docs: true, ...commentRange(songId) });
  } catch (err) {
    console.error('Error loading comments:', err);
    return;
  }
  const bySong = new Map();
  result.rows.forEach(({ doc }) => {
    const id = doc && songIdOfComment(doc);
    if (!id || (songId && id !== songId)) return;
    if (!bySong.has(id)) bySong.set(id, []);
    bySong.get(id).push(doc);
  });
  rows.forEach(li => drawComments(li, commentsFrom(bySong.get(li.dataset.songId) || []))); // a song can be in a book twice
}
function drawComments(li, list) {
  li.commentList = list; // kept for when its box is first opened
  const box = li.querySelector(':scope > .commentsContainer .comments');
  if (box) {
    const me = window.user._id, admin = !!window.church?.admin;
    const shown = list.filter((c, i) => !c.removed || list.slice(i + 1).some(later => !later.removed));
    shown.forEach(c => commentRefs.set(c.key, c));
    box.innerHTML = shown.map(c => commentHtml(c, c.user === me, c.user === me || admin)).join('');
  }
  const count = list.filter(c => !c.removed).length;
  const toggle = li.querySelector(':scope > .toggle_comment');
  if (!toggle) return;
  if (count) toggle.dataset.commentNumber = count;
  else delete toggle.dataset.commentNumber;
  toggle.title = count ? `${count} comment${count === 1 ? '' : 's'}` : 'Comments';
  toggle.setAttribute('aria-label', toggle.title);
}
function commentWhen(date) {
  const d = new Date(date);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', ...(thisYear ? {} : { year: 'numeric' }), hour: 'numeric', minute: '2-digit' });
}
// One comment as HTML: who (the name they chose), when, and the words; the writer's own has a pencil and a
// trash can, and a church admin's view has the trash can on every one. Names and words are escaped.
function commentHtml(c, canChange = false, canRemove = false) {
  if (c.removed) return '<div class="comment-item removed">Comment removed</div>';
  return `<div class="comment-item" data-key="${escapeHtml(c.key)}">
      <div class="comment-head"><b>${escapeHtml(personName(c.user))}</b> <span class="comment-when">${commentWhen(c.date)}${c.edited ? ' · edited' : ''}</span>${
        canChange ? `<button type="button" class="inline-icon" onclick="editComment(this)" aria-label="Edit your comment" title="Edit">${icon('edit')}</button>` : ''}${
        canRemove ? `<button type="button" class="inline-icon" onclick="removeComment(this)" aria-label="Remove this comment" title="Remove">${icon('trash')}</button>` : ''}</div>
      <div class="comment-text">${escapeHtml(c.comment)}</div>
    </div>`;
}

async function addComment(btn) {
  const li = btn.closest('li');
  const field = btn.closest('.commentsContainer').querySelector(':scope > textarea.comment');
  const comment = field.value.trim();
  if (!comment) return;
  const songId = li.dataset.songId, date = Date.now();
  const doc = {
    _id: `c_${window.songbook._id}_${songId}|${date.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    sb: window.songbook._id, song: songId, user: window.user._id, date, comment,
  };
  btn.disabled = true;
  try {
    await db.put(doc);
    field.value = '';
    await loadSongbookComments(songId);
  } catch (err) {
    reportDbError(err, 'save your comment');
    btn.disabled = false;
  }
}
// Changes one shown comment: its own record, or its place in an older thread
async function saveCommentChange(key, change) {
  const c = commentRefs.get(key);
  if (!c) throw new Error('That comment has changed. Close the comments and open them again.');
  if (!c.thread) {
    const doc = await db.get(c._id);
    await db.put({ ...doc, ...change });
    return;
  }
  const doc = await db.get(c.thread);
  const i = doc.comments.findIndex(x => x && x.user === c.user && x.date === c.date);
  if (i < 0) throw new Error("That comment isn't there anymore.");
  doc.comments[i] = { ...doc.comments[i], ...change };
  await db.put(doc);
}
// The pencil: the words become a box, with Save and Cancel
function editComment(btn) {
  const item = btn.closest('.comment-item');
  const c = commentRefs.get(item.dataset.key);
  if (!c || item.querySelector('.comment-edit')) return;
  const li = item.closest('li'), text = item.querySelector('.comment-text');
  text.hidden = true;
  text.insertAdjacentHTML('afterend', `<div class="comment-edit"><textarea class="comment" rows="2" aria-label="Your comment"></textarea>
      <div class="comment-buttons"><button type="button" class="btn btn-small" data-cancel>Cancel</button><button type="button" class="btn btn-small primary" data-save>Save</button></div></div>`);
  const edit = item.querySelector('.comment-edit'), field = edit.querySelector('textarea');
  field.value = c.comment;
  field.focus();
  const done = () => { edit.remove(); text.hidden = false; };
  edit.querySelector('[data-cancel]').onclick = done;
  edit.querySelector('[data-save]').onclick = async () => {
    const comment = field.value.trim();
    if (!comment || comment === c.comment) return done(); // to take it away, the trash can
    try {
      await saveCommentChange(c.key, { comment, edited: Date.now() });
      await loadSongbookComments(li.dataset.songId);
    } catch (err) {
      reportDbError(err, 'save your comment');
    }
  };
}
async function removeComment(btn) {
  const item = btn.closest('.comment-item');
  const c = commentRefs.get(item.dataset.key);
  if (!c) return;
  const li = item.closest('li');
  const whose = c.user === window.user._id ? 'Your comment' : `${personName(c.user)}'s comment`;
  const dialog = new TaskDialog('Remove this comment?');
  const removed = await dialog.run({
    text: `${whose} will be gone for everyone. If someone replied after it, a "Comment removed" line stays so their reply still makes sense.`,
    submit: 'Remove', cancel: 'Keep it', danger: true,
    action: async () => {
      await saveCommentChange(c.key, { comment: '', removed: { by: window.user._id, date: Date.now() } });
      return true;
    },
  });
  if (removed === null) return;
  dialog.close();
  await loadSongbookComments(li.dataset.songId);
}
// Post lights up once something's typed; Ctrl+Enter (Cmd+Enter on a Mac) posts or saves
document.addEventListener('input', e => {
  if (e.target.matches?.('.commentsContainer > textarea.comment')) e.target.parentElement.querySelector('.comment-post').disabled = !e.target.value.trim();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || !e.target.matches?.('.commentsContainer textarea')) return;
  e.preventDefault();
  const button = e.target.parentElement.querySelector(e.target.matches('.commentsContainer > textarea.comment') ? '.comment-post' : '[data-save]');
  if (!button?.disabled) button?.click();
});

function addSongToSongbook(song_id, songbook_id=window.songbook._id) {
  if(songbook_id == undefined) {
    return
  }

  if(songbook_id == 'sb-favoriteSongs') {
    return toggleFavorite(song_id, 'fav_songs');
  }
  else if(songbook_id == 'sb-allSongs') {
    // do nothing because the db.changes function should update the allSongs songbook
  }
  else {
    // Never throws: the song itself is saved by now, so a failure here is only reported
    return db.get(songbook_id).then(function(songbook){
      songbook.songrefs.push({
        "id": song_id,
        "status":"n",
        "key":"Am",
        "comments":[
          "Hi"
        ]
      });
      return saveWithHistory(songbook).then(function(result) {
        console.log('Successfully added song to '+songbook.title+'!');
      });
    }).catch(function(err){
      reportDbError(err, 'add the new song to this songbook');
    });
  }
}

async function loadRawDbObject(rawDbId, elementDrop, onclick) {
  // Security check
  if (rawDbId !== 'categories' && rawDbId !== window.user._id) {
    showError("That isn't yours to edit.");
    return;
  }

  try {
    const jsonObject = await db.get(rawDbId);
    const keys = Object.keys(jsonObject);
    const element = document.getElementById(elementDrop.id || elementDrop);

    if (!element) {
      console.error('Target element not found');
      return;
    }

    // Build HTML structure
    let html = `
      <div id="rawObRoot" data-id="${jsonObject._id}" data-rev="${jsonObject._rev}">
        <h3>Editing: ${jsonObject._id}</h3>
    `;

    // Add fields for each key
    keys.forEach(key => {
      if (key !== '_id' && key !== '_rev') {
        let content = jsonObject[key];
        let contentType = typeof content;
        
        if (Array.isArray(content)) {
          content = content.join('\n');
          contentType = 'array';
        }

        html += `
          <fieldset class="key" data-name="${key}">
            <legend>${key}</legend>
            <pre class="key_content toTextarea" data-content-type="${contentType}">${content}</pre>
          </fieldset>
        `;
      }
    });

    // Add action buttons
    html += `
      </div>
      <button class="btn primary" onclick="saveRawDbObject(document.getElementById('${element.id}'));">Save</button>
      <button class="btn" onclick="${onclick}">Cancel</button>
    `;

    // Update DOM
    element.innerHTML = html;

    // Convert pre elements to editable textareas using toTextarea.js
    const chunks = Array.from(element.querySelectorAll('.toTextarea'));
    convertChunksToEditable(chunks);

  } catch (err) {
    reportDbError(err, 'open it for editing');
  }
}
async function saveRawDbObject(element) {
  try {
    const rootElement = element.querySelector('#rawObRoot');
    if (!rootElement) {
      throw new Error('Invalid element structure');
    }

    // Security check
    const dbId = rootElement.dataset.id;
    if (dbId !== 'categories' && dbId !== window.user._id) {
      showError("That isn't yours to edit.");
      return;
    }

    // Build the object to save
    const jsonObject = {
      _id: dbId,
      _rev: rootElement.dataset.rev
    };

    // Process each key field
    const keyElements = element.querySelectorAll('.key');
    keyElements.forEach(keyElement => {
      const keyName = keyElement.dataset.name;
      const contentElement = keyElement.querySelector('.key_content');
      const contentType = contentElement.dataset.contentType;
      
      let content = contentElement.textContent;
      if (contentType === 'array') {
        content = content.split('\n').filter(line => line.trim() !== '');
      }

      jsonObject[keyName] = content;
    });

    // Save to database
    await db.put(jsonObject);
    console.log('Successfully updated:', jsonObject._id);
    
    // Clear the container
    element.innerHTML = '';

  } catch (error) {
    reportDbError(error, 'save it');
  }
}

// "+ Save as a new format": ask for a name in the app's own dialog (not the browser's prompt), then save
async function createExportCfg(){
  blueHighlight(document.getElementById('export_new_config'));
  const dialog = new TaskDialog('Save as a new format');
  const done = await dialog.run({
    text: 'Save these export settings under a name, so you can pick them from the Format menu later.',
    fields: [{ name: 'name', label: 'Name', maxlength: 40 }],
    submit: 'Save',
    working: 'Saving…',
    action: async values => {
      const name = values.name.trim();
      if (!name.replaceAll(/[^A-Za-z0-9 -]/g, '')) throw new Error('Please use at least one letter or number.');
      if (!await saveExport(name)) throw new Error("Couldn't save it. Please try again.");
    },
  });
  if (done !== null) dialog.close();
}
async function deleteExportCfg(cfgId){
  let doc;
  try {
    doc = await db.get(cfgId);
  } catch (err) {
    reportDbError(err, 'find that format');
    return;
  }
  const dialog = new TaskDialog(`Delete "${doc.name || 'Default'}"?`);
  const done = await dialog.run({
    text: 'This format will be gone from the Format menu. The export settings on screen stay as they are.',
    submit: 'Delete',
    danger: true,
    working: 'Deleting…',
    action: () => db.remove(doc),
  });
  if (done === null) return;
  dialog.close();
  await loadExportSetups();
}
function serializeForm(formId) {
  const form = document.getElementById(formId);
  const elements = form.elements;

  const serializedArray = [];
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    if(element.name == ''){ continue }
    serializedArray.push({ name: element.name, value: (element.type === 'checkbox' ? element.checked : element.value)});
  }
  return serializedArray;
}
async function saveExport(name) {
  let opts = serializeForm('export_form');
  let cfg = {
    _id: 'cfg-'+window.exportObject._id+window.user._id+(name != '' ? ':'+name.replaceAll(/[^A-Za-z0-9 -]/g, "") : ''),
    cfg: opts,
    name: name
  }
  try {
    try {
      cfg._rev = (await db.get(cfg._id))._rev; // updating a saved config
    } catch (err) {
      if (err.status !== 404) throw err; // 404: a new config
    }
    await db.put(cfg);
  } catch (err) {
    reportDbError(err, 'save this export setup');
    return false;
  }
  // The buttons are rebuilt, so light up the new one (lighting up the clicked one was lost, #131), and
  // show this setup in the Format menu. (The sync handler says "saved".)
  await loadExportSetups();
  const formatSelect = document.getElementById('format');
  const saved = [...formatSelect.options].find(option => option.value === JSON.stringify(opts));
  if (saved) formatSelect.value = saved.value;
  const button = [...document.querySelectorAll('#cfg_buttons [data-save-name]')].find(b => b.dataset.saveName === (name || ''));
  if (button) blueHighlight(button);
  return true;
}

async function toggleFavorite(itemId, favoriteType) { // Make it more generic
  try {
    const user = await db.get(window.user._id);
    if (!user[favoriteType]) {
      user[favoriteType] = []; 
    }

    const index = user[favoriteType].indexOf(itemId);
    if (index === -1) {
      user[favoriteType].push(itemId);
    } else {
      user[favoriteType].splice(index, 1);
    }

    await db.put(user);
    console.log(`Successfully updated favorite ${(favoriteType == 'fav_sbs' ? 'Songbook' :'Song')}s!`);
  } catch (err) {
    reportDbError(err, 'change your favorites');
  }
}

// ---- Versions of a song (#90, #117) ----
// Songs that are the same song in another language or another length are linked in a version group: a
// record of its own, "v-<time><random>", with songs: { "<song id>": "<who added that song>" }. A record of its
// own, not a field on each song, so that linking saves one record, and bringing back an old version of a
// song doesn't bring back an old group. A song is in at most one group: linking a song that's already in
// one joins the groups. Two devices offline can still put one song in two groups; the song then says so and
// offers to join them. Who may link: database/validate.js, the same as groupChangeAllowed in lib.js.
// Parts aren't paired: side by side shows each version whole.
const versionGroups = { db: null, ready: null, bySong: new Map() };
const notYoursToLink = 'Only editors can link or unlink a song someone else added.';

// Read every group on this device (there are few), keeping which groups each song is in
function readVersionGroups() {
  versionGroups.db = db;
  const reading = versionGroups.ready = db.allDocs({ startkey: 'v-', endkey: 'v-￰', include_docs: true }).then(result => {
    const bySong = new Map();
    for (const { doc } of result.rows) {
      if (!doc?.songs || typeof doc.songs !== 'object' || Array.isArray(doc.songs)) continue;
      for (const id of Object.keys(doc.songs)) bySong.set(id, [...(bySong.get(id) || []), doc]);
    }
    if (versionGroups.ready === reading) versionGroups.bySong = bySong; // not an older read that finished late
  }).catch(err => {
    if (versionGroups.ready === reading) versionGroups.ready = null;
    throw err;
  });
  return reading;
}
function versionGroupsRead() {
  return versionGroups.db === db && versionGroups.ready ? versionGroups.ready : readVersionGroups();
}
const groupsOfSong = id => versionGroups.bySong.get(id) || [];

// A song's other versions, leaving out deleted songs, by language and then title: { groups, versions }
async function otherVersions(songId) {
  await versionGroupsRead();
  const groups = groupsOfSong(songId);
  const ids = [...new Set(groups.flatMap(group => Object.keys(group.songs)))].filter(id => id !== songId);
  const rows = ids.length ? (await db.allDocs({ keys: ids, include_docs: true })).rows : [];
  const versions = rows.map(row => row.doc).filter(doc => doc && !doc._deleted)
    .sort((a, b) => songLangLabel(a).localeCompare(songLangLabel(b)) || String(a.title).localeCompare(String(b.title)));
  return { groups, versions };
}

// What linking these songs (their docs) would do. Every group any of them is in becomes one: the one with the
// most songs (the oldest of those) keeps them all, and the others are deleted.
function planLink(songs) {
  const groups = [...new Set(songs.flatMap(song => groupsOfSong(song._id)))]
    .sort((a, b) => Object.keys(b.songs).length - Object.keys(a.songs).length || (a._id < b._id ? -1 : 1));
  const songsOf = Object.assign({}, ...groups.map(group => group.songs));
  for (const song of songs) if (!(song._id in songsOf)) songsOf[song._id] = song.addedBy || '';
  const [keep, ...gone] = groups;
  const allowed = groupChangeAllowed(keep?.songs, songsOf) && gone.every(group => groupChangeAllowed(group.songs, {}));
  const changes = !keep || gone.length > 0 || Object.keys(songsOf).length > Object.keys(keep.songs).length;
  return { keep, gone, songsOf, allowed, changes };
}

// Link songs as versions of each other. Changes nothing, and throws, if this person may not make all of it.
async function linkVersions(songIds) {
  await readVersionGroups(); // the newest
  const songs = (await db.allDocs({ keys: [...new Set(songIds)], include_docs: true })).rows.map(row => row.doc).filter(doc => doc && !doc._deleted);
  if (songs.length < 2 && !songs.some(song => groupsOfSong(song._id).length > 1)) throw new Error('Choose at least one other song.');
  const { keep, gone, songsOf, allowed, changes } = planLink(songs);
  if (!allowed) throw new Error(notYoursToLink);
  if (!changes) return keep._id;
  const now = Date.now();
  const doc = keep ? { ...keep } : { _id: `v-${now}${Math.random().toString(36).slice(2, 6)}`, added: now, addedBy: window.user._id };
  Object.assign(doc, { songs: songsOf, edited: now, editedBy: window.user._id });
  await db.put(doc);
  for (const group of gone) await db.put({ ...group, _deleted: true, edited: now, editedBy: window.user._id });
  await readVersionGroups();
  return doc._id;
}

// Take a song out of its group. A group left with one song is deleted, when this person may.
async function unlinkVersion(songId) {
  await readVersionGroups();
  const changes = groupsOfSong(songId).map(group => {
    const rest = { ...group.songs };
    delete rest[songId];
    return { group, rest, drop: Object.keys(rest).length < 2 && groupChangeAllowed(group.songs, {}) };
  });
  if (changes.some(({ group, rest }) => !groupChangeAllowed(group.songs, rest))) throw new Error(notYoursToLink);
  const now = Date.now();
  for (const { group, rest, drop } of changes) {
    const doc = { ...group, songs: drop ? group.songs : rest, edited: now, editedBy: window.user._id };
    if (drop) doc._deleted = true;
    await db.put(doc);
  }
  await readVersionGroups();
}
function canUnlinkVersion(songId) {
  return groupsOfSong(songId).every(group => {
    const rest = { ...group.songs };
    delete rest[songId];
    return groupChangeAllowed(group.songs, rest);
  });
}

// A group record changed (here, by sync, or deleted): read them again and show the change on the open song
function versionGroupsChanged() {
  readVersionGroups().then(() => {
    showVersionChips();
    const dialog = document.getElementById('dialog');
    if (dialog.style.display === 'block' && dialog.dataset.use === 'info' && document.body.classList.contains('song')) fillVersionInfo();
  }).catch(err => console.warn("Couldn't read the version groups:", err));
}

// The open song's versions, as chips under its categories: each opens that version beside it, and closes it
// again (a chip is filled in while its version is open). A song in two groups says so.
async function showVersionChips() {
  const card = document.querySelector('#song .song-card:not(.version-card):not(.revision)');
  const row = card?.querySelector('.version-chips');
  if (!row || document.getElementById('song').classList.contains('edit')) return;
  let found;
  try {
    found = await otherVersions(card.dataset.id);
  } catch (err) {
    console.warn("Couldn't read the song's versions:", err);
    return;
  }
  if (!row.isConnected) return; // another song opened meanwhile
  const { groups, versions } = found;
  const open = new Set([...document.querySelectorAll('#song .version-card')].map(el => el.dataset.id));
  row.innerHTML = (versions.length ? '<span class="version-label">Versions:</span>' : '')
    + versions.map(doc => `<button type="button" class="filter-chip${open.has(doc._id) ? ' sel' : ''}" data-version="${escapeHtml(doc._id)}"
        aria-pressed="${open.has(doc._id)}" title="Show this version beside the song" onclick="toggleVersionBeside(this.dataset.version)">${escapeHtml(songLangLabel(doc))} <span class="n">${escapeHtml(doc.title)}</span></button>`).join('')
    + (groups.length > 1 ? overlapNote(card.dataset.id, groups) : '');
  row.hidden = !row.innerHTML;
}
// A song in more than one group (linked on two devices at once): offer to join them
function overlapNote(songId, groups) {
  const allowed = planLink([...new Set(groups.flatMap(group => Object.keys(group.songs)))].map(id => ({ _id: id }))).allowed;
  return `<small class="version-overlap">This song is in ${groups.length} version groups, linked on two devices at the same time.
    ${allowed ? `<button type="button" class="btn btn-tiny" onclick="joinVersionGroups('${escapeHtml(songId)}')">Join them</button>` : 'An editor can join them.'}</small>`;
}
async function joinVersionGroups(songId) {
  try {
    await linkVersions([songId]);
    notyf.success('Joined into one group of versions');
  } catch (err) {
    reportDbError(err, 'join the version groups');
  }
  versionGroupsChanged();
}

// Side by side (#117): a version opens as another card beside the song, the way an old version does
function toggleVersionBeside(songId) {
  const card = [...document.querySelectorAll('#song .version-card')].find(el => el.dataset.id === songId);
  if (card) closeVersionBeside(card);
  else loadSong(songId, false, { beside: true }).then(markOpenVersions).catch(() => {}); // already reported
}
function closeVersionBeside(card) {
  card.remove();
  markOpenVersions();
}
function markOpenVersions() {
  const open = new Set([...document.querySelectorAll('#song .version-card')].map(el => el.dataset.id));
  document.querySelectorAll('#song .version-chips [data-version]').forEach(chip => {
    chip.classList.toggle('sel', open.has(chip.dataset.version));
    chip.setAttribute('aria-pressed', open.has(chip.dataset.version));
  });
}

// The song's Info: its versions, each to open beside it or unlink, and Link a version
async function fillVersionInfo() {
  const box = document.querySelector('#dialog .version-info');
  const song = window.song;
  if (!box || !song?._id?.startsWith('s-')) return;
  let found;
  try {
    found = await otherVersions(song._id);
  } catch (err) {
    box.innerHTML = "<br><b>Versions:</b><br>Couldn't check";
    return;
  }
  if (!box.isConnected || window.song !== song) return;
  const { groups, versions } = found;
  const sb = escapeHtml(window.songbook?._id || 'sb-allSongs');
  const rows = versions.map(doc => {
    const id = escapeHtml(doc._id);
    return `${escapeHtml(songLangLabel(doc))}: <a href="#${sb}&${id}">${escapeHtml(doc.title)}</a>
      <button type="button" class="btn btn-tiny" onclick="toggleVersionBeside('${id}')" title="Show it beside this song">Beside</button>${
      canUnlinkVersion(doc._id) ? `<button type="button" class="btn btn-tiny" onclick="unlinkFromInfo('${id}')" title="It stays a song of its own">Unlink</button>` : ''}`;
  });
  const mayLink = !song._deleted && (window.church?.editor || canEdit(song) || groups.length > 0);
  const unlinkSelf = rows.length && !song._deleted && canUnlinkVersion(song._id)
    ? `<button type="button" class="btn btn-tiny" onclick="unlinkFromInfo(window.song._id)" title="Take this song out of its versions">Unlink this song</button>` : '';
  box.innerHTML = `<br><b>Versions:</b><br>${rows.length ? rows.join('<br>') : 'None linked'}`
    + (groups.length > 1 ? `<br>${overlapNote(song._id, groups)}` : '')
    + (mayLink || unlinkSelf ? '<br>' : '')
    + (mayLink ? `<button type="button" class="btn btn-tiny" onclick="pickVersions()">Link a version</button>` : '') + unlinkSelf;
}
async function unlinkFromInfo(songId) {
  try {
    await unlinkVersion(songId);
    notyf.success('Unlinked');
  } catch (err) {
    reportDbError(err, 'unlink the version');
  }
  document.querySelector(`#song .version-card[data-id="${CSS.escape(songId)}"]`)?.remove();
  versionGroupsChanged();
}

const cclisNumber = doc => (doc?.cclis && !isNaN(doc.cclis) && Number(doc.cclis) > 0 ? String(Number(doc.cclis)) : '');
async function allLiveSongs() {
  return (await db.allDocs({ startkey: 's-', endkey: 's-￰', include_docs: true })).rows.map(row => row.doc).filter(doc => doc && !doc._deleted);
}

// Link a version: find songs to link with the open song. Songs that look like versions of it (the same title
// or CCLI number) are offered first; typing finds any song by its title.
async function pickVersions() {
  const song = window.song;
  if (!song?._id) return;
  const dialog = new TaskDialog(`Link versions of "${song.title}"`);
  dialog.working('Reading the songs…');
  let songs;
  try {
    await readVersionGroups();
    songs = (await allLiveSongs()).filter(doc => doc._id !== song._id);
  } catch (err) {
    await dialog.finish(`Couldn't read the songs: ${err?.message || err}`, { error: true });
    return;
  }
  const linked = new Set(groupsOfSong(song._id).flatMap(group => Object.keys(group.songs)));
  const title = titleKey(song.title), ccli = cclisNumber(song);
  const rows = songs.filter(doc => !linked.has(doc._id))
    .map(doc => ({ doc, suggest: !!((title && titleKey(doc.title) === title) || (ccli && cclisNumber(doc) === ccli)), allowed: planLink([song, doc]).allowed }))
    .sort((a, b) => b.suggest - a.suggest || String(a.doc.title).localeCompare(String(b.doc.title)))
    .map(({ doc, suggest, allowed }) => `<li data-search="${escapeHtml(titleKey(doc.title))}"${suggest ? ' data-suggest' : ' hidden'}><label>
      <input type="checkbox" value="${escapeHtml(doc._id)}"${allowed ? '' : ' disabled'}> ${escapeHtml(doc.title)}
      <small>${escapeHtml(songLangLabel(doc))}${groupsOfSong(doc._id).length ? ', has versions' : ''}${allowed ? '' : '. An editor has to link this one.'}</small></label></li>`).join('');
  const linking = dialog.run({
    html: `<p>Pick the songs that are "${escapeHtml(song.title)}" in another language or another length. They show beside each other, and each stays a song of its own.</p>
      <input type="search" class="backup-search" placeholder="Find a song" aria-label="Find a song">
      <p class="version-pick-hint"><small></small></p>
      <ul class="backup-list version-pick">${rows}</ul>`,
    submit: 'Link',
    working: 'Linking…',
    action: async () => {
      const picked = [...dialog.body.querySelectorAll('.version-pick input:checked')].map(box => box.value);
      if (!picked.length) throw new Error('Pick at least one song.');
      await linkVersions([song._id, ...picked]);
      return picked.length;
    },
  });
  const search = dialog.body.querySelector('.backup-search');
  const hint = dialog.body.querySelector('.version-pick-hint small');
  const filter = () => {
    const words = titleKey(search.value);
    let shown = 0;
    dialog.body.querySelectorAll('.version-pick li').forEach(li => {
      li.hidden = !li.querySelector('input').checked && (words ? !li.dataset.search.includes(words) : !li.hasAttribute('data-suggest'));
      if (!li.hidden) shown++;
    });
    hint.textContent = shown ? (words ? '' : 'These look like versions of it. Type to find another song.')
      : words ? 'No song has that in its title.' : 'Type part of a title to find the song.';
  };
  search.addEventListener('input', filter);
  search.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); }); // Enter doesn't link yet
  filter();
  const result = await linking;
  if (!result) return;
  versionGroupsChanged();
  await dialog.finish(`Linked ${result === 1 ? 'the song' : `${result} songs`} as versions of "${song.title}".`);
}

// Find versions (for editors, from the menu under your name): suggests songs to link, from the Duplicate
// category, the same title (folded like the search, so accents and marks don't count) and the same CCLI
// number. Each set is shown on its own and linked only when the editor says so. Skipped sets are remembered
// on this device.
const skippedKey = () => `versionSkips.${window.dbName || ''}`;
function skippedSuggestions() {
  try {
    return new Set(JSON.parse(localStorage.getItem(skippedKey()) || '[]'));
  } catch (err) {
    return new Set();
  }
}
function skipSuggestion(key) {
  const skipped = skippedSuggestions();
  skipped.add(key);
  try {
    localStorage.setItem(skippedKey(), JSON.stringify([...skipped]));
  } catch (err) { /* no storage: it comes back next time */ }
}
// The first line of a song's words, as text (no chords), and folded the same way as titles to compare
function firstLine(doc) {
  const first = songShape(doc).content.find(([part]) => part?.type !== 'comment')?.[1]?.[0] || '';
  return lineText(String(first)).replace(/\s+/g, ' ').trim();
}
const firstLineKey = doc => titleKey(firstLine(doc));
const markedDuplicate = song => songShape(song).categories.some(category => category.trim().toLowerCase() === 'duplicate');

// Sets of songs that may be versions of each other, and the Duplicate songs that matched nothing
function versionSuggestions(songs) {
  const parent = new Map(songs.map(song => [song._id, song._id]));
  const root = id => (parent.get(id) === id ? id : root(parent.get(id)));
  const pairs = [];
  const matchBy = (reason, keyOf) => {
    const found = new Map();
    for (const song of songs) {
      const key = keyOf(song);
      if (key) found.set(key, [...(found.get(key) || []), song._id]);
    }
    for (const ids of found.values()) for (const id of ids.slice(1)) pairs.push([ids[0], id, reason]);
  };
  matchBy('the same title', song => titleKey(song.title));
  matchBy('the same CCLI number', cclisNumber);
  // a song marked Duplicate also matches a song that starts with the same words
  const duplicateLines = new Set(songs.filter(markedDuplicate).map(firstLineKey).filter(key => key.length >= 12));
  matchBy('the same first line', song => (duplicateLines.has(firstLineKey(song)) ? firstLineKey(song) : ''));
  for (const [a, b] of pairs) parent.set(root(a), root(b));

  const sets = new Map(), reasons = new Map();
  for (const song of songs) sets.set(root(song._id), [...(sets.get(root(song._id)) || []), song]);
  for (const [a, , reason] of pairs) reasons.set(root(a), new Set([...(reasons.get(root(a)) || []), reason]));
  const oneGroup = set => {
    const group = groupsOfSong(set[0]._id);
    return group.length === 1 && set.every(song => groupsOfSong(song._id).length === 1 && groupsOfSong(song._id)[0] === group[0]);
  };
  const suggestions = [...sets.entries()].filter(([, set]) => set.length > 1 && !oneGroup(set)).map(([id, set]) => {
    const duplicate = set.some(markedDuplicate);
    return {
      songs: set.sort((a, b) => String(a.title).localeCompare(String(b.title))),
      why: [...(duplicate ? ['a song in the Duplicate category'] : []), ...reasons.get(id)],
      key: set.map(song => song._id).sort().join(' '),
      duplicate,
    };
  }).sort((a, b) => b.duplicate - a.duplicate || String(a.songs[0].title).localeCompare(String(b.songs[0].title)));
  const alone = songs.filter(song => markedDuplicate(song) && sets.get(root(song._id)).length === 1 && !groupsOfSong(song._id).length);
  return { suggestions, alone };
}

async function findVersions() {
  if (!window.church?.editor) return;
  const dialog = new TaskDialog('Find versions');
  dialog.working('Looking for songs that may be versions of each other…');
  let found;
  try {
    await readVersionGroups();
    found = versionSuggestions(await allLiveSongs());
  } catch (err) {
    await dialog.finish(`Couldn't read the songs: ${err?.message || err}`, { error: true });
    return;
  }
  const skipped = skippedSuggestions();
  const fresh = found.suggestions.filter(suggestion => !skipped.has(suggestion.key));
  const skippedBefore = found.suggestions.length - fresh.length;
  const aloneNote = found.alone.length
    ? `\n\n${found.alone.length === 1 ? 'A song' : `${found.alone.length} songs`} in the Duplicate category matched no other song: ${found.alone.map(song => `"${song.title}"`).join(', ')}. To link one, open it, then its Info, then Link a version.` : '';
  if (!found.suggestions.length) {
    await dialog.finish(`No songs look like versions of each other that aren't linked yet.${aloneNote}`);
    return;
  }
  const start = await dialog.run({
    text: "yCanta looks for songs in the Duplicate category, songs with the same title (accents and marks don't count), and songs with the same CCLI number. You'll see each set of songs on its own and choose. Nothing is linked unless you press Link.",
    html: `<p>${fresh.length ? `<b>${fresh.length}</b> set${fresh.length === 1 ? '' : 's'} to look at.` : 'No new sets to look at.'}</p>`
      + (skippedBefore ? `<label class="backup-all"><input type="checkbox" name="again"> Also show the ${skippedBefore} I skipped before</label>` : ''),
    submit: 'Start',
    action: values => values,
  });
  if (!start) return;
  const list = start.again ? found.suggestions : fresh;
  let linked = 0, skips = 0, stopped = false;
  for (const [n, suggestion] of list.entries()) {
    const step = dialog.run({
      html: `<p><b>${n + 1} of ${list.length}</b>: ${escapeHtml(suggestion.why.join(', '))}. Untick any song that isn't a version of the others.</p>
        <ul class="backup-list version-pick">${suggestion.songs.map(song => {
          const facts = [songLangLabel(song), cclisNumber(song) && `CCLI ${cclisNumber(song)}`, markedDuplicate(song) && 'in Duplicate',
            firstLine(song) && `"${firstLine(song).slice(0, 40)}"`, groupsOfSong(song._id).length && 'has versions'].filter(Boolean);
          return `<li><label><input type="checkbox" value="${escapeHtml(song._id)}" checked> ${escapeHtml(song.title)} <small>${escapeHtml(facts.join(', '))}</small></label></li>`;
        }).join('')}</ul>`,
      submit: 'Link',
      cancel: 'Stop',
      working: 'Linking…',
      action: async () => {
        const picked = [...dialog.body.querySelectorAll('.version-pick input:checked')].map(box => box.value);
        if (picked.length < 2) throw new Error('Tick at least two songs, or press Skip.');
        await linkVersions(picked);
        return 'linked';
      },
    });
    dialog.buttons.querySelector('[data-cancel]').insertAdjacentHTML('afterend', '<button type="button" class="btn" data-skip>Skip</button>');
    dialog.buttons.querySelector('[data-skip]').addEventListener('click', () => dialog.resolveWith('skip'));
    const result = await step;
    if (!result) { // Stop: the window has closed
      stopped = true;
      break;
    }
    if (result === 'skip') {
      skipSuggestion(suggestion.key);
      skips++;
    } else {
      linked++;
    }
  }
  versionGroupsChanged();
  const summary = `Linked ${linked} set${linked === 1 ? '' : 's'} of versions${skips ? `, skipped ${skips}` : ''}.`;
  if (stopped) {
    if (linked || skips) notyf.success(summary);
    return;
  }
  await dialog.finish(summary + aloneNote);
}

// Find Spanish songs (#90, for editors, from the menu under your name). A song in Spanish counts as the church's
// usual language until someone picks Spanish in its Language box. This looks at each song's title and words
// (spanishLook in lib.js) and offers the ones that look Spanish, clearest first, one at a time: Tag saves its
// languages the normal way (the old version is kept), Skip is remembered on this device. "Tag all" tags the clearly
// Spanish ones after one confirm. Nothing is saved without a click.
const spanishSkipsKey = () => `spanishSkips.${window.dbName || ''}`;
function spanishSkips() {
  try {
    return new Set(JSON.parse(localStorage.getItem(spanishSkipsKey()) || '[]'));
  } catch (err) {
    return new Set();
  }
}
function skipSpanish(id) {
  const skipped = spanishSkips();
  skipped.add(id);
  try {
    localStorage.setItem(spanishSkipsKey(), JSON.stringify([...skipped]));
  } catch (err) { /* no storage: it comes back next time */ }
}
const SPANISH_CHOICES = { es: 'Spanish only', 'es,en': 'Spanish and English' };

// Songs that may be in Spanish: no language picked yet, not in Hindi or Arabic letters, and looking Spanish.
// Clearly Spanish first, then part Spanish and part English, then the ones that only might be.
function spanishSuggestions(songs) {
  const rank = found => (found.clear ? 0 : found.maybe ? 2 : 1);
  return songs.filter(song => !savedLangs(song).length && !scriptLangs(song).length)
    .map(song => ({ song, ...spanishLook(song) }))
    .filter(found => found.look)
    .sort((a, b) => rank(a) - rank(b) || b.es - a.es || String(a.song.title).localeCompare(String(b.song.title)));
}

// Save a song's languages the normal way: its newest copy, the old version kept, saved by this person.
// False if someone tagged it Spanish in the meantime.
async function tagSongLanguages(id, langs) {
  const doc = await db.get(id);
  if (savedLangs(doc).includes('es')) return false;
  if (!canEdit(doc)) throw new Error(`You're not allowed to change "${doc.title}".`);
  doc.langs = [...new Set([...langs, ...savedLangs(doc)])];
  await saveWithHistory(savedByMe(doc));
  return true;
}

// A few lines of a song's words to tell what it is: for a song that looks part Spanish, part English, a few of each
function spanishSample(found) {
  const lines = found.lines.filter(line => line.text.trim());
  if (found.look === 'es,en') {
    const es = lines.filter(line => line.lang === 'es').slice(0, 3), en = lines.filter(line => line.lang === 'en').slice(0, 3);
    if (es.length && en.length) return lines.filter(line => es.includes(line) || en.includes(line)).map(line => line.text.trim());
  }
  return lines.slice(0, 4).map(line => line.text.trim());
}

async function findSpanishSongs() {
  if (!window.church?.editor) return;
  const dialog = new TaskDialog('Find Spanish songs');
  if (churchLang() === 'es') {
    await dialog.finish("This church's usual language is Spanish, so songs with no language picked already count as Spanish.");
    return;
  }
  dialog.working('Looking for songs that look Spanish…');
  let found;
  try {
    found = spanishSuggestions(await allLiveSongs());
  } catch (err) {
    await dialog.finish(`Couldn't read the songs: ${err?.message || err}`, { error: true });
    return;
  }
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const tags = { es: 0, 'es,en': 0 };
  let skips = 0, note = '', list = null;
  const summary = () => {
    const done = tags.es + tags['es,en'];
    const kinds = Object.entries(tags).filter(([, n]) => n).map(([look, n]) => [n, SPANISH_CHOICES[look]]);
    const how = kinds.length > 1 ? ` (${kinds.map(([n, label]) => `${n} ${label}`).join(', ')})` : kinds.length ? ` as ${kinds[0][1]}` : '';
    return `Tagged ${plural(done, 'song')}${how}${skips ? `, skipped ${skips}` : ''}.`;
  };
  const tagged = (found, look) => { // a song tagged by someone else in the meantime counts too: it's done
    tags[look]++;
    found.tagged = true;
  };

  // The start: how many, then Tag all the clear ones (after a confirm), or look at them one at a time
  while (!list) {
    const left = found.filter(f => !f.tagged);
    const skipped = spanishSkips();
    const fresh = left.filter(f => !skipped.has(f.song._id));
    const skippedBefore = left.length - fresh.length;
    const clear = fresh.filter(f => f.clear);
    const mixed = fresh.filter(f => !f.clear && !f.maybe && f.look === 'es,en');
    const maybe = fresh.length - clear.length - mixed.length;
    if (!left.length) {
      await dialog.finish(note ? `${summary()} No other songs look Spanish.` : "No songs look Spanish that aren't tagged with a language yet.");
      return;
    }
    const counts = [[clear.length, 'clearly Spanish'], [mixed.length, 'part Spanish, part English'], [maybe, 'maybe Spanish']]
      .filter(([n]) => n).map(([n, what]) => `<li><b>${n}</b> look ${what}</li>`).join('');
    const start = dialog.run({
      text: note ? '' : "yCanta looks at each song's title and words for Spanish letters and marks (ñ ¿ ¡ á é í ó ú) and common Spanish words. Songs with a language picked already are left out. You'll see each song on its own and choose Spanish only, or Spanish and English. Nothing is saved unless you press Tag.",
      html: (note ? `<p>${escapeHtml(note)}</p>` : '')
        + (fresh.length ? `<p>Songs to look at:</p><ul>${counts}</ul>` : '<p>No new songs to look at.</p>')
        + (skippedBefore ? `<label class="backup-all"><input type="checkbox" name="again"> Also show the ${skippedBefore} I skipped before</label>` : ''),
      submit: 'One at a time',
      cancel: note ? 'Close' : 'Cancel',
      action: values => values,
    });
    if (clear.length) {
      dialog.buttons.querySelector('[data-cancel]').insertAdjacentHTML('afterend',
        `<button type="button" class="btn" data-tag-all>Tag all ${clear.length} clear ones</button>`);
      dialog.buttons.querySelector('[data-tag-all]').addEventListener('click', () => dialog.resolveWith('all'));
    }
    const answer = await start;
    if (!answer) { // closed
      if (tags.es + tags['es,en']) notyf.success(summary());
      return;
    }
    if (answer !== 'all') {
      list = answer.again ? left : fresh;
      if (!list.length) {
        await dialog.finish(note ? summary() : 'No new songs to look at.');
        return;
      }
      break;
    }
    // Tag all: one confirm that names every song, each can be unticked
    const button = count => `Tag ${plural(count, 'song')} as Spanish`;
    const confirm = dialog.run({
      html: `<p><b>${plural(clear.length, 'song')}</b> will change: each gets Spanish as its language. Untick any that isn't Spanish. Each song's old version is kept.</p>
        <ul class="backup-list spanish-pick">${clear.map(f => `<li><label><input type="checkbox" value="${escapeHtml(f.song._id)}" checked> ${escapeHtml(f.song.title)} <small>${escapeHtml(spanishSample(f)[0] || '')}</small></label></li>`).join('')}</ul>`,
      submit: button(clear.length),
      cancel: '',
      working: 'Tagging…',
      action: async () => {
        const picked = [...dialog.body.querySelectorAll('.spanish-pick input:checked')].map(box => box.value);
        if (!picked.length) throw new Error('Tick at least one song, or press Back.');
        const failed = [];
        let done = 0;
        for (const [n, id] of picked.entries()) {
          dialog.setBusy(`Tagging ${n + 1} of ${picked.length}…`);
          const one = clear.find(f => f.song._id === id);
          try {
            if (await tagSongLanguages(id, ['es'])) done++;
            tagged(one, 'es');
          } catch (err) {
            console.error(err);
            failed.push(`"${one.song.title}": ${err?.message || err}`);
          }
        }
        return { done, failed };
      },
    });
    dialog.buttons.insertAdjacentHTML('afterbegin', '<button type="button" class="btn" data-back>Back</button>');
    dialog.buttons.querySelector('[data-back]').addEventListener('click', () => dialog.resolveWith('back'));
    const submit = dialog.buttons.querySelector('[type="submit"]');
    dialog.body.querySelector('.spanish-pick').addEventListener('change', () => {
      submit.textContent = button(dialog.body.querySelectorAll('.spanish-pick input:checked').length);
    });
    const result = await confirm;
    if (result === null) { // closed (Esc)
      if (tags.es + tags['es,en']) notyf.success(summary());
      return;
    }
    if (result === 'back') continue;
    note = `Tagged ${plural(result.done, 'song')} as Spanish.${result.failed.length ? ` Couldn't tag ${result.failed.join('; ')}.` : ''}`;
  }

  // One at a time
  let stopped = false;
  for (const [n, found] of list.entries()) {
    const why = found.clear ? 'Looks clearly Spanish.' : found.maybe ? 'Maybe Spanish: it has only a few Spanish words.'
      : found.look === 'es,en' ? 'Looks part Spanish, part English.' : 'Looks Spanish.';
    const step = dialog.run({
      html: `<p><b>${n + 1} of ${list.length}</b>: ${why} <small>(Spanish words and marks: ${found.es}, English words: ${found.en})</small></p>
        <p><b>${escapeHtml(found.song.title)}</b></p>
        <div class="history-version"><p>${spanishSample(found).map(escapeHtml).join('<br>')}</p></div>
        ${Object.entries(SPANISH_CHOICES).map(([look, label]) =>
          `<label class="backup-all"><input type="radio" name="look" value="${look}"${look === found.look ? ' checked' : ''}> ${label}</label>`).join('')}`,
      submit: 'Tag',
      cancel: 'Stop',
      working: 'Saving…',
      action: async ({ look }) => {
        if (!SPANISH_CHOICES[look]) throw new Error('Pick Spanish only, or Spanish and English.');
        await tagSongLanguages(found.song._id, look.split(','));
        return look;
      },
    });
    dialog.buttons.querySelector('[data-cancel]').insertAdjacentHTML('afterend', '<button type="button" class="btn" data-skip>Skip</button>');
    dialog.buttons.querySelector('[data-skip]').addEventListener('click', () => dialog.resolveWith('skip'));
    const result = await step;
    if (!result) { // Stop: the window has closed
      stopped = true;
      break;
    }
    if (result === 'skip') {
      skipSpanish(found.song._id);
      skips++;
    } else {
      tagged(found, result);
    }
  }
  if (stopped) {
    if (tags.es + tags['es,en'] || skips) notyf.success(summary());
    return;
  }
  await dialog.finish(`${summary()}${tags.es + tags['es,en'] ? " To undo one, open the song's Info, then Old versions." : ''}`);
}

