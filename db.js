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
async function checkRemoteDBandSyncHandler(){
  if(!db) {
    console.log('no db!')
    notyf.info('Logging out, something broke!', 'red');
    dbLogout();
  }
  //get user from local db, pwd, and remote url...
  let user = await db.get('_local/'+window.user._id);
  let pwd = user.pwd;
  let username = user._id.slice(9);
  let remote_url = user.remote_url;

  if(!remoteDb && remote_url) {
    console.log('setting up remoteDb')
    await loginRemoteDb(remote_url, username, pwd);
  }
  if(!syncHandler && remote_url) {
    console.log('setting up sync handler')
    await setUpSyncHandler();
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
        if (isOpen) { // someone deleted the song we're looking at (or editing): leave it, as production did
          window.songEditing = false;
          notyf.error('This song was deleted', 'red');
          window.location.hash = '#' + formatSbID(window.songbook?._id || 'sb-allSongs');
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
          });
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
      }

      // Reload all songs view if needed
      if (window.songbook?._id === 'sb-allSongs') {
        window.songbook._id = '';
        loadSongbook('sb-allSongs');
      }
    } 
    // Songbook changes
    else if (change.doc._id.startsWith('sb-')) {
      const isCurrentSongbook = window.songbook?._id === change.doc._id && 
                              (document.body.classList.contains('songList') || 
                               document.body.classList.contains('song'));

      if (isCurrentSongbook) {
        window.songbook = '';
        loadSongbook(change.doc._id);
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
        window.songbooks_list.get('songbook-id', change.doc._id)
          .forEach(songbook => {
            songbook.values(mapSongbookRowToValue(change));
          });
        window.songbooks_list.sort('user-fav', {order: 'desc', sortFunction: sortFavSongbooks});
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
          loadSongbook('sb-favoriteSongs');
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
          await loginRemoteDb(remote_url, username, pwd);
          await takeNextStep(username, dbName);
        } else {
          const localUser = await db.get('_local/u-'+username);
          if (localUser.pwd === pwd) {
            window.roles = localUser.roles;
            window.church = localUser.church; // what the church's lists said at the last online login
            notyf.info('Offline login successful', 'green');
            await takeNextStep(username, dbName);
          } else {
            throw new Error('Offline login failed');
          }
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
    
    if(error.name === 'unauthorized' || error.name === 'forbidden') {
      alert('Username or Password are incorrect');
    } else {
      alert(error.message || 'There was an error during login');
    }
    
    return false;
  }

  async function takeNextStep(username, dbName) {
    // Initialize window objects
    window.songbook = {};
    window.song = {};
    
    const categories = {
      _id: 'categories',
      categories: ["Adoration", "Aspiration/Desire", "Assurance", "Atonement", "Awe", "Bereavement", "Brokenness", "Calvary", "Christ as Bridegroom", "Christ as King", "Christ as Lamb", "Christ as Redeemer", "Christ as Savior", "Christ as Shepherd", "Christ as Son", "Christ's Blood", "Christ's Return", "Church as Christ's Body", "Church as Christ's Bride", "Church as God's House", "Cleansing", "Comfort", "Commitment", "Compassion", "Condemnation", "Consecration", "Conviction of Sin", "Courage", "Creation", "The Cross", "Dedication/Devotion", "Dependence on God", "Encouragement", "Endurance", "Eternal Life", "Evangelism", "Faith", "Faithfulness", "Fear", "Fear of God", "Fellowship", "Forgiveness", "Freedom", "God as Creator", "God as Father", "God as Friend", "God as Refuge", "God's Creation", "God's Faithfulness", "God's Glory", "God's Goodness", "God's Guidance", "God's Harvest", "God's Holiness", "God's Love", "God's Mercy", "God's Power", "God's Presence", "God's Strength", "God's Sufficiency", "God's Timelessness", "God's Victory", "God's Wisdom", "God's Word", "Godly Family", "Grace", "Gratefulness", "Healing", "Heaven", "Holiness", "Holy Spirit", "Hope", "Humility", "Hunger/Thirst for God", "Incarnation", "Invitation", "Jesus as Messiah", "Joy", "Kingdom of God", "Knowing Jesus", "Lordship of Christ", "Love for God", "Love for Jesus", "Love for Others", "Majesty", "Meditation", "Mercy", "Missions", "Mortality", "Neediness", "New Birth", "Obedience", "Oneness in Christ", "Overcoming Sin", "Patience", "Peace", "Persecution", "Praise", "Prayer", "Proclamation", "Provision", "Purity", "Purpose", "Quietness", "Redemption", "Refreshing", "Repentance", "Rest", "Resurrection", "Revival", "Righteousness", "Salvation", "Sanctification", "Security", "Seeking God", "Service", "Servanthood", "Sorrow", "Spiritual Warfare", "Submission to God", "Suffering for Christ", "Surrender", "Temptation", "Trials", "Trust", "Victorious Living", "Waiting on God", "Worship", "-----", "Christmas", "Easter", "Good Friday", "Thanksgiving", "-----", "Baptism", "Birth", "Closing Worship", "Communion", "Death", "Engagement", "Opening Worship", "Table Songs", "Wedding", "-----", "Children's Songs", "Rounds", "Scripture Reading", "Scripture Songs", "-----", "Needs Work", "Needs Chord Work", "Needs Categorical Work", "Duplicate", "-----", "Norway", "Secular", "Delete", "Spanish words", "Celebration", "Add category", "Palm Sunday", "God's Holiness"]
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

      setLoginState();

      // Setup sync for remote databases
      if(navigator.onLine && db.name.endsWith('(remote)')) {
        console.log('doing a onetime sync...');
        let startTime = new Date();
        
        try {
          await db.sync(remoteDb).on('denied', reportDenied).on('change', (change) => {
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
        } catch (error) {console.log(error)}
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
      document.documentElement.classList.toggle('churchAdmin', !!window.church?.admin);
      document.documentElement.classList.toggle('churchEditor', !!window.church?.editor);

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
      console.error('Error in takeNextStep:', error);
      return false;
    }
  }
}
function setUpSyncHandler() {
  try {
    syncHandler = db.sync(remoteDb, {
      live: true,
      retry: true
    }).on('denied', reportDenied).on('change', function (change) {
      console.log('Synced some stuff', parseInt(parseInt(change.change.last_seq.split('-')[0].replace('-',''))/parseInt(info.update_seq.replace('-',''))*100)+'%');
      // yo, something changed!
    }).on('paused', function (info) {
      // replication was paused, usually because of a lost connection
    }).on('active', function (info) {
      // replication was resumed
    }).on('complete', function (err) {
      //replication canceled
      console.log('complete');
    });
    notyf.info('Sync established', 'green');
  }
  catch(err) {
    if(err.name == 'unauthorized' || err.name == 'forbidden'){
      console.log(err)
      alert('Username or Password are incorrect');
    }
    else {
      console.log(err) // totally unhandled error (shouldn't happen)
    }
    dbLogout();
  }
}
async function dbLogout() {
  if (!confirmWhenEditing()) {
    try {
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
    console.log(err);
  });
}

// ---- Church access and people ----
// Each church database lists its own people in its security settings: "admins" (church admins),
// "members" (everyone who may open it) and "editors" (members who may change anyone's songs). The
// server enforces the same lists on every save with _design/auth (couchdb/validate.js); canEdit()
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
    const url = new URL(remoteDb.getUsersDatabaseUrl().replace(/_users\/?$/, '_node/_local/_config/admins'));
    url.username = '';
    url.password = '';
    const res = await fetch(url.href, {
      cache: 'no-store',
      headers: { Authorization: getBasicAuthHeader(window.user._id.slice(2), ownPassword()) },
    });
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
  const me = window.user._id.slice(2);
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
  if (oldTags.length) {
    html += `<p class="old-tags"><small>Also let in by older account tags: ${oldTags.map(escapeHtml).join(', ')}. Someone with one of these tags keeps that access even if they're removed or set lower here, until the tag comes off their account.</small></p>`;
  }
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

// The password this person signed in with (kept in memory only, see loginRemoteDb)
function ownPassword() {
  if (!sessionPwd) throw new Error('Please sign out and sign in again first.');
  return sessionPwd;
}

async function callAccountsHelper(body) {
  return postToHelper({ ...body, db: window.church.db, adminName: window.user._id.slice(2), adminPassword: ownPassword() });
}

// Your own account (CouchDB 3 doesn't let regular users read or change their own account record)
async function callOwnAccount(body) {
  return postToHelper({ ...body, name: window.user._id.slice(2), ownPassword: ownPassword() });
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
  const usersUrl = new URL(remoteDb.getUsersDatabaseUrl());
  usersUrl.username = '';
  usersUrl.password = '';
  const res = await fetch(usersUrl.href + '/_all_docs?include_docs=true&startkey="org.couchdb.user:"&endkey="org.couchdb.user:\ufff0"', {
    cache: 'no-store',
    headers: { Authorization: getBasicAuthHeader(window.user._id.slice(2), ownPassword()) },
  });
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

// Server admins: is couchdb/validate.js this church's save rules (_design/auth)?
// { state: 'latest' | 'outdated' | 'missing' | 'unknown', source, rev }
async function saveRulesStatus() {
  const same = (a, b) => (a || '').replace(/\r\n/g, '\n').trim() === (b || '').replace(/\r\n/g, '\n').trim();
  try {
    const source = await (await fetch('couchdb/validate.js', { cache: 'no-store' })).text();
    if (!source.trim().startsWith('function')) throw new Error('Could not load couchdb/validate.js');
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

// Server admins: install couchdb/validate.js as this church's save rules
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

// The server refused something this device saved (see couchdb/validate.js). Say so once per doc.
const deniedShown = new Set();
async function reportDenied(event) {
  const err = event?.doc || event || {}; // sync wraps the refusal as {direction, doc}
  const id = err.id || err._id || '';
  if (deniedShown.has(id)) return;
  deniedShown.add(id);
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

function handleError(err){
  if (err.name === 'not_found') {
    alert('You do not have permission to see this user');
  } else if(err.name ==='conflict') {
    alert('That already exists');
  } else if(!navigator.onLine){
    alert('you are offline, try again when you are reconnected');
  } else {
    console.error("An unexpected error occurred:", err); // Log detailed error
    alert(
      `Sorry, something went wrong: ${err.message}`
    );
  }
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

      try {
        const result = await db.put(song);
        console.log('saved:', song.title);
        
        if (change_url) {
          window.location.hash = `#${formatSbID(window.songbook._id)}&${song._id}`;
        }
        
        resolve(song._id);
        logData('edited', song._id);
      } catch (err) {
        if (new_song) {
          song._id += Math.random().toString(36).substring(7, 9);
          console.log(song._id);
          await db.put(song);
        }
        console.log(err, song.title);
        resolve(song._id);
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
        addSongToSongbook(song._id);
      } catch (err) {
        console.error(err);
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
        console.error(err);
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
      console.log(err);
      resolve(song_id);
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
      const songElClassList = [];
      if (deleted) songElClassList.push('deleted');
      if (song_rev) {
        songElClassList.push('revision', 'current_rev');
        document.body.classList.add('revision');
      }

      // Build float menu if not a revision
      let floatMenu = '';
      if (!song_rev) {
        const editable = canEdit(song);
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
              ${song_rev ? `<button onclick="this.closest('song').remove()" class="close-icon">&times;</button>` : `
                <span class="star" onclick="event.stopPropagation(); toggleFavorite(this.closest('song').dataset.id,'fav_songs')"></span>
                <info onclick="event.stopPropagation(); loadInfo();"></info>
                <span class="fsButton" onclick="toggleFullscreen(this)"></span>
              `}
            </span>
          </div>
          <authors><author>${song.authors.join('</author>, <author>')}</author></authors>
          <scripture_ref><scrip_ref>${song.scripture_ref.join('</scrip_ref>, <scrip_ref>')}</scrip_ref></scripture_ref>
          ${!song_rev ? `<span id="keyToggleContainer"><span id="keyToggleFilter">` : ''}<key>${song.key}</key>${!song_rev ? `<button id="keyToggle" onclick="this.parentElement.parentElement.classList.toggle('active')">↑↓</button></span></span>` : ''}
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
        Transposer(document.querySelector('#keyToggle'));
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
      
      const song = await db.get(song_id, options);
      if (song._deleted) {
        if (window.song?._revs_info) {
          window.song._revs_info = window.song._revs_info.filter(rev => rev.rev !== song._rev); //remove deleted revision
        }
        prevSongRev();
      } else {
        await createSongHtml(song);
      }
    } catch (err) {
      console.error("Error loading song:", err);
      if (err.status === 404) {
        // Song not found - show error message and redirect
        notyf.error(`Song not found (ID: ${song_id})`, 'red');
        window.location.hash = '#' + formatSbID(window.songbook._id);
      } else {
        notyf.error('Error loading song', 'red');
        reject(err);
      }
    }
  });
}
async function deleteSong(song_id) {
  let sbs = await songInSongbooks(song_id);
  if(sbs.length) {
    alert(`"${window.song.title}" cannot be deleted it is in the following songbooks:\n - ${sbs.map(sb => sb.doc.title).join('\n -')}`);
  }
  else if (confirm(`Are you sure you want to delete song:\n\n - ${window.song.title}?`)) {
    try {
      const doc = await db.get(song_id);
      window.deletingId = song_id; // our own delete: the change feed should not warn about it
      await db.remove(doc);
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
      await db.remove(doc);
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

      try {
        const result = await db.put(songbook);
        window.songbook = songbook;
        console.log('saved:', songbook.title);

        if (change_url) {
          window.location.hash = `#${window.songbook._id}`;
          document.querySelectorAll('.edit_buttons').forEach(el => el.remove());
          initializeSongbooksList();
        }

        resolve(window.songbook._id);
        logData('edited', songbook._id);
      } catch (err) {
        console.error('Error saving songbook:', err);
        
        if (new_songbook) {
          // Retry with modified ID if new songbook fails
          songbook._id += Math.random().toString(36).substring(7, 9);
          console.log('Retrying with new ID:', songbook._id);
          try {
            await db.put(songbook);
            resolve(window.songbook._id);
          } catch (retryErr) {
            console.error('Retry failed:', retryErr);
            resolve('save_failed');
          }
        } else {
          resolve('save_failed');
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
      await loadSongbookContent(songbook);
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
      await loadSongbookContent(songbook);
      return;
    }

    // Existing songbook case
    try {
      const songbook = await db.get(songbook_id);
      songbook.edited = new Date().getTime();
      songbook.editedBy = window.user._id;
      await loadSongbookContent(songbook);
    } catch (err) {
      console.error('Error loading songbook:', err);
      resolve('load_failed');
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
    console.error('Error loading songbook:', err);
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
    toggleFavorite(song_id, 'fav_songs');
  }
  else if(songbook_id == 'sb-allSongs') {
    // do nothing because the db.changes function should update the allSongs songbook
  }
  else {
    db.get(songbook_id).then(function(songbook){
      songbook.songrefs.push({
        "id": song_id,
        "status":"n",
        "key":"Am",
        "comments":[
          "Hi"
        ]
      });
      db.put(songbook).then(function(result) {
        console.log('Successfully added song to '+songbook.title+'!');
      });
    }).catch(function(err){
      console.log(err);
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
function saveExport(name) {
  let opts = serializeForm('export_form');
  let cfg = {
    _id: 'cfg-'+window.exportObject._id+window.user._id+(name != '' ? ':'+name.replaceAll(/[^A-Za-z0-9 -]/g, "") : ''),
    cfg: opts,
    name: name
  }
  db.get(cfg._id).then(function(_doc) {
    console.log('updating');
    cfg._rev = _doc._rev;
    return db.put(cfg);
  }).catch( function (error) {
    console.log('adding');
    return db.put(cfg);
  }).then(function(info){
    console.log("id of record: " + info.id);
    prepExport();
  });
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
    console.log(err);
  }
}

