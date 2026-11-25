# Server-side save rules

`validate.js` is the `validate_doc_update` function for each church database, stored as `_design/auth`.
CouchDB runs it on every save, including saves that arrive by sync, so the rules hold even outside the app.
`canEdit()` in `lib.js` should match it.

| Who | How the server knows | Can save |
|---|---|---|
| Server admin | CouchDB server admin | Anything |
| Church admin | Name in the database's `_security.admins` | Anything in that church, including this rule |
| Editor | Name in `_security.editors` | Any song or songbook, and the category list; comments like everyone else |
| Everyone else in `_security.members` | | Their own songs and songbooks (`addedBy`), comments of their own, their own export settings (`cfg-`) and profile (`u-`) |

**Comments** (`c_` docs) work the same for everyone but church admins: you add your own, and edit or remove only your
own. A church admin removes any. Each new comment is its own doc, `c_<songbook>_<song>|<when>`; older ones share one
doc per song, `c_<songbook>_<song>`, with a `comments` list. Only a church admin deletes a comment doc: a removed
comment is kept with its words cleared and `removed: {by, date}`, so the replies after it still make sense.

Everyone in the church can also add **kept old versions** (`h-` docs, issue #138): before the app saves a song or
songbook, it saves a copy of the version being replaced, as `h-<doc id>|<revision number, 6 digits>-<revision hash>`.
Only songs and songbooks have them; the nightly backups (`../backups/`) cover everything else. The rule checks that the name matches the doc and
revision it says it copies, and that the person adding it is the one who replaced it. Only church admins
can change or remove one. Devices send these up but never download them (the app's sync uses the selector
`{"_id": {"$not": {"$regex": "^h-"}}}`); the "Old versions" window reads one doc's range from the server.

**Version groups** (`v-` docs, issue #90) link songs that are the same song in another language or another length.
Each is one record, `v-<time><random>`, with `songs: { "<song id>": "<who added that song>" }`. Being in a group counts
as part of each song, so the song rule holds: editors link and unlink any song; everyone else only songs they added.
A member can add their own song to a group that holds other people's songs, or take it back out, but can't start a
group with someone else's song, take someone else's song out, or join two groups that hold other people's songs. A
song is in at most one group: the app joins groups when a song in one is linked again, and offers to join them if two
devices offline each made one.

Anything else is refused with a message the app can show. The built-in "All Songs" and "Favorite Songs"
songbooks (`sb-allSongs`, `sb-favoriteSongs`) can never be saved.

## What it can't stop

- **A determined member using developer tools.** When a revision arrives by sync on a new branch of a
  document's history, CouchDB gives the rule no "old" version to compare with. A signed-in member who
  crafts such a revision can make their version of someone else's song the visible one. The original
  is kept as a conflict (`GET /db/doc?conflicts=true`), so nothing is lost and it can be put back.
  The rule stops mistakes and casual changes, not a member set on misusing their access.
- **Who added a song, in a version group.** The rule can't read other docs, so for `v-` docs it trusts the "who
  added" the app writes beside each song. A member using developer tools could claim someone else's song as their
  own there and link it. That only links songs; it can't change them.
- **Refused saves stay on the device.** The app says which item the server refused, but the refused
  version stays in that device's own copy (issue #139).

## Testing

`test-rule.mjs` checks every rule as every kind of user against a **local** CouchDB 3.3.3 (the version on the
live server). It deletes and recreates a `church_a` database and makes fake users, so never point it at
the live server.

```bash
COUCH_ADMIN_PASS=... node database/test-rule.mjs
```

## Shared presentations (#51)

A presentation can be shared with other devices by a short code (the presentation's setup panel, then
"Share with other devices"). Followers open `live.html` and need no account. Everything goes through one
server-wide database, `ycanta_live`. Each share has `set:CODE` (the title, settings and song order),
`part:CODE:0`, `part:CODE:1`, … (the songs, spread by song id) and `now:CODE` (the song and part on screen).
The songs are split because nginx in front of the live server turns down any upload over 1 MB, and a whole
church book (1,400+ songs) is several MB; each part is kept under 700 KB, and a changed song sends only its
part again. `live-validate.js` is its save rule: anyone can read, only someone signed in can share, and only
the person who started a share can change or end it.

**On the live server** (once, in Fauxton, as a server admin):

1. Make a database named `ycanta_live` (not partitioned).
2. Permissions: leave both Admins and Members empty. No members means anyone can read it.
3. Add a design doc `_design/live` with `validate_doc_update` set to the function in `live-validate.js`.
4. Keep only a few old versions of each record (every slide change is a new one): in a terminal,
   `curl -X PUT https://<server>/couch/ycanta_live/_revs_limit -d 10 -u <admin>`.
5. CORS: followers come from the same sites as the app, so the server's existing list should already cover
   them. Not checked on the live server yet.

Old shares are removed when the presenter stops sharing or closes the presentation. One left behind by a
closed laptop stays until someone deletes it; it does no harm.

**Locally**, `setup-live.mjs` does all of this (the seed runs it), `test-live.mjs` checks the rule, and
`tests/live-local.mjs` tries the whole thing in a browser: a presenter shares, a second tab follows.
