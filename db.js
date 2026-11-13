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
window.addEventListener('load', function() {
  // Update Online status
  updateOnlineStatus(event);
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  window.currentWakeLock = navigator.wakeLock.request();

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
    } else if (selectedValue.endsWith('(local)')) {
      loginElement.classList.add('login_local');
    } else if (selectedValue.endsWith('(remote)')) {
      loginElement.classList.add('login_remote');
    }

    // Demo login handling
    if (e.target.value === 'demo(local)' && !e.fromLoginRoute) {
      const databases = JSON.parse(localStorage.getItem('databases'));
      const username = 'Johannes Gutenberg';
      const pin = '42';
      
      notyf.info('<b>Login Info</b><br>Username: Johannes Gutenberg<br> Pin: 42', 'green');

      if (databases && databases[e.target.value]) {
        dbLogin('login_local', 'demo(local)', username, pin);
      } else {
        dbLogin('create_local', 'demo(local)', username, pin);

        // Import the Public Domain songs only when the demo DB is first created
        try {
          const response = await fetch('https://ycanta.canaanf.org/Public Domain.json');
          const blob = await response.blob();
          const file = new File([blob], 'Public Domain.json', { type: 'TEXT/JSON' });

          setTimeout(() => {
            handleFile(file);
            notyf.info('Imported Public Domain songs', 'green');
          }, 500);
        } catch (error) {
          console.error('Error fetching file:', error);
        }
      }
    }
  });

  // Trigger initial change event
  setTimeout(() => {
    dbSelect.dispatchEvent(new Event('change'));
  }, 50);
});
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
  // The server decides who may open a church: its own lists, or an older "<db>-..." tag.
  // Someone on neither gets a 403 here.
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
  notyf.info('Connected to server', 'green');
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
function dbChanges() {
  window.changeHandler = db.changes({
    since: 'now',
    live: true,
    include_docs: true
  }).on('change', function (change) {
    if (change.id.startsWith('h-')) return; // a kept old version (#138): nothing to show
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
        notyf.info('Config deleted', 'var(--export-color)');
      }
      return;
    }

    // Song changes
    if (change.doc._id.startsWith('s-')) {
      loadRecentSongs();
      
      // If currently viewing this song
      const isCurrentSong = window.song?._id === change.doc._id && 
                          document.body.classList.contains('song');
      
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
          `Song "${escapeHtml(change.doc.title)}" updated by ${escapeHtml(window.users[change.doc.editedBy])}`,
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
      }
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
          `Songbook "${escapeHtml(change.doc.title)}" updated by ${escapeHtml(window.users[change.doc.editedBy])}`,
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
      const songbookId = change.doc._id.match(/sb-.*?_/g)?.[0]?.replace('_','');
      
      if (songbookId && window.songbook?._id === songbookId && window.songbook.showComments) {
        const songId = change.doc._id.match(/s-.*?$/g)?.[0];
        if (songId) {
          const songElements = document.querySelectorAll(`li[data-song-id="${songId}"]`); // a song can be in a book twice
          if (songElements.length) {
            songElements.forEach(songElement => {
              const toggleComment = songElement.querySelector('.toggle_comment');
              const commentsContainer = songElement.querySelector('.comments');
              if (toggleComment) {
                toggleComment.dataset.commentNumber = change.doc.comments.length;
              }
              if (commentsContainer) {
                commentsContainer.innerHTML = change.doc.comments.map(commentHtml).join('');
              }
            });

            notyf.info(
              `Comment added to "${escapeHtml(songId)}" by ${escapeHtml(change.doc.comments.at(-1).user)}`,
              'var(--songList-color)'
            );
          }
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
        notyf.info(`User Updated "${change.doc.name}"`, 'var(--edit-color)');
        
        // Update favorites display
        const favSongbooks = change.doc.fav_sbs || [];
        
        // Update current songbook favorite status
        const songbookHeader = document.querySelector('#songbook_header .title');
        if (songbookHeader) {
          songbookHeader.dataset.userFav = favSongbooks.includes(window.songbook?._id);
        }
        
        // Update current song favorite status
        const currentSong = document.querySelector('#song song');
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
        (change.doc.name || 'Default') + ' config ' + (change.deleted ? 'deleted' : 'saved'),
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
    alert(`Could not delete database: ${err.message}`); // Provide a more specific error message
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
          alert('Username or PIN was incorrect');
          dbLogout();
          return false;
        }
        break;

      case "connect_remote":
        remote_url = parseUrl(remote_url, username, pwd);
        try {
          await loginRemoteDb(remote_url, username, pwd);
          addDBtoLocalStorage(dbName, 'remote', remote_url);
          
          db = new PouchDB(dbName, {
            adapter: usePersistentStorage ? undefined : 'memory'
          });
          await takeNextStep(username, dbName);
        } catch (error) {
          console.error('Remote connection error:', error);
          dbLogout();
          const message = error.name === 'no_access' ? error.message
            : error.duringSetup ? `Couldn't finish logging in: ${error.message}`
            : error.name === 'unauthorized' || error.name === 'forbidden'
            ? 'Username or password are incorrect'
            : 'Please check your login information';
          alert(message);
          return false;
        }
        break;

      case "login_remote":
        db = new PouchDB(dbName, {
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
      alert(`Couldn't finish logging in: ${error.message || error.name}`);
    } else if(error.name === 'unauthorized' || error.name === 'forbidden') {
      alert('Username or Password are incorrect');
    } else {
      alert(error.message || 'There was an error during login');
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
    if (!localUser?.pwd) {
      throw new Error("Can't reach the server, and this device has no saved copy to use offline. " +
        'To use yCanta offline, log in once while connected, with "Keep me logged in" checked.');
    }
    if (localUser.pwd !== pwd) {
      throw new Error('Wrong password (checked against the copy saved on this device).');
    }
    window.roles = localUser.roles;
    window.church = localUser.church; // what the church's lists said at the last online login
    notyf.info('Offline: using the songs saved on this device', 'green');
    await takeNextStep(username, dbName);
  }

  async function takeNextStep(username, dbName) {
    // Initialize window objects
    window.songbook = {};
    window.song = {};
    
    const categories = {
      _id: 'categories',
      categories: ["----- Topics", "Adoration", "Aspiration/Desire", "Assurance", "Atonement", "Awe", "Bereavement", "Brokenness", "Calvary", "Christ as Bridegroom", "Christ as King", "Christ as Lamb", "Christ as Redeemer", "Christ as Savior", "Christ as Shepherd", "Christ as Son", "Christ's Blood", "Christ's Return", "Church as Christ's Body", "Church as Christ's Bride", "Church as God's House", "Cleansing", "Comfort", "Commitment", "Compassion", "Condemnation", "Consecration", "Conviction of Sin", "Courage", "Creation", "The Cross", "Dedication/Devotion", "Dependence on God", "Encouragement", "Endurance", "Eternal Life", "Evangelism", "Faith", "Faithfulness", "Fear", "Fear of God", "Fellowship", "Forgiveness", "Freedom", "God as Creator", "God as Father", "God as Friend", "God as Refuge", "God's Creation", "God's Faithfulness", "God's Glory", "God's Goodness", "God's Guidance", "God's Harvest", "God's Holiness", "God's Love", "God's Mercy", "God's Power", "God's Presence", "God's Strength", "God's Sufficiency", "God's Timelessness", "God's Victory", "God's Wisdom", "God's Word", "Godly Family", "Grace", "Gratefulness", "Healing", "Heaven", "Holiness", "Holy Spirit", "Hope", "Humility", "Hunger/Thirst for God", "Incarnation", "Invitation", "Jesus as Messiah", "Joy", "Kingdom of God", "Knowing Jesus", "Lordship of Christ", "Love for God", "Love for Jesus", "Love for Others", "Majesty", "Meditation", "Mercy", "Missions", "Mortality", "Neediness", "New Birth", "Obedience", "Oneness in Christ", "Overcoming Sin", "Patience", "Peace", "Persecution", "Praise", "Prayer", "Proclamation", "Provision", "Purity", "Purpose", "Quietness", "Redemption", "Refreshing", "Repentance", "Rest", "Resurrection", "Revival", "Righteousness", "Salvation", "Sanctification", "Security", "Seeking God", "Service", "Servanthood", "Sorrow", "Spiritual Warfare", "Submission to God", "Suffering for Christ", "Surrender", "Temptation", "Trials", "Trust", "Victorious Living", "Waiting on God", "Worship", "----- Seasons", "Christmas", "Easter", "Good Friday", "Thanksgiving", "----- Occasions", "Baptism", "Birth", "Closing Worship", "Communion", "Death", "Engagement", "Opening Worship", "Table Songs", "Wedding", "----- Song types", "Children's Songs", "Rounds", "Scripture Reading", "Scripture Songs", "----- Work to do", "Needs Work", "Needs Chord Work", "Needs Categorical Work", "Duplicate", "----- Other", "Norway", "Secular", "Delete", "Spanish words", "Celebration", "Add category", "Palm Sunday"]
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
      const analytics = localStorage.getItem(userId+'analytics');

      document.getElementById(darkMode+'Radio').checked = true;
      handleDarkMode();
      document.documentElement.style.fontSize = fontSize + 'px';
      document.getElementById('fontSize').value = fontSize;
      document.getElementById('fontSizeOutput').textContent = fontSize + 'px';
      document.getElementById('analytics').checked = analytics !== 'false';

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
      const willDownload = !!(remoteDb && navigator.onLine && db.name.endsWith('(remote)'));
      let firstDownload = false;
      if (willDownload) {
        try {
          firstDownload = (await db.info()).doc_count === 0;
        } catch (err) {
          console.warn('Could not count the songs on this device:', err);
        }
      }
      setLoginState({ route: !firstDownload });

      // Setup sync for remote databases
      if(willDownload) { // no remoteDb: logged in from this device's copy
        console.log('doing a onetime sync...');
        let startTime = new Date();
        
        try {
          await db.sync(remoteDb, SYNC_OPTIONS).on('denied', reportDenied).on('change', (change) => {
            const percentage = parseInt(parseInt(change.change.last_seq.split('-')[0].replace('-',''))/parseInt(window.info.update_seq.replace('-',''))*100);
            
            document.documentElement.classList.add('barLoading');
            
            if(new Date() - startTime > 4000 && !document.documentElement.classList.contains('circleLoading')) {
              document.documentElement.classList.add('circleLoading');
            }
            
            if((new Date() - startTime) > 10000) {
              document.documentElement.classList.remove('circleLoading');
              startTime = false;
            }
            
            document.documentElement.style.setProperty('--status-text', `"Downloading song files to your device . . . ${percentage}%${(startTime ? ' \\a If this happens every time you log in, try clicking \\"Keep me logged in\\" :)' : '')}"`);
            document.documentElement.style.setProperty('--animation', `3s loading infinite`);
          });
        } catch (error) {
          // Not fatal: the app goes on with the copy on this device, and the live sync below keeps trying
          reportDbError(error, 'download the latest songs');
        }
        console.log('finished');

        document.documentElement.classList.remove('circleLoading', 'barLoading');
        document.documentElement.style.setProperty('--status-text', '""');
        document.documentElement.style.setProperty('--animation', '"unset"');
        
        console.log('sync complete');
        await setUpSyncHandler();
        setLoginState();
      }

      // Setup db changes listener
      dbChanges();
      window.dbName = db.name.replace(/\(.+?\)/,'');

      // Clear login inputs
      document.querySelectorAll('#login input').forEach(input => {
        input.value = '';
      });

      // Role classes show the edit controls, so set them before analytics can fail
      document.documentElement.classList.add(...Object.keys(window.roles));
      showChurchLevel();

      // Analytics: a failure here must never break login
      try {
        if(!localStorage.getItem('analyticID')) {
          localStorage.setItem('analyticID', newAnalyticsId());
          dysmyssable.info('yCanta has been updated to send information to help improve how it works. You can toggle this in settings.', 'var(--song-color)', '#'); // stays until closed, like production
        }

        // One row in the Sessions tab per visit
        setSessionInfo({
          user: window.user._id,
          db: db.name,
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
function setUpSyncHandler() {
  try {
    syncHandler = db.sync(remoteDb, {
      ...SYNC_OPTIONS,
      live: true,
      retry: true
    }).on('denied', reportDenied).on('change', function (change) {
      console.log('Synced some stuff', window.info ? parseInt(parseInt(change.change.last_seq.split('-')[0].replace('-',''))/parseInt(window.info.update_seq.replace('-',''))*100)+'%' : '');
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
        alert('Your login has expired. Please log in again.');
        dbLogout();
      } else {
        reportDbError(err, 'keep syncing with the server');
        syncHandler = null; // so reconnectSync can start it again
      }
    });
    notyf.info('Sync established', 'green');
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
    setUpSyncHandler(); // says "Sync established"
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
      songbooks.map(function(row) {
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
      });
      //Creates list.min.js list for viewing all the songbooks
      // index.html renamed it from "songbooks"; accept both for the one load where the browser has an old copy cached
      const containerId = document.getElementById('songbooks_container') ? 'songbooks_container' : 'songbooks';
      window.songbooks_list = new List(containerId, options, values);
      window.songbooks_list.sort('user-fav', {order: 'desc', sortFunction: sortFavSongbooks});
      bindSearchToList(window.songbooks_list, '#' + containerId);
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
// mirrors it for the buttons. Older accounts may still carry "<db>-viewer"/"<db>-editor"/"<db>-admin"
// tags, and both the server and the app still honor them.

// the yCanta Accounts web app (accounts-backend/), deployed from info.ycanta@gmail.com
window.accountsURL = 'https://script.google.com/macros/s/AKfycbzQvNIHM0lvuhT-yXVEjSKHvO9nHGMmithevWRmNgiFlZhFj-8T7MDY4DxuP3M7vDai9A/exec';

// What this person may do in this church, from its security lists and their account tags
function churchAccessFrom(sec, roles, name, dbId) {
  roles = roles || {};
  const inGroup = group => !!group && ((group.names || []).includes(name) || (group.roles || []).some(role => roles[role]));
  const serverAdmin = !!roles._admin;
  const admin = serverAdmin || !!roles[dbId + '-admin'] || inGroup(sec.admins);
  const editor = admin || !!roles[dbId + '-editor'] || inGroup(sec.editors);
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
  const oldTags = (sec.members?.roles || []).concat(sec.admins?.roles || []).filter(role => role !== '_admin');

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
      ${canReset(name, level) ? '<button onclick="resetChurchPassword(this)">↻ Password</button>' : '<span></span>'}
      <select aria-label="Level for ${escapeHtml(name)}" onchange="setChurchPersonLevel(this)"${self && !window.church.serverAdmin ? ' disabled title="Ask another church admin to change your own level"' : ''}>${options}</select>
      ${self ? '<span></span>' : '<button onclick="removeChurchPerson(this)">🗑 Remove</button>'}
    </li>`;
  }).join('') + '</ul>';
  if (!people.length) html += '<p>Nobody is on the list yet.</p>';
  else html += '<p class="people-none" hidden>No one matches that search.</p>';
  if (oldTags.length) {
    html += `<p class="old-tags"><small>Also let in by older account tags: ${oldTags.map(escapeHtml).join(', ')}. Someone with one of these tags keeps that access even if they're removed or set lower here, until the tag comes off their account.</small></p>`;
  }
  html += '<p class="backup-tools"><button class="btn btn-small" onclick="restoreFromBackup()">↶ Restore from a backup</button></p>';
  if (window.church.serverAdmin) {
    const [rules, moves] = await Promise.all([saveRulesStatus(), oldTags.length ? findTaggedMoves().catch(() => null) : []]);
    const rulesLine = {
      latest: 'Save rules: up to date.',
      outdated: 'Save rules: an update is available.',
      missing: 'Save rules: not installed. The server lets members change anything.',
      unknown: "Save rules: couldn't check.",
    }[rules.state];
    const rulesButton = rules.state === 'latest' ? '' :
      `<button class="btn btn-small" onclick="installSaveRules()">${rules.state === 'outdated' ? 'Update' : 'Install'} the save rules</button>`;
    let movesLine = '';
    if (moves === null) movesLine = "<p>Couldn't check the older tags.</p>";
    else if (moves.length) movesLine = `<p>${moves.length === 1 ? '1 person with an older tag isn\'t' : moves.length + ' people with older tags aren\'t'} on the list yet. <button class="btn btn-small" onclick="moveTaggedPeople()">Move them onto the list</button></p>`;
    else if (oldTags.length) movesLine = '<p>Everyone with an older tag is on the list.</p>';
    html += `<div class="server-tools"><b>Server admin tools</b>
      <p>${rulesLine} ${rulesButton}</p>${movesLine}</div>`;
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
    throw new Error("This isn't turned on yet. Ask Carl or Evan.");
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
async function loadRecoveryEmail({ fresh = false } = {}) {
  const box = document.getElementById('recovery_email');
  if (!box) return;
  if (!window.accountsURL) {
    box.innerHTML = '<p>Password recovery by email isn\'t turned on yet.</p>';
    return;
  }
  const userId = window.user._id;
  if (fresh || recoveryEmailLookup?.userId !== userId) {
    if (!navigator.onLine) {
      box.innerHTML = '<p>Connect to the internet to see or change it.</p>';
      return;
    }
    recoveryEmailLookup = { userId, reply: callOwnAccount({ action: 'getEmail' }) };
  }
  const lookup = recoveryEmailLookup;
  try {
    const { email } = await lookup.reply;
    if (!document.body.contains(box)) return; // the profile was redrawn meanwhile
    box.innerHTML = email
      ? `<p>${escapeHtml(email)}</p><button class="btn" onclick="setRecoveryEmail()">Change</button> <button class="btn" onclick="clearRecoveryEmail()">Remove</button>`
      : `<p>None yet. Add one so you can reset your password if you forget it.</p><button class="btn" onclick="setRecoveryEmail()">Add email</button>`;
  } catch (err) {
    if (recoveryEmailLookup === lookup) recoveryEmailLookup = null; // try again next time
    box.textContent = err.message;
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
  notyf.info('Recovery email removed', 'olive');
  loadRecoveryEmail({ fresh: true });
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
    notyf.info(`${escapeHtml(name)} is now: ${levelLabels[select.value]}`, 'green');
  } catch (err) {
    await TaskDialog.message('Could not change that', err.message || String(err));
  }
  loadAllUsers();
}

async function removeChurchPerson(button) {
  const name = button.closest('li').dataset.name;
  const hasOldTags = !!document.querySelector('#all_users .old-tags');
  const dialog = new TaskDialog(`Remove ${name}?`);
  const done = await dialog.run({
    text: `${name} won't be able to open this church anymore. Their account stays, so another church can still use it.` +
      (hasOldTags ? '\n\nIf their account also has one of the older tags listed under the users, that tag still lets them in until Carl or Evan removes it.' : ''),
    submit: 'Remove',
    danger: true,
    working: 'Removing…',
    action: () => updateChurchPeople([[name, 'none']]),
  });
  if (done === null) return;
  dialog.close();
  notyf.info(`Removed ${escapeHtml(name)}`, 'red');
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

// Server admins: who has this church's older account tags but isn't on the lists at that level yet.
// [[name, level], ...]. Accounts and tags aren't changed, so the tags keep working too.
async function findTaggedMoves() {
  const dbId = window.church.db;
  const res = await serverAdminFetch('_users/_all_docs?include_docs=true&startkey="org.couchdb.user:"&endkey="org.couchdb.user:\ufff0"');
  if (!res.ok) throw new Error(`Could not read the accounts (${res.status})`);
  const rows = (await res.json()).rows.map(row => row.doc).filter(Boolean);
  const people = churchPeople(await getChurchSecurity());
  const rank = { viewer: 1, editor: 2, admin: 3 };
  const moves = [];
  for (const user of rows) {
    const roles = user.roles || [];
    const level = roles.includes(dbId + '-admin') ? 'admin'
      : roles.includes(dbId + '-editor') ? 'editor'
      : roles.includes(dbId + '-viewer') ? 'viewer' : null;
    if (level && (rank[level] > (rank[people.get(user.name)] || 0))) moves.push([user.name, level]);
  }
  return moves;
}

async function moveTaggedPeople() {
  const dialog = new TaskDialog('Move tagged people onto the list');
  dialog.working('Reading the accounts…');
  let moves;
  try {
    moves = await findTaggedMoves();
  } catch (err) {
    await dialog.finish(err.message || String(err), { error: true });
    return;
  }
  if (!moves.length) {
    loadAllUsers();
    await dialog.finish('Everyone with a tag is already on the list.');
    return;
  }
  const done = await dialog.run({
    text: moves.length === 1
      ? 'This person gets onto the list. Their account and tags stay as they are.'
      : `These ${moves.length} people get onto the list. Their accounts and tags stay as they are.`,
    html: '<ul>' + moves.map(([name, level]) => `<li>${escapeHtml(name)}: ${levelLabels[level]}</li>`).join('') + '</ul>',
    submit: 'Move them',
    working: 'Saving the list…',
    action: () => updateChurchPeople(moves),
  });
  if (done === null) return;
  loadAllUsers();
  await dialog.finish(`Moved ${moves.length} ${moves.length === 1 ? 'person' : 'people'} onto the list.`);
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
  notyf.error(`The server did not save "${escapeHtml(title)}": ${escapeHtml(err.reason || err.message || 'not allowed')}`);
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

function saveSong(song_id, songElement = document.querySelector('#song song'), change_url = true) {

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

      const stitle = fieldText('stitle').trim();
      song.title = stitle || "New Song";
      song.authors = fieldList('authors', /[,|]/);
      song.scripture_ref = fieldList('scripture_ref');
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

      // Build search field
      const punctuation = /[^a-zA-Z0-9\s:-]/g;
      const duplicateWhitespace = /\s{2,}/g;
      
      function formatArray(array, letter) {
        return (array.join(',') !== '' ? array.join(` ${letter}:`) : `!${letter}`).replace(duplicateWhitespace, ' ');
      }
      
      function formatText(text, letter) {
        return (text ? text : `!${letter}`).replace(duplicateWhitespace, ' ');
      }
      
      function formatNumber(number, letter) {
        return (number ? `${letter}${number}` : `!${letter}`).replace(duplicateWhitespace, ' ');
      }
      
      function formatSongContent(content) {
        let song_content = '';
        const seenLines = new Set();
        
        content.forEach(chunk => {
          chunk[1].forEach(line => {
            const cleanLine = escapeRegExp(
              remove_chords(line)
                .replace(duplicateWhitespace, ' ')
                .replace(punctuation, '')
                .trim()
            );
            
            if (!seenLines.has(cleanLine)) {
              song_content += cleanLine + '\n';
              seenLines.add(cleanLine);
            }
          });
        });
        return song_content;
      }

      song.search = [
        `t:${song.title}\0`,
        `a:${formatArray(song.authors, 'a')}\0`,
        `s:${formatArray(song.scripture_ref, 's')}\0`,
        `i:${formatText(song.introduction, 'i')}\0`,
        `k:${formatText(song.key, 'k')}\0`,
        `c:${formatArray(song.categories, 'c')}\0`,
        `cp:${formatText(song.copyright, 'cp')}\0`,
        `yt:${formatNumber(song.yt, 'yt')}\0`,
        `cclis:${formatNumber(song.cclis, 'cclis')}\0`,
        `chords:${formatText(song.chords, 'chords')}\0`,
        `addedBy:${formatText(song.addedBy?.slice(2) || '', 'addedBy')}\0`,
        `editedBy:${formatText(song.editedBy?.slice(2) || '', 'editedBy')}\0`,
        formatSongContent(song.content),
        '\0'
      ].join('');

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

function loadSong(song_id, song_rev = false) {
  // Validate song_id format
  if (song_id && !song_id.startsWith('s-')) {
    console.error('Invalid song ID format:', song_id);
    return Promise.reject(new Error('Invalid song ID format'));
  }

  return new Promise(async (resolve, reject) => {
    async function createSongHtml(song, deleted = false) {
      window.song_rev = song._rev;
      document.querySelectorAll('.current_rev').forEach(el => el.classList.remove('current_rev'));
      
      if (!song_rev) {
        window.song = song;
        window.song._revs_info = song._revs_info ? song._revs_info.filter(rev => rev.status === 'available') : [];
      }

      // Build song element class list
      // (not 'deleted': the router strips that class from everything when it finishes a route)
      const songElClassList = [];
      if (deleted) songElClassList.push('deleted-song');
      if (song_rev) {
        songElClassList.push('revision', 'current_rev');
        document.body.classList.add('revision');
      }

      // Build float menu if not a revision
      let floatMenu = '';
      if (!song_rev) {
        const editable = canEdit(song) && !deleted; // a deleted song is restored, not edited (#69)
        floatMenu = `
          ${editable ? '<button data-songbook onclick="deleteSong(window.song._id)" class="float-menu-item deleteSong"><span class="float-menu-icon">&#128465;</span>Delete</button>' : ''}
          <a data-song-export class="float-menu-item"><span class="float-menu-icon">&#128424;</span>Export</a>
          ${editable ? '<a data-song-edit class="float-menu-item"><span class="float-menu-icon">&#9998;</span>Edit</a>' : ''}
          <span class="float-menu-item float-menu-toggle"><button type="button" class="float-menu-icon">+</button></span>
        `;
        document.querySelector('#song .float-menu').innerHTML = floatMenu;
      }

      // Build song HTML
      let songHtml = `
        <song class="${songElClassList.join(' ')}" 
              data-rev="${song._rev}" 
              rev-info="${window.users[song.editedBy] || song.editedBy.slice(2)}: ${formatDate(song.edited)}"
              data-id="${song._id}" 
              data-user-fav="${window.user.fav_songs.includes(song._id) ? 'true' : 'false'}">
          <div class="column_header title" id="song_header">
            <stitle><a data-song class="title_link">${song.title}</a></stitle>
            <span class="buttonsRight">
              ${song_rev ? `${canEdit(window.song) ? `<button onclick="restoreSongRev('${escapeHtml(song._rev)}')" class="btn btn-tiny" title="Make this the current version">↶ Restore</button>` : ''}<button onclick="this.closest('song').remove()" class="close-icon">&times;</button>` : `
                <span class="star" onclick="event.stopPropagation(); toggleFavorite(this.closest('song').dataset.id,'fav_songs')"></span>
                <info onclick="event.stopPropagation(); loadInfo();"></info>
                <span class="fsButton" onclick="toggleFullscreen(this)"></span>
              `}
            </span>
          </div>
          ${deleted ? `<p class="deleted-note">Deleted${song.deletedBy ? ' by ' + escapeHtml(window.users?.[song.deletedBy] || song.deletedBy.replace(/^u-/, '')) : ''}${song.deletedAt ? ', ' + formatDate(song.deletedAt) : ''}.
            ${song.deletedAt && canEdit(song) ? `<button class="btn btn-tiny" onclick="restoreOpenSong(this)">↶ Restore</button>` : ''}</p>` : ''}
          <authors><author>${song.authors.join('</author>, <author>')}</author></authors>
          <scripture_ref><scrip_ref>${song.scripture_ref.join('</scrip_ref>, <scrip_ref>')}</scrip_ref></scripture_ref>
          ${!song_rev ? `<span id="keyToggleContainer"><span id="keyToggleFilter">` : ''}<key>${song.key}</key>${!song_rev ? `<button id="keyToggle" type="button" aria-expanded="false" title="Change the key">Key: <b class="key-name">${escapeHtml(song.key)}</b><span class="chevron" aria-hidden="true"></span></button><label class="chord-switch" hidden><input type="checkbox" id="chordSwitch"><span class="switch-track" aria-hidden="true"></span>Chords</label></span></span>` : ''}
          <categories><cat>${song.categories.sort().join('</cat>, <cat>')}</cat></categories>
          <cclis>${(song.cclis ? (!isNaN(song.cclis) ? 'CCLI Song #: '+song.cclis : 'In CCLI') : '')}</cclis>
          <introduction>${song.introduction}</introduction>
      `;

      // Add song content chunks
      song.content.forEach(chunk => {
        songHtml += `<chunk type="${chunk[0].type.toLowerCase()}">`;
        chunk[1].forEach(line => {
          songHtml += `<line>${line}</line>`;
        });
        songHtml += '</chunk>';
      });

      songHtml += `<copyright>${song.copyright}</copyright></song>`;

      // Insert song HTML
      const songContainer = document.querySelector('#song .content');
      if (song_rev && !document.querySelector(`[data-rev="${song_rev}"]`)) {
        songContainer.insertAdjacentHTML('beforeend', songHtml);
      } else if (!song_rev) {
        songContainer.innerHTML = songHtml;
      } else {
        document.querySelectorAll(`song[data-rev="${song._rev}"]`).forEach(el => {
          el.classList.add('current_rev');
        });
        if (document.getElementById('dialog').style.display === "block" && document.getElementById('dialog').dataset.use === "info") {
          loadInfo();
        }
        return;
      }
      
      const urlRegex = /(((http|https|ftp):\/\/)*[\w?=&.\/-;#~%-]+\.[\w?=&.\/-;#~%-]+(?![\w\s?&.\/;#~%"=-]*>))/g;
      const commentChunks = document.querySelectorAll(`song[data-rev="${song._rev}"] chunk[type="comment"]`);

      commentChunks.forEach(function(chunk) {
        chunk.innerHTML = chunk.innerHTML.replace(urlRegex, '<a href="$1" target="_blank">$1</a> ');
      });

      // Set YouTube links
      const songEl = document.querySelector(`song[data-rev="${song._rev}"]`);
      let regex = /(https?:\/\/)?(?:www\.)?(youtu(?:\.be\/([-\w]+)|be\.com\/watch\?v=([-\w]+)))\w/g;
      const textContent = songEl.textContent;
      window.youtube_links = textContent.match(regex) || [];
      if (window.youtube_links.length > 0 && !song_rev) {
        const keyElement = songEl.querySelector('key');
        const youtubeButton = document.createElement('button');
        youtubeButton.className = 'btn';
        youtubeButton.style.cssText = 'padding: 5px 8px; margin-top: 0; margin-bottom: 0; background-color: var(--highlight-color);';
        youtubeButton.textContent = '▶';
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
      if (song._deleted) {
        if (window.song?._versions) { // a deleted revision: take it out of the list and step past it
          const list = window.song._versions.list;
          const at = list.findIndex(version => version.rev === song._rev);
          if (at !== -1) list.splice(at, 1);
          if (list[at]) loadSong(song_id, list[at].rev).catch(() => {});
        }
        resolve('song_loaded');
      } else {
        await createSongHtml(song);
      }
    } catch (err) {
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
  let complete = !db.name.endsWith('(remote)'); // a local database has everything on this device
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
  if (typeof doc.search === 'string') {
    doc.search = doc.search.replace(/editedBy:[^\0]*\0/, `editedBy:${ownName().replace(/\s+/g, ' ')}\0`);
  }
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
    if (typeof restored.search === 'string') restored.search = restored.search.replace(/addedBy:[^\0]*\0/, `addedBy:${now.addedBy.replace(/^u-/, '')}\0`);
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
  const songs = (v.songrefs || []).map(ref => ref.id === 'section' ? `— ${ref.title || 'Section'} —` : (titles.get(ref.id) || ref.id));
  return `<p><b>${escapeHtml(v.title || '')}</b></p><ol>${songs.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`;
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
    (v.songrefs || []).forEach(ref => ref.id !== 'section' && ids.add(ref.id));
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
        ${mayRestore && !entry.deleted ? `<button type="button" class="btn" data-restore="${i}">↶ Make this the current version</button>` : ''}
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
    .sort((a, b) => (a.doc.title || a.doc.name || a.doc._id).localeCompare(b.doc.title || b.doc.name || b.doc._id));
}

function backupItemKind(id) {
  return id.startsWith('sb-') ? 'songbook' : id.startsWith('s-') ? 'song' : id.startsWith('u-') ? 'profile'
    : id.startsWith('cfg-') ? 'export setup' : id.startsWith('c_') ? 'comments' : id === 'categories' ? 'category list' : 'other';
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
      if (typeof doc.search === 'string') doc.search = doc.search.replace(/addedBy:[^\0]*\0/, `addedBy:${owner.replace(/^u-/, '')}\0`);
      await saveWithHistory(savedByMe(doc));
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
      <button class="btn" data-id="${escapeHtml(t.id)}" data-rev="${escapeHtml(t.rev)}" onclick="restoreFromTrash(this)">↶ Restore</button>
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
    alert(`"${window.song.title}" cannot be deleted it is in the following songbooks:\n - ${sbs.map(sb => sb.doc.title).join('\n -')}`);
  }
  else if (confirm(`Are you sure you want to delete song:\n\n - ${window.song.title}?`)) {
    try {
      const doc = await db.get(song_id);
      window.deletingId = song_id; // our own delete: the change feed should not warn about it
      await saveWithHistory(deletedDoc(doc));
      window.location.hash = "#" + formatSbID(window.songbook._id);
      console.log("Deleted:", window.song.title);
    } catch (err) {
      console.error("Error deleting song:", err); 
      alert("An error occurred while deleting the song.");
    }
  }
}

async function deleteSongbook(songbook_id) {
  if (confirm(`Are you sure you want to delete songbook:\n\n - ${window.songbook.title}?`)) {
    try {
      const doc = await db.get(songbook_id);
      window.deletingId = songbook_id;
      await saveWithHistory(deletedDoc(doc));
      initializeSongbooksList();
      window.location.hash = '#songbooks';
      console.log("Deleted:", window.songbook.title);
    } catch (err) {
      console.error("Error deleting songbook:", err);
      alert("An error occurred while deleting the songbook.");
    }
  }
}

function saveSongbook(songbook_id, songbook_html = document.getElementById('songbook_content'), change_url = true) {
    if(document.getElementById('songbook_title').textContent.trim() === ''){
    alert('Please add a title before you save');
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
          document.querySelectorAll('.edit_buttons').forEach(el => el.remove());
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

    if (window.songbook_list) {
      window.songbook_list.clear();
    }

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
      return a.doc.title?.localeCompare(b.doc.title);
    });

    window.songbook.songrefs = result.rows.map(row => ({id: row.id, status: 'n'}));
    
    buildSongbookList(result.rows);
    setSongbookInfo(window.songbook);
    return 'loaded special songbook';
  }

  function handleNewSongbook() {
    // A fresh object, so the new book doesn't start with the last book's status and comment switches
    window.songbook = {title: '', _id: 'sb-new-songbook', songrefs: []};
    setSongbookInfo(window.songbook);
  }

  async function loadRegularSongbook(sbId) {
    const result = await db.get(sbId);
    window.songbook = result;

    const songIds = result.songrefs.map(row => row.id);

    const songResult = await db.allDocs({
      include_docs: true,
      keys: songIds
    });

    const songbookData = result.songrefs.map(item => {
      if (item.id === "section") return item;
      
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

function loadSongbookComments() {
  db.allDocs({
    include_docs: true,
    startkey: `c_${window.songbook._id}`,
    endkey: `c_${window.songbook._id}\ufff0`
  }).then(({rows}) => {
    // Add comment UI to all songs
    document.querySelectorAll('#songbook_content .list li:not([data-song-id="section"])').forEach(li => {
      if (!li.querySelector('.commentsContainer')) {
        li.insertAdjacentHTML('beforeend', `
          <div class="commentsContainer">
            <div class="comments"></div>
            <textarea class="comment" style="width:100%"></textarea>
            <button class="btn" onclick="addComment(this)">Add comment</button>
          </div>
        `);
      }
      if (!li.querySelector('.toggle_comment') && li.querySelector('a')) {
        li.querySelector('a').insertAdjacentHTML('afterend', 
          '<button class="toggle_comment" onclick="this.nextElementSibling.style.display=getComputedStyle(this.nextElementSibling).display===\'none\'?\'block\':\'none\'">💬</button>');
      }
    });

    // Populate existing comments
    rows.forEach(({doc: song}) => {
      const songId = song._id.match(/s-.*/)?.[0];
      // Every row for this song (a song can be in a book twice); add-song panel rows have no .comments
      document.querySelectorAll(`li[data-song-id="${songId}"]`).forEach(li => {
        const commentsBox = li.querySelector('.comments');
        if (!commentsBox) return;
        commentsBox.innerHTML = song.comments.map(commentHtml).join('');
        li.querySelector('.toggle_comment')?.setAttribute('data-comment-number', song.comments.length);
      });
    });
  }).catch(console.error);
}
// One comment as HTML; user and comment text are escaped since anyone with DB access can write them
function commentHtml(comment) {
  const when = new Date(comment.date).toLocaleTimeString(undefined, {
    weekday: 'long', year: 'numeric', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  return `<div><b>${escapeHtml(comment.user)} </b>${when}<pre>${escapeHtml(comment.comment)}</pre></div>`;
}
async function addComment(btn) {
  try {
    const comment = btn.previousElementSibling.value.trim();
    if (!comment) return alert('Please add some text! :)');

    const li = btn.closest('li');
    const commentId = `c_${window.songbook._id}_${li.dataset.songId}`;
    const newComment = {
      date: Date.now(),
      user: window.user._id,
      comment
    };

    try {
      const doc = await db.get(commentId);
      await db.put({...doc, comments: [...doc.comments, newComment]});
    } catch (err) {
      if (err.status === 404) {
        await db.put({_id: commentId, comments: [newComment]});
      } else {
        throw err;
      }
    }

    // Update UI
    btn.previousElementSibling.value = '';
    const commentsDiv = li.querySelector('.comments');
    if (commentsDiv) {
      commentsDiv.insertAdjacentHTML('beforeend', commentHtml(newComment));
      const toggle = li.querySelector('.toggle_comment');
      if (toggle) toggle.dataset.commentNumber = 
        (parseInt(toggle.dataset.commentNumber || 0) + 1);
    }

  } catch (err) {
    console.error('Failed to save comment:', err);
    notyf.error('Failed to save comment');
  }
}

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
    alert('Unauthorized access!');
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
      <button class="btn" onclick="${onclick}" style="background-color: var(--background-color);">Cancel</button>
      <button class="btn" onclick="saveRawDbObject(document.getElementById('${element.id}'));" style="background-color: var(--background-color);">Save</button>
    `;

    // Update DOM
    element.innerHTML = html;

    // Convert pre elements to editable textareas using toTextarea.js
    const chunks = Array.from(element.querySelectorAll('.toTextarea'));
    convertChunksToEditable(chunks);

  } catch (err) {
    console.error('Error loading raw object:', err);
    alert('Failed to load object');
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
      alert('Unauthorized access!');
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
    console.error("Error saving raw object:", error);
    alert('Failed to save object');
  }
}

function createExportCfg(){
  let configName = prompt("What do you want call your new config?");
  if(configName && configName != '') { 
    saveExport(configName);
  }
  blueHighlight(document.getElementById('export_new_config'));
}
async function deleteExportCfg(cfgId){
  try {
    const doc = await db.get(cfgId);
    if (confirm(`Are you sure you want to delete ${doc.name} config?`)) {
      await db.remove(doc);
      console.log("Deleted:", doc.name);
    }
  } catch (err) {
    console.error("Error deleting cfg:", err); 
    alert("An error occurred while deleting the cfg.");
  }
  prepExport();
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
    const info = await db.put(cfg);
    console.log("id of record: " + info.id);
    prepExport();
  } catch (err) {
    reportDbError(err, 'save this export setup');
  }
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

