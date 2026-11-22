function (newDoc, oldDoc, userCtx) {
  // Save rule for ycanta_live, the shared presentations (#51). Anyone can read (the database has no
  // members), so a TV or a phone can follow along with no account. Only someone signed in can share, and
  // only the person who started a share can change or end it. Records: set:CODE and now:CODE.
  var isAdmin = userCtx.roles.indexOf('_admin') !== -1;
  if (!userCtx.name) {
    throw({ unauthorized: 'Sign in to share a presentation.' });
  }
  if (oldDoc && oldDoc.owner !== userCtx.name && !isAdmin) {
    throw({ forbidden: 'Only the person sharing this presentation can change it.' });
  }
  if (newDoc._deleted) {
    return;
  }
  if (newDoc.owner !== userCtx.name && !isAdmin) {
    throw({ forbidden: 'A shared presentation must name you as its owner.' });
  }
  if (!/^(set|now):[A-Z0-9]{4,8}$/.test(newDoc._id)) {
    throw({ forbidden: 'Shared presentation records are named set:CODE or now:CODE.' });
  }
  if (newDoc.type !== (newDoc._id.indexOf('set:') === 0 ? 'live-set' : 'live-now')) {
    throw({ forbidden: 'This record has the wrong type.' });
  }
}
