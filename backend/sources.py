"""Academic source connectors + paper utilities.

Every connector returns a list of paper dicts with the same shape:
title, authors, year, abstract, url, doi, citationCount, source (+ journal when known).

All connectors share one httpx.AsyncClient: creating a client per call builds a
new SSL context each time, which is synchronous and blocks the event loop badly
when ~80 searches fire at once.
"""
import asyncio
import math
import os
import re
import xml.etree.ElementTree as ET
from typing import Callable, Optional
from urllib.parse import quote

import httpx

SEMANTIC_SCHOLAR_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
CROSSREF_URL = "https://api.crossref.org/works"
PUBMED_SEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
PUBMED_FETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
OPENALEX_URL = "https://api.openalex.org/works"
EUROPE_PMC_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
BASE_URL = "https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi"
ARXIV_URL = "http://export.arxiv.org/api/query"
DOAJ_URL = "https://doaj.org/api/search/articles"
ERIC_URL = "https://api.ies.ed.gov/eric/"
ZENODO_URL = "https://zenodo.org/api/records"
PLOS_URL = "https://api.plos.org/search"
HAL_URL = "https://api.archives-ouvertes.fr/search/"
INSPIRE_URL = "https://inspirehep.net/api/literature"
FATCAT_URL = "https://api.fatcat.wiki/v0/release/search"
OPENAIRE_URL = "https://api.openaire.eu/search/publications"
UNPAYWALL_URL = "https://api.unpaywall.org/v2"
DOAB_URL = "https://directory.doabooks.org/rest/search"

# Optional: the keyless Semantic Scholar endpoint is aggressively throttled and
# usually returns nothing; a free API key makes it a reliable source again.
_S2_KEY = os.getenv("SEMANTIC_SCHOLAR_API_KEY")

# OpenAlex's polite pool wants a real address, and it is the one index Firmo now
# leans on hardest: keyword search, seed resolution, references and cited-by all
# go through it, so a search can spend a dozen calls there. Set OPENALEX_MAILTO
# in the environment to a real address you own.
#
# Unset, Firmo sends no mailto at all rather than a placeholder. This used to
# default to "firmo@example.com", which is worse than sending nothing:
# example.com is IANA-reserved and can never receive mail, so OpenAlex reads it
# as junk, drops the request back to the common pool anyway, and Firmo pays the
# cost of identifying itself for none of the benefit — while also being the kind
# of caller their abuse tooling is designed to notice.
#
# OpenAlex now meters by BUDGET as well as by rate ("Insufficient budget. This
# request costs $0.001 but you only have $0.0001 remaining"), and the polite
# pool is the difference between hitting that occasionally and constantly.
_mailto = (os.getenv("OPENALEX_MAILTO") or "").strip()
if _mailto.lower().endswith(("@example.com", "@example.org", "@example.net")):
    _mailto = ""
OPENALEX_MAILTO = _mailto or None


def _polite(params: dict) -> dict:
    """Query params with the polite-pool contact attached, when there is one.

    httpx renders a None param as an empty `mailto=`, which is its own kind of
    junk, so the key is omitted entirely rather than sent blank.
    """
    if OPENALEX_MAILTO:
        return {**params, "mailto": OPENALEX_MAILTO}
    return params

_client: Optional[httpx.AsyncClient] = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=15.0,
            follow_redirects=True,
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=40),
        )
    return _client


# ── Rate-limit circuit breaker ────────────────────────────────────────────────
# Once a host starts answering 429, every further call is both useless and rude,
# and with retries attached it is actively harmful: a search that should take 17
# seconds took 29, spent entirely on sleeping between rejections. So when a host
# rate-limits us, stop calling it for a cooldown and fail instantly instead.
#
# Two different things arrive as 429, and a minute is the right answer to only
# one of them. A burst limit clears in seconds. A spent daily budget does not:
#
#   {"error": "Rate limit exceeded",
#    "message": "Insufficient budget. This request costs $0.001 but you only
#                have $0 remaining."}
#
# OpenAlex meters by spend as well as by rate, and a spent allowance does not
# clear on the timescale a burst limit does. Retrying it every sixty seconds is
# worse than pointless inside a search: OpenAlex is the highest-yielding
# connector we have, so each attempt burns a slot in the student's fan-out only
# to be told "no" again, while the other fourteen wait.
#
# Ten minutes, and not longer, because the window was measured rather than
# assumed. An hour was the first guess and it was wrong: after eight consecutive
# budget rejections the same endpoint was serving 200s again within minutes, so
# the allowance refills far faster than "come back tomorrow" suggests. Writing
# the best database off for an hour to save it a handful of requests would cost
# far more than it saves. If the host tells us when to return, believe it over
# any number chosen here.
_COOLDOWN_S = 60.0
_BUDGET_COOLDOWN_S = 600.0
_limited_until: dict[str, float] = {}


def _budget_exhausted(resp: httpx.Response) -> bool:
    """A 429 that means "come back tomorrow", not "slow down"."""
    try:
        return "insufficient budget" in resp.text[:400].lower()
    except Exception:
        return False


def _host(url: str) -> str:
    return url.split("/", 3)[2] if "//" in url else url


class RateLimited(Exception):
    """This host is in cooldown; the caller should degrade, not wait."""


async def _get(url: str, params: dict, timeout: float = 15.0, headers: Optional[dict] = None,
               retries: int = 0) -> httpx.Response:
    """One GET, with a per-host rate-limit breaker and optional backoff.

    `retries` is opt-in per call site: a connector that is one of fourteen firing
    in parallel should fail fast and let the others carry the search, but a
    citation hop is a chain — if the seed lookup gets a 429 the whole walk is
    lost, so those calls are worth one patient retry.
    """
    host = _host(url)
    loop = asyncio.get_running_loop()
    if loop.time() < _limited_until.get(host, 0.0):
        raise RateLimited(host)

    delay = 0.6
    for attempt in range(retries + 1):
        resp = await get_client().get(url, params=params, timeout=timeout, headers=headers)
        if resp.status_code in (429, 503):
            if _budget_exhausted(resp):
                after = resp.headers.get("retry-after")
                cool = (min(float(after), _BUDGET_COOLDOWN_S)
                        if (after or "").isdigit() else _BUDGET_COOLDOWN_S)
                if loop.time() >= _limited_until.get(host, 0.0):
                    print(f"[budget spent] {host} has no API budget left; standing down "
                          f"for {cool / 60:.0f} min and letting the other databases carry it")
                _limited_until[host] = loop.time() + cool
                resp.raise_for_status()
            _limited_until[host] = loop.time() + _COOLDOWN_S
            if attempt < retries:
                wait = resp.headers.get("retry-after")
                await asyncio.sleep(
                    min(float(wait), 5.0) if (wait or "").isdigit() else delay)
                delay *= 2
                continue
        elif resp.is_success:
            _limited_until.pop(host, None)
        resp.raise_for_status()
        return resp
    resp.raise_for_status()
    return resp


