"""Measure Firmo's search instead of eyeballing it.

Ranking changes used to be verified by running one query in a browser and
deciding it looked better. That cannot catch a change that improves psychology
and quietly breaks history, and it cannot answer the only question a librarian
will ask: is this actually better than what students already use?

So: a fixed set of topics, a set of DOIs a human judged on-topic for each, and
three numbers.

  recall@k     of the papers we know are right, how many did we surface in k?
  hit rate     what share of topics found at least one of them?
  off-topic    how often did the wrong sense of an ambiguous query leak in?

Usage
    python eval/run_eval.py                    # full set
    python eval/run_eval.py --case remote-work # one topic
    python eval/run_eval.py --save runs/x.json # keep the result to diff later
    python eval/run_eval.py --compare runs/x.json

Run it from backend/ with the venv python. It makes real API calls, so a full
run costs real requests and takes a few minutes.

On reading the numbers
----------------------
Runs are NOT deterministic. The fan-out queries are written by the LLM afresh
each time, and the search has a wall-clock budget, so two runs of the same case
can differ by ten papers and a case can swing between 0.0 and 0.5 on its own.
Treat a single-run difference of one case as noise; only a move in the summary
across several runs is evidence. Judge a ranking change on the summary, and
re-run before believing a regression.
"""
import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

# Import the app's own modules rather than going over HTTP: the point is to
# measure the ranker, not the web layer.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import main as firmo  # noqa: E402
from sources import (  # noqa: E402
    build_query_terms,
    get_client,
    normalize_doi,
    process_papers,
    search_all,
)

HERE = Path(__file__).resolve().parent
BENCHMARK = HERE / "benchmark.json"
DEFAULT_K = 10


def norm_doi(doi: str) -> str:
    """Canonical DOI, via the same normaliser the search pipeline uses.

    Scoring has to fold the same spellings the deduper folds, or a paper Firmo
    genuinely returned gets counted as a miss because one database wrote the
    DOI with a doubled slash.
    """
    return normalize_doi(doi) or ""


def norm_title(title: str) -> str:
    """Titles for matching: case, punctuation, and spacing all discarded.

    Databases disagree about subtitles, trailing asterisks, and smart quotes,
    so an exact string compare would report misses that are really the same
    paper under a slightly different record.
    """
    return "".join(ch for ch in (title or "").lower() if ch.isalnum())


def matched_targets(papers: list[dict], dois: set[str], titles: set[str]) -> set[str]:
    """Which ground-truth papers appear in this list, by DOI or by title.

    Title matching exists for arXiv: it registers DOIs with DataCite rather
    than CrossRef, so an arXiv-only paper carries no DOI our connectors can
    return and would score as a permanent miss no matter how well ranked.
    """
    found: set[str] = set()
    for p in papers:
        d = norm_doi(p.get("doi"))
        if d and d in dois:
            found.add(d)
        t = norm_title(p.get("title"))
        for target in titles:
            # Containment, not equality: records routinely append a venue or
            # drop a subtitle.
            if t and (t.startswith(target) or target in t):
                found.add(target)
    return found


async def run_case(case: dict, k: int) -> dict:
    """Run one topic through the real pipeline and score what came back."""
    query = case["query"]
    started = time.monotonic()

    # Mirrors /api/research exactly, minus the streaming and the PDF enrichment,
    # so a number here is a number about what students actually get.
    plan = await firmo.plan_research(query)
    final_query = plan.get("corrected_query") or query

    fanout = [final_query[:120]] + [
        q for q in plan.get("search_queries", [])[:6] if q.lower() != final_query.lower()
    ]
    query_terms = build_query_terms(fanout)

    raw = await search_all(fanout, budget=10.0)
    papers = process_papers(raw)

    anchor = firmo._topic_anchor(final_query, plan)
    await firmo.attach_semantic_scores(anchor, papers)

    ranked = await firmo.rerank_and_tag(final_query, plan.get("brief", ""), papers,
                                        query_terms=query_terms)
    core = [p for p in ranked if p.get("tier") != "related"]

    want_dois = {norm_doi(d) for d in case.get("must_find", [])}
    want_titles = {norm_title(t) for t in case.get("must_find_titles", [])}
    wanted = want_dois | want_titles

    top = core[:k]
    found_at_k = matched_targets(top, want_dois, want_titles)
    found_anywhere = matched_targets(ranked, want_dois, want_titles)

    # The wrong sense of an ambiguous query: counted on titles only, because an
    # abstract can mention "armed conflict" in passing without being about it.
    off_terms = [t.lower() for t in case.get("off_topic_terms", [])]
    off_topic = [
        p["title"] for p in top
        if any(t in (p.get("title") or "").lower() for t in off_terms)
    ]

    return {
        "id": case["id"],
        "query": query,
        "discipline": case.get("discipline", ""),
        "corrected_query": final_query,
        "elapsed_s": round(time.monotonic() - started, 1),
        "returned": len(ranked),
        "core": len(core),
        "expected": len(wanted),
        "found_at_k": len(found_at_k),
        "found_anywhere": len(found_anywhere),
        "recall_at_k": round(len(found_at_k) / len(wanted), 3) if wanted else None,
        "recall_total": round(len(found_anywhere) / len(wanted), 3) if wanted else None,
        "missed": sorted(wanted - found_anywhere),
        "off_topic_in_top": off_topic,
        "top_titles": [p.get("title", "")[:90] for p in top[:5]],
    }


