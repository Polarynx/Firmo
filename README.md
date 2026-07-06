# Firmo

**From blank page to bibliography.** Firmo is a free research hub for students writing essays and papers. Describe what you're writing about — a topic, a thesis, or a research question — and Firmo finds real, citable academic sources, shows you what the evidence says, and builds your works-cited page as you go.

## What it does

- **One smart input** — type a topic, thesis, or question; Firmo detects which and adapts
- **Research brief** — what the evidence says, strong angles for your paper, related topics to explore
- **14 academic databases** searched in parallel with a hard time budget (Semantic Scholar, OpenAlex, CrossRef, PubMed, Europe PMC, DOAJ, ERIC, arXiv, PLOS, HAL, BASE, Zenodo, INSPIRE-HEP, Internet Archive Scholar) — results stream in live
- **Evidence stance** on every source: Supports · Counterpoint · Mixed · Background
- **Free PDF badges** — legal open-access copies via Unpaywall
- **Projects** — one per paper, saved sources persist in your browser
- **Works Cited panel** — a live, alphabetized bibliography in APA 7, MLA 9, Chicago, Harvard, or IEEE. Sources with a DOI are formatted from the publisher's full record via CrossRef (journal, volume, issue, pages). Copy-all, or export BibTeX / RIS for Zotero and Mendeley
- **Check my draft** — paste your writing, get every factual claim scored, and jump to sources for the shaky ones
- Summarize, "Why it matters", synthesize the evidence, ask questions grounded in your sources
- Dark / light mode, shareable search URLs

## Project structure

```
firmo/
├── backend/              # FastAPI Python backend
│   ├── main.py           # routes + streaming research pipeline
│   ├── sources.py        # 14 database connectors + fan-out search
│   ├── citations.py      # CrossRef CSL citations, BibTeX, RIS
│   ├── llm.py            # Mistral client (JSON mode)
│   ├── schemas.py        # request models
│   └── requirements.txt
└── frontend/             # React + Vite + Tailwind
    └── src/
        ├── App.jsx
        ├── lib/          # api (NDJSON stream reader), projects store, constants
        └── components/   # ResearchInput, BriefCard, PaperCard,
                          # ProjectSidebar, EssayChecker, …
```

## Running locally

### Backend

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload
```

Requires a `.env` with `MISTRAL_API_KEY=...` (never commit it). Optional: `UNPAYWALL_EMAIL`, `ALLOWED_ORIGINS`.

API: `http://localhost:8000` · interactive docs at `/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173`; `/api` calls proxy to the backend automatically.

## API reference

### `POST /api/research` — the main event (streaming)

```json
{ "query": "caffeine improves athletic performance", "year_from": 2015 }
```

Streams NDJSON events: `status` → `brief` (type, assessment, angles, related) → `papers` (provisional preview) → `ranked` (final list with `stance`, `relevanceScore`, `oa_pdf`) → `done`.

### `POST /api/cite`

`{ title, authors, year, doi, journal, url, style }` → `{ citation, intext, exact }`.
Styles: `apa`, `mla`, `chicago`, `harvard`, `ieee`. `exact: true` means it was rendered from the publisher's full CrossRef record.

### `POST /api/export`

`{ papers: [...], style, format: "text" | "bibtex" | "ris" }` → a complete, alphabetized bibliography (plus per-entry list for `text`).

### Others

`/api/claimchain` (draft checker) · `/api/more-sources` · `/api/summarize` · `/api/digdeep` · `/api/synthesize-sources` · `/api/ask-sources`

Rate limit: 50 searches/day per IP on `/api/research` and `/api/claimchain`.
