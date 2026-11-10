function (newDoc, oldDoc, userCtx, secObj) {
  // yCanta: who may save what in one church's database. CouchDB runs this on every save, including sync.
  // The same function goes into every church database, as _design/auth. canEdit() in lib.js mirrors it.
  var name = userCtx.name;
  var roles = userCtx.roles || [];
  var db = userCtx.db;
  var id = newDoc._id;
  var me = 'u-' + name;

  function has(list, value) { return !!list && list.indexOf(value) !== -1; }
  function inGroup(group) { // a {names, roles} list from the church's security settings
    if (!group) return false;
    if (has(group.names, name)) return true;
    for (var i = 0; i < (group.roles || []).length; i++) {
      if (has(roles, group.roles[i])) return true;
    }
    return false;
  }
  function endsWith(text, end) { return text.length >= end.length && text.slice(-end.length) === end; }
  function no(message) { throw({ forbidden: message }); }

  // "All Songs" and "Favorite Songs" are built into the app, never saved
  if (id === 'sb-allSongs' || id === 'sb-favoriteSongs') no('That songbook is built in and can\'t be saved.');

  // Church admins: server admins, names in the church's admins list, or the older "<db>-admin" tag
  if (has(roles, '_admin') || inGroup(secObj.admins) || has(roles, db + '-admin')) return;
  if (!name) no('Please log in to save.');

  // Editors: names in the church's editors list, or the older "<db>-editor" tag
  var isEditor = inGroup(secObj.editors) || has(roles, db + '-editor');

  // Songs and songbooks: editors change any; everyone else only the ones they added
  if (/^(s|sb)-/.test(id)) {
    if (isEditor) return;
    var addedBy = oldDoc ? oldDoc.addedBy : newDoc.addedBy;
    if (addedBy !== me) no('Only editors can change a song or songbook someone else added.');
    if (!newDoc._deleted && newDoc.addedBy !== me) no('A song or songbook you add has to list you as the one who added it.');
    return;
  }

  // Comments: everyone can add their own; only editors change or remove them
  if (id.indexOf('c_') === 0) {
    if (isEditor) return;
    if (newDoc._deleted) no('Only editors can remove comments.');
    if (!Array.isArray(newDoc.comments)) no('Comments have to be a list.');
    var before = (oldDoc && !oldDoc._deleted && oldDoc.comments) || [];
    var after = newDoc.comments || [];
    if (after.length < before.length) no('Only editors can remove comments.');
    for (var i = 0; i < after.length; i++) {
      if (i < before.length) {
        if (JSON.stringify(after[i]) !== JSON.stringify(before[i])) no('Only editors can change comments.');
      } else if (!after[i] || after[i].user !== me) {
        no('A new comment has to be your own.');
      }
    }
    return;
  }

  // Saved export settings: "cfg-<item><user>" or "cfg-<item><user>:<name>"; only their owner.
  // The app strips ":" from <name>, so the owner is whatever comes before the last ":" (unless that ":"
  // is inside the user name itself).
  if (id.indexOf('cfg-') === 0) {
    var cut = id.lastIndexOf(':');
    var unnamed = endsWith(id, me) && (cut === -1 || cut >= id.length - me.length);
    var named = cut !== -1 && endsWith(id.slice(0, cut), me);
    if (unnamed || named) return;
    no('Export settings can only be saved by the person they belong to.');
  }

  // Profiles and favorites: only your own
  if (id.indexOf('u-') === 0) {
    if (id === me) return;
    no('You can only change your own profile.');
  }

  // The category list: editors
  if (id === 'categories') {
    if (isEditor) return;
    no('Only editors can change the category list.');
  }

  no('Only church admins can save this.');
}