def summarise(results: list[dict], k: int) -> dict:
    scored = [r for r in results if r["expected"] > 0]
    n = len(scored) or 1
    return {
        "cases": len(results),
        "k": k,
        "recall_at_k": round(sum(r["recall_at_k"] for r in scored) / n, 3),
        "recall_total": round(sum(r["recall_total"] for r in scored) / n, 3),
        "hit_rate": round(sum(1 for r in scored if r["found_at_k"] > 0) / n, 3),
        "off_topic_cases": sum(1 for r in results if r["off_topic_in_top"]),
        "empty_cases": sum(1 for r in results if r["core"] == 0),
        "mean_seconds": round(sum(r["elapsed_s"] for r in results) / max(len(results), 1), 1),
    }


def print_report(results: list[dict], summary: dict) -> None:
    print()
    print(f"{'case':<24}{'disc':<16}{'core':>5}{'rec@k':>8}{'total':>8}{'sec':>7}  flags")
    print("-" * 88)
    for r in results:
        flags = []
        if r["off_topic_in_top"]:
            flags.append(f"off-topic×{len(r['off_topic_in_top'])}")
        if r["core"] == 0:
            flags.append("EMPTY")
        if r["expected"] and r["found_anywhere"] == 0:
            flags.append("found none")
        print(f"{r['id']:<24}{r['discipline'][:15]:<16}{r['core']:>5}"
              f"{_fmt(r['recall_at_k']):>8}{_fmt(r['recall_total']):>8}"
              f"{r['elapsed_s']:>7}  {', '.join(flags)}")

    print("-" * 88)
    print(f"recall@{summary['k']}: {summary['recall_at_k']}   "
          f"recall overall: {summary['recall_total']}   "
          f"hit rate: {summary['hit_rate']}   "
          f"off-topic cases: {summary['off_topic_cases']}   "
          f"mean: {summary['mean_seconds']}s")

    misses = [(r["id"], r["missed"]) for r in results if r["missed"]]
    if misses:
        print("\nknown-good papers never surfaced:")
        for cid, dois in misses:
            print(f"  {cid}: {', '.join(dois)}")

    for r in results:
        if r["off_topic_in_top"]:
            print(f"\nwrong sense leaked into {r['id']}:")
            for t in r["off_topic_in_top"]:
                print(f"  - {t[:100]}")


def _fmt(v) -> str:
    return "-" if v is None else f"{v:.2f}"


def compare(current: dict, baseline_path: Path) -> None:
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    b = baseline["summary"]
    c = current["summary"]
    print(f"\nagainst {baseline_path.name} ({baseline.get('run_at', 'unknown date')}):")
    for key in ("recall_at_k", "recall_total", "hit_rate"):
        delta = c[key] - b[key]
        arrow = "same" if abs(delta) < 1e-9 else ("better" if delta > 0 else "WORSE")
        print(f"  {key:<14} {b[key]:.3f} -> {c[key]:.3f}  ({delta:+.3f}, {arrow})")

    prev = {r["id"]: r for r in baseline["results"]}
    for r in current["results"]:
        old = prev.get(r["id"])
        if not old or old["recall_total"] is None or r["recall_total"] is None:
            continue
        if r["recall_total"] < old["recall_total"]:
            print(f"  regressed: {r['id']} {old['recall_total']:.2f} -> {r['recall_total']:.2f}")


async def main() -> int:
    ap = argparse.ArgumentParser(description="Measure Firmo's source relevance.")
    ap.add_argument("--case", help="run one case by id")
    ap.add_argument("-k", type=int, default=DEFAULT_K, help=f"cutoff for recall@k (default {DEFAULT_K})")
    ap.add_argument("--save", help="write the run to this path")
    ap.add_argument("--compare", help="diff the run against a saved one")
    args = ap.parse_args()

    if not os.getenv("MISTRAL_API_KEY"):
        print("MISTRAL_API_KEY is not set. Planning and reranking would fall back, "
              "which makes the numbers meaningless.", file=sys.stderr)
        return 2

    data = json.loads(BENCHMARK.read_text(encoding="utf-8"))
    cases = [c for c in data["cases"] if not args.case or c["id"] == args.case]
    if not cases:
        print(f"no case with id {args.case!r}", file=sys.stderr)
        return 2

    print(f"running {len(cases)} case(s) at k={args.k}…")
    results = []
    # Sequential on purpose: parallel runs would collide on the shared search
    # budget and the timings would stop meaning anything.
    for case in cases:
        r = await run_case(case, args.k)
        results.append(r)
        print(f"  {r['id']:<24} core={r['core']:<4} recall@k={_fmt(r['recall_at_k'])}  {r['elapsed_s']}s")

    summary = summarise(results, args.k)
    print_report(results, summary)

    payload = {
        "run_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "k": args.k,
        "summary": summary,
        "results": results,
    }

    if args.compare:
        compare(payload, Path(args.compare))

    if args.save:
        out = Path(args.save)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"\nsaved to {out}")

    await get_client().aclose()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
