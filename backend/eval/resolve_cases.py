"""Turn proposed gold titles into verified benchmark entries.

A benchmark's gold set is the one file where a wrong entry hides forever. A DOI
with a transposed digit is never retrieved by anything, so it depresses recall
on every run for all time and reads as a retrieval problem rather than a typo —
and the existing benchmark's own header records a first draft where a third of
the DOIs were wrong and one pointed at a different paper entirely.

The failure mode that matters here is not typing. It is confabulation: writing
down a DOI from memory that looks perfectly well-formed and belongs to
something else. verify_benchmark.py cannot catch that, because the DOI resolves
fine — it is simply the wrong paper.

So no DOI is ever written by hand. A case proposes the *title* of the paper it
wants, this resolves that title against OpenAlex, and records whatever actually
came back together with a similarity score against what was asked for. Anything
below the threshold is reported rather than saved, and the resolved titles are
printed so a human can see intent and result side by side.

    python resolve_cases.py --dry-run     # resolve and print, write nothing
    python resolve_cases.py --write       # append the confident ones
"""
from __future__ import annotations

import argparse
import asyncio
import difflib
import json
import os
import re
import sys

import httpx

HERE = os.path.dirname(os.path.abspath(__file__))
BENCHMARK = os.path.join(HERE, "benchmark.json")
PROPOSED = os.path.join(HERE, "proposed_cases.json")
MAILTO = os.getenv("OPENALEX_MAILTO", "").strip()

# Below this, the thing that came back is not the thing that was asked for.
#
# 0.72 was the first value and it was far too generous. It admitted "Broken
# Windows and Food Safety" for Wilson and Kelling on policing, "Scaling laws for
# language encoding models in fMRI" for the Kaplan scaling-laws paper, and
# "Post-Acute COVID-19 Syndrome and Stroke" for "Post-acute COVID-19 syndrome" —
# every one a real paper, plausibly titled, and the wrong one. A title that
# shares most of its words with another is the normal case in academic
# publishing, not a signal.
#
# The cost of the two errors is not symmetric. A rejected good paper is a case
# this benchmark does not contain. An accepted wrong one is a permanent false
# failure: it can never be retrieved by any search for the question it is filed
# under, so it silently depresses recall on every run forever and reads as a
# retrieval problem. So the threshold is set where it loses real papers rather
# than where it admits impostors, and what it loses is printed for a human.
# Raised again, from 0.90, after "Training Compute-Optimal Protein Language
# Models" was admitted at 0.92 for "Training Compute-Optimal Large Language
# Models". One word apart, a different paper in a different field. Every
# genuine match in this set scored exactly 1.00, so there is clear air between
# a real hit and a near miss, and the bar belongs in the gap rather than just
# under the impostors.
MATCH_MIN = 0.95

# Not papers. CrossRef indexes these recommendation stubs with a title that
# begins with the real paper's, so they score high and are never what was meant.
JUNK_PREFIXES = ("faculty opinions recommendation",
                 "correction to", "erratum", "retraction of", "comment on")


def norm(t: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", (t or "").lower()).strip()


def similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


async def resolve_title(client, title: str, sem) -> dict | None:
    """The best CrossRef match for a title, with the evidence for judging it.

    CrossRef rather than OpenAlex, for one practical reason: OpenAlex meters by
    daily budget and answers "Insufficient budget ... Resets at midnight UTC"
    once it is spent, which turns every lookup into an apparent miss. A gold set
    must never be built by a process that cannot tell "no such paper" from "not
    today" — that is how a benchmark quietly fills with permanent false
    failures. CrossRef has no such budget, and is the authority on DOIs anyway.

    Its blind spot is books and older monographs, which frequently have no DOI
    at all. Those come back unresolved and are reported, not guessed at.
    """
    async with sem:
        for attempt in range(4):
            try:
                r = await client.get(
                    "https://api.crossref.org/works",
                    params={"query.bibliographic": title, "rows": 5,
                            "select": "DOI,title,issued,is-referenced-by-count"},
                    timeout=30.0)
                if r.status_code == 200:
                    break
                await asyncio.sleep(2.0 * (attempt + 1))
            except Exception:
                await asyncio.sleep(1.5 * (attempt + 1))
        else:
            return {"error": "no 200 from CrossRef"}

        await asyncio.sleep(0.3)
        items = r.json().get("message", {}).get("items", [])
        if not items:
            return None

        best, score = None, 0.0
        for w in items:
            found = (w.get("title") or [""])[0]
            if norm(found).startswith(JUNK_PREFIXES):
                continue
            sc = similarity(title, found)
            if sc > score:
                best, score = w, sc
        if not best:
            return None
        issued = (best.get("issued", {}).get("date-parts") or [[None]])[0]
        return {
            "asked": title,
            "found": (best.get("title") or [""])[0],
            "doi": best.get("DOI"),
            "year": issued[0] if issued else None,
            "cited": best.get("is-referenced-by-count"),
            "score": round(score, 3),
        }


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="append confident cases to benchmark.json")
    args = ap.parse_args()

    proposed = json.load(open(PROPOSED, encoding="utf-8"))
    client = httpx.AsyncClient(headers={"User-Agent": f"firmo-eval/1.0 (+mailto:{MAILTO})"})
    sem = asyncio.Semaphore(2)

    accepted, rejected = [], []
    async with client:
        for case in proposed:
            entry = {"id": case["id"], "query": case["query"],
                     "discipline": case["discipline"]}
            dois, titles = [], []
            print(f"\n{case['id']}  —  {case['query']}")
            for want in case["titles"]:
                got = await resolve_title(client, want, sem)
                if not got or got.get("error"):
                    print(f"   MISS  {want[:64]}   ({(got or {}).get('error', 'nothing came back')})")
                    rejected.append((case["id"], want, "unresolved"))
                    continue
                mark = "ok  " if got["score"] >= MATCH_MIN else "DROP"
                print(f"   {mark}  {got['score']:.2f}  {(got['found'] or '')[:66]}")
                if got["score"] < MATCH_MIN:
                    print(f"          asked for: {want[:66]}")
                    rejected.append((case["id"], want, f"similarity {got['score']}"))
                    continue
                if got["doi"]:
                    dois.append(got["doi"])
                else:
                    titles.append(got["found"])

            if not dois and not titles:
                print("   -> case dropped, no verified gold")
                continue
            if dois:
                entry["must_find"] = dois
            if titles:
                entry["must_find_titles"] = titles
            if case.get("off_topic_terms"):
                entry["off_topic_terms"] = case["off_topic_terms"]
            accepted.append(entry)

    print(f"\n{len(accepted)} cases with verified gold, "
          f"{sum(len(c.get('must_find', [])) + len(c.get('must_find_titles', [])) for c in accepted)} papers")
    print(f"{len(rejected)} proposed papers rejected")
    for cid, want, why in rejected:
        print(f"   {cid:26} {why:18} {want[:52]}")

    if args.write:
        data = json.load(open(BENCHMARK, encoding="utf-8"))
        have = {c["id"] for c in data["cases"]}
        fresh = [c for c in accepted if c["id"] not in have]
        data["cases"].extend(fresh)
        json.dump(data, open(BENCHMARK, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        print(f"\nappended {len(fresh)} new cases -> {len(data['cases'])} total")
    else:
        json.dump(accepted, open(os.path.join(HERE, "resolved_preview.json"), "w",
                                 encoding="utf-8"), indent=2, ensure_ascii=False)
        print("\ndry run; wrote resolved_preview.json")


if __name__ == "__main__":
    asyncio.run(main())