async def search_semantic_scholar(query: str, limit: int = 10, year_from: Optional[int] = None) -> list[dict]:
    params = {
        "query": query,
        "limit": limit,
        "fields": "title,authors,year,abstract,url,externalIds,citationCount,publicationTypes,journal",
        "publicationTypes": "JournalArticle,Review,MetaAnalysis,ClinicalTrial,CaseReport",
    }
    if year_from:
        params["year"] = f"{year_from}-"
    headers = {"x-api-key": _S2_KEY} if _S2_KEY else None
    try:
        data = (await _get(SEMANTIC_SCHOLAR_URL, params, headers=headers)).json()
    except Exception:
        return []

    results = []
    for paper in data.get("data", []):
        abstract = paper.get("abstract") or ""
        citation_count = paper.get("citationCount") or 0
        if not abstract and citation_count == 0:
            continue
        authors = [a.get("name", "") for a in paper.get("authors", [])]
        doi = paper.get("externalIds", {}).get("DOI")
        journal = (paper.get("journal") or {}).get("name")
        results.append({
            "title": paper.get("title", ""),
            "authors": authors,
            "year": paper.get("year"),
            "abstract": abstract,
            "url": paper.get("url", ""),
            "doi": doi,
            "journal": journal,
            "citationCount": citation_count,
            "source": "semantic_scholar",
        })
    return results


async def search_crossref(query: str, limit: int = 8, year_from: Optional[int] = None) -> list[dict]:
    # Repeated type filters are OR'd by Crossref; books/chapters/monographs are
    # essential for humanities coverage.
    filter_str = "type:journal-article,type:book-chapter,type:book,type:monograph,type:edited-book"
    if year_from:
        filter_str += f",from-pub-date:{year_from}"
    params = {
        "query.bibliographic": query,
        "rows": limit,
        "filter": filter_str,
        "sort": "relevance",
        "select": "DOI,title,author,published-print,published-online,abstract,container-title,is-referenced-by-count,URL",
    }
    try:
        data = (await _get(CROSSREF_URL, params)).json()
    except Exception:
        return []

    results = []
    for item in data.get("message", {}).get("items", []):
        abstract_raw = item.get("abstract", "")
        abstract = re.sub(r"<[^>]+>", "", abstract_raw)
        citation_count = item.get("is-referenced-by-count", 0) or 0
        if not abstract and citation_count == 0:
            continue

        authors = []
        for a in item.get("author", []):
            name = f"{a.get('given', '')} {a.get('family', '')}".strip()
            if name:
                authors.append(name)

        year = None
        date_parts = item.get("published-print", item.get("published-online", {})).get("date-parts", [[]])
        if date_parts and date_parts[0]:
            year = date_parts[0][0]

        doi = item.get("DOI") or None
        url = item.get("URL") or (f"https://doi.org/{doi}" if doi else "")
        title_list = item.get("title", [""])
        journal_list = item.get("container-title", [])

        results.append({
            "title": title_list[0] if title_list else "",
            "authors": authors,
            "year": year,
            "abstract": abstract,
            "url": url,
            "doi": doi,
            "journal": journal_list[0] if journal_list else None,
            "citationCount": citation_count,
            "source": "crossref",
        })
    return results


async def search_pubmed(query: str, limit: int = 8, year_from: Optional[int] = None) -> list[dict]:
    term = f"({query})"
    if year_from:
        term += f" AND {year_from}:3000[dp]"
    try:
        search_resp = await _get(PUBMED_SEARCH_URL, {
            "db": "pubmed", "term": term, "retmax": limit,
            "retmode": "json", "sort": "relevance",
        }, timeout=20.0)
        ids = search_resp.json().get("esearchresult", {}).get("idlist", [])
        if not ids:
            return []

        fetch_resp = await _get(PUBMED_FETCH_URL, {
            "db": "pubmed", "id": ",".join(ids), "retmode": "xml",
        }, timeout=20.0)
        root = ET.fromstring(fetch_resp.text)
    except Exception:
        return []

    results = []
    for article in root.findall(".//PubmedArticle"):
        try:
            pmid_el = article.find(".//PMID")
            pmid = pmid_el.text if pmid_el is not None else ""

            title_el = article.find(".//ArticleTitle")
            title = "".join(title_el.itertext()) if title_el is not None else ""

            abstract_parts = article.findall(".//AbstractText")
            abstract_pieces = []
            for el in abstract_parts:
                label = el.get("Label")
                text = "".join(el.itertext()).strip()
                if text:
                    abstract_pieces.append(f"{label}: {text}" if label else text)
            abstract = " ".join(abstract_pieces)

            year = None
            year_el = article.find(".//PubDate/Year")
            if year_el is not None and year_el.text:
                try:
                    year = int(year_el.text)
                except ValueError:
                    pass

            authors = []
            for author in article.findall(".//Author"):
                last = author.findtext("LastName", "")
                fore = author.findtext("ForeName", "")
                name = f"{fore} {last}".strip()
                if name:
                    authors.append(name)

            doi = None
            for id_el in article.findall(".//ArticleId"):
                if id_el.get("IdType") == "doi":
                    doi = id_el.text
                    break

            journal = article.findtext(".//Journal/Title") or None
            url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else ""

            if not title:
                continue

            results.append({
                "title": title,
                "authors": authors,
                "year": year,
                "abstract": abstract,
                "url": url,
                "doi": doi,
                "journal": journal,
                "citationCount": 0,
                "source": "pubmed",
            })
        except Exception:
            continue

    return results


async def search_europe_pmc(query: str, limit: int = 8, year_from: Optional[int] = None) -> list[dict]:
    q = query
    if year_from:
        q += f" FIRST_PDATE:[{year_from}-01-01 TO *]"
    # No `sort`. Europe PMC sorts by relevance already, and it has no RELEVANCE
    # keyword — asking for one is not an error, it is a silent empty envelope:
    # `{"version": "6.9"}` with HTTP 200, no hitCount, no results. Paired with
    # the `except: return []` below, that made this connector look like a
    # database with nothing to say about any topic, for every query, invisibly.
    # It indexes 40 million biomedical records; it was returning zero.
    params = {
        "query": q,
        "format": "json",
        "resultType": "core",
        "pageSize": limit,
    }
    try:
        data = (await _get(EUROPE_PMC_URL, params)).json()
    except Exception:
        return []

    results = []
    for item in data.get("resultList", {}).get("result", []):
        title = item.get("title", "")
        if not title:
            continue

        abstract = item.get("abstractText", "") or ""
        authors_raw = item.get("authorList", {}).get("author", [])
        authors = [
            f"{a.get('firstName', '')} {a.get('lastName', '')}".strip()
            for a in authors_raw if isinstance(a, dict)
        ]

        year = None
        pub_year = item.get("pubYear")
        if pub_year:
            try:
                year = int(pub_year)
            except ValueError:
                pass

        doi = item.get("doi") or None
        journal = (item.get("journalInfo", {}).get("journal", {}) or {}).get("title")
        url = item.get("fullTextUrlList", {})
        url = next(
            (u.get("url", "") for u in url.get("fullTextUrl", []) if u.get("availabilityCode") == "OA"),
            f"https://doi.org/{doi}" if doi else f"https://europepmc.org/article/{item.get('source','')}/{item.get('id','')}"
        )

        results.append({
            "title": title,
            "authors": authors,
            "year": year,
            "abstract": abstract,
            "url": url,
            "doi": doi,
            "journal": journal,
            "citationCount": item.get("citedByCount", 0) or 0,
            "source": "europe_pmc",
        })
    return results


