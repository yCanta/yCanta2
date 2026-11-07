# Analytics backend (Apps Script)

These are two files from the "yCanta - Analytics" Apps Script project. `Config.gs`, `Auth.gs` and `Youtube.gs` live only in Apps Script.

- `Analytics.gs` replaces `Responses.gs`.
- `Server.gs` replaces `Server.gs`.

## Tabs it writes

| Tab | One row per | Columns |
|---|---|---|
| Sessions | visit (page load) | Start, Install, Session, User, Database, Platform, Screen, Touch, Installed, Dark mode, Font size, Load ms, Online, Location, Last seen |
| Events | thing that happened | Time, Install, Session, User, Event, Value |

Events are named the same as before: `hashchanged`, `edited`, `exported`, `timing` (now `hidden`/`visible`), `connection`, `analytics`.

## Deploy

1. In Apps Script, delete `Responses.gs`. Paste in `Analytics.gs`, and replace `Server.gs`.
2. Deploy, then Manage deployments, then edit the existing web app deployment and pick **New version**. Editing keeps the `/exec` URL that the app uses. A new deployment would get a new URL.
3. Run `migrateResponses` once. It copies the old Responses tab into Sessions and Events, and empties the old Script Properties caches.
4. Run `buildDashboard` once.
5. Check the Dashboard tab, then delete the old `Responses` and `Dash` tabs. Responses has about 20 million cells, mostly empty.
6. Delete the daily `writeCacheToSheets` trigger (Triggers, on the left).

The new backend accepts both the old app (`{action: "log", data: [...]}`) and the new one (`{action: "log", v: 2, ...}`), so the app and the backend can ship in either order.
