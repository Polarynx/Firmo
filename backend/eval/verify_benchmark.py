"""Check that every DOI in the benchmark is a real, resolvable record.

A retrieval benchmark is only as trustworthy as its gold set, and a gold set is
exactly the kind of file where a wrong entry hides forever: a DOI with one
transposed digit is never found by any search, so it depresses recall on every
run and looks like a retrieval problem rather than a typo. That is the worst
possible failure for a number the product is being steered by.

So the gold set gets the same treatment Firmo gives a student's bibliography —
every entry goes to CrossRef, and anything that does not come back is reported
by name. Run it after touching benchmark.json, and before believing a run:

    python verify_benchmark.py            # check every case
    python verify_benchmark.py --fix      # drop unresolvable DOIs, keep a backup

Requires network. Nothing here calls an LLM or costs anything.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import sys

import httpx

HERE = os.path.dirname(os.path.abspath(__file__))
BENCHMARK = os.path.join(HERE, "benchmark.json")

# The same courtesy header the product's own CrossRef calls use. An unidentified
# client gets the shared pool and the rate limiting that comes with it.
MAILTO = os.getenv("OPENALEX_MAILTO", "").strip()
UA = f"firmo-eval/1.0 (+https://firmo.app{'; mailto:' + MAILTO if MAILTO else ''})"

CONCURRENCY = 6


async def resolve(client: httpx.AsyncClient, doi: str, sem: asyncio.Semaphore) -> tuple[str, str | None]:
    """Return (doi, title) if CrossRef knows it, else (doi, None)."""
    async with sem:
        for attempt in range(3):
            try:
                r = await client.get(
                    f"https://api.crossref.org/works/{doi}",
                    headers={"User-Agent": UA},
                    timeout=20.0,
                )
                if r.status_code == 404:
                    return doi, None
                if r.status_code == 429:
                    await asyncio.sleep(2 * (attempt + 1))
                    continue
                r.raise_for_status()
                msg = r.json().get("message", {})
                title = (msg.get("title") or [""])[0]
                return doi, title or "(untitled record)"
            except httpx.HTTPStatusError:
                return doi, None
            except Exception:
                if attempt == 2:
                    # Network trouble is not evidence the DOI is bad, and
                    # deleting a good entry is far worse than keeping a doubtful
                    # one. Unreachable is reported separately from missing.
                    return doi, "?"
                await asyncio.sleep(1.5 * (attempt + 1))
    return doi, None


async def resolve_title(client: httpx.AsyncClient, title: str, sem: asyncio.Semaphore) -> tuple[str, str | None]:
    """Return (title, best CrossRef match) if something close enough exists.

    Titles carry the same risk DOIs do and hide it better. `must_find_titles`
    exists for papers with no CrossRef DOI — arXiv preprints, books — and the
    scorer matches them as strings, so a title remembered slightly wrong is a
    paper that can never be found: permanent zero recall on that case, reported
    as a retrieval failure. Near-match rather than exact, because the gold set
    should not have to reproduce a publisher's capitalisation and subtitle
    punctuation to count.
    """
    from difflib import SequenceMatcher

    def norm(s: str) -> str:
        return " ".join("".join(ch if ch.isalnum() else " " for ch in s.lower()).split())

    async with sem:
        for attempt in range(3):
            try:
                r = await client.get(
                    "https://api.crossref.org/works",
                    params={"query.bibliographic": title, "rows": 5,
                            "select": "title,DOI"},
                    headers={"User-Agent": UA},
                    timeout=25.0,
                )
                if r.status_code == 429:
                    await asyncio.sleep(2 * (attempt + 1))
                    continue
                r.raise_for_status()
                items = r.json().get("message", {}).get("items", [])
                want = norm(title)
                best, score = None, 0.0
                for it in items:
                    cand = (it.get("title") or [""])[0]
                    if not cand:
                        continue
                    s = SequenceMatcher(None, want, norm(cand)).ratio()
                    if s > score:
                        best, score = cand, s
                if score >= 0.90:
                    return title, best
                break
            except Exception:
                if attempt == 2:
                    return title, "?"
                await asyncio.sleep(1.5 * (attempt + 1))

        # CrossRef does not know it. That is not yet evidence the title is
        # wrong: CrossRef indexes journal articles, and this field exists
        # precisely for the things it misses — books, arXiv preprints, NBER
        # working papers, government reports. OpenAlex covers all of those, so
        # only a title neither index has ever heard of is actually suspect.
        try:
            params = {"filter": f"title.search:{title}", "per-page": 5,
                      "select": "id,title"}
            if MAILTO:
                params["mailto"] = MAILTO
            r = await client.get("https://api.openalex.org/works", params=params,
                                 headers={"User-Agent": UA}, timeout=25.0)
            r.raise_for_status()
            want = norm(title)
            for it in r.json().get("results", []):
                cand = it.get("title") or ""
                if cand and SequenceMatcher(None, want, norm(cand)).ratio() >= 0.90:
                    return title, f"{cand}  [openalex]"
        except Exception:
            pass
    return title, None


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true",
                    help="remove DOIs CrossRef does not know, after backing the file up")
    args = ap.parse_args()

    with open(BENCHMARK, encoding="utf-8") as fh:
        data = json.load(fh)
    cases = data["cases"]

    wanted = sorted({d for c in cases for d in c.get("must_find", [])})
    print(f"{len(cases)} cases, {len(wanted)} distinct DOIs\n")

    wanted_titles = sorted({t for c in cases for t in c.get("must_find_titles", [])})
    if wanted_titles:
        print(f"{len(wanted_titles)} distinct titles to check as well\n")

    sem = asyncio.Semaphore(CONCURRENCY)
    async with httpx.AsyncClient(follow_redirects=True) as client:
        results = await asyncio.gather(*(resolve(client, d, sem) for d in wanted))
        title_results = await asyncio.gather(
            *(resolve_title(client, t, sem) for t in wanted_titles))

    titles = dict(results)
    found_titles = dict(title_results)
    missing = [d for d, t in results if t is None]
    unreachable = [d for d, t in results if t == "?"]
    missing_titles = [t for t, m in title_results if m is None]

    for case in cases:
        bad = [d for d in case.get("must_find", []) if titles.get(d) is None]
        bad_t = [t for t in case.get("must_find_titles", []) if found_titles.get(t) is None]
        mark = "FAIL" if (bad or bad_t) else "ok  "
        n = len(case.get("must_find", [])) + len(case.get("must_find_titles", []))
        print(f"{mark} {case['id']:<26} {n} refs"
              + (f"   bad DOI: {', '.join(bad)}" if bad else "")
              + (f"   unmatched title: {' | '.join(bad_t)}" if bad_t else ""))

    print()
    if unreachable:
        print(f"{len(unreachable)} could not be checked (network): {', '.join(unreachable)}")
    if missing_titles:
        print(f"{len(missing_titles)} title(s) with no close CrossRef match — check the "
              f"wording, or accept that the paper is not in CrossRef (books and arXiv "
              f"preprints often are not, which is not an error):")
        for t in missing_titles:
            print(f"  {t}")
        print()

    if not missing and not missing_titles:
        print("Every reference resolves.")
        return 0
    if not missing:
        print("Every DOI resolves.")
        if not args.fix:
            print("Re-run with --fix to drop the unmatched titles.")
            return 1

    print(f"{len(missing)} DOI(s) CrossRef does not know:")
    for d in missing:
        print(f"  {d}")

    if not args.fix:
        print("\nRe-run with --fix to drop them.")
        return 1

    shutil.copy(BENCHMARK, BENCHMARK + ".bak")
    dead = set(missing)
    dead_titles = set(missing_titles)
    for case in cases:
        case["must_find"] = [d for d in case.get("must_find", []) if d not in dead]
        if "must_find_titles" in case:
            case["must_find_titles"] = [t for t in case["must_find_titles"]
                                        if t not in dead_titles]
    # A case with nothing left to find scores 0 recall forever and drags the
    # mean down while measuring nothing. Better gone than quietly wrong.
    def refs(c):
        return c.get("must_find") or c.get("must_find_titles")
    kept = [c for c in cases if refs(c)]
    dropped = [c["id"] for c in cases if not refs(c)]
    data["cases"] = kept
    with open(BENCHMARK, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print(f"\nBacked up to benchmark.json.bak; removed {len(dead)} DOIs.")
    if dropped:
        print(f"Dropped {len(dropped)} case(s) left with no gold DOIs: {', '.join(dropped)}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
