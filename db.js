//initialize global variable.
var db, syncHandler, remoteDb;
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
  //check access, admin different than user
  let info = await remoteDb.info();
  const userJS = await remoteDb.getUser(username);
  if(!userJS.roles.some((role) => role.startsWith(info.db_name))) {
    dbLogout();
    alert('you do not have access to this database');
    return;
  }
  window.roles = batman.roles.reduce((a, v) => ({ ...a, [v]: true}), {});
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
        
        // Update songbook favorites
        document.querySelectorAll('#songbooks .list li').forEach(li => {
          li.dataset.userFav = favSongbooks.includes(li.dataset.songbookId);
        });
        
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
          window.songbooks_list.reIndex();
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
          const message = error.name === 'unauthorized' || error.name === 'forbidden'
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
        await remoteDb.putIfNotExists(categories);
        window.user = await remoteDb.get('u-'+username);
        window.info = await remoteDb.info();
      } else {
        await db.putIfNotExists(user);
        await db.putIfNotExists(categories);
        window.user = await db.get('u-'+username);
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
        roles: window.roles
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
          await db.sync(remoteDb).on('change', (change) => {
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

      // Analytics: a failure here must never break login
      try {
        if(!localStorage.getItem('analyticID')) {
          localStorage.setItem('analyticID', crypto.randomUUID());
          logData('platform', getOS());
          logData('screenSize', getScreenSize());
          logData('touch', isTouchCapable());
          logData('darkMode', localStorage.getItem(window.user._id+'darkMode') || 'def');
          logData('fontSize', localStorage.getItem(window.user._id+'fontSize') || 'def');
          dysmyssable.info('yCanta has been updated to send information to help improve how it works. You can toggle this in settings.', 'var(--song-color)', '#'); // stays until closed, like production
        }

        logData('username', window.user._id);
        logData('connection', navigator.onLine ? "online" : "offline");

        if(window.loadData) {
          logData('loadTime', performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart);
          logData('installed', isInstalled());

          if(localStorage.getItem(window.user._id+'analytics') !== 'false') {
            // Not awaited, so login doesn't wait on a third-party lookup
            fetch('https://ipapi.co/json/')
              .then(response => response.json())
              .then(data => logData('location', `${data.country_name}, ${data.region}, ${data.city}`))
              .catch(error => console.error('Error fetching location:', error));
          }
          delete window.loadData;
        }
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
    }).on('change', function (change) {
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
      window.songbooks_list = new List('songbooks', options, values);
      window.songbooks_list.sort('user-fav', {order: 'desc', sortFunction: sortFavSongbooks});
      bindSearchToList(window.songbooks_list, '#songbooks');
      return 
    }
    buildSongbooksList(result.rows);
  }).catch(function(err){
    console.log(err);
  });
}

async function addAdminUser() {
  if (!remoteDb) {
    console.log("There is no remoteDb");
    return;
  }

  let users = await getAllUsers('adminSignup');
  if (users instanceof Error) {
    alert('You are offline perhaps! Error: ' + users.message);
    return;
  }

  const username = prompt('What Admin username do you want to add?');
  if (!username) return;

  if (users.admins.includes(username) || users.users.some(usr => usr.doc.name === username)) {
    alert(`${username} is already used by a user`);
    return;
  }

  const password = prompt('What password?');
  if (!password) return;
  const passwordAgain = prompt('Please enter it again.');
  if (password !== passwordAgain) {
    alert('Passwords did not match, please try again');
    return;
  }

  try {
    await remoteDb.signUpAdmin(username, password);
    await remoteDb.signUp(username, password, { roles: [window.dbName+"-admin"] });
    loadAllUsers();
    notyf.info(`Added Admin: ${username}`, 'green');
  } catch (err) {
    handleError(err);
  }
}

async function changeAdminPassword(username) {  // Pass user explicitly
  const password = prompt(`What do you want to change the password for ${username} to?`);
  if (!password) return;
  const passwordAgain = prompt('Please enter it again.');
  if (password !== passwordAgain) {
    alert('Passwords did not match, please try again');
    return;
  }
  try {
    if ('u-' + username === window.user._id) {  // Check against the passed currentUser
      const tempAdminName = username + '-temp3';
      const ajaxOpts = { ajax: { headers: { Authorization: null } } }; 

      const tempAdmin = await remoteDb.signUpAdmin(tempAdminName, 'brucewayne');
      
      // Ensure temp admin login is successful BEFORE logging out the current user
      ajaxOpts.ajax.headers.Authorization = getBasicAuthHeader(tempAdminName, 'brucewayne');
      await remoteDb.logOut(); // Now logout the original user
      await remoteDb.logIn(tempAdminName, 'brucewayne', ajaxOpts); 

      await remoteDb.deleteAdmin(username);
      await remoteDb.signUpAdmin(username, password); 
      await remoteDb.logOut();

      ajaxOpts.ajax.headers.Authorization = getBasicAuthHeader(username, password); // Use original username and new password
      await remoteDb.logIn(username, password, ajaxOpts);
      await remoteDb.deleteAdmin(tempAdminName);

      let localStorageUser = JSON.parse(localStorage.getItem('loggedin'));
      localStorageUser.pwd = password;
      localStorage.setItem('loggedin',JSON.stringify(localStorageUser));
    } else {
      await remoteDb.deleteAdmin(username);
      await remoteDb.signUpAdmin(username, password); 
    }
    
    loadAllUsers();
    notyf.info(`Password changed for Admin: ${username}`, 'olive');

  } catch (err) {
    handleError(err); 
  }
}

