# yCanta accounts helper

Lets a church admin create accounts and reset passwords for people in their own church, without being a
CouchDB server admin. It is an Apps Script web app bound to the **yCanta Server** sheet (owned by
info.ycanta@gmail.com), project **yCanta Accounts** (`1DjWTDez4G6qIi3wRqgstrwrijk8selL976C44AOh_9KUdHXNMEvshq6Z`).
Every request is written to the sheet's **Log** tab, without passwords.

## How a request is checked

1. The app sends the church admin's own name and password, the church database, and what to do.
2. The helper signs in to CouchDB as that admin, then reads that church's `_security` list with their session.
3. Only a church admin of that church (or a server admin) gets past this. Then the helper uses an
   **accounts-only** CouchDB account to:
   - `createAccount`: make an account with no tags. An existing account is left alone. The app then adds the
     name to the church's list itself.
   - `resetPassword`: only for people on that church's list who are not church admins.

The accounts-only account is an admin of the `_users` database and nothing else. It can't read any church,
change any church's list, see server settings, or make a server admin. It **can** reset any non-server-admin's
password, so its password belongs only in Script Properties.

## One-time setup

On the CouchDB server, as a server admin:

1. Create a plain user for the helper, for example `ycanta-accounts`, with a long random password.
2. Set `[couchdb] users_db_security_editable = true` (CouchDB 3 needs this before `_users/_security` can change).
3. Set `_users/_security` to
   `{"admins": {"names": ["ycanta-accounts"], "roles": []}, "members": {"names": [], "roles": ["_admin"]}}`.
   The members part keeps public sign-up closed.

In the Apps Script project, signed in as info.ycanta@gmail.com:

4. Project Settings > Script Properties: `COUCH_URL` (the app's CouchDB address, ending in `/`),
   `MAKER_NAME`, `MAKER_PASS`.
5. Deploy > New deployment > Web app, execute as **me**, access **Anyone**. Authorize it, and put the web app URL
   in the app.

## Testing

`test-local.mjs` runs `Code.gs` unchanged in Node against the local test CouchDB (see `../couchdb/`).
