# Firmo for Google Docs

Brings a Firmo project into the document that actually gets submitted: the saved
sources, an in-text citation at the cursor, and a works-cited page generated
from the publisher's record.

Most students do not write their paper in Firmo. They write it in Docs, because
that is where the assignment template came from and where their group partner
is. A research tool that ends at its own text box hands the student a
copy-paste job at exactly the point where citations get mangled.

## How it is put together

- `Code.gs` runs on Apps Script's servers and does all the HTTP. Nothing calls
  the Firmo API from the browser, so there is no CORS configuration and the
  session token never reaches the page.
- `Sidebar.html` is the interface, talking to `Code.gs` through
  `google.script.run`.
- The token is kept in `PropertiesService.getUserProperties()` — scoped to this
  add-on **and** this Google account. Not in the document, where a collaborator
  could read it.
- The only document scope requested is `documents.currentonly`, so the add-on
  can touch the document it is open in and nothing else in the student's Drive.
- Citations are formatted server side by the same CSL styles the workspace uses.
  A second implementation of APA in JavaScript would drift from the first, and
  the one in the document is the one that gets marked.
- Bibliography entries arrive containing real HTML (`<i>`, `&amp;`) and are
  converted into actual italic runs. Appending them raw prints
  `<i>Journal of Family Psychology</i>` into the student's bibliography.

## Install it for yourself

1. Open a Google Doc → **Extensions → Apps Script**.
2. Paste `Code.gs` over the default `Code.gs`.
3. **File → New → HTML**, name it `Sidebar`, and paste `Sidebar.html`.
4. Show the manifest (**Project Settings → Show "appsscript.json"**) and paste
   `appsscript.json`.
5. Save, then reload the document. **Extensions → Firmo → Open Firmo**.
6. First run asks for authorisation; an unpublished script shows Google's
   "unverified app" warning, which is expected until it is submitted for review.
7. In the sidebar, set the Firmo address if you are not on `localhost:8000`,
   then sign in.

## Publishing it

These need your Google Cloud and Workspace Marketplace accounts:

- Attach the script to a **standard Google Cloud project** and complete the
  OAuth consent screen.
- Replace `logoUrl` in `appsscript.json` with a real hosted icon.
- Submit for **OAuth verification**. `documents.currentonly` and
  `script.external_request` are both sensitive scopes, so expect a review that
  asks what data leaves the document. The answer is: the document's contents
  never leave it — the add-on writes into the document and reads only the
  student's own Firmo project.
- Publish through the Google Workspace Marketplace SDK.

## Known limits

- The add-on reads the project through `/api/sync`, which returns every project
  the student has. That is one round trip more data than it needs; a dedicated
  read-only project endpoint would be tidier if this gets heavy use.
- Nothing writes *back* to Firmo yet, so edits made in Docs are not recorded in
  the process record. Carrying the claim layer into Docs — marking sentences
  that need a source, in the document — is the obvious next step and the one
  that would make this more than a citation manager.