async function deleteAdminUser(username) { // Pass current user explicitly
  // Ensure the user isn't trying to delete themselves
  if ('u-' + username === window.user._id) {
    alert('You cannot delete your own admin account. Try logging in as a different admin.');
    return;
  }

  // Confirm deletion
  if (!confirm(`Are you sure you want to delete Admin: ${username}?`)) {
    console.log('Decided not to delete them');
    return;
  }

  try {
    await remoteDb.deleteAdmin(username);
    await remoteDb.deleteUser(username);

    loadAllUsers();
    notyf.info(`Admin: ${username} deleted`, 'red');

  } catch (err) {
    handleError(err);
  }
}

async function addUser() {
  let users = await getAllUsers("userSignup");
  if (users instanceof Error) {
    alert("You are offline perhaps! Error: " + users.message);
    return;
  }

  const username = prompt("What username do you want to add?");
  if (!username) return;

  if (users.admins.includes(username) || users.users.some((usr) => usr.doc.name === username) ) {
    alert(`${username} is already a user in your database`);
    return;
  }

  const password = prompt("What password?");
  if (!password) return;
  const passwordAgain = prompt("Please enter it again.");
  if (password !== passwordAgain) {
    alert("Passwords did not match, please try again");
    return;
  }

  const viewerName = window.dbName + "-viewer";

  try {
    await remoteDb.signUp(username, password, { roles: [viewerName] });
  } catch (err) {
    if (err.name === "conflict") {
      try {
        const userJS = await remoteDb.getUser(username);
        const roles = { roles: userJS.roles.concat([viewerName]) };
        await remoteDb.putUser(username, roles);
        alert("This user already exists but did not have access to this database. They have been added. Their password was not changed.");
      } catch (updateErr) {
        handleError(updateErr); // Handle errors during role update
      }
    } else {
      handleError(err); // Handle other errors
    }
  }
  notyf.info(`Added ${username}`, 'green');
  loadAllUsers();
}

async function toggleUserEditor(username, editor) { // Pass dbName explicitly
  try {
    const userJS = await remoteDb.getUser(username);
    const editorName = window.dbName + "-editor"; 

    let roles;
    if (editor) {
      roles = Array.from(new Set(userJS.roles.concat([editorName]))); // Avoid duplicates
    } else {
      roles = userJS.roles.filter((e) => e !== editorName);
    }

    await remoteDb.putUser(username, { roles });  // Use async/await consistently
    
    loadAllUsers();
    notyf.info(`Updated ${username}`, 'green');

  } catch (err) {
    handleError(err); 
  }
}

async function changeUserPassword(username) {
  const password = prompt(`What do you want to change the password for ${username} to?`);
  if (!password) return;

  const passwordAgain = prompt("Please enter it again.");
  if (password !== passwordAgain) {
    alert("Passwords did not match, please try again");
    return;
  }

  try {
    await remoteDb.changePassword(username, password);
    if ('u-' + username === window.user._id) {  // Check against the passed currentUser also check if we are on memory version
      let localStorageUser = JSON.parse(localStorage.getItem('loggedin'));
      localStorageUser.pwd = password;
      localStorage.setItem('loggedin',JSON.stringify(localStorageUser));
      location.reload();
    }
    notyf.info(`Password changed for ${username}`, "olive");
  } catch (err) {
    handleError(err); 
  }
}

async function deleteUser(username) {
  const response = confirm(`Are you sure you want to remove ${username}?`);
  if (!response) return; 

  try {
      const userJS = await remoteDb.getUser(username);
      const roles = userJS.roles.filter(e => !e.includes(window.dbName)); // Create a new array

      await remoteDb.putUser(username, { roles });
      loadAllUsers();
      notyf.info(`Removed user: ${username}`, 'red');
  } catch (err) {
      handleError(err);
  }
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
    setSongbookInfo({title: '', _id: 'sb-new-songbook'});
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
        songDoc.status = item.status;
        return songDoc;
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