async def search_base(query: str, limit: int = 8, year_from: Optional[int] = None) -> list[dict]:
    """Bielefeld Academic Search Engine: free, no key, cross-disciplinary."""
    q = query
    if year_from:
        q += f" year:{year_from}-2099"
    params = {
        "func": "PerformSearch",
        "query": q,
        "hits": limit,
        "format": "json",
    }
    try:
        data = (await _get(BASE_URL, params)).json()
    except Exception:
        return []

    results = []
    for doc in data.get("response", {}).get("docs", []):
        title_raw = doc.get("dctitle", "") or ""
        title = title_raw if isinstance(title_raw, str) else (title_raw[0] if title_raw else "")
        if not title:
            continue

        authors_raw = doc.get("dccreator", []) or []
        authors = authors_raw if isinstance(authors_raw, list) else [authors_raw]

        abstract_raw = doc.get("dcdescription", "") or ""
        abstract = abstract_raw if isinstance(abstract_raw, str) else (abstract_raw[0] if abstract_raw else "")

        year = None
        date = doc.get("dcdate", "") or ""
        year_match = re.search(r'\d{4}', str(date))
        if year_match:
            try:
                year = int(year_match.group())
            except ValueError:
                pass

        doi_raw = doc.get("dcdoi", "") or ""
        doi = doi_raw if isinstance(doi_raw, str) and doi_raw else None
        url = doc.get("dcidentifier", "") or (f"https://doi.org/{doi}" if doi else "")
        if isinstance(url, list):
            url = url[0] if url else ""

        results.append({
            "title": title,
            "authors": authors,
            "year": year,
            "abstract": abstract,
            "url": url,
            "doi": doi,
            "citationCount": 0,
            "source": "base",
        })
    return results


async def search_openalex(query: str, limit: int = 8, year_from: Optional[int] = None) -> list[dict]:
    # Books, chapters, and dissertations matter as much as articles in the
    # humanities, so filtering to articles only starves history/culture topics.
    filter_str = "type:article|review|book|book-chapter|dissertation"
    if year_from:
        filter_str += f",publication_year:>{year_from - 1}"
    params = _polite({
        "search": query,
        "filter": filter_str,
        "per-page": limit,
        "select": OPENALEX_SELECT,
        "sort": "relevance_score:desc",
    })
    try:
        data = (await _get(OPENALEX_URL, params)).json()
    except Exception:
        return []

    return [p for p in (_openalex_paper(w) for w in data.get("results", [])) if p]


# The fields every OpenAlex read needs. Kept in one place because the keyword
# search and the citation-graph expansion below must return identically shaped
# papers, or the deduper sees the same work twice.
OPENALEX_SELECT = (
    "id,title,authorships,publication_year,abstract_inverted_index,doi,"
    "cited_by_count,primary_location,is_retracted"
)


def _openalex_paper(work: dict) -> Optional[dict]:
    """One OpenAlex work as a Firmo paper, or None if it is unusable."""
    title = work.get("title", "")
    if not title:
        return None

    authors = [
        a.get("author", {}).get("display_name", "")
        for a in work.get("authorships", [])
    ]

    # Reconstruct abstract from inverted index
    abstract = ""
    inv = work.get("abstract_inverted_index")
    if inv:
        word_positions = [(word, pos) for word, positions in inv.items() for pos in positions]
        word_positions.sort(key=lambda x: x[1])
        abstract = " ".join(w for w, _ in word_positions)

    doi_raw = work.get("doi", "")
    doi = doi_raw.replace("https://doi.org/", "") if doi_raw else None
    loc = work.get("primary_location") or {}
    journal = (loc.get("source") or {}).get("display_name")
    url = loc.get("landing_page_url") or (f"https://doi.org/{doi}" if doi else "")

    return {
        "title": title,
        "authors": authors,
        "year": work.get("publication_year"),
        "abstract": abstract,
        "url": url,
        "doi": doi,
        "journal": journal,
        "citationCount": work.get("cited_by_count", 0),
        "source": "openalex",
        "retracted": bool(work.get("is_retracted")),
    }


async def search_arxiv(query: str, limit: int = 8, year_from: Optional[int] = None) -> list[dict]:
    """arXiv: free preprint server for physics, math, CS, biology, and more."""
    params = {"search_query": f"all:{query}", "start": 0, "max_results": limit, "sortBy": "relevance"}
    try:
        root = ET.fromstring((await _get(ARXIV_URL, params)).text)
    except Exception:
        return []

    ns = "http://www.w3.org/2005/Atom"
    results = []
    for entry in root.findall(f"{{{ns}}}entry"):
        title_el = entry.find(f"{{{ns}}}title")
        title = (title_el.text or "").strip() if title_el is not None else ""
        if not title:
            continue
        authors = [
            name_el.text.strip()
            for a_el in entry.findall(f"{{{ns}}}author")
            for name_el in [a_el.find(f"{{{ns}}}name")]
            if name_el is not None and name_el.text
        ]
        summary_el = entry.find(f"{{{ns}}}summary")
        abstract = (summary_el.text or "").strip() if summary_el is not None else ""
        id_el = entry.find(f"{{{ns}}}id")
        url = (id_el.text or "").strip() if id_el is not None else ""
        year = None
        pub_el = entry.find(f"{{{ns}}}published")
        if pub_el is not None and pub_el.text:
            m = re.search(r'\d{4}', pub_el.text)
            if m:
                year = int(m.group())
        if year_from and year and year < year_from:
            continue
        if not abstract:
            continue
        results.append({"title": title, "authors": authors, "year": year, "abstract": abstract,
                        "url": url, "doi": None, "citationCount": 0, "source": "arxiv"})
    return results


async def search_doaj(query: str, limit: int = 8, year_from: Optional[int] = None) -> list[dict]:
    """DOAJ: Directory of Open Access Journals, peer-reviewed open-access articles."""
    # The search term goes in the path, not in `q`. DOAJ answers a query
    # parameter with a flat 404 — which the bare `except` below turned into an
    # empty result list, so this read as "DOAJ knows nothing about your topic"
    # rather than "we have been calling the wrong URL".
    url = f"{DOAJ_URL.rstrip('/')}/{quote(query, safe='')}"
    try:
        data = (await _get(url, {"pageSize": limit})).json()
    except Exception:
        return []

    results = []
    for item in data.get("results", []):
        bib = item.get("bibjson", {})
        title = bib.get("title", "")
        if not title:
            continue
        authors = [a.get("name", "") for a in bib.get("author", [])]
        abstract = bib.get("abstract", "") or ""
        year = None
        try:
            year = int(bib.get("year") or 0) or None
        except (ValueError, TypeError):
            pass
        if year_from and year and year < year_from:
            continue
        doi = bib.get("doi") or None
        journal = (bib.get("journal") or {}).get("title")
        links = bib.get("link", [])
        url = next((l.get("url", "") for l in links if l.get("type") == "fulltext"), "")
        if not url and doi:
            url = f"https://doi.org/{doi}"
        if not abstract:
            continue
        results.append({"title": title, "authors": authors, "year": year, "abstract": abstract,
                        "url": url, "doi": doi, "journal": journal, "citationCount": 0, "source": "doaj"})
    return results


