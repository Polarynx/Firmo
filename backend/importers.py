"""Bringing an existing library in: RIS, BibTeX, and bare DOIs.

Every student who would find Firmo useful already has sources somewhere — a
Zotero library, a reference list a professor handed out, a folder of DOIs in a
notes app. Without a way in, they have to start from an empty project, which is
the one thing guaranteed to send them back to the tool they already know.

Parsers here are deliberately forgiving. Exported files are messy: half-quoted
BibTeX, RIS with CRLF endings and stray blank lines, DOIs pasted with a
trailing bracket. A record that parses partially is still worth having, because
the DOI lookup below can fill in whatever the file left out.
"""
import asyncio
import re
import unicodedata
from typing import Optional

from sources import _get, clean_text

CROSSREF_WORKS = "https://api.crossref.org/works"


# ── DOIs ─────────────────────────────────────────────────────────────────────

# Deliberately not anchored: DOIs arrive embedded in URLs, citations, and
# parentheses. The trailing-punctuation strip below undoes the over-capture.
_DOI_RE = re.compile(r"\b(10\.\d{4,9}/[^\s\"'<>,;]+)", re.I)


def extract_dois(text: str) -> list[str]:
    """Every DOI in a blob of text, de-duplicated, in the order they appear."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in _DOI_RE.findall(text or ""):
        # A DOI can legitimately end in almost anything, but a citation almost
        # never ends mid-identifier, so trailing sentence punctuation is ours.
        doi = raw.rstrip(".,;:)]}>'\"")
        key = doi.lower()
        if key not in seen:
            seen.add(key)
            out.append(doi)
    return out


# ── RIS ──────────────────────────────────────────────────────────────────────

# One tag per line, "XX  - value", with continuation lines indented or bare.
_RIS_LINE = re.compile(r"^([A-Z][A-Z0-9])\s{2}-\s?(.*)$")

_RIS_AUTHOR_TAGS = {"AU", "A1", "A2", "A3", "A4"}
_RIS_TITLE_TAGS = ("TI", "T1", "T2")
_RIS_JOURNAL_TAGS = ("JO", "JF", "JA", "T2", "BT")
_RIS_ABSTRACT_TAGS = ("AB", "N2")
_RIS_YEAR_TAGS = ("PY", "Y1", "DA")


def looks_like_ris(text: str) -> bool:
    return bool(re.search(r"^TY\s{2}-\s?\w", text or "", re.M))


def _flip_name(name: str) -> str:
    """"Smith, John" → "John Smith", to match how connectors emit authors."""
    name = clean_text(name).strip().rstrip(",")
    if "," not in name:
        return name
    family, _, given = name.partition(",")
    given = given.strip()
    family = family.strip()
    if not given or not family:
        return name.strip(", ")
    return f"{given} {family}"


def _year_from(value: str) -> Optional[int]:
    m = re.search(r"(1[0-9]{3}|20[0-9]{2})", value or "")
    return int(m.group(1)) if m else None


def parse_ris(text: str) -> list[dict]:
    """Split an RIS export into records. ER marks the end of each."""
    records: list[dict] = []
    fields: dict[str, list[str]] = {}
    last_tag: Optional[str] = None

    def flush() -> None:
        nonlocal fields, last_tag
        if fields:
            paper = _ris_record_to_paper(fields)
            if paper:
                records.append(paper)
        fields = {}
        last_tag = None

    for raw_line in (text or "").splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            continue
        m = _RIS_LINE.match(line.strip())
        if m:
            tag, value = m.group(1), m.group(2).strip()
            if tag == "ER":
                flush()
                continue
            if tag == "TY" and fields:
                # Some exporters omit ER entirely; a new TY starts a new record.
                flush()
            fields.setdefault(tag, []).append(value)
            last_tag = tag
        elif last_tag:
            # A wrapped abstract continues the previous tag.
            fields[last_tag][-1] = f"{fields[last_tag][-1]} {line.strip()}".strip()

    flush()
    return records


def _ris_record_to_paper(fields: dict[str, list[str]]) -> Optional[dict]:
    def first(tags) -> str:
        for t in tags:
            if fields.get(t):
                return fields[t][0].strip()
        return ""

    title = clean_text(first(_RIS_TITLE_TAGS))
    doi = first(("DO", "DI")).strip() or None
    if doi:
        doi = doi.replace("https://doi.org/", "").replace("doi:", "").strip()
    if not title and not doi:
        return None

    authors = [_flip_name(a) for t in _RIS_AUTHOR_TAGS for a in fields.get(t, [])]

    journal = clean_text(first(_RIS_JOURNAL_TAGS))
    # T2 doubles as both journal and secondary title; if it was already taken
    # as the title, it is not also the journal.
    if journal and journal == title:
        journal = ""

    return {
        "title": title,
        "authors": [a for a in authors if a],
        "year": _year_from(first(_RIS_YEAR_TAGS)),
        "abstract": clean_text(first(_RIS_ABSTRACT_TAGS)),
        "url": first(("UR", "L1")).strip() or (f"https://doi.org/{doi}" if doi else ""),
        "doi": doi,
        "journal": journal or None,
        "citationCount": 0,
        "source": "import",
    }


# ── BibTeX ───────────────────────────────────────────────────────────────────

def looks_like_bibtex(text: str) -> bool:
    return bool(re.search(r"@\w+\s*\{", text or ""))


def _split_entries(text: str) -> list[str]:
    """Each @type{...} entry, matched by counting braces.

    A regex cannot do this: BibTeX values nest braces freely ({\\'e}, {The
    {DNA} Story}), so the closing brace of an entry is only findable by
    counting.
    """
    out: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        at = text.find("@", i)
        if at < 0:
            break
        open_brace = text.find("{", at)
        if open_brace < 0:
            break
        depth = 0
        j = open_brace
        while j < n:
            ch = text[j]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        if depth != 0:
            # Truncated file: take what is left rather than dropping the entry.
            out.append(text[at:])
            break
        out.append(text[at:j + 1])
        i = j + 1
    return out


def _bib_fields(entry: str) -> dict[str, str]:
    """Field values from one entry, brace- and quote-aware."""
    body = entry[entry.find("{") + 1:].rstrip().rstrip("}")
    fields: dict[str, str] = {}
    i = 0
    n = len(body)
    while i < n:
        eq = body.find("=", i)
        if eq < 0:
            break
        key = body[max(body.rfind(",", 0, eq) + 1, 0):eq].strip().lower()
        j = eq + 1
        while j < n and body[j].isspace():
            j += 1
        if j >= n:
            break
        if body[j] == "{":
            depth = 0
            start = j + 1
            while j < n:
                if body[j] == "{":
                    depth += 1
                elif body[j] == "}":
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            value = body[start:j]
            i = j + 1
        elif body[j] == '"':
            start = j + 1
            j += 1
            while j < n and body[j] != '"':
                j += 1
            value = body[start:j]
            i = j + 1
        else:
            end = body.find(",", j)
            end = n if end < 0 else end
            value = body[j:end]
            i = end + 1
        if key and re.fullmatch(r"[a-z][a-z0-9_-]*", key):
            fields[key] = _clean_bib_value(value)
    return fields


# BibTeX writes accents as commands, and a name is not a detail to get wrong:
# "Jo{\~a}o Silva" has to come out as "João Silva" on the works-cited page, not
# "Joao" and certainly not "Jo\~ao".
_BIB_LIGATURES = {
    r"\ss": "ß", r"\AE": "Æ", r"\ae": "æ", r"\OE": "Œ", r"\oe": "œ",
    r"\AA": "Å", r"\aa": "å", r"\O": "Ø", r"\o": "ø",
    r"\L": "Ł", r"\l": "ł",
    # Dotless i and j exist only to carry an accent; the accent is applied
    # below, so they revert to the ordinary letter here.
    r"\i": "i", r"\j": "j",
}

_BIB_COMBINING = {
    "'": "\u0301", "`": "\u0300", "^": "\u0302", '"': "\u0308",
    "~": "\u0303", "=": "\u0304", ".": "\u0307", "c": "\u0327",
    "v": "\u030c", "u": "\u0306", "H": "\u030b", "r": "\u030a",
    "k": "\u0328", "b": "\u0331", "d": "\u0323",
}

_BIB_ACCENT_RE = re.compile(r"\\([`'^\"~=.cvuHrkbd])\s*\{?\s*([A-Za-z])\s*\}?")


def _clean_bib_value(value: str) -> str:
    """Resolve BibTeX escapes and strip its protective braces.

    Braces in a value are there to protect capitalisation ({DNA}) or to group
    an accent ({\\'e}); neither should reach the student's works-cited page.
    """
    # Ligatures first: they can appear inside an accent group (\^{\i}).
    for cmd, char in sorted(_BIB_LIGATURES.items(), key=lambda kv: -len(kv[0])):
        value = value.replace(cmd, char)

    def accent(m: re.Match) -> str:
        return unicodedata.normalize("NFC", m.group(2) + _BIB_COMBINING[m.group(1)])

    value = _BIB_ACCENT_RE.sub(accent, value)

    value = value.replace(r"\&", "&").replace(r"\%", "%").replace(r"\$", "$")
    value = value.replace("---", "—").replace("--", "–")
    # Whatever commands are left are formatting we have no use for (\emph, \textbf).
    value = re.sub(r"\\[a-zA-Z]+\s*", "", value)
    value = value.replace("{", "").replace("}", "")
    return clean_text(value)


def parse_bibtex(text: str) -> list[dict]:
    papers: list[dict] = []
    for entry in _split_entries(text or ""):
        f = _bib_fields(entry)
        title = f.get("title", "")
        doi = (f.get("doi") or "").replace("https://doi.org/", "").strip() or None
        if not title and not doi:
            continue

        authors = []
        if f.get("author"):
            # BibTeX joins authors with a literal " and ".
            for name in re.split(r"\s+and\s+", f["author"]):
                flipped = _flip_name(name)
                if flipped:
                    authors.append(flipped)

        papers.append({
            "title": title,
            "authors": authors,
            "year": _year_from(f.get("year", "") or f.get("date", "")),
            "abstract": f.get("abstract", ""),
            "url": f.get("url", "") or (f"https://doi.org/{doi}" if doi else ""),
            "doi": doi,
            "journal": f.get("journal") or f.get("booktitle") or f.get("publisher") or None,
            "citationCount": 0,
            "source": "import",
        })
    return papers


# ── DOI lookup ───────────────────────────────────────────────────────────────

async def fetch_by_doi(doi: str) -> Optional[dict]:
    """Resolve one DOI to a full record via CrossRef."""
    try:
        resp = await _get(f"{CROSSREF_WORKS}/{doi}", {}, timeout=12.0)
        if resp.status_code != 200:
            return None
        item = resp.json().get("message", {})
    except Exception:
        return None
    return _crossref_item_to_paper(item)


def _crossref_item_to_paper(item: dict) -> Optional[dict]:
    titles = item.get("title") or []
    title = clean_text(titles[0]) if titles else ""
    doi = item.get("DOI")
    if not title and not doi:
        return None

    authors = []
    for a in item.get("author", []) or []:
        name = f"{a.get('given', '')} {a.get('family', '')}".strip()
        if name:
            authors.append(name)

    year = None
    dates = item.get("published-print") or item.get("published-online") or item.get("issued") or {}
    parts = dates.get("date-parts") or [[]]
    if parts and parts[0]:
        year = parts[0][0]

    containers = item.get("container-title") or []
    return {
        "title": title,
        "authors": authors,
        "year": year,
        "abstract": clean_text(re.sub(r"<[^>]+>", "", item.get("abstract", "") or "")),
        "url": item.get("URL") or (f"https://doi.org/{doi}" if doi else ""),
        "doi": doi,
        "journal": clean_text(containers[0]) if containers else None,
        "citationCount": item.get("is-referenced-by-count", 0) or 0,
        "source": "crossref",
    }


# ── One entry point ──────────────────────────────────────────────────────────

MAX_IMPORT = 200
_LOOKUP_CONCURRENCY = asyncio.Semaphore(6)


def detect_format(text: str) -> str:
    """What the pasted text is. Checked in order of how specific the signal is."""
    if looks_like_ris(text):
        return "ris"
    if looks_like_bibtex(text):
        return "bibtex"
    if extract_dois(text):
        return "doi"
    return "unknown"


async def _enrich(paper: dict) -> dict:
    """Fill in what the export left out, from the publisher's own record.

    Exports are frequently missing the abstract and always missing the citation
    count, and those are exactly what the ranker and the student use to judge a
    source. A failed lookup keeps the file's own version.
    """
    doi = paper.get("doi")
    if not doi:
        return paper
    async with _LOOKUP_CONCURRENCY:
        fetched = await fetch_by_doi(doi)
    if not fetched:
        return paper
    merged = dict(paper)
    for key in ("title", "abstract", "journal", "year", "url"):
        if not merged.get(key) and fetched.get(key):
            merged[key] = fetched[key]
    if not merged.get("authors"):
        merged["authors"] = fetched.get("authors", [])
    merged["citationCount"] = fetched.get("citationCount", 0) or merged.get("citationCount", 0)
    merged["verified"] = True
    return merged


async def import_text(text: str, fmt: str = "auto") -> dict:
    """Parse pasted text or an uploaded file into Firmo's paper shape."""
    text = text or ""
    kind = detect_format(text) if fmt in ("auto", "", None) else fmt

    if kind == "ris":
        papers = parse_ris(text)
    elif kind == "bibtex":
        papers = parse_bibtex(text)
    elif kind == "doi":
        dois = extract_dois(text)[:MAX_IMPORT]
        fetched = await asyncio.gather(*(fetch_by_doi(d) for d in dois))
        papers = [p for p in fetched if p]
        # A DOI that resolves to nothing is worth reporting by name: it is
        # usually a typo the student can fix, not a dead record.
        missing = [d for d, p in zip(dois, fetched) if not p]
        return {"format": kind, "papers": papers, "count": len(papers), "unresolved": missing}
    else:
        return {"format": "unknown", "papers": [], "count": 0, "unresolved": []}

    papers = papers[:MAX_IMPORT]
    papers = list(await asyncio.gather(*(_enrich(p) for p in papers)))
    return {"format": kind, "papers": papers, "count": len(papers), "unresolved": []}
