# Firmo for Word

The Google Docs add-on's twin, for the editor most departments hand out a
template for. Same surface: your Firmo project's sources, a citation at the
cursor, and a works-cited page built from the publisher's record.

## How it differs from the Docs add-on

The Docs add-on runs on Apps Script's servers, so its API calls have no browser
origin. This one runs in a webview, so it calls the Firmo API over ordinary
`fetch` from the add-in's own origin — which is why the backend allows
extension-style origins by regex (`ALLOWED_ORIGIN_REGEX`). If you host the
taskpane on a normal https domain, add that domain to `ALLOWED_ORIGINS` instead
and the regex is not involved.

The session token lives in `localStorage` for the taskpane's origin. It is never
written into the document, where anyone the `.docx` is shared with could read
it.

## Run it locally

Office requires **https** for taskpanes, including on localhost.

1. Serve this folder over https on port 3000. `npx office-addin-dev-certs
   install` then any https static server will do.
2. Run the Firmo backend on `https://localhost:8000` — or edit `DEFAULTS` in
   `taskpane.js` and the `AppDomain` in `manifest.xml` to match wherever it is.
3. Sideload `manifest.xml`:
   - **Word on Windows** — put the folder on a network share, add it under
     File → Options → Trust Center → Trusted Add-in Catalogs, then Insert →
     My Add-ins → Shared Folder.
   - **Word on the web** — Insert → Add-ins → Upload My Add-in.
4. Open the pane from **Home → Firmo → Sources**.

## Before publishing

These need your Microsoft Partner Center account:

- **Generate a real GUID** for `<Id>`. The one in the manifest is a placeholder
  and will collide.
- Host the taskpane and its icons on a real https origin, and replace every
  `https://localhost:3000` in `manifest.xml`.
- Add 16/32/80px icons — they are referenced but not included here.
- Submit through Partner Center for AppSource validation. Expect questions about
  `ReadWriteDocument`; the honest answer is that the add-in writes citations and
  a bibliography and reads nothing out of the document.

## Known limits

- Reads projects through `/api/sync`, which returns every project the student
  has — one round trip more data than needed.
- Nothing writes back to Firmo, so citations inserted here do not appear in the
  process record. Closing that loop is what would make this more than a
  citation manager, and it is the same gap the Docs add-on has.
