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

Anything else is refused with a message the app can show.

## Testing

`test-rule.mjs` checks every rule as every kind of user against a **local** CouchDB 3.3.3 (the version on the
live server). It deletes and recreates a `church_a` database and makes fake users, so never point it at
the live server.

```bash
COUCH_ADMIN_PASS=... node couchdb/test-rule.mjs
```
