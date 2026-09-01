# Where retrieval stands, and what is worth measuring next

## The number

`keyed-1`, 58 cases, the first run ever taken with a healthy OpenAlex:

| | before (3 runs) | keyed-1 (1 run) |
|---|---|---|
| `recall_total` | 0.078 – 0.103 | **0.543** |
| `recall_at_k` | 0.043 – 0.069 | **0.399** |
| `hit_rate` | 0.052 – 0.103 | **0.500** |

Firmo finds more than half the papers a person who knows the field would name,
and half of all questions surface at least one of them. It was one in ten.

`band.py` says this is weak evidence, and it is right to: one run a side. It is
reported anyway because the gap is about fivefold and the widest spread ever
seen between runs of one build on this benchmark is about 2.6x. Believe the
direction; do not quote the third decimal.

## What this retires

The gap this file used to point at is gone, and it went without being worked on.

Measured with no model calls, on 20 cases and 30 gold papers: keyword search
alone puts 13% of gold into the pool, and the citation walk takes that to 57%.
End-to-end recall was 0.356 at the time, so about twenty points of gold were
being retrieved and then discarded at the ~58-paper cut. That looked like the
cheapest remaining win.

End-to-end is now 0.543 against the same 57% reaching the pool, so the cut is
costing roughly three points rather than twenty. The earlier figure was taken
while OpenAlex was degrading toward nothing, which starved the citation walk —
every call in that walk goes to OpenAlex — and made the pool look far richer
than what survived it. Raising the cap is no longer worth a day.

## What needs no further measurement

Settled by direct observation rather than statistics:

- Europe PMC, DOAJ and Semantic Scholar were returning zero papers for every
  query, and now return papers. Europe PMC was being sent a sort key it does
  not have and answering with an empty envelope; DOAJ wants its search term in
  the path and was getting it as `?q=`.
- The OpenAlex API key: 12/12 queries answered against 0/12 unkeyed.
- The citation fallback: `recall_total` 0.069 → 0.310, three runs a side.
- The benchmark: 58 cases, 86 gold papers, noise floor 6.6x tighter than the
  32-case set it replaced.
- BASE authorises by IP and refuses this one whatever user agent it is sent, so
  it is out of the fan-out behind `FIRMO_ENABLE_BASE=1` rather than spending a
  request slot per query to be refused.

## If there is appetite for more

In rough order of expected value:

1. **A second and third keyed run.** Cheapest way to turn the headline number
   from believable into established. ~35 minutes each.
2. **`FIRMO_S2_CITATION_ALWAYS=1`, finished properly.** Walking both citation
   graphs measured *worse* in its one run (0.264 against 0.305–0.374) but that
   arm was cut short by the Mistral quota. Same question as the cap from the
   other direction: whether more candidates displace good ones.
3. **The remaining third.** 46% of gold is still not found. Nothing cheap is
   known to be left; this is new work rather than a fix.

## House rules for this file

**One run, not a campaign.** Firmo's own Mistral and OpenAlex quotas are the
budget that matters, and the harness drinks from both. Three runs a side is the
standard for deciding whether to *change* something; it is the wrong standard
for recording a number already believed.

**A run without the reranker degrades silently to cosine ranking rather than
failing.** That is how the wrong conclusions in this repository have been
reached before. If a run looks strange, check its per-case timing for a
collapse partway through before believing it.