async def search_eric(query: str, limit: int = 8, year_from: Optional[int] = None) -> list[dict]:
    """ERIC: US Dept of Education database for education research papers."""
    params = {"search": query, "fields": "id,title,author,description,publicationdateyear,url",
              "format": "json", "rows": limit}
    try:
        data = (await _get(ERIC_URL, params)).json()
    except Exception:
        return []

    results = []
    for doc in data.get("response", {}).get("docs", []):
        title = doc.get("title", "")
        if not title:
            continue
        authors_raw = doc.get("author", []) or []
        authors = authors_raw if isinstance(authors_raw, list) else [authors_raw]
        abstract = doc.get("description", "") or ""
        year = None
        try:
            year = int(doc.get("publicationdateyear") or 0) or None
        except (ValueError, TypeError):
            pass
        if year_from and year and year < year_from:
            continue
        eric_id = doc.get("id", "")
        url = doc.get("url", "") or (f"https://eric.ed.gov/?id={eric_id}" if eric_id else "")
        if not abstract:
            continue
        results.append({"title": title, "authors": authors, "year": year, "abstract": abstract,
                        "url": url, "doi": None, "citationCount": 0, "source": "eric"})
    return results


async def search_zenodo(query: str, limit: int = 8, year_from: Optional[int] = None) -> list[dict]:
    """Zenodo: CERN open research repository for papers, datasets, and preprints."""
    params = {"q": query, "type": "publication", "size": limit, "sort": "bestmatch"}
    try:
        data = (await _get(ZENODO_URL, params)).json()
    except Exception:
        return []

    results = []
    for hit in data.get("hits", {}).get("hits", []):
        meta = hit.get("metadata", hit)
        title = meta.get("title", "")
        if not title:
            continue
        creators = meta.get("creators", [])
        authors = [c.get("name", "") for c in creators]
        abstract = re.sub(r"<[^>]+>", "", meta.get("description", "") or "")
        year = None
        pub_date = meta.get("publication_date", "")
        if pub_date:
            m = re.search(r'\d{4}', pub_date)
            if m:
                year = int(m.group())
        if year_from and year and year < year_from:
            continue
        doi = meta.get("doi") or hit.get("doi") or None
        url = hit.get("links", {}).get("html", "") or (f"https://doi.org/{doi}" if doi else "")
        if not abstract:
            continue
        results.append({"title": title, "authors": authors, "year": year, "abstract": abstract,
                        "url": url, "doi": doi, "citationCount": 0, "source": "zenodo"})
    return results


async def search_plos(query: str, limit: int = 6, year_from: Optional[int] = None) -> list[dict]:
    """PLOS: Public Library of Science open-access journals."""
    params = {"q": query, "fl": "id,title_display,author_display,abstract,publication_date,journal",
              "wt": "json", "rows": limit}
    try:
        data = (await _get(PLOS_URL, params)).json()
    except Exception:
        return []

    results = []
    for doc in data.get("response", {}).get("docs", []):
        title = doc.get("title_display", "")
        if not title:
            continue
        authors_raw = doc.get("author_display", []) or []
        authors = authors_raw if isinstance(authors_raw, list) else [authors_raw]
        abstract_raw = doc.get("abstract", []) or []
        abstract = " ".join(abstract_raw) if isinstance(abstract_raw, list) else (abstract_raw or "")
        year = None
        pub_date = doc.get("publication_date", "")
        if pub_date:
            m = re.search(r'\d{4}', pub_date)
            if m:
                year = int(m.group())
        if year_from and year and year < year_from:
            continue
        doi = doc.get("id") or None
        journal = doc.get("journal") or None
        url = f"https://doi.org/{doi}" if doi else ""
        if not abstract:
            continue
        results.append({"title": title, "authors": authors, "year": year, "abstract": abstract,
                        "url": url, "doi": doi, "journal": journal, "citationCount": 0, "source": "plos"})
    return results


async def search_hal(query: str, limit: int = 8, year_from: Optional[int] = None) -> list[dict]:
    """HAL: French/European open archive of scholarly research across all disciplines."""
    fq = "docType_s:ART"
    if year_from:
        fq += f" AND producedDate_i:[{year_from} TO *]"
    params = {"q": query, "rows": limit, "fl": "title_s,authFullName_s,abstract_s,producedDate_i,doi_s,uri_s",
              "fq": fq, "wt": "json"}
    try:
        data = (await _get(HAL_URL, params)).json()
    except Exception:
        return []

    results = []
    for doc in data.get("response", {}).get("docs", []):
        title_raw = doc.get("title_s", [])
        title = (title_raw[0] if isinstance(title_raw, list) and title_raw else title_raw) or ""
        if not title:
            continue
        authors = doc.get("authFullName_s", []) or []
        abstract_raw = doc.get("abstract_s", [])
        abstract = (abstract_raw[0] if isinstance(abstract_raw, list) and abstract_raw else abstract_raw) or ""
        year = None
        try:
            year = int(doc.get("producedDate_i") or 0) or None
        except (ValueError, TypeError):
            pass
        if year_from and year and year < year_from:
            continue
        doi = doc.get("doi_s") or None
        url = doc.get("uri_s", "") or (f"https://doi.org/{doi}" if doi else "")
        if not abstract:
            continue
        results.append({"title": title, "authors": authors, "year": year, "abstract": abstract,
                        "url": url, "doi": doi, "citationCount": 0, "source": "hal"})
    return results


async def search_inspire(query: str, limit: int = 8, year_from: Optional[int] = None) -> list[dict]:
    """INSPIRE-HEP: leading database for high-energy physics and related fields."""
    q = query
    if year_from:
        q = f"{query} AND date {year_from}--"
    params = {"q": q, "size": limit, "sort": "mostrecent",
              "fields": "titles,authors,abstracts,publication_info,dois,arxiv_eprints,citation_count"}
    try:
        data = (await _get(INSPIRE_URL, params)).json()
    except Exception:
        return []

    results = []
    for hit in data.get("hits", {}).get("hits", []):
        meta = hit.get("metadata", {})
        titles = meta.get("titles", [])
        title = titles[0].get("title", "") if titles else ""
        if not title:
            continue
        authors = [a.get("full_name", "") for a in meta.get("authors", [])[:12]]
        abstracts = meta.get("abstracts", [])
        abstract = abstracts[0].get("value", "") if abstracts else ""
        year = None
        pub_info = meta.get("publication_info", [])
        if pub_info:
            year = pub_info[0].get("year")
        if year_from and year and year < year_from:
            continue
        dois = meta.get("dois", [])
        doi = dois[0].get("value", "") if dois else None
        arxiv_ids = meta.get("arxiv_eprints", [])
        arxiv_id = arxiv_ids[0].get("value", "") if arxiv_ids else ""
        if doi:
            url = f"https://doi.org/{doi}"
        elif arxiv_id:
            url = f"https://arxiv.org/abs/{arxiv_id}"
        else:
            url = f"https://inspirehep.net/literature/{hit.get('id', '')}"
        if not abstract:
            continue
        results.append({"title": title, "authors": authors, "year": year, "abstract": abstract,
                        "url": url, "doi": doi, "citationCount": meta.get("citation_count", 0) or 0,
                        "source": "inspire_hep"})
    return results


