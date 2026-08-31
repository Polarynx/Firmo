# The next measurement, and only the next one

**One run. Not a campaign.** Firmo's own Mistral quota is the budget that
matters; the benchmark is a diagnostic and should cost a fraction of it. Three
runs a side is the right standard for deciding whether to *change* something,
and it is the wrong standard for recording a number we already believe.

## Run this

```
cd backend
FIRMO_LLM_CONCURRENCY=2 RERANK_CONCURRENCY=2 \
  ./.venv/Scripts/python.exe eval/run_eval.py --save eval/runs/keyed-1.json
```

~35 minutes, 58 cases. Then:

```
./.venv/Scripts/python.exe eval/band.py band58-1 band58-2 band58-3 -- keyed-1
```

## What it answers

Every retrieval number on record was measured while OpenAlex was throttled or
refusing outright, because the API key arrived after the runs. The last one,
`recall_total` 0.356, was taken on an OpenAlex that was degrading toward zero
during the run. With the key wired in it should be higher, and nobody knows by
how much.

`band.py` will say CANNOT TELL against a single run, which is correct and
expected. Read the number, do not treat it as a verdict.

## The interesting gap, if there is appetite for one more thing later

Measured with no LLM at all, on 20 cases and 30 gold papers, keyed:

| | gold reaching the pool |
|---|---|
| keyword search alone | 4/30 (13%) |
| plus the citation walk | 17/30 (57%) |

But end-to-end `recall_total` was 0.356. So roughly twenty points of gold are
being retrieved and then discarded: the pool is cut to about 58 papers a case,
and papers that made it into the pool do not survive the cut.

That is a ranking and cap problem, not a retrieval one, and it is the cheapest
remaining win — the retrieval half is already solved. Raising the cut and
measuring would be a handful of runs rather than a day.

Related and already measured: walking both citation graphs on every search
(`FIRMO_S2_CITATION_ALWAYS=1`) made recall *worse* in its one run, 0.264
against 0.305–0.374. Consistent with the same cause — more candidates
displacing good ones rather than adding to them. Worth finishing that arm
before touching the cap, since they are the same question from two directions.

## What needs no further measurement

Settled by direct observation rather than statistics, and not worth re-running:

- Europe PMC, DOAJ and Semantic Scholar were returning zero papers for every
  query and now return papers.
- The citation fallback: `recall_total` 0.069 → 0.310, three runs a side.
- The OpenAlex API key: 12/12 queries answered against 0/12 unkeyed.
- The benchmark itself: 58 cases, 86 gold papers, noise floor 6.6× tighter
  than the 32-case set it replaced.
