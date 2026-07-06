"""Citation generation.

Papers with a DOI get real, complete citations (journal, volume, issue, pages)
from CrossRef's content-negotiation service, rendered by the official CSL styles.
Papers without a DOI fall back to local formatters built from the metadata we have.
BibTeX / RIS exports are generated locally for reference managers (Zotero, Mendeley).
"""
import asyncio
import re
from typing import Optional

import httpx

# style key → CSL style id used by doi.org content negotiation
CSL_STYLES = {
    "apa": "apa",
    "mla": "modern-language-association",
    "chicago": "chicago-author-date",
    "harvard": "harvard-cite-them-right",
    "ieee": "ieee",
}

STYLE_LABELS = {
    "apa": "APA 7",
    "mla": "MLA 9",
    "chicago": "Chicago",
    "harvard": "Harvard",
    "ieee": "IEEE",
}


async def crossref_citation(doi: str, style: str, client: Optional[httpx.AsyncClient] = None) -> Optional[str]:
    """Fully formatted bibliography entry from doi.org, or None if unavailable."""
    csl = CSL_STYLES.get(style)
    if not csl or not doi:
        return None
    headers = {"Accept": f"text/x-bibliography; style={csl}; locale=en-US"}
    url = f"https://doi.org/{doi}"

    async def fetch(c: httpx.AsyncClient) -> Optional[str]:
        resp = await c.get(url, headers=headers)
        if resp.status_code != 200:
            return None
        # doi.org omits the charset header, so httpx misdecodes as latin-1
        text = resp.content.decode("utf-8", "replace").strip()
        # Some registrars return HTML error pages with a 200
        if not text or text.startswith("<"):
            return None
        text = re.sub(r"\s+", " ", text)
        # Registrar CSL output sometimes renders empty editor fields
        text = re.sub(r"edited by ,\s*", "", text)
        return text

    try:
        if client is not None:
            return await fetch(client)
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as c:
            return await fetch(c)
    except Exception:
        return None


# ── Local fallback formatters (no-DOI papers) ─────────────────────────────────

def _authors_apa(authors: list[str]) -> str:
    formatted = []
    for a in authors:
        parts = a.rsplit(" ", 1)
        formatted.append(f"{parts[1]}, {parts[0][0]}." if len(parts) == 2 else a)
    if len(formatted) > 7:
        return ", ".join(formatted[:6]) + ", ... " + formatted[-1]
    if len(formatted) > 1:
        return ", ".join(formatted[:-1]) + ", & " + formatted[-1]
    return formatted[0] if formatted else ""


def _authors_mla(authors: list[str]) -> str:
    if not authors:
        return ""
    parts = authors[0].rsplit(" ", 1)
    first = f"{parts[-1]}, {parts[0]}" if len(parts) == 2 else authors[0]
    if len(authors) == 1:
        return first
    if len(authors) == 2:
        return f"{first}, and {authors[1]}"
    return f"{first}, et al."


def _authors_chicago(authors: list[str]) -> str:
    if not authors:
        return ""
    if len(authors) == 1:
        return authors[0]
    if len(authors) <= 3:
        return ", ".join(authors[:-1]) + ", and " + authors[-1]
    return authors[0] + " et al."


def _link(paper: dict) -> str:
    if paper.get("doi"):
        return f"https://doi.org/{paper['doi']}"
    return paper.get("url") or ""


def local_citation(paper: dict, style: str) -> str:
    authors = paper.get("authors") or []
    title = paper.get("title") or "Untitled"
    year = paper.get("year")
    journal = paper.get("journal")
    link = _link(paper)

    if style == "mla":
        who = _authors_mla(authors) or "Unknown Author"
        j = f" {journal}," if journal else ""
        cite = f'{who}. "{title}."{j} {year or "n.d."}.'
    elif style == "chicago":
        who = _authors_chicago(authors) or "Unknown Author"
        j = f" {journal}." if journal else ""
        cite = f'{who}. "{title}."{j} {year or "n.d."}.'
    elif style == "harvard":
        who = _authors_apa(authors) or "Unknown Author"
        j = f" {journal}." if journal else ""
        cite = f"{who} ({year or 'no date'}) '{title}'.{j}"
    elif style == "ieee":
        initials = []
        for a in authors[:6]:
            parts = a.rsplit(" ", 1)
            initials.append(f"{parts[0][0]}. {parts[1]}" if len(parts) == 2 and parts[0] else a)
        who = ", ".join(initials) or "Unknown Author"
        j = f" {journal}," if journal else ""
        cite = f'{who}, "{title},"{j} {year or "n.d."}.'
    else:  # apa (default)
        who = _authors_apa(authors) or "Unknown Author"
        j = f" {journal}." if journal else ""
        cite = f"{who} ({year or 'n.d.'}). {title}.{j}"

    if link:
        cite = f"{cite} {link}"
    return cite