async def search_fatcat(query: str, limit: int = 8, year_from: Optional[int] = None) -> list[dict]:
    """fatcat: Internet Archive Scholar index of hundreds of millions of papers."""
    params = {"q": query, "limit": limit}
    try:
        data = (await _get(FATCAT_URL, params)).json()
    except Exception:
        return []

    hits_raw = data.get("hits", {})
    hits_list = hits_raw.get("hits", hits_raw) if isinstance(hits_raw, dict) else hits_raw
    if not isinstance(hits_list, list):
        return []

    results = []
    for hit in hits_list:
        item = hit.get("_source", hit)
        title = item.get("title", "")
        if not title:
            continue
        contrib_names = item.get("contrib_names", [])
        if not contrib_names:
            contrib_names = [
                c.get("raw_name") or f"{c.get('given_name','')} {c.get('surname','')}".strip()
                for c in item.get("contribs", [])
            ]
        authors = [a for a in contrib_names if a]
        abstracts = item.get("abstracts", [])
        abstract = abstracts[0].get("content", "") if abstracts else ""
        year = None
        try:
            year = int(item.get("release_year") or 0) or None
        except (ValueError, TypeError):
            pass
        if year_from and year and year < year_from:
            continue
        ext_ids = item.get("ext_ids", {})
        doi = item.get("doi") or ext_ids.get("doi") or None
        if doi:
            url = f"https://doi.org/{doi}"
        else:
            urls_list = item.get("urls", [])
            url = urls_list[0].get("url", "") if urls_list else ""
        if not abstract:
            continue
        results.append({"title": title, "authors": authors, "year": year, "abstract": abstract,
                        "url": url, "doi": doi, "citationCount": 0, "source": "fatcat"})
    return results


def _oaf_first(v):
    """OpenAIRE OAF fields are dict-or-list-of-dicts; return the first dict."""
    if isinstance(v, list):
        return v[0] if v else {}
    return v or {}


async def search_openaire(query: str, limit: int = 8, year_from: Optional[int] = None) -> list[dict]:
    """OpenAIRE: EU aggregator of institutional repositories; strong humanities coverage."""
    params = {"keywords": query, "format": "json", "size": limit, "sortBy": "resultdateofacceptance,descending"}
    if year_from:
        params["fromDateAccepted"] = f"{year_from}-01-01"
    try:
        data = (await _get(OPENAIRE_URL, params)).json()
    except Exception:
        return []

    raw = ((data.get("response", {}).get("results") or {}).get("result")) or []
    if isinstance(raw, dict):
        raw = [raw]

    results = []
    for res in raw:
        ent = (res.get("metadata", {}).get("oaf:entity", {}) or {}).get("oaf:result", {}) or {}

        title = _oaf_first(ent.get("title")).get("$", "")
        if not title:
            continue

        creators = ent.get("creator")
        if isinstance(creators, dict):
            creators = [creators]
        authors = [c.get("$", "") for c in (creators or []) if isinstance(c, dict)]

        abstract = _oaf_first(ent.get("description")).get("$", "") or ""
        if not abstract:
            continue

        year = None
        date = _oaf_first(ent.get("dateofacceptance")).get("$", "")
        m = re.search(r"\d{4}", str(date))
        if m:
            year = int(m.group())
        if year_from and year and year < year_from:
            continue

        pids = ent.get("pid")
        if isinstance(pids, dict):
            pids = [pids]
        doi = next(
            (str(p.get("$", "")) for p in (pids or []) if isinstance(p, dict) and p.get("@classid") == "doi"),
            None,
        ) or None

        journal = _oaf_first(ent.get("journal")).get("$") or None
        if doi:
            url = f"https://doi.org/{doi}"
        else:
            obj_id = (res.get("header", {}).get("dri:objIdentifier") or {}).get("$", "")
            url = f"https://explore.openaire.eu/search/publication?articleId={obj_id}" if obj_id else ""

        results.append({"title": title, "authors": authors, "year": year, "abstract": abstract,
                        "url": url, "doi": doi, "journal": journal, "citationCount": 0,
                        "source": "openaire"})
    return results


async def search_doab(query: str, limit: int = 6, year_from: Optional[int] = None) -> list[dict]:
    """DOAB: Directory of Open Access Books, peer-reviewed scholarly books.

    Books are badly under-covered by the article-first databases, so DOAB is the
    difference-maker for humanities and history topics.
    """
    params = {"query": query, "expand": "metadata"}
    try:
        data = (await _get(DOAB_URL, params)).json()
    except Exception:
        return []
    if not isinstance(data, list):
        return []

    results = []
    for item in data[:limit]:
        md = item.get("metadata", [])
        if not isinstance(md, list):
            continue
        vals: dict = {}
        for m in md:
            k, v = m.get("key"), m.get("value")
            if k is not None and v is not None:
                vals.setdefault(k, []).append(v)

        def first(key: str) -> str:
            xs = vals.get(key) or []
            return xs[0] if xs else ""

        title = first("dc.title")
        abstract = first("dc.description.abstract")
        if not title or not abstract:
            continue

        year = None
        m = re.search(r"\d{4}", first("dc.date.issued"))
        if m:
            year = int(m.group())
        if year_from and year and year < year_from:
            continue

        doi = first("oapen.identifier.doi") or None
        handle = item.get("handle", "")
        if doi:
            url = f"https://doi.org/{doi}"
        elif handle:
            url = f"https://directory.doabooks.org/handle/{handle}"
        else:
            url = first("dc.identifier.uri")

        results.append({
            "title": title,
            "authors": vals.get("dc.contributor.author", []) or [],
            "year": year,
            "abstract": abstract,
            "url": url,
            "doi": doi,
            "journal": first("oapen.relation.isPublishedBy") or None,
            "citationCount": 0,
            "source": "doab",
        })
    return results


# ── Fan-out search ────────────────────────────────────────────────────────────

# (connector, per-query result limit). Ordered roughly by quality of results.
# fatcat was removed: its endpoint reliably times out at 15s and returns nothing,
# so it only ever occupied a task slot and dragged the progress bar. DOAB (open
# access books) took its place to broaden humanities/history coverage.
ALL_CONNECTORS: list[tuple] = [
    (search_semantic_scholar, 15),
    (search_openalex, 12),
    (search_crossref, 8),
    (search_pubmed, 10),
    (search_europe_pmc, 10),
    (search_doaj, 8),
    (search_eric, 8),
    (search_arxiv, 8),
    (search_plos, 6),
    (search_hal, 8),
    (search_openaire, 8),
    (search_zenodo, 8),
    (search_inspire, 8),
    (search_doab, 6),
]

