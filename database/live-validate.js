function (newDoc, oldDoc, userCtx) {
  // Save rule for ycanta_live, the shared presentations (#51). Anyone can read (the database has no
  // members), so a TV or a phone can follow along with no account. Only someone signed in can write:
  //   set:CODE        only the person sharing (its owner)
  //   now:CODE        the owner, or the leader the owner handed the screens to (its "driver"). That leader
  //                   can keep the screens or give them back, not pass them on. Only the owner can end it.
  //   lead:CODE:name  a signed-in leader following along; only that person
  //   sug:CODE:id     a suggested song: anyone, signed in or not, can send one (it can't be changed after);
  //                   someone signed in answers it once (yes or no) or takes it away
  var isAdmin = userCtx.roles.indexOf('_admin') !== -1;
  var id = newDoc._id;
  if (/^sug:[A-Z0-9]{4,8}:[a-z0-9]{6,24}$/.test(id)) {
    if (!oldDoc) {
      if (newDoc._deleted) {
        return;
      }
      if (newDoc.type !== 'live-sug' || typeof newDoc.text !== 'string' || !newDoc.text.trim() || newDoc.text.length > 120) {
        throw({ forbidden: 'A suggestion is a song name, up to 120 letters.' });
      }
      if (newDoc.name !== undefined && (typeof newDoc.name !== 'string' || newDoc.name.length > 40)) {
        throw({ forbidden: 'A name is up to 40 letters.' });
      }
      if (newDoc.status !== 'new' || newDoc.by !== undefined) {
        throw({ forbidden: 'A new suggestion has not been answered yet.' });
      }
      return;
    }
    if (!userCtx.name) {
      throw({ unauthorized: 'Sign in to answer a suggestion.' });
    }
    if (newDoc._deleted) {
      return;
    }
    if (newDoc.type !== oldDoc.type || newDoc.text !== oldDoc.text || newDoc.name !== oldDoc.name || newDoc.at !== oldDoc.at) {
      throw({ forbidden: 'A suggestion can be answered, not changed.' });
    }
    if (oldDoc.status !== 'new') {
      throw({ forbidden: 'Someone already answered this suggestion.' });
    }
    if ((newDoc.status !== 'yes' && newDoc.status !== 'no') || newDoc.by !== userCtx.name) {
      throw({ forbidden: 'An answer is yes or no, with your name.' });
    }
    return;
  }
  if (!userCtx.name) {
    throw({ unauthorized: 'Sign in to share a presentation.' });
  }

  var lead = /^lead:[A-Z0-9]{4,8}:/.exec(id);
  if (lead) {
    if (id.slice(lead[0].length) !== userCtx.name && !isAdmin) {
      throw({ forbidden: 'A leader record can only be your own.' });
    }
    if (newDoc._deleted) {
      return;
    }
    if (newDoc.type !== 'live-lead' || newDoc.owner !== userCtx.name) {
      throw({ forbidden: 'A leader record names you as its owner.' });
    }
    return;
  }

  if (!/^(set|now):[A-Z0-9]{4,8}$/.test(id)) {
    throw({ forbidden: 'Shared presentation records are named set:CODE, now:CODE, lead:CODE:name or sug:CODE:id.' });
  }
  if (oldDoc) {
    var isOwner = oldDoc.owner === userCtx.name;
    var isDriver = id.indexOf('now:') === 0 && oldDoc.driver === userCtx.name;
    if (!isOwner && !isDriver && !isAdmin) {
      throw({ forbidden: 'Only the person sharing this presentation, or the leader they handed it to, can change it.' });
    }
    if (newDoc._deleted) {
      if (!isOwner && !isAdmin) {
        throw({ forbidden: 'Only the person sharing this presentation can end it.' });
      }
      return;
    }
    if (newDoc.owner !== oldDoc.owner && !isAdmin) {
      throw({ forbidden: 'A shared presentation keeps its owner.' });
    }
    if (!isOwner && !isAdmin && newDoc.driver !== userCtx.name && newDoc.driver !== oldDoc.owner) {
      throw({ forbidden: 'A leader can keep the screens or give them back, not pass them on.' });
    }
  } else {
    if (newDoc._deleted) {
      return;
    }
    if (newDoc.owner !== userCtx.name && !isAdmin) {
      throw({ forbidden: 'A shared presentation must name you as its owner.' });
    }
  }
  if (newDoc.type !== (id.indexOf('set:') === 0 ? 'live-set' : 'live-now')) {
    throw({ forbidden: 'This record has the wrong type.' });
  }
}
