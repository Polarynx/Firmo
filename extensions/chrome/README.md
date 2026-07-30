# Save to Firmo

A browser button that saves the paper you are reading into a Firmo project,
resolved against the publisher's own record rather than scraped off the page.

This is the distribution bet. Zotero did not win its category by having the best
reference database; it won by being the button that was already there when you
found something worth keeping. A research tool a student has to switch tabs to
feed is a tool they stop feeding by week three.

## What it does

1. Reads the open tab for a DOI — publisher metadata first, then JSON-LD, then
   the URL, then arXiv's id scheme, and only then visible text near the top of
   the page. A DOI found down in a reference list belongs to a different paper,
   so that region is deliberately not searched.
2. Sends what it found to `POST /api/resolve`, which returns the record from
   CrossRef or DataCite. **Nothing scraped from the page is ever saved as
   citation data** — a citation assembled from page text looks right and fails
   when a marker checks it.
3. Appends it to a project through `POST /api/sources/save`, which never
   rewrites the rest of the project. The save also lands in the process record,
   tagged as captured while reading.

If the page is a results list, it says so instead of saving the first hit. If
nothing identifiable is on the page, it says that too.

## Install it locally

1. Run the Firmo backend on `http://localhost:8000` and the workspace on
   `http://localhost:5173`.
2. Open `chrome://extensions`, turn on **Developer mode**, choose **Load
   unpacked**, and select this folder.
3. Open a paper — try `https://arxiv.org/abs/1706.03762` or any journal article
   — and click the toolbar button.

## Point it at a deployment

Right-click the toolbar button → **Options**, and set the API and workspace
addresses. Chrome will ask for permission to reach that one origin.

Permission for arbitrary sites is requested at that moment rather than declared
in the manifest, so the extension never ships asking to read every page you
visit. That matters more than convenience here: the institutions Firmo is
trying to sell to are exactly the ones whose IT desks block extensions with
blanket host access.

## Before publishing to the Chrome Web Store

These need your accounts and cannot be done from the repository:

- **Add an icon.** `manifest.json` currently declares none, so Chrome shows a
  default. A 128×128 PNG plus an `"icons"` entry is required for store review.
- **Set the production addresses as the defaults** in `popup.js` and
  `options.js` (`DEFAULTS`), so a fresh install works without visiting Options.
- **Write the store listing privacy disclosure.** The honest version is short:
  the extension reads the active tab only when you click the button, sends a
  DOI or title to your Firmo backend, and stores a session token locally.
- Package and submit through the Chrome Web Store developer dashboard (one-time
  registration fee).

## Firefox and Safari

`browser.*` is promise-based and `chrome.*` is polyfilled in Firefox, so this
code runs there as-is; Firefox needs `browser_specific_settings.gecko.id` added
to the manifest. Safari needs Xcode's converter and an Apple developer account.
