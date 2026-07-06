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
UNPAYWALL_URL = "https://api.unpaywall.org/v2"

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


async def _get(url: str, params: dict, timeout: float = 15.0) -> httpx.Response:
    resp = await get_client().get(url, params=params, timeout=timeout)
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
    try:
        data = (await _get(SEMANTIC_SCHOLAR_URL, params)).json()
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
    filter_str = "type:journal-article"
    if year_from:
        filter_str += f",from-pub-date:{year_from}"
    params = {
        "query": query,
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
    params = {
        "query": q,
        "format": "json",
        "resultType": "core",
        "pageSize": limit,
        "sort": "RELEVANCE",
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
    """Bielefeld Academic Search Engine — free, no key, cross-disciplinary."""
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
    filter_str = "type:article"
    if year_from:
        filter_str += f",publication_year:>{year_from - 1}"
    params = {
        "search": query,
        "filter": filter_str,
        "per-page": limit,
        "select": "id,title,authorships,publication_year,abstract_inverted_index,doi,cited_by_count,primary_location",
        "sort": "relevance_score:desc",
        "mailto": "firmo@example.com",  # polite pool — faster responses
    }
    try:
        data = (await _get(OPENALEX_URL, params)).json()
    except Exception:
        return []

    results = []
    for work in data.get("results", []):
        title = work.get("title", "")
        if not title:
            continue

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

        results.append({
            "title": title,
            "authors": authors,
            "year": work.get("publication_year"),
            "abstract": abstract,
            "url": url,
            "doi": doi,
            "journal": journal,
            "citationCount": work.get("cited_by_count", 0),
            "source": "openalex",
        })
    return results


async def search_arxiv(query: str, limit: int = 8, year_from: Optional[int] = None) -> list[dict]:
    """arXiv — free preprint server for physics, math, CS, biology, and more."""
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
    """DOAJ — Directory of Open Access Journals, peer-reviewed open-access articles."""
    params = {"q": query, "pageSize": limit}
    try:
        data = (await _get(DOAJ_URL, params)).json()
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
    """ERIC — US Dept of Education database for education research papers."""
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
    """Zenodo — CERN open research repository for papers, datasets, and preprints."""
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
    """PLOS — Public Library of Science open-access journals."""
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
    """HAL — French/European open archive of scholarly research across all disciplines."""
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
    """INSPIRE-HEP — leading database for high-energy physics and related fields."""
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
    """fatcat — Internet Archive Scholar index of hundreds of millions of papers."""
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


# ── Fan-out search ────────────────────────────────────────────────────────────

# (connector, per-query result limit). Ordered roughly by quality of results.
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
    (search_base, 8),
    (search_zenodo, 8),
    (search_inspire, 8),
    (search_fatcat, 8),
]


async def search_all(
    queries: list[str],
    year_from: Optional[int] = None,
    budget: float = 10.0,
    on_progress: Optional[Callable] = None,
) -> list[dict]:
    """Fire every connector for every query in parallel with a hard time budget.

    Whatever has arrived when the budget expires is what we use — one slow
    database never blocks the whole search. `on_progress(done, total, papers_so_far)`
    is awaited after each completion batch.
    """
    tasks = [
        asyncio.create_task(fn(q, limit=limit, year_from=year_from))
        for q in queries
        for fn, limit in ALL_CONNECTORS
    ]
    total = len(tasks)
    papers: list[dict] = []
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
            try:
                papers.extend(t.result())
            except Exception:
                pass
        if done and on_progress:
            await on_progress(done_count, total, len(papers))

    for t in pending:
        t.cancel()
    return papers


# ── Paper utilities ───────────────────────────────────────────────────────────

def clean_text(text: str) -> str:
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


def clean_paper(paper: dict) -> dict:
    return {
        **paper,
        "title": clean_text(paper.get("title", "")),
        "abstract": clean_text(paper.get("abstract", "")),
    }


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


def deduplicate(papers: list[dict]) -> list[dict]:
    seen_dois: set[str] = set()
    seen_titles: set[str] = set()
    unique = []
    for p in papers:
        doi = p.get("doi")
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
    return paper.get("doi") or paper.get("url") or (paper.get("title") or "")[:60]


def process_papers(raw: list[dict], year_from: Optional[int] = None) -> list[dict]:
    """dedupe → clean → drop untitled → apply year filter."""
    papers = [clean_paper(p) for p in deduplicate(raw)]
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
