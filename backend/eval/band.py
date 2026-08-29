"""Compare two sets of runs without fooling yourself.

Three retrieval decisions in this repo have been made on a single run against a
single prior run, and at least two of them were wrong. Citation-graph seeding
was reverted on "5 cases lost, 0 gained, recall_total 0.219 -> 0.109", which
later turned out to sit inside the spread of identical code. The connector
repair looked like a clean win against three prior runs until the fourth and
fifth runs of the same build came back 0.203 and 0.078.

The mistake is always the same shape: comparing one number to one number, when
the thing being measured moves on its own by more than the change does.

So this refuses to answer the question that way. Give it two groups of runs and
it reports each metric as a range, and it will only call a difference real when
the two ranges do not touch — which for small groups is a weak test, and is
meant to be. It would rather say "cannot tell" than hand back a verdict that
another run would overturn.

    python band.py polite-baseline polite-rep2 polite-rep3 -- connfix-1 connfix-2
    python band.py band58-1 band58-2 band58-3          # one group: the noise floor
"""
from __future__ import annotations

import json
import os
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RUNS = os.path.join(HERE, "runs")
METRICS = ("recall_at_k", "recall_total", "hit_rate")


def load(name: str) -> dict:
    path = os.path.join(RUNS, name if name.endswith(".json") else name + ".json")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def summarise(names: list[str]) -> tuple[dict, int]:
    runs = [load(n) for n in names]
    sizes = {r["summary"]["cases"] for r in runs}
    if len(sizes) > 1:
        print(f"!! these runs used different benchmarks ({sorted(sizes)} cases). "
              f"They are not comparable and nothing below means anything.\n")
    out = {}
    for m in METRICS:
        vals = [r["summary"][m] for r in runs]
        out[m] = {"min": min(vals), "max": max(vals),
                  "median": statistics.median(vals), "values": vals}
    return out, sizes.pop() if len(sizes) == 1 else -1


def show(label: str, band: dict, cases: int, names: list[str]) -> None:
    print(f"{label}  ({len(names)} runs, {cases} cases)")
    for m in METRICS:
        b = band[m]
        vals = " ".join(f"{v:.3f}" for v in b["values"])
        print(f"  {m:13} {b['min']:.3f} - {b['max']:.3f}   median {b['median']:.3f}"
              f"   [{vals}]")
    print()


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)

    if "--" in args:
        cut = args.index("--")
        before, after = args[:cut], args[cut + 1:]
    else:
        before, after = args, []

    b_band, b_cases = summarise(before)
    show("BEFORE" if after else "RUNS", b_band, b_cases, before)

    if not after:
        # One group: this is the noise floor, and the only number that matters
        # is how much the metric moves when nothing has changed.
        print("Noise floor on identical code:")
        for m in METRICS:
            b = b_band[m]
            spread = b["max"] - b["min"]
            rel = spread / b["median"] if b["median"] else float("inf")
            print(f"  {m:13} moves by {spread:.3f} ({rel:.0%} of its median) "
                  f"with no change at all")
        print("\nA change smaller than that is invisible here, whatever a single "
              "run says.")
        return

    a_band, a_cases = summarise(after)
    show("AFTER", a_band, a_cases, after)

    print("Verdict, metric by metric:")
    for m in METRICS:
        lo, hi = b_band[m], a_band[m]
        if hi["min"] > lo["max"]:
            print(f"  {m:13} REAL and better  (after {hi['min']:.3f} > before {lo['max']:.3f})")
        elif hi["max"] < lo["min"]:
            print(f"  {m:13} REAL and worse   (after {hi['max']:.3f} < before {lo['min']:.3f})")
        else:
            overlap = min(lo["max"], hi["max"]) - max(lo["min"], hi["min"])
            print(f"  {m:13} CANNOT TELL      (ranges overlap by {overlap:.3f})")

    n = min(len(before), len(after))
    if n < 3:
        print(f"\nOnly {n} run(s) on the smaller side. Non-overlap on that few is "
              f"weak evidence: two runs of one build came back 0.203 and 0.078 "
              f"on the old benchmark. Prefer three a side before believing it.")


if __name__ == "__main__":
    main()