# BASE is off unless the deployment has registered for it.
#
# It authorises by IP, not by key or user agent: every request from an
# unregistered address comes back as HTTP 200 carrying
# `<error>Access denied for IP address ...</error>`, which the connector reads
# as a search with no results. Tested from this machine with a plain httpx
# agent, a polite contact agent and a browser agent — the address is what it
# objects to, so no amount of header work reaches it.
#
# Left in the fan-out it was a guaranteed failure in every search: one of the
# ~98 request slots spent to be refused, on every query a student types. Off by
# default, and switched on by a deployment that has registered its address with
# Bielefeld:
#
#     FIRMO_ENABLE_BASE=1
#
# Kept rather than deleted because the index is real and worth having — 400
# million documents, unusually strong on European and grey literature — and the
# only thing standing between us and it is a form.
if os.getenv("FIRMO_ENABLE_BASE") == "1":
    ALL_CONNECTORS.append((search_base, 8))

# A fast, broad-coverage subset for latency-sensitive lookups where we only need a
# handful of solid abstracts per query rather than exhaustive coverage, e.g. checking
# each claim in a pasted draft against real sources. These four are reliably quick and
# span the sciences, social sciences, and humanities.
FAST_CONNECTORS: list[tuple] = [
    (search_openalex, 8),
    (search_semantic_scholar, 8),
    (search_crossref, 6),
    (search_europe_pmc, 6),
]


# ── Connector health ────────────────────────────────────────────────────────
#
# Every connector ends in `except Exception: return []`, which is right for a
# search — one database being down must not take the other fourteen with it.
# What it is not is silent-by-design, and that is how it was behaving: an empty
# list means "nothing on this topic" and "we have been calling a 404 for weeks"
# equally well, and nothing downstream can tell them apart.
#
# Two connectors sat dead for exactly that reason. Europe PMC was being sent a
# sort key it does not have and answering with an empty envelope; DOAJ was being
# sent its search term as a query parameter when it wants one in the path. Both
# returned zero for every query, for every user, and the only trace was a number
# nobody was looking at. Between them that is 40 million biomedical records and
# the whole open-access directory.
#
# So a connector that returns nothing for an entire fan-out gets counted, and
# says so the first time. This does not fix anything by itself. It just means
# the next one to break is noticed in a log line rather than in a benchmark six
# weeks later.
# Two windows, because silence means different things to different databases.
#
# A general index has something for any topic a student brings, so three quiet
# searches in a row is already odd. A specialist does not: INSPIRE holding
# nothing on high-conflict divorce is INSPIRE working. Judging the two alike
# would cry wolf at the physics database for every humanities session, and a
# check that fires constantly is worth less than no check at all.
#
# What separates a quiet specialist from a broken one is the long run. A
# specialist eventually gets a search in its own field and answers; a broken
# connector never answers, whatever it is asked. Twenty-five is long enough for
# that to show and short enough to notice within a session. It is why DOAJ gets
# caught here — an open-access directory is not general enough for the short
# window, but it was returning zero for every query on earth.
_GENERAL_CONNECTORS = {
    "search_openalex", "search_crossref", "search_semantic_scholar",
    "search_openaire", "search_base", "search_zenodo",
}
_DEAD_AFTER = 3
_DEAD_AFTER_SPECIALIST = 25

_dead_streak: dict[str, int] = {}


def _threshold(name: str) -> int:
    return _DEAD_AFTER if name in _GENERAL_CONNECTORS else _DEAD_AFTER_SPECIALIST


def _note_yield(name: str, count: int) -> None:
    if count > 0:
        if _dead_streak.pop(name, 0) >= _threshold(name):
            print(f"[connector recovered] {name} is returning results again")
        return
    _dead_streak[name] = n = _dead_streak.get(name, 0) + 1
    if n == _threshold(name):
        # ASCII only. The Windows console is cp1252 and turns an em dash into a
        # replacement character, which is a poor look for the line whose whole
        # job is to be noticed.
        print(f"[connector silent] {name} has returned nothing for "
              f"{n} consecutive searches - check its URL, params and key")


def connector_health() -> dict:
    """Connectors currently past their silence threshold. For diagnostics."""
    return {k: v for k, v in _dead_streak.items() if v >= _threshold(k)}


async def search_all(
    queries: list[str],
    year_from: Optional[int] = None,
    budget: float = 10.0,
    on_progress: Optional[Callable] = None,
    connectors: Optional[list[tuple]] = None,
) -> list[dict]:
    """Fire every connector for every query in parallel with a hard time budget.

    Whatever has arrived when the budget expires is what we use: one slow
    database never blocks the whole search. `on_progress(done, total, papers_so_far)`
    is awaited after each completion batch. Pass `connectors` (e.g. FAST_CONNECTORS)
    to search a smaller, quicker subset instead of every database.
    """
    connectors = connectors or ALL_CONNECTORS
    tasks = {}
    for q in queries:
        for fn, limit in connectors:
            task = asyncio.create_task(fn(q, limit=limit, year_from=year_from))
            # Which query a task belongs to, so the caller can report progress
            # per search arm rather than as one undifferentiated bar. A student
            # watching "Collecting results · 214 papers" learns nothing; watching
            # each of their seven queries land tells them which phrasing worked.
            # The connector name rides along so a database that has quietly
            # stopped answering can be told apart from one with nothing to say.
            tasks[task] = (q, fn.__name__)

    total = len(tasks)
    papers: list[dict] = []
    per_query: dict[str, int] = {q: 0 for q in queries}
    per_connector: dict[str, int] = {fn.__name__: 0 for fn, _ in connectors}
    done_count = 0

    loop = asyncio.get_running_loop()
    deadline = loop.time() + budget
    pending = set(tasks)
    while pending:
        timeout = deadline - loop.time()
        if timeout <= 0:
            break
        done, pending = await asyncio.wait(pending, timeout=timeout, return_when=asyncio.FIRST_COMPLETED)
        for t in done:
            done_count += 1
            q, name = tasks[t]
            try:
                found = t.result()
            except Exception:
                continue
            papers.extend(found)
            per_query[q] = per_query.get(q, 0) + len(found)
            per_connector[name] = per_connector.get(name, 0) + len(found)
        if done and on_progress:
            await on_progress(done_count, total, len(papers), dict(per_query))

    # Only connectors that got to finish are judged. One cancelled at the
    # deadline is slow, not broken, and counting it as silent would raise the
    # alarm on whichever database happens to be furthest away.
    finished: set[str] = {name for t, (_, name) in tasks.items() if t not in pending}
    for t in pending:
        t.cancel()
    for name in finished:
        _note_yield(name, per_connector.get(name, 0))

    return papers


# ── Citation-graph expansion ──────────────────────────────────────────────────
#
# Why this exists. The eval harness showed recall@10 of 0.06: for a topic like
# high-conflict divorce and children, the canonical papers were not merely
# ranked badly, they were absent from the entire 60-paper pool. Keyword fan-out
# cannot reach them, because the phrase a student types and the title a 2001
# paper was given rarely share vocabulary.
#
# What does reach them is the citation graph. The canonical paper on a topic is,
# almost by definition, the one that the on-topic papers we *did* find all cite,
# or the one they all descend from. So: take the best few hits, walk one hop in
# both directions, and let the neighbourhood surface its own landmarks.


