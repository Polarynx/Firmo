"""Where do the missing papers go?

The eval says five of fifty-five known-good papers make it into a sixty-paper
pool. That number alone cannot say why, and the two possible causes want
opposite fixes: if a gold paper arrives from a database and then loses its
place, the ranker is at fault; if it never arrives at all, the ranker is
irrelevant and the fan-out is.

Three questions, in order of how much they would change the fix:

  --mode plain    Fan out on the student's own words. How many of the ~98 HTTP
                  tasks finish inside the ten-second budget, which connectors
                  are still in flight when it expires, and does the gold paper
                  reach the raw union at all.

  --mode oracle   Fan out on the gold paper's exact title. This is the control.
                  If a connector cannot return a paper when handed its title
                  verbatim, no amount of query rewriting will ever reach it and
                  the bug is in the connector, the dedupe, or the filters. If it
                  can, the pipeline is sound and the problem is vocabulary.

Neither mode calls the LLM, so both are repeatable — which the eval itself is
not, and that is exactly why chasing its numbers has been so unproductive.
"""
import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

import sources as S


def _norm(doi):
    return (S.normalize_doi(doi) or "").lower()


def _tkey(t):
    return S._title_key(t or "")


async def fanout_census(queries, budget):
    """search_all, instrumented. Same shape, but it keeps the books."""
    tasks = {}
    for q in queries:
        for fn, limit in S.ALL_CONNECTORS:
            t = asyncio.create_task(fn(q, limit=limit, year_from=None))
            tasks[t] = fn.__name__

    papers, per_conn, failed, finished = [], {}, {}, 0
    loop = asyncio.get_running_loop()
    deadline = loop.time() + budget
    pending = set(tasks)
    while pending:
        left = deadline - loop.time()
        if left <= 0:
            break
        done, pending = await asyncio.wait(pending, timeout=left,
                                           return_when=asyncio.FIRST_COMPLETED)
        for t in done:
            name = tasks[t]
            finished += 1
            try:
                got = t.result()
            except Exception as e:
                failed[name] = failed.get(name, 0) + 1
                continue
            per_conn[name] = per_conn.get(name, 0) + len(got)
            papers.extend(got)

    stranded = {}
    for t in pending:
        stranded[tasks[t]] = stranded.get(tasks[t], 0) + 1
        t.cancel()

    return {"total": len(tasks), "finished": finished, "cancelled": len(pending),
            "per_connector": per_conn, "failed": failed, "stranded": stranded,
            "raw": papers}


async def gold_titles(dois):
    """The gold papers' real titles, straight from OpenAlex.

    By DOI filter, not `_openalex_by_ids` — that one takes OpenAlex work IDs and
    silently returns nothing when handed a DOI, which quietly reduced the first
    oracle run to only those cases whose ground truth was recorded as a title.
    """
    dois = [d for d in dois if d]
    if not dois:
        return {}
    out = {}
    for i in range(0, len(dois), 40):
        batch = [f"https://doi.org/{_norm(d)}" for d in dois[i:i + 40]]
        try:
            data = (await S._get(S.OPENALEX_URL, S._polite({
                "filter": "doi:" + "|".join(batch),
                "per-page": len(batch),
                "select": "id,doi,title,cited_by_count",
            }))).json()
        except Exception:
            continue
        for w in data.get("results", []):
            if w.get("doi") and w.get("title"):
                out[_norm(w["doi"])] = w["title"]
    return out


async def run_case(case, mode, budget):
    gold = {_norm(d) for d in case.get("must_find", []) if _norm(d)}
    gold_t = {_tkey(t) for t in case.get("must_find_titles", []) if _tkey(t)}

    if mode == "oracle":
        titles = await gold_titles(case.get("must_find", []))
        queries = list(titles.values()) + list(case.get("must_find_titles", []))
        if not queries:
            return None
    else:
        queries = [case["query"]]

    t0 = time.time()
    c = await fanout_census(queries, budget)
    elapsed = time.time() - t0

    raw = c.pop("raw")
    raw_dois = {_norm(p.get("doi")) for p in raw if p.get("doi")}
    raw_titles = {_tkey(p.get("title")) for p in raw if p.get("title")}
    hit_raw = len(gold & raw_dois) + len(gold_t & raw_titles)

    processed = S.process_papers(raw)
    kept_dois = {_norm(p.get("doi")) for p in processed if p.get("doi")}
    kept_titles = {_tkey(p.get("title")) for p in processed if p.get("title")}
    hit_kept = len(gold & kept_dois) + len(gold_t & kept_titles)

    return {"id": case["id"], "elapsed": round(elapsed, 1),
            "gold": len(gold) + len(gold_t), "in_raw": hit_raw, "in_kept": hit_kept,
            "raw_papers": len(raw), "kept_papers": len(processed), **c}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["plain", "oracle"], default="plain")
    ap.add_argument("--budget", type=float, default=10.0)
    ap.add_argument("--limit", type=int, default=0, help="first N cases only")
    args = ap.parse_args()

    cases = json.loads(Path(__file__).with_name("benchmark.json").read_text())["cases"]
    if args.limit:
        cases = cases[:args.limit]

    print(f"mode={args.mode}  budget={args.budget}s  cases={len(cases)}\n")
    fin = tot = g = raw_hit = kept_hit = 0
    stranded, yields = {}, {}

    for case in cases:
        r = await run_case(case, args.mode, args.budget)
        if r is None:
            continue
        fin += r["finished"]; tot += r["total"]
        g += r["gold"]; raw_hit += r["in_raw"]; kept_hit += r["in_kept"]
        for k, v in r["stranded"].items():
            stranded[k] = stranded.get(k, 0) + v
        for fn, _ in S.ALL_CONNECTORS:
            yields.setdefault(fn.__name__, []).append(r["per_connector"].get(fn.__name__, 0))

        print(f"{r['id']:26} tasks {r['finished']:>3}/{r['total']:<3} "
              f"papers {r['raw_papers']:>4}->{r['kept_papers']:<4} "
              f"gold raw {r['in_raw']}/{r['gold']} kept {r['in_kept']}/{r['gold']}  {r['elapsed']}s")

    print(f"\ntasks finished:              {fin}/{tot} ({fin / max(tot,1):.0%})")
    print(f"gold reaching the raw union: {raw_hit}/{g} ({raw_hit / max(g,1):.0%})")
    print(f"gold surviving processing:   {kept_hit}/{g} ({kept_hit / max(g,1):.0%})")

    print("\ncancelled at the deadline, by connector:")
    for k, v in sorted(stranded.items(), key=lambda x: -x[1])[:20]:
        print(f"  {k:28} {v}")

    print("\nmean papers per connector call:")
    for k, v in sorted(yields.items(), key=lambda x: -sum(x[1])):
        print(f"  {k:28} {sum(v) / max(len(v),1):5.1f}")


if __name__ == "__main__":
    asyncio.run(main())
