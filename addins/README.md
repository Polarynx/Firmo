# Firmo inside the document

Students do not write in Firmo. They write in Word and Google Docs, and every
step of the workflow that asks them to leave costs more than the feature is
worth: paste out, check, paste back, lose the formatting twice. The web
workspace is where a paper is *researched*. These are where it is *written*.

Both add-ins deliberately offer a fraction of the workspace. Seven stages do not
fit in a 300px column beside a page, and five of them — the question, the source
stacks, the outline — are not what you need while the cursor is in a paragraph.
What is here is the two passes that can only run against a finished draft:

| | |
|---|---|
| **Claims** | Marks every sentence a reader would expect a source for. Amber wants a citation, red means the evidence disagrees, green is already covered. One press inserts the citation *and* adds the entry to the works-cited page. |
| **References** | Sends every entry in the reference list to CrossRef and OpenAlex. Catches wrong years, mangled titles, retractions, and citations that do not exist at all. |

Neither requires an account. Both endpoints are open and rate-limited by IP, so
the add-in works the first time it is opened, which is the only time most people
will give it.

## A rule both add-ins follow

**Never touch the document without being asked.** A `.docx` on a desktop has no
version history, and the file is the thing the student is graded on. Every write
is behind a press. Highlighting is the only bulk change, it is a checkbox that
can be turned off before the run, and in Docs there is a menu item to clear it.

---

## Word

Files: `word/manifest.xml`, `word/taskpane.html`, `word/taskpane.js`, `word/taskpane.css`

Plain ES2020, no bundler — an Office add-in is loaded as files by a webview and a
build step would buy nothing but a build step.

### Sideloading for development

1. Serve the folder over **HTTPS** — Office refuses `http://` for anything but
   `localhost`, and refuses a self-signed certificate without trusting it first:
   ```
   npx office-addin-dev-certs install
   npx http-server addins/word -S -C ~/.office-addin-dev-certs/localhost.crt \
       -K ~/.office-addin-dev-certs/localhost.key -p 3000
   ```
2. Point the manifest at it: replace every `https://firmo.app/addins/word/` with
   `https://localhost:3000/`.
3. Sideload:
   - **Windows** — put `manifest.xml` in a shared folder, add that folder under
     File → Options → Trust Center → Trusted Add-in Catalogs, restart Word, then
     Insert → My Add-ins → Shared Folder.
   - **Mac** — copy `manifest.xml` into
     `~/Library/Containers/com.microsoft.Word/Data/Documents/wef/`.
   - **Word for the web** — Insert → Add-ins → Upload My Add-in.
4. The pane appears under **Home → Firmo → Check this draft**.

### Before shipping

- Regenerate the `<Id>` GUID. The one in the manifest is a placeholder and two
  add-ins sharing an Id conflict.
- Host the four icon sizes at the `IconUrl` paths.
- `ALLOWED_ORIGIN_REGEX` on the backend already allows `officeapps.live.com`,
  `office.com` and `microsoft365.com`. This matters more than it looks: **Word
  for the web sends the Office frame's origin, not the add-in's**, so allowing
  only `firmo.app` lets the desktop add-in work while silently breaking the web
  one — the version most students use.

### Known limits

- `Range.search` caps at 255 characters and treats `^ # * ? [ ] \ < > & @ ~` as
  wildcards, so long or punctuation-heavy sentences are matched on a sanitised
  leading fragment. A highlight covering most of a sentence beats none.
- Word's highlight palette is a fixed named set, so the amber/red/green ramp is
  approximated rather than matched.

---

## Google Docs

Files: `gdocs/Code.gs`, `gdocs/Sidebar.html`, `gdocs/appsscript.json`

A different animal from the Word add-in for one reason: Apps Script runs on
Google's servers, so `UrlFetchApp` calls Firmo server-to-server. **No CORS entry
is needed at all** — no browser origin is involved.

The cost is that `UrlFetchApp` has no incremental reader, so the NDJSON
responses arrive whole and are parsed at the end. Word can show claims landing
one at a time; this cannot. The sidebar says plainly that it is working and how
long the pass takes, rather than animating a progress bar that knows nothing.

### Installing

1. In a document: **Extensions → Apps Script**.
2. Paste `Code.gs`, add an HTML file named `Sidebar`, paste `Sidebar.html`.
3. Project Settings → show `appsscript.json` → paste it in.
4. **Deploy → Test deployments → Install**.
5. The menu appears under **Extensions → Firmo**.

The scopes are the narrowest that work: `documents.currentonly` grants access to
the open document and nothing else in the user's Drive, which is the difference
between an add-on a university will approve and one it will not.

---

## Pointing at a local backend

Both default to `https://firmo.app`.

- **Word** — `localStorage.setItem('firmo_api', 'http://localhost:8000')` in the
  pane's console, then add that origin to `ALLOWED_ORIGINS`.
- **Docs** — change `var API` at the top of `Code.gs`. It must be publicly
  reachable; Google's servers cannot see your `localhost`.