async def _openalex_by_ids(ids: list[str], year_from: Optional[int] = None) -> list[dict]:
    """Fetch OpenAlex works by ID, in batches the filter parameter can carry."""
    out: list[dict] = []
    for i in range(0, len(ids), 40):
        batch = ids[i:i + 40]
        short = [w.rsplit("/", 1)[-1] for w in batch]
        filter_str = "openalex_id:" + "|".join(short)
        if year_from:
            filter_str += f",publication_year:>{year_from - 1}"
        try:
            data = (await _get(OPENALEX_URL, _polite({
                "filter": filter_str,
                "per-page": len(short),
                "select": OPENALEX_SELECT,
            }), retries=1)).json()
        except Exception:
            continue
        out.extend(p for p in (_openalex_paper(w) for w in data.get("results", [])) if p)
    return out


SEED_SELECT = "id,title,referenced_works"


async def _seed_work(paper: dict) -> Optional[dict]:
    """The OpenAlex work for one of our papers, with its outbound references.

    Resolving by DOI is exact, but most connectors hand back records without
    one — Semantic Scholar and BASE especially — and the best-ranked hits are
    routinely among them. When only DOI-bearing papers could seed the hop, four
    of the top six seeds were skipped and the walk started from whatever
    obscure record happened to carry a DOI. So fall back to a title lookup,
    accepted only on a near-exact match, since a loose title match would seed
    the walk from the wrong paper entirely.
    """
    doi = paper.get("doi")
    if doi:
        try:
            return (await _get(
                f"{OPENALEX_URL}/doi:{doi}",
                _polite({"select": SEED_SELECT}),
                timeout=10.0, retries=1,
            )).json()
        except Exception:
            pass

    title = (paper.get("title") or "").strip()
    if len(title) < 12:
        return None
    try:
        data = (await _get(OPENALEX_URL, _polite({
            "search": title[:200],
            "per-page": 3,
            "select": SEED_SELECT,
        }), timeout=10.0, retries=1)).json()
    except Exception:
        return None

    want = _title_key(title)
    for work in data.get("results", []):
        if _title_key(work.get("title") or "") == want:
            return work
    return None


def _title_key(title: str) -> str:
    """A title reduced to comparable form: lowercase, alphanumerics only."""
    return re.sub(r'[^a-z0-9]+', '', (title or "").lower())


async def _cited_by(work_id: str, limit: int, year_from: Optional[int] = None) -> list[dict]:
    """The most-cited papers that cite this one — the descendants that matter."""
    short = work_id.rsplit("/", 1)[-1]
    filter_str = f"cites:{short}"
    if year_from:
        filter_str += f",publication_year:>{year_from - 1}"
    try:
        data = (await _get(OPENALEX_URL, _polite({
            "filter": filter_str,
            "per-page": limit,
            "select": OPENALEX_SELECT,
            "sort": "cited_by_count:desc",
        }), retries=1)).json()
    except Exception:
        return []
    return [p for p in (_openalex_paper(w) for w in data.get("results", [])) if p]


async def expand_by_citations(
    seeds: list[dict],
    max_seeds: int = 6,
    max_refs: int = 120,
    cited_by_per_seed: int = 15,
    year_from: Optional[int] = None,
    seed_budget: float = 7.0,
    budget: float = 9.0,
) -> list[dict]:
    """One hop out from the best hits, in both directions along the citation graph.

    `seeds` are already-ranked papers, best first; only those with a DOI can be
    resolved. Runs under its own time budget for the same reason `search_all`
    does — a slow hop must never hold up a search that already has results.

    References are ranked by **co-citation**, not taken in list order. A seed
    cites 85–135 works, the great majority of them method notes and tangents, so
    reading the first N of each list is close to sampling at random — that is
    what kept Amato's 2001 meta-analysis out of the pool even when six papers
    that cite it were already in hand. The work that several independent seeds
    all cite is the landmark of that literature, so shared references are
    fetched first and singletons only fill whatever room is left.
    """
    # Try more papers than we need seeds: some will not resolve at all, and a
    # walk that starts from two records is a walk with no co-citation signal.
    candidates = [p for p in seeds if p.get("title")][:max_seeds * 2]
    if not candidates:
        return []

    loop = asyncio.get_running_loop()

    # Resolving seeds gets its own clock. Folded into the fetch budget it ate
    # the whole window — a dozen title lookups can take longer than the hop
    # they exist to start — and the walk returned nothing at all.
    try:
        resolved = await asyncio.wait_for(
            asyncio.gather(*(_seed_work(p) for p in candidates), return_exceptions=True),
            timeout=seed_budget,
        )
    except asyncio.TimeoutError:
        return []
    works = [w for w in resolved
             if isinstance(w, dict) and w.get("id") and w.get("referenced_works")]
    works = works[:max_seeds]
    if not works:
        return []

    deadline = loop.time() + budget

    shared: dict[str, int] = {}
    order: dict[str, int] = {}
    for w in works:
        for i, rid in enumerate((w.get("referenced_works") or [])):
            shared[rid] = shared.get(rid, 0) + 1
            order.setdefault(rid, i)
    # most co-cited first; ties broken by how early the seeds cite it
    ref_ids = sorted(shared, key=lambda r: (-shared[r], order[r]))[:max_refs]

    tasks = [asyncio.create_task(_openalex_by_ids(ref_ids, year_from))] if ref_ids else []
    tasks += [
        asyncio.create_task(_cited_by(w["id"], cited_by_per_seed, year_from))
        for w in works
    ]

    papers: list[dict] = []
    pending = set(tasks)
    while pending:
        timeout = deadline - loop.time()
        if timeout <= 0:
            break
        done, pending = await asyncio.wait(
            pending, timeout=timeout, return_when=asyncio.FIRST_COMPLETED)
        for t in done:
            try:
                papers.extend(t.result())
            except Exception:
                pass
    for t in pending:
        t.cancel()

    # Mark provenance so the UI can say *why* a paper is in the pool. These did
    # not answer a query; they were reached from something that did.
    for p in papers:
        p["via"] = "citations"
    return papers


# ── Paper utilities ───────────────────────────────────────────────────────────

def clean_text(text) -> str:
    # Connectors occasionally hand back a non-string here (e.g. a bare year int or
    # a list from a quirky API record). Coerce defensively, since one such value used to
    # crash process_papers and wipe the entire search intermittently.
    if not isinstance(text, str):
        if text is None:
            return ""
        if isinstance(text, (list, tuple)):
            text = " ".join(str(x) for x in text if x)
        else:
            text = str(text)
    if not text:
        return text
    text = re.sub(r'<[^>]+>', '', text)
    # Strip LaTeX commands like \textit{...}; repeat to handle nesting
    for _ in range(5):
        text = re.sub(r'\\[a-zA-Z]+\{([^{}]*)\}', r'\1', text)
    text = re.sub(r'\\[a-zA-Z]+', '', text)
    text = re.sub(r'\$\$.*?\$\$', '', text, flags=re.DOTALL)
    text = re.sub(r'\$.*?\$', '', text)
    text = re.sub(r'[{}]', '', text)
    text = re.sub(r' {2,}', ' ', text).strip()
    text = re.sub(r"'{2,}", "'", text)
    return text


