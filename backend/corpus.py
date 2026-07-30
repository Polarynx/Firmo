"""Reading the papers, not just their abstracts.

Every ranking and claim-matching decision Firmo makes has been taken on a title
and a 250-word abstract. That is the product's real quality ceiling, and it is
invisible from the outside: an abstract will happily support a claim that the
paper itself hedges three ways on page 7.

This module puts the papers themselves into a project. A source the student
saves, if it has an open-access PDF, is fetched, split into passages, embedded,
and stored against the project. From then on a claim in their draft can be
matched to the sentence that actually backs it, with the page number — which is
the thing a title-only search cannot do at any budget.

Two deliberate limits:

  Only open-access PDFs are fetched. Firmo does not go around paywalls, and a
  tool that did would be unusable at the institutions it is trying to sell to.

  Ingest is best-effort and never blocks the student. A scanned PDF with no text
  layer, a dead link, or a publisher that refuses the request all end the same
  way: that paper contributes nothing and everything else carries on.
"""
import asyncio
import base64
import hashlib
import re
import struct
from io import BytesIO
from typing import Callable, Optional

# A paper contributes at most this many passages. Beyond it, returns diminish
# sharply — the tail of a PDF is references and appendices — while the embedding
# cost and the per-search scan grow linearly.
MAX_PASSAGES_PER_PAPER = 120
MAX_PDF_BYTES = 25_000_000
MAX_PDF_PAGES = 40
MIN_PASSAGE_CHARS = 120
MAX_PASSAGE_CHARS = 450


def source_key(paper: dict) -> str:
    """How a paper is identified inside one project's corpus."""
    doi = (paper.get("doi") or "").strip().lower()
    if doi:
        return doi[:200]
    title = re.sub(r"\s+", " ", (paper.get("title") or "").strip().lower())
    return "t:" + hashlib.sha1(title.encode("utf-8")).hexdigest()


def pack(vec: list[float]) -> str:
    """An embedding as base64 float32."""
    return base64.b64encode(struct.pack(f"{len(vec)}f", *vec)).decode("ascii")


def unpack(blob: str) -> list[float]:
    raw = base64.b64decode(blob)
    return list(struct.unpack(f"{len(raw) // 4}f", raw))


def split_pdf(data: bytes) -> list[tuple[int, str]]:
    """(page number, passage) pairs. Runs in a worker thread — pypdf is sync."""
    from pypdf import PdfReader

    reader = PdfReader(BytesIO(data))
    passages: list[tuple[int, str]] = []
    for page_no, page in enumerate(reader.pages[:MAX_PDF_PAGES], start=1):
        try:
            text = re.sub(r"[ \t]+", " ", page.extract_text() or "")
        except Exception:
            continue
        cur = ""
        for sentence in re.split(r"(?<=[.!?])\s+", text):
            sentence = sentence.strip()
            if not sentence:
                continue
            if cur and len(cur) + len(sentence) > MAX_PASSAGE_CHARS:
                if len(cur) >= MIN_PASSAGE_CHARS:
                    passages.append((page_no, cur))
                cur = sentence
            else:
                cur = f"{cur} {sentence}" if cur else sentence
        if len(cur) >= MIN_PASSAGE_CHARS:
            passages.append((page_no, cur))
    return passages[:MAX_PASSAGES_PER_PAPER]


def pdf_url_for(paper: dict) -> Optional[str]:
    """The open-access PDF for a paper, if Firmo already knows of one.

    `oa_pdf` is filled in by the Unpaywall enrichment step during a search, so
    this asks what is already known rather than going looking. Nothing here
    attempts to reach a paywalled copy.
    """
    url = (paper.get("oa_pdf") or "").strip()
    if url.lower().startswith(("http://", "https://")):
        return url
    return None


async def fetch_pdf(url: str, get: Callable) -> Optional[bytes]:
    try:
        resp = await get(url)
    except Exception:
        return None
    data = resp.content or b""
    if resp.status_code != 200 or len(data) > MAX_PDF_BYTES or not data[:5].startswith(b"%PDF"):
        return None
    return data


async def extract(data: bytes) -> list[tuple[int, str]]:
    try:
        return await asyncio.to_thread(split_pdf, data)
    except Exception:
        return []


def cosine(a: list[float], b: list[float]) -> float:
    dot = na = nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / ((na ** 0.5) * (nb ** 0.5))


def rank(query_vec: list[float], rows, top_k: int = 5) -> list[tuple[float, object]]:
    """The passages closest in meaning to a claim, best first.

    A linear scan, which is the right shape at this size: one project's corpus
    is a few thousand vectors, and an index would add a dependency and a
    rebuild step to save single-digit milliseconds.
    """
    scored = []
    for row in rows:
        if not row.vec:
            continue
        try:
            scored.append((cosine(query_vec, unpack(row.vec)), row))
        except Exception:
            continue
    scored.sort(key=lambda t: t[0], reverse=True)
    return scored[:top_k]
