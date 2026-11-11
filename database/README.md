# Server-side save rules

`validate.js` is the `validate_doc_update` function for each church database, stored as `_design/auth`.
CouchDB runs it on every save, including saves that arrive by sync, so the rules hold even outside the app.
`canEdit()` in `lib.js` should match it.

| Who | How the server knows | Can save |
|---|---|---|
| Server admin | CouchDB server admin | Anything |
| Church admin | Name in the database's `_security.admins`, or the older `<db>-admin` tag | Anything in that church, including this rule |
| Editor | Name in `_security.editors`, or the older `<db>-editor` tag | Any song, songbook, comment, and the category list |
| Everyone else in `_security.members` | | Their own songs and songbooks (`addedBy`), new comments of their own, their own export settings (`cfg-`) and profile (`u-`) |

Everyone in the church can also add **kept old versions** (`h-` docs, issue #138): before the app saves a song or
songbook, it saves a copy of the version being replaced, as `h-<doc id>|<revision number, 6 digits>-<revision hash>`.
Only songs and songbooks have them; the nightly backups (`../backups/`) cover everything else. The rule checks that the name matches the doc and
revision it says it copies, and that the person adding it is the one who replaced it. Only church admins
can change or remove one. Devices send these up but never download them (the app's sync uses the selector
`{"_id": {"$not": {"$regex": "^h-"}}}`); the "Old versions" window reads one doc's range from the server.

Anything else is refused with a message the app can show. The built-in "All Songs" and "Favorite Songs"
songbooks (`sb-allSongs`, `sb-favoriteSongs`) can never be saved.

## What it can't stop

- **A determined member using developer tools.** When a revision arrives by sync on a new branch of a
  document's history, CouchDB gives the rule no "old" version to compare with. A signed-in member who
  crafts such a revision can make their version of someone else's song the visible one. The original
  is kept as a conflict (`GET /db/doc?conflicts=true`), so nothing is lost and it can be put back.
  The rule stops mistakes and casual changes, not a member set on misusing their access.
- **Older account tags.** While an account has `<db>-editor` or `<db>-admin`, it keeps that level, even
  if the church's lists say less. Take the tag off the account to really lower someone.
- **Refused saves stay on the device.** The app says which item the server refused, but the refused
  version stays in that device's own copy (issue #139).

## Testing

`test-rule.mjs` checks every rule as every kind of user against a **local** CouchDB 3.3.3 (the version on the
live server). It deletes and recreates a `church_a` database and makes fake users, so never point it at
the live server.

```bash
COUCH_ADMIN_PASS=... node database/test-rule.mjs
```