def normalize_doi(doi) -> Optional[str]:
    """One canonical spelling of a DOI, for comparing and for looking up.

    The same paper arrives from different databases spelled differently: as a
    resolver URL, with a `doi:` prefix, in mixed case, and — for a stretch of
    older APA records — with a doubled slash, so CrossRef returns
    `10.1037/0893-3200.15.3.355` while another index returns
    `10.1037//0893-3200.15.3.355`.

    Compared raw, those are two papers. That put the same study on a student's
    works-cited page twice, and it hid genuine duplicates from the deduper
    whenever the two records' titles also differed by a subtitle. DOIs are
    case-insensitive by specification, so folding case is safe for resolution
    as well as for comparison.
    """
    if not doi:
        return None
    d = str(doi).strip()
    d = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:)\s*", "", d, flags=re.I)
    d = d.strip().rstrip(".,;:)]}>'\"")
    # Collapse the doubled slash inside the suffix, never the one after the prefix.
    d = re.sub(r"(?<=/)/+", "", d)
    d = d.lower()
    return d if d.startswith("10.") else None


def clean_paper(paper: dict) -> dict:
    return {
        **paper,
        "title": clean_text(paper.get("title", "")),
        "abstract": clean_text(paper.get("abstract", "")),
        "doi": normalize_doi(paper.get("doi")),
    }


# ── Source-safety flags ───────────────────────────────────────────────────────
# Students can't tell a retracted paper or an unreviewed preprint from a solid
# journal article; professors grade on exactly that. OpenAlex reports retractions
# directly (is_retracted above); everywhere else, publishers prepend the title
# ("RETRACTED: ..."), so a title check catches what the APIs don't say outright.

_RETRACTED_TITLE = re.compile(
    r"^\s*\[?\s*(retracted|withdrawn)\b|^\s*(retraction|notice of retraction)\b[:\s]|\(retracted\b",
    re.IGNORECASE,
)
_PREPRINT_VENUES = re.compile(
    r"arxiv|biorxiv|medrxiv|psyarxiv|chemrxiv|socarxiv|edarxiv|ssrn|research square"
    r"|preprints\.org|osf preprints",
    re.IGNORECASE,
)


def attach_safety_flags(paper: dict) -> dict:
    title = paper.get("title") or ""
    journal = paper.get("journal") or ""
    retracted = bool(paper.get("retracted")) or bool(_RETRACTED_TITLE.search(title))
    preprint = paper.get("source") == "arxiv" or bool(_PREPRINT_VENUES.search(journal))
    return {**paper, "retracted": retracted, "preprint": preprint}


def quality_score(paper: dict) -> float:
    score = 0.0
    if paper.get("abstract"):
        score += 10
    if paper.get("doi"):
        score += 5
    if paper.get("journal"):
        score += 3
    citations = paper.get("citationCount") or 0
    if citations > 0:
        score += math.log(citations + 1) * 4
    return score


# ── Lexical relevance ─────────────────────────────────────────────────────────
# The non-LLM relevance signal the ranker was missing. Without it, everything was
# ordered by citation count until the LLM ran, so the most-cited paper that merely
# shared a keyword ("The CES-D Scale" for a bilingual-education query) floated to
# the top of the preview, and a flaky LLM call left that citation-ranked noise in
# place. These functions give every ranking step a cheap topical signal to lean on.

_STOPWORDS = frozenset("""
a an and are as at be by for from has have how in into is it its of on or that the
their to was were what when where which who why will with about above after again
against all also am been before being below between both but can cannot could did do
does doing down during each few further here more most no nor not now off once only
other over own same should so some such than then there these they this those through
too under until up very while would your you our may might must shall these toward
towards study studies research paper papers review reviews analysis effect effects
impact impacts role using use used based examine examines examining
""".split())


def _terms(text: str) -> set:
    if not text:
        return set()
    return {w for w in re.findall(r"[a-z0-9]{3,}", text.lower()) if w not in _STOPWORDS}


def build_query_terms(queries: list[str]) -> set:
    """Union of content words across the corrected input and every fan-out query."""
    terms: set = set()
    for q in queries:
        terms |= _terms(q or "")
    return terms


def relevance_score(paper: dict, query_terms: set) -> float:
    """Lexical overlap between the query vocabulary and a paper's title/abstract.

    Title hits weigh most; covering more of the query at all is rewarded, so a
    paper touching several query facets beats one that just repeats a single shared
    word. Returns 0.0 when nothing overlaps, which callers use to drop obvious junk.
    """
    if not query_terms:
        return 0.0
    title_terms = _terms(paper.get("title", ""))
    abstract_terms = _terms((paper.get("abstract") or "")[:1200])
    title_hits = len(query_terms & title_terms)
    abstract_hits = len(query_terms & abstract_terms)
    covered = len(query_terms & (title_terms | abstract_terms)) / len(query_terms)
    return 3.0 * title_hits + 1.0 * abstract_hits + 5.0 * covered


def candidate_rank(paper: dict, query_terms: set) -> float:
    """Relevance-first ordering for the preview and the rerank candidate pool.

    Weighted so topical fit dominates but a well-cited, well-formed paper with only
    modest overlap can still make the pool (the LLM may still judge it relevant),
    while citation count alone can never carry an off-topic paper to the top.
    """
    return relevance_score(paper, query_terms) * 3.0 + quality_score(paper)


def deduplicate(papers: list[dict]) -> list[dict]:
    seen_dois: set[str] = set()
    seen_titles: set[str] = set()
    unique = []
    for p in papers:
        # Normalised, because the same DOI reaches us in several spellings and
        # a raw compare lets the same paper through twice.
        doi = normalize_doi(p.get("doi"))
        title_key = re.sub(r'\W+', '', (p.get("title") or "").lower())[:60]
        if doi and doi in seen_dois:
            continue
        if title_key and title_key in seen_titles:
            continue
        if doi:
            seen_dois.add(doi)
        if title_key:
            seen_titles.add(title_key)
        unique.append(p)
    return unique


def paper_id(paper: dict) -> str:
    return normalize_doi(paper.get("doi")) or paper.get("url") or (paper.get("title") or "")[:60]


def process_papers(raw: list[dict], year_from: Optional[int] = None) -> list[dict]:
    """dedupe → clean → flag retractions/preprints → drop untitled → year filter."""
    papers = [attach_safety_flags(clean_paper(p)) for p in deduplicate(raw)]
    papers = [p for p in papers if p.get("title")]
    if year_from:
        papers = [p for p in papers if not p.get("year") or p["year"] >= year_from]
    return papers


async def enrich_unpaywall(papers: list[dict], top_n: int = 20) -> None:
    """Attach a legal open-access PDF link (oa_pdf) to the top papers that have DOIs."""
    email = os.getenv("UNPAYWALL_EMAIL", "hello@firmo.app")
    targets = [p for p in papers[:top_n] if p.get("doi") and not p.get("oa_pdf")]
    if not targets:
        return

    async def one(p: dict):
        try:
            resp = await get_client().get(f"{UNPAYWALL_URL}/{p['doi']}", params={"email": email}, timeout=6.0)
            if resp.status_code != 200:
                return
            data = resp.json()
            loc = data.get("best_oa_location") or {}
            pdf = loc.get("url_for_pdf") or loc.get("url")
            if pdf:
                p["oa_pdf"] = pdf
        except Exception:
            pass

    await asyncio.gather(*(one(p) for p in targets))
