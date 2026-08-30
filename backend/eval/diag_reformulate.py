"""Which phrasing of a student's question actually reaches the paper?

The established facts: hand the pipeline a gold paper's exact title and it finds
it about 86% of the time; hand it the student's own question and it finds about
one in seven. The fan-out is sound, the connectors work, and the gap is the
words. What is not established is which reformulation closes it, and the
candidates disagree about the diagnosis — stripping interrogatives assumes the
question words are noise, keyword extraction assumes the nouns carry it, and
citation expansion assumes no phrasing will ever reach the paper and the graph
should be walked instead.

Against Semantic Scholar rather than OpenAlex, for a boring but binding reason:
OpenAlex meters by daily spend and a benchmark run plus this comparison
exhausts it, at which point every lookup fails and reads as a miss. Semantic
Scholar has no such budget, only a rate limit of roughly one request a second,
which is a delay rather than a wall. It is also a first-class index in the
product, so a result here is about a database Firmo actually searches.

No LLM anywhere, so the ranking between strategies is repeatable — which the
end-to-end benchmark is not, and which is why every previous attempt to reason
about retrieval from it went wrong.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

import sources as S

S2 = "https://api.semanticscholar.org/graph/v1/paper/search"
S2_REFS = "https://api.semanticscholar.org/graph/v1/paper/{pid}/references"

STOP = {
    "how", "what", "why", "does", "do", "did", "is", "are", "was", "were", "the",
    "a", "an", "of", "in", "on", "to", "for", "and", "or", "with", "that", "this",
    "it", "its", "can", "could", "would", "should", "affect", "affects", "cause",
    "causes", "change", "changed", "make", "makes", "there", "their", "about",
    "any", "much", "many", "really", "actually", "you", "your", "we", "i",
    "when", "which", "who", "whom", "at", "by", "from", "as", "be", "been",
}


def strip_question(q: str) -> str:
    words = [w for w in re.findall(r"[\w'-]+", q.lower()) if w not in STOP]
    return " ".join(words) or q


def head_nouns(q: str) -> str:
    words = [w for w in re.findall(r"[\w'-]+", q.lower()) if w not in STOP]
    return " ".join(sorted(words, key=len, reverse=True)[:4]) or q


def norm_doi(d):
    return (S.normalize_doi(d) or "").lower()


def norm_title(t):
    return re.sub(r"[^a-z0-9]+", "", (t or "").lower())


async def s2_search(query: str, limit: int = 20) -> list[dict] | None:
    """One Semantic Scholar search. None means the request never succeeded."""
    headers = {"x-api-key": S._S2_KEY} if S._S2_KEY else None
    for attempt in range(5):
        try:
            r = await S.get_client().get(
                S2, params={"query": query[:250], "limit": limit,
                            "fields": "title,externalIds,citationCount"},
                headers=headers, timeout=30.0)
        except Exception:
            await asyncio.sleep(1.5 * (attempt + 1))
            continue
        if r.status_code == 200:
            await asyncio.sleep(1.2)
            return r.json().get("data") or []
        await asyncio.sleep(1.5 * (attempt + 1))
    return None


async def s2_references(paper_id: str) -> list[dict] | None:
    headers = {"x-api-key": S._S2_KEY} if S._S2_KEY else None
    for attempt in range(4):
        try:
            r = await S.get_client().get(
                S2_REFS.format(pid=paper_id),
                params={"limit": 100, "fields": "title,externalIds"},
                headers=headers, timeout=30.0)
        except Exception:
            await asyncio.sleep(1.5 * (attempt + 1))
            continue
        if r.status_code == 200:
            await asyncio.sleep(1.2)
            # `data` can be present and null for a paper with no indexed
            # references, which is not the same as the request failing.
            return [d.get("citedPaper") or {} for d in (r.json().get("data") or [])]
        await asyncio.sleep(1.5 * (attempt + 1))
    return None


def hits(papers, gold_dois, gold_titles) -> int:
    if not papers:
        return 0
    got_d = {norm_doi((p.get("externalIds") or {}).get("DOI")) for p in papers}
    got_t = {norm_title(p.get("title")) for p in papers}
    return len(gold_dois & got_d) + len(gold_titles & got_t)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="first N cases only")
    ap.add_argument("--hop", action="store_true", help="also walk one citation hop")
    args = ap.parse_args()

    cases = json.loads(Path(__file__).with_name("benchmark.json").read_text(encoding="utf-8"))["cases"]
    if args.limit:
        cases = cases[:args.limit]

    strategies = {
        "plain question": lambda c: c["query"],
        "stopwords stripped": lambda c: strip_question(c["query"]),
        "longest 4 words": lambda c: head_nouns(c["query"]),
    }
    score = {k: 0 for k in strategies}
    score["any of the three"] = 0
    if args.hop:
        score["plain + one citation hop"] = 0
    total = 0
    failures = 0

    for c in cases:
        gold_d = {norm_doi(d) for d in c.get("must_find", []) if norm_doi(d)}
        gold_t = {norm_title(t) for t in c.get("must_find_titles", []) if norm_title(t)}
        n_gold = len(gold_d) + len(gold_t)
        if not n_gold:
            continue
        total += n_gold

        found_any = 0
        plain_papers = None
        line = [f"{c['id']:26}"]
        for name, fn in strategies.items():
            papers = await s2_search(fn(c))
            if papers is None:
                failures += 1
                papers = []
            if name == "plain question":
                plain_papers = papers
            h = hits(papers, gold_d, gold_t)
            score[name] += h
            found_any = max(found_any, h)
            line.append(f"{name.split()[0]} {h}/{n_gold}")
        score["any of the three"] += found_any

        if args.hop:
            h = 0
            for p in (plain_papers or [])[:5]:
                refs = await s2_references(p.get("paperId", ""))
                if refs:
                    h = max(h, hits(refs, gold_d, gold_t))
            score["plain + one citation hop"] += h
            line.append(f"hop {h}/{n_gold}")

        print("  ".join(line), flush=True)

    print(f"\ngold recovered out of {total}:")
    for k, v in sorted(score.items(), key=lambda x: -x[1]):
        print(f"  {k:26} {v:3}  ({v / max(total,1):.0%})")

    if failures:
        print(f"\n!! {failures} searches never got a 200. Those read as misses, "
              f"so this run is not a result.")


if __name__ == "__main__":
    asyncio.run(main())
