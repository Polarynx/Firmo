# Where retrieval stands, and what is worth measuring next

## The number

Two runs with a keyed OpenAlex, against three of the same build before the
citation and connector work:

| | before (3 runs) | keyed (2 runs) |
|---|---|---|
| `recall_total` | 0.078 - 0.103 | **0.382 - 0.543** |
| `recall_at_k` | 0.043 - 0.069 | **0.270 - 0.399** |
| `hit_rate` | 0.052 - 0.103 | **0.379 - 0.500** |

Firmo finds roughly two fifths to a half of the papers a person who knows the
field would name, against one in ten before. `band.py` still says two runs a
side is weak evidence and it is right; the ranges do not come close to
overlapping, and the worst keyed run is nearly four times the best control.

The spread between the two keyed runs is not noise, and it is worth reading.
`keyed-2` ran with Semantic Scholar throttled to silence, DOAJ behind its bot
challenge, and six Mistral rate-limit retries. So 0.382 is roughly what Firmo
does with two indexes missing and the model under pressure, and 0.543 is what
it does on a good day. Both numbers are useful; neither is the third decimal.

`keyed-3` has been attempted twice and abandoned twice, both times on purpose.
The first attempt stopped when Mistral began rate-limiting partway through
`keyed-2`. The second was killed after one case: 29 consecutive 503s
("Service temporarily unavailable due to high load"), that single case scoring
0.00, and Mistral unreachable altogether a minute later.

That is the failure this file warns about, met head on. A run without a working
reranker does not fail - it silently falls back to cosine ranking and produces
a number that looks like a ranking regression. Banking one would have meant
retracting it later, which is how most of the wrong conclusions here were
reached. No partial file was written.

So the third run is still owed, and it needs a day when Mistral is healthy
rather than the end of a long one.

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
- DOAJ is behind a Cloudflare bot challenge (403, "Just a moment..."). The
  connector is correct and returned papers for a day after its URL was fixed;
  the challenge is not something to work around. The breaker treats it as an
  outage.
- Semantic Scholar is silent, and a key is already set. This looked like a
  missing key and is not one: the 44-character key is sent as `x-api-key` and
  Semantic Scholar answers 429 identically with it and without it, wording and
  all - "apply for a key for higher rate limits". An unrecognised, expired or
  never-activated key is indistinguishable from no key from the outside, so
  nothing in the code can tell them apart. The key's status needs checking with
  Semantic Scholar; there is nothing to fix here. It was silent through all of
  `keyed-2` and would have been through `keyed-3`.

## If there is appetite for more

In rough order of expected value:

1. **A third keyed run, on a healthy day.** Cheapest way to turn the headline number from
   believable into established, and the only thing band.py is still asking for.
   ~35 minutes. Run it when the Mistral quota is fresh, not after a day of use.
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
