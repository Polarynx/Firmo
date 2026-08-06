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


async def openalex_dois(query, n=50, sort=None, field=None):
    """One OpenAlex page, patient about rate limits so a 429 is never read as a miss.

    `field` swaps the loose `search` parameter — which also reads full text, and
    for a broad question returns thousands of papers that mention the words
    somewhere — for a filter over a named field.
    """
    for attempt in range(4):
        if field:
            p = {"filter": f"{field}.search:{query}", "per-page": n, "select": "id,doi,title"}
        else:
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


async def by_topic(query, n=50):
    """The most-cited work in whatever OpenAlex topic the question lands in.

    A different retrieval mode, aimed at a different failure. Keyword relevance
    answers "which papers are about these words", and for a broad question the
    answer is thousands, ranked by textual match. But the paper a supervisor
    would name is rarely the closest textual match — it is the one the field is
    built on, and it may share almost no vocabulary with how a student phrases
    the question. Topic membership plus citation weight asks that question
    instead: what is this corner of the literature founded on.
    """
    for attempt in range(3):
        try:
            r = await S.get_client().get(
                "https://api.openalex.org/topics",
                params=S._polite({"search": query, "per-page": 3, "select": "id,display_name"}),
                timeout=25.0)
        except Exception:
            await asyncio.sleep(1.5 * (attempt + 1))
            continue
        if r.status_code == 200:
            break
        await asyncio.sleep(2.0 * (attempt + 1))
    else:
        return None

    ids = [t["id"].rsplit("/", 1)[-1] for t in r.json().get("results", []) if t.get("id")]
    if not ids:
        return []

    for attempt in range(3):
        try:
            r = await S.get_client().get(S.OPENALEX_URL, params=S._polite({
                "filter": "topics.id:" + "|".join(ids),
                "sort": "cited_by_count:desc",
                "per-page": n, "select": "id,doi,title"}), timeout=30.0)
        except Exception:
            await asyncio.sleep(1.5 * (attempt + 1))
            continue
        if r.status_code == 200:
            return r.json().get("results", [])
        await asyncio.sleep(2.0 * (attempt + 1))
    return None


def _norm(d):
    return (S.normalize_doi(d) or "").lower()


def _hits(works, gold):
    return len({_norm(w.get("doi") or "") for w in works or []} & gold)


async def one_hop(works, gold, fan=8):
    """Walk one step out from the best few hits, following what they cite.

    The premise being tested: a landmark paper is the one that the on-topic
    papers all cite, so it should be reachable from them even when no phrasing
    of the question reaches it directly.

    Outbound only, deliberately. The other direction — who cites these hits —
    finds work newer than what we already have, and every gold paper in this
    benchmark is older and more established than the topical results that lead
    to it. Walking both ways would double the requests to answer a question
    only one of them can.
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
    # (query builder, OpenAlex field). None means the loose `search` parameter,
    # which also reads full text; title_and_abstract is the strict one.
    strategies = {
        "plain": (lambda c: c["query"], None),
        "stripped": (lambda c: strip_question(c["query"]), None),
        "head_nouns": (lambda c: head_nouns(c["query"]), None),
        "plain / title+abs": (lambda c: c["query"], "title_and_abstract"),
        "stripped / title+abs": (lambda c: strip_question(c["query"]), "title_and_abstract"),
    }
    score = {k: 0 for k in strategies}
    score["union_of_all"] = 0
    score["topic + most cited"] = 0
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
        for name, (fn, field) in strategies.items():
            works = await openalex_dois(fn(c), field=field)
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

        topic_works = await by_topic(strip_question(c["query"]))
        if topic_works is None:
            failures += 1
            topic_works = []
        t_hits = _hits(topic_works, gold)
        score["topic + most cited"] += t_hits
        union |= {_norm(w.get("doi") or "") for w in topic_works} & gold
        line.append(f"topic {t_hits}/{len(gold)}")

        score["union_of_all"] += len(union)
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
