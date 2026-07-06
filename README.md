# Firmo
<<<<<<< HEAD

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
=======
 
**Firmo** is a full-stack academic source finder and citation generator. Enter any claim, essay, or research topic and Firmo queries 14 academic databases (2B+ papers) simultaneously, evaluates evidence using Mistral LLM, and generates properly formatted citations.
 
🔗 **Live:** [firmo-delta.vercel.app](https://firmo-delta.vercel.app)
 
---
 
## How It Works
 
1. **User submits** a claim, essay, or topic through the React frontend
2. **FastAPI backend** fans out parallel queries across 14 academic database APIs
3. **Results are deduplicated**, ranked, and enriched with metadata (journal, citation count, database source)
4. **Mistral LLM** evaluates the claim against returned evidence — generating a confidence score (0–100%), synthesis verdict, and optional counterarguments
5. **Frontend renders** interactive source cards with one-click citation generation, summarization, and deep-dive analysis
 
---
 
## Features
 
### Search Modes
- **Single Claim** — paste a factual statement and get papers that support or challenge it
- **Essay Check** — extracts up to 8 factual claims from pasted text with color-coded confidence bars
- **Topic Explorer** — search by keyword or topic area with AI-generated research landscape overviews
 
### Source Analysis
- AI confidence scoring (0–100%) per claim
- **Debatable mode** — toggle between supporting and opposing sources for contested claims
- **Stress Test** — generates the strongest academic counterargument + opposing papers
- **Evidence synthesis** — AI verdict across up to 12 sources at once
- **Summarize** — one-sentence plain-English summary of any abstract
- **Dig Deep** — 3–4 sentence analysis of what a paper studied and how it relates to your claim
- **Ask Sources** — free-form questions answered based on what the found papers actually say
- **Find More Sources** — 5 alternative search queries, no duplicates with existing results
 
### Citations
- APA, MLA, Chicago — full reference + in-text format
- One-click copy to clipboard
 
### UX
- Dark / light mode with system preference detection
- Related claims and related topics chips for exploration
- Save papers with original claim context (browser storage)
- Search history — last 20 searches, re-runnable with one click
- Share via URL — copy a direct link to any search result
- Database filter chips — filter results by source with live count per database
- Source badge on every paper card showing database origin, journal, and citation count
- Guided 16-step walkthrough tutorial with pro tips
- IP-based rate limiting: 50 searches/user/day
 
---
 
## Databases (14)
 
| Database | Estimated Papers |
|---|---|
| Semantic Scholar | 200M+ |
| OpenAlex | 250M+ |
| BASE | 300M+ |
| CrossRef | 150M+ |
| Europe PMC | 45M+ |
| PubMed | 35M+ |
| DOAJ | 20M+ |
| arXiv | 2.4M+ |
| Zenodo | 3M+ |
| ERIC | 2M+ |
| HAL | 1.5M+ |
| INSPIRE-HEP | 1.5M+ |
| PLOS | 300K+ |
| fatcat | 900M+ |
 
**Total: ~2 billion+ academic papers searchable simultaneously**
 
---
 
## Project Structure
 
```
firmo/
├── backend/              # FastAPI Python backend
│   ├── main.py
│   └── requirements.txt
└── frontend/             # React + Vite + Tailwind frontend
    ├── src/
    │   ├── App.jsx
    │   ├── main.jsx
    │   ├── index.css
    │   └── components/
    │       ├── SearchBar.jsx
    │       ├── SourceCard.jsx
    │       └── ThemeToggle.jsx
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── tailwind.config.js
>>>>>>> 0ea62073e92a44786ae982623293807ebbc4e034
```
 
---
 
## Running Locally
 
### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # macOS/Linux
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
uvicorn main:app --reload
```
<<<<<<< HEAD

Requires a `.env` with `MISTRAL_API_KEY=...` (never commit it). Optional: `UNPAYWALL_EMAIL`, `ALLOWED_ORIGINS`.

API: `http://localhost:8000` · interactive docs at `/docs`.

=======
API available at `http://localhost:8000` · Interactive docs at `http://localhost:8000/docs`
 
>>>>>>> 0ea62073e92a44786ae982623293807ebbc4e034
### Frontend
```bash
cd frontend
npm install
npm run dev
```
<<<<<<< HEAD

Opens at `http://localhost:5173`; `/api` calls proxy to the backend automatically.

## API reference

### `POST /api/research` — the main event (streaming)

=======
App opens at `http://localhost:5173`. API calls proxy to `localhost:8000` via Vite.
 
---
 
## API Reference
 
### `POST /api/search`
>>>>>>> 0ea62073e92a44786ae982623293807ebbc4e034
```json
{ "query": "caffeine improves athletic performance", "year_from": 2015 }
```
<<<<<<< HEAD

Streams NDJSON events: `status` → `brief` (type, assessment, angles, related) → `papers` (provisional preview) → `ranked` (final list with `stance`, `relevanceScore`, `oa_pdf`) → `done`.

### `POST /api/cite`

`{ title, authors, year, doi, journal, url, style }` → `{ citation, intext, exact }`.
Styles: `apa`, `mla`, `chicago`, `harvard`, `ieee`. `exact: true` means it was rendered from the publisher's full CrossRef record.

### `POST /api/export`

`{ papers: [...], style, format: "text" | "bibtex" | "ris" }` → a complete, alphabetized bibliography (plus per-entry list for `text`).

### Others

`/api/claimchain` (draft checker) · `/api/more-sources` · `/api/summarize` · `/api/digdeep` · `/api/synthesize-sources` · `/api/ask-sources`

Rate limit: 50 searches/day per IP on `/api/research` and `/api/claimchain`.
=======
Returns a list of papers with `title`, `authors`, `year`, `abstract`, `url`, `doi`, `source_db`.
 
### `POST /api/cite`
```json
{
  "title": "...",
  "authors": ["Jane Doe", "John Smith"],
  "year": 2023,
  "doi": "10.1234/example",
  "url": "https://...",
  "style": "apa"
}
```
Returns `{ "citation": "...", "intext": "...", "style": "apa" }`.
 
---
 
## Deployment
 
- **Frontend:** Vercel (auto-deploy via GitHub CI/CD)
- **Backend:** Render
- 9 REST API endpoints
- Sub-2s response time (warm)
- ~300 searches/month on free tier
 
---
 
## Version History
 
| Version | Name | Highlights |
|---|---|---|
| **v1.3** | Extended Sources | Expanded to 14 databases, source badges, database filter chips |
| **v1.2** | Topic Explorer | Topic search mode, research landscape overviews, changelog viewer |
| **v1.1** | Guidance | 16-step guided tutorial with pro tips, startup fix |
| **v1.0** | Foundation | Claim search, essay checker, stress test, citations, debatable mode, evidence synthesis |
 
---
 
## Tech Stack
 
**Frontend:** React, Vite, Tailwind CSS
**Backend:** FastAPI, Python
**LLM:** Mistral AI
**Deployment:** Vercel + Render
>>>>>>> 0ea62073e92a44786ae982623293807ebbc4e034
