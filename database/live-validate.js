function (newDoc, oldDoc, userCtx) {
  // Save rule for ycanta_live, the shared presentations (#51). Anyone can read (the database has no
  // members), so a TV or a phone can follow along with no account. Only someone signed in can write:
  //   set:CODE        only the person sharing (its owner)
  //   now:CODE        the owner, or the leader the owner handed the screens to (its "driver"). That leader
  //                   can keep the screens or give them back, not pass them on. Only the owner can end it.
  //   lead:CODE:name  a signed-in leader following along; only that person
  var isAdmin = userCtx.roles.indexOf('_admin') !== -1;
  var id = newDoc._id;
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
    throw({ forbidden: 'Shared presentation records are named set:CODE, now:CODE or lead:CODE:name.' });
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
