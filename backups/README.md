# yCanta nightly backups

`Backup.gs` is a small Apps Script project (issue #138, phase 3). Every night it saves a gzipped JSON copy of each
church database to a **yCanta backups** folder in the Google Drive of the account that owns the project. That
should be info.ycanta@gmail.com.

- One file per church per night, named like `canaan 2026-11-11.json.gz`.
- It keeps the last 14 days, plus the first backup of each of the last 12 months. Older files go to Drive's
  trash, which keeps them 30 more days.
- A backup holds every document as it is that night, deleted ones and kept old versions (`h-` docs) included,
  plus the church's lists (`_security`) and the save rules.
- If a night fails, Apps Script emails the project's owner.

It is a separate project from the accounts helper on purpose: the helper is a public web app, and it
shouldn't be able to reach Google Drive.

## One-time setup

1. **A backup account on the server.** In the app, signed in as a church admin, open Admin and add a person
   named `ycanta-backup` with a long random password, as a **User**. Do the same in each church (in the
   second church, add the same name; the account already exists). It only ever reads.
2. **The project.** Signed in as info.ycanta@gmail.com, go to script.google.com > New project, and name it
   **yCanta Backups**. Paste in `Backup.gs` (replacing `Code.gs`). In Project Settings, tick "Show
   appsscript.json manifest file in editor", and paste in `appsscript.json`.
3. **Script Properties** (Project Settings > Script Properties):
   - `COUCH_URL`: the app's CouchDB address, ending in `/`, e.g. `https://ycanta.canaanf.org/couch/`
   - `BACKUP_NAME`: `ycanta-backup`
   - `BACKUP_PASS`: its password
   - `BACKUP_DBS`: `canaan,being_church`
4. **First run.** In the editor, choose `backupAll` and Run. Google asks to let it reach other websites, see
   and change Drive files, and run on a schedule. Allow it. A **yCanta backups** folder appears in Drive,
   with one file per church.
5. **Every night.** Choose `installBackupTrigger` and Run once. Triggers (the clock icon) then shows a daily
   `backupAll`.

When a new church starts, add its database to `BACKUP_DBS` and the backup account to its list.

## Restoring

In the app, a church admin opens **Admin > Restore from a backup**, downloads a file from the Drive folder and
chooses it. The app lists what is different now (changed, deleted or gone since the backup), with a search box.
Pick what to put back. Each one is saved as a new version, so what it replaces is kept in its old versions.

If the server itself is lost: set up a new, empty database, sign in as a server admin, and use **copy the whole
backup in** in the same window. That loads every document exactly as it was, revisions, old versions, save rules
and (if ticked) the church's lists included.

## Testing

`test-local.mjs` runs `Backup.gs` unchanged in Node against the local test CouchDB (see `../database/`), with
stand-ins for the Apps Script services. Drive is the `local-test-output/` folder (not committed).

```bash
node database/seed-local-church.mjs && node backups/test-local.mjs
```
