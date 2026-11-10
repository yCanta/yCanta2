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
   - `createAccount`: make an account with no tags, marked `created_for: <church>`. An existing account is left
     alone. The app then adds the name to the church's list itself.
   - `resetPassword`: a church admin can put any name on their own list, so the list alone isn't enough. The
     account must also carry that church's older `<db>-viewer`/`<db>-editor` tag (only server admins set those)
     or have been made for that church. Never for admins anywhere, the helper's own account, or anyone else.

## Your own account and forgotten passwords

CouchDB 3 closes the account list to regular users, so they can't read or change their own account record.
These requests carry the person's own name and password (the app sends the one they signed in with):

- `getEmail`, `changeOwnPassword`
- `startEmail` then `confirmEmail`: adds a **recovery email**. A code goes to that address first, so only an
  inbox the person controls is saved, and the saved email is signed (`email_sig`). People can edit their own
  account record, so an email typed straight into it is ignored. Church admins can't set someone else's email.
- `clearEmail`

"Forgot password?" on the login page needs no sign-in:

- `requestReset` with a name or recovery email: emails a one-time code from info.ycanta@gmail.com. The reply is
  the same whether or not the account exists, so it can't be used to find out who has an account.
- `confirmReset` with the name, code and new password.

Codes are 8 characters, last 20 minutes, allow 5 tries and work once. Asking again while a code is on its way
sends nothing new, so a stranger can't cancel it. Only a hash of each code is kept, in the script cache, which
empties itself, as do the counters, so nothing builds up in Script Properties.

Limits: 3 emails an hour per account, 5 recovery-email changes per 6 hours per account, 20 emails an hour in
all, and only "forgot password" emails once Google's daily quota runs low. After 10 wrong passwords in an hour
for one name, the helper stops checking that name's password for the rest of the hour, so it can't be used to
guess passwords. Unknown requests aren't logged, and logged text can't become a sheet formula.

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
5. Deploy > New deployment > Web app, execute as **me**, access **Anyone**. Authorize it (it asks to reach other
   websites, send email as you, and edit this sheet), and put the web app URL in `window.accountsURL` in `db.js`.

## Testing

- `test-local.mjs` runs `Code.gs` unchanged in Node against the local test CouchDB (see `../database/`), with
  stand-ins for the Apps Script services in `local-shim.mjs`.
- `serve-local.mjs` serves it at `http://localhost:8790` for the app's local test page. Emails it would send
  are kept at `http://localhost:8790/mail` instead.