def intext_citation(paper: dict, style: str) -> str:
    authors = paper.get("authors") or []
    year = str(paper.get("year")) if paper.get("year") else "n.d."
    lasts = [a.rsplit(" ", 1)[-1] for a in authors] or ["Unknown"]

    if style == "mla":
        if len(lasts) > 2:
            return f"({lasts[0]} et al. p. ##)"
        if len(lasts) == 2:
            return f"({lasts[0]} and {lasts[1]} p. ##)"
        return f"({lasts[0]} p. ##)"
    if style == "chicago":
        if len(lasts) > 3:
            return f"({lasts[0]} et al. {year})"
        return f"({', '.join(lasts)} {year})"
    if style == "ieee":
        return "[#]"  # numbered by position in the reference list
    # apa / harvard
    if len(lasts) == 1:
        return f"({lasts[0]}, {year})"
    if len(lasts) == 2:
        return f"({lasts[0]} & {lasts[1]}, {year})"
    return f"({lasts[0]} et al., {year})"


async def format_citation(paper: dict, style: str, client: Optional[httpx.AsyncClient] = None) -> dict:
    """Best available citation: CrossRef CSL when the paper has a DOI, local otherwise."""
    citation = None
    exact = False
    if paper.get("doi"):
        citation = await crossref_citation(paper["doi"], style, client=client)
        exact = citation is not None
    if not citation:
        citation = local_citation(paper, style)
    return {
        "citation": citation,
        "intext": intext_citation(paper, style),
        "style": style,
        "exact": exact,  # True → rendered by the official CSL style with full metadata
    }


async def format_bibliography(papers: list[dict], style: str) -> list[dict]:
    """Citations for a whole project, fetched concurrently, alphabetized."""
    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
        results = await asyncio.gather(*(format_citation(p, style, client=client) for p in papers))
    entries = [
        {**r, "title": p.get("title", ""), "id": p.get("doi") or p.get("url") or (p.get("title") or "")[:60]}
        for p, r in zip(papers, results)
    ]
    entries.sort(key=lambda e: e["citation"].lower())
    return entries


# ── Reference-manager exports ─────────────────────────────────────────────────

def _bibtex_key(paper: dict, index: int) -> str:
    authors = paper.get("authors") or []
    last = re.sub(r"\W+", "", authors[0].rsplit(" ", 1)[-1]) if authors else "anon"
    year = paper.get("year") or "nd"
    word = re.sub(r"\W+", "", (paper.get("title") or "x").split()[0].lower()) or "x"
    return f"{last.lower()}{year}{word}{index}"


def bibtex_entry(paper: dict, index: int = 0) -> str:
    fields = {
        "title": paper.get("title") or "",
        "author": " and ".join(paper.get("authors") or []),
        "journal": paper.get("journal") or "",
        "year": str(paper.get("year") or ""),
        "doi": paper.get("doi") or "",
        "url": paper.get("url") or "",
    }
    body = ",\n".join(
        f"  {k} = {{{v}}}" for k, v in fields.items() if v
    )
    return f"@article{{{_bibtex_key(paper, index)},\n{body}\n}}"


def ris_entry(paper: dict) -> str:
    lines = ["TY  - JOUR"]
    if paper.get("title"):
        lines.append(f"TI  - {paper['title']}")
    for a in paper.get("authors") or []:
        parts = a.rsplit(" ", 1)
        lines.append(f"AU  - {parts[1]}, {parts[0]}" if len(parts) == 2 else f"AU  - {a}")
    if paper.get("year"):
        lines.append(f"PY  - {paper['year']}")
    if paper.get("journal"):
        lines.append(f"JO  - {paper['journal']}")
    if paper.get("doi"):
        lines.append(f"DO  - {paper['doi']}")
    if paper.get("url"):
        lines.append(f"UR  - {paper['url']}")
    if paper.get("abstract"):
        lines.append(f"AB  - {paper['abstract'][:500]}")
    lines.append("ER  - ")
    return "\n".join(lines)
