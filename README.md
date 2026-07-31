# Firmo

A research workspace for students writing papers. One surface: type a topic and
Firmo searches sixteen academic databases and briefs you; paste a draft and it
marks every claim that needs backing and offers sources for each; paste a
reference list and it checks every entry against the publisher's record.

Firmo explains, plans, and finds evidence. It does not write the paper — the
grounded chat is hard-limited to outlines and explanations, which is the point
rather than a limitation.

## What it does

**Find sources.** Semantic Scholar, CrossRef, PubMed, OpenAlex, Europe PMC,
BASE, arXiv, DOAJ, ERIC, Zenodo, PLOS, HAL, INSPIRE-HEP, Internet Archive
Scholar, OpenAIRE, and DOAB, searched in parallel under a 10s budget. Results
are ranked by meaning — a topic anchor and each paper are embedded, and cosine
similarity is the primary signal — then judged by an LLM and split into
"Relevant" and "Related & background". Retracted papers and preprints are
flagged.

**Check a draft.** Claims are extracted verbatim and each one is marked in the
document itself: needs a citation, covered by a source you already saved,
evidence disagrees, or no citation needed. Clicking a mark opens the evidence;
"Cite & save" inserts the in-text citation and adds the source to the paper.

**Check citations.** A pasted bibliography is verified entry by entry against
CrossRef, catching invented references, wrong years, and retractions. A lookup
that fails is reported as *unchecked*, never as *not found* — a student should
never be told their real source is fake because an API hiccuped.

**Also:** argument review (thesis, paragraph-by-paragraph, missing
counterargument), outline builder, annotated bibliography, verbatim quote
finder with page numbers from open-access PDFs, and a grounded chat over your
saved sources.

**Import and export.** Bring in RIS, BibTeX, or a list of DOIs. Export a real
Word document — your draft plus a works-cited page with hanging indents in APA,
MLA, Chicago, Harvard, or IEEE — or BibTeX/RIS to take elsewhere.

**Accounts.** Optional. Everything works signed out; an account makes your
papers, sources, and drafts follow you to any machine instead of living in one
browser.

## Layout

```
firmo/
├── backend/                 FastAPI
│   ├── main.py              endpoints and the research pipeline
│   ├── sources.py           the 16 connectors, dedup, safety flags
│   ├── citations.py         CSL formatting via CrossRef content negotiation
│   ├── importers.py         RIS / BibTeX / DOI parsing
│   ├── docx_export.py       Word output
│   ├── llm.py               Mistral client, model routing, embeddings
│   ├── db.py                SQLAlchemy models (SQLite local, Postgres in prod)
│   ├── auth.py              password hashing, JWT sessions
│   └── eval/                relevance benchmark and runner
└── frontend/                React + Vite + Tailwind + Zustand + framer-motion
    └── src/
        ├── components/canvas/     Zone A — the writing surface
        ├── components/sidebar/    Zone B — sources, claims, argument, audit
        ├── components/omnibar/    Zone C — ⌘K command dock and chat
        ├── components/workspace/  top bar, layout, accounts
        └── stores/                workspace, research, annotations, UI, auth
```

## Running locally

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
source .venv/bin/activate       # macOS/Linux
pip install -r requirements.txt
uvicorn main:app --reload
```

Runs on `http://localhost:8000`; interactive docs at `/docs`.

Create `backend/.env`:

```
MISTRAL_API_KEY=...
OPENALEX_MAILTO=you@yourdomain.com   # strongly recommended, see Configuration
SEMANTIC_SCHOLAR_API_KEY=...         # optional, raises that connector's rate limit
```

On Windows, run uvicorn through the venv's interpreter directly
(`backend/.venv/Scripts/python.exe -m uvicorn main:app`) — a bare `python` may
resolve to a system install without the dependencies.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173`, with `/api/*` proxied to port 8000.

In development, Firmo clears its own `localStorage` on boot so a demo always
looks like a brand-new user. Add `?keep` to the URL to keep your work.

## Configuration

| Variable | Where | What it does |
|---|---|---|
| `MISTRAL_API_KEY` | backend | Required. Briefs, ranking, and every judgement fall back without it. |
| `OPENALEX_MAILTO` | backend | An address you own. Puts Firmo in OpenAlex's polite pool, which is faster and throttles far later — and OpenAlex is the index citation expansion leans on hardest. Unset, Firmo sends no contact at all and warns at startup; a placeholder is worse than nothing, since OpenAlex reads it as junk and drops you to the common pool anyway. |
| `DATABASE_URL` | backend | Postgres for accounts. Omitted, Firmo uses a local SQLite file. |
| `FIRMO_SECRET` | backend | Signs session tokens. **Required in production** — startup refuses without it. |
| `ALLOWED_ORIGINS` | backend | Comma-separated origins allowed by CORS. Must include the deployed frontend. |
| `FIRMO_REASONING_MODEL` | backend | Model for claim verdicts and argument review. Falls back automatically if the key cannot serve it. |
| `FIRMO_DAILY_LIMIT` / `FIRMO_IP_CEILING` | backend | Per-person allowance and the per-network ceiling above it. |
| `VITE_API_URL` | frontend | The backend's origin, with no trailing slash and no `/api`. Without it a deployed frontend calls itself and every request fails. |

## Measuring the search

Relevance is measured, not eyeballed:

```bash
cd backend
python eval/run_eval.py                     # the whole set
python eval/run_eval.py --case remote-work  # one topic
python eval/run_eval.py --save runs/x.json --compare runs/baseline.json
```

Reports recall@k, hit rate, and how often the wrong sense of an ambiguous query
leaks in. Runs are not deterministic — the fan-out queries are written fresh
each time — so judge a change on the summary across several runs, not on one
case moving.

Ground truth in `eval/benchmark.json` must be verified against CrossRef before
being added. A first draft of that file was written from memory and a third of
its DOIs were wrong.

## Where Firmo goes when the student leaves the tab

Most students do not write the paper in Firmo. They find sources in a browser
and write in Docs or Word, so a tool that ends at its own text box gets used
once. These carry the project out to where the work actually happens; each
folder has its own README with install and publishing steps.

| | What it does |
|---|---|
| `extensions/chrome` | Saves the paper in the open tab to a project, resolved against CrossRef or DataCite rather than scraped off the page. |
| `integrations/google-docs` | Apps Script sidebar: the project's sources, a citation at the cursor, a works-cited page. |
| `integrations/word` | The same surface as an Office.js taskpane. |

Two backend endpoints exist for them. `POST /api/resolve` turns a DOI, a URL or
an exact title into a real record, and refuses rather than guessing — a citation
built from a guess looks right and fails when a marker checks it. `POST
/api/sources/save` appends one source server side; external clients must never
go through `/api/sync`, which is last-write-wins over a whole project and would
overwrite whatever the student was typing in another tab.

## Deploying

Frontend on Vercel, backend on Render, both from `main`. `backend/.env` is
gitignored and never deploys, so every variable above has to be set in the
host's dashboard. Render's free tier cold-starts in 30–60s.
