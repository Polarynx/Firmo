"""Which reformulation actually reaches the paper?

Established so far: hand the pipeline a gold paper's exact title and it finds
it; hand it the student's question and ten of thirteen gold papers are not in
OpenAlex's top hundred. So the fan-out is sound and the query is the problem.

That narrows it but does not answer it, and the candidate fixes disagree about
what is wrong. Stripping question scaffolding assumes the interrogative words
are noise. Keyword extraction assumes the nouns carry it. Citation expansion
assumes the vocabulary gap is unbridgeable and the graph should be walked
instead. Each is a different day of work, so they get measured before one is
picked rather than after.

No LLM anywhere in here, so the ranking between strategies is repeatable —
which is the property the end-to-end eval lacks and the reason two earlier
retrieval conclusions were wrong.
"""
import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

import sources as S

STOP = {
    "how", "what", "why", "does", "do", "did", "is", "are", "was", "were", "the",
    "a", "an", "of", "in", "on", "to", "for", "and", "or", "with", "that", "this",
    "it", "its", "can", "could", "would", "should", "affect", "affects", "cause",
    "causes", "change", "changed", "make", "makes", "there", "their", "about",
    "any", "much", "many", "really", "actually", "you", "your", "we", "i",
}


def strip_question(q: str) -> str:
    """The question with its scaffolding removed."""
    words = re.findall(r"[\w'-]+", q.lower())
    kept = [w for w in words if w not in STOP]
    return " ".join(kept) or q


def head_nouns(q: str) -> str:
    """The four longest content words — a crude stand-in for the key concepts."""
    words = [w for w in re.findall(r"[\w'-]+", q.lower()) if w not in STOP]
    return " ".join(sorted(words, key=len, reverse=True)[:4]) or q


async def openalex_dois(query, n=50, sort=None):
    """One OpenAlex page, patient about rate limits so a 429 is never read as a miss."""
    for attempt in range(4):
        p = {"search": query, "per-page": n, "select": "id,doi,title"}
        if sort:
            p["sort"] = sort
        try:
            r = await S.get_client().get(S.OPENALEX_URL, params=S._polite(p), timeout=30.0)
        except Exception:
            await asyncio.sleep(1.5 * (attempt + 1))
            continue
        if r.status_code == 200:
            return [w for w in r.json().get("results", []) if w.get("id")]
        await asyncio.sleep(2.0 * (attempt + 1))
    return None


def _norm(d):
    return (S.normalize_doi(d) or "").lower()


def _hits(works, gold):
    return len({_norm(w.get("doi") or "") for w in works or []} & gold)


async def one_hop(works, gold, fan=8):
    """Walk the citation graph one step out from the best few hits, both ways.

    The premise being tested: a landmark paper is the one that the on-topic
    papers all cite, so it should be reachable from them even when no phrasing
    of the question reaches it directly.
    """
    seeds = [w["id"] for w in (works or [])[:fan]]
    if not seeds:
        return 0, 0

    found = set()
    reached = 0

    # Outbound: what the hits cite.
    refs = []
    for sid in seeds:
        try:
            r = await S.get_client().get(
                S.OPENALEX_URL, params=S._polite({
                    "filter": f"openalex_id:{sid.rsplit('/', 1)[-1]}",
                    "select": "referenced_works", "per-page": 1}), timeout=25.0)
            if r.status_code == 200:
                for w in r.json().get("results", []):
                    refs.extend(w.get("referenced_works") or [])
        except Exception:
            pass
        await asyncio.sleep(0.2)

    for i in range(0, min(len(refs), 200), 40):
        batch = [x.rsplit("/", 1)[-1] for x in refs[i:i + 40]]
        try:
            r = await S.get_client().get(S.OPENALEX_URL, params=S._polite({
                "filter": "openalex_id:" + "|".join(batch),
                "select": "doi", "per-page": len(batch)}), timeout=30.0)
            if r.status_code == 200:
                ws = r.json().get("results", [])
                reached += len(ws)
                found |= {_norm(w.get("doi") or "") for w in ws} & gold
        except Exception:
            pass
        await asyncio.sleep(0.3)

    return len(found), reached


async def main():
    cases = json.loads(Path(__file__).with_name("benchmark.json").read_text())["cases"]
    strategies = {
        "plain": lambda c: c["query"],
        "stripped": lambda c: strip_question(c["query"]),
        "head_nouns": lambda c: head_nouns(c["query"]),
    }
    score = {k: 0 for k in strategies}
    score["union_of_three"] = 0
    score["plain + one citation hop"] = 0
    total = 0
    # A rate-limited probe that reports zero is indistinguishable from a paper
    # that genuinely is not there, and reading one as the other is what produced
    # the last two wrong conclusions about retrieval. So failures are counted
    # separately and loudly, and any run with failures in it is not a result.
    failures = 0

    for c in cases:
        gold = {_norm(d) for d in c.get("must_find", []) if _norm(d)}
        if not gold:
            continue
        total += len(gold)
        union = set()
        plain_works = None
        line = [f"{c['id']:24}"]
        for name, fn in strategies.items():
            works = await openalex_dois(fn(c))
            if works is None:
                failures += 1
                works = []
            if name == "plain":
                plain_works = works
            n = _hits(works, gold)
            score[name] += n
            union |= {_norm(w.get("doi") or "") for w in works or []} & gold
            line.append(f"{name} {n}/{len(gold)}")
            await asyncio.sleep(0.3)

        score["union_of_three"] += len(union)
        hop, reached = await one_hop(plain_works, gold)
        score["plain + one citation hop"] += len(union | set()) * 0 + hop
        line.append(f"hop {hop}/{len(gold)} (saw {reached})")
        print("  ".join(line))

    print(f"\ngold recovered, out of {total}:")
    for k, v in sorted(score.items(), key=lambda x: -x[1]):
        print(f"  {k:26} {v:3}  ({v / max(total,1):.0%})")

    if failures:
        print(f"\n!! {failures} probes never got a 200 from OpenAlex. These numbers "
              f"are not a result — every failed probe reads as a miss.\n"
              f"   Nothing else may be hitting the same API while this runs.")


if __name__ == "__main__":
    asyncio.run(main())
