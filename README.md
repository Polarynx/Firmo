# Firmo

**Firmo** is an academic source finder and citation generator. Enter any claim or research question and Firmo surfaces relevant papers from Semantic Scholar and CrossRef, then generates properly formatted citations in APA, MLA, or Chicago style.

## Features

- Search academic papers by natural-language claim
- Sources from Semantic Scholar + CrossRef, deduplicated
- Citation generation: APA, MLA, Chicago (full reference + in-text)
- One-click copy for citations and in-text references
- Dark / light mode

## Project structure

```
firmo/
├── backend/          # FastAPI Python backend
│   ├── main.py
│   └── requirements.txt
└── frontend/         # React + Vite + Tailwind frontend
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

The API will be available at `http://localhost:8000`.
Interactive docs: `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will open at `http://localhost:5173`.
API calls are proxied to `localhost:8000` automatically via Vite.

## API reference

### `POST /api/search`

```json
{ "claim": "Social media is linked to increased anxiety in teenagers" }
```

Returns a list of papers with `title`, `authors`, `year`, `abstract`, `url`, `doi`.

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
