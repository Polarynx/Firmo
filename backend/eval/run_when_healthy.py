"""Wait for the model to be genuinely well, then take the measurement.

The third keyed run has been abandoned twice, both times correctly: once when
Mistral began rate-limiting, once after 29 consecutive 503s. A benchmark taken
through an outage does not fail, it quietly falls back to cosine ranking and
returns a number that reads as a ranking regression, and retracting those is
most of what has gone wrong in this repository.

So the run is not scheduled, it is gated. This waits until the model has
answered several probes in a row, spaced out, and only then starts the eval.

Several in a row, rather than one, because that is the difference between "the
service is back" and "one request got lucky between failures" - and the second
is exactly the state that produces a plausible, wrong number. The spacing
matters for the same reason: three replies inside a second say nothing about
whether a thirty-five minute run will survive.
"""
import asyncio
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv
load_dotenv(BACKEND / ".env")

import llm

HEALTHY_IN_A_ROW = 3        # consecutive good probes before we believe it
PROBE_GAP_S = 60.0          # spread out, so a lucky second does not qualify
RETRY_GAP_S = 300.0         # while it is down, ask every five minutes
MAX_WAIT_S = 8 * 3600.0     # give up rather than wait forever


async def probe() -> bool:
    """One cheap call. True only on a real answer."""
    try:
        out = await llm.chat_json('Return ONLY {"ok": 1}', max_tokens=20)
        return bool(out)
    except Exception as e:
        print(f"  probe failed: {type(e).__name__}: {str(e)[:80]}", flush=True)
        return False


async def wait_for_health() -> bool:
    started = time.time()
    good = 0
    while time.time() - started < MAX_WAIT_S:
        if await probe():
            good += 1
            waited = int((time.time() - started) / 60)
            print(f"  healthy probe {good}/{HEALTHY_IN_A_ROW} ({waited} min waited)", flush=True)
            if good >= HEALTHY_IN_A_ROW:
                return True
            await asyncio.sleep(PROBE_GAP_S)
        else:
            # One failure resets the count. A service flapping between 200 and
            # 503 is not well enough for a thirty-five minute run.
            good = 0
            await asyncio.sleep(RETRY_GAP_S)
    return False


def main() -> int:
    print("waiting for Mistral to be healthy before running keyed-3", flush=True)
    if not asyncio.run(wait_for_health()):
        print("gave up: Mistral did not stay healthy within the window", flush=True)
        return 1

    print("Mistral looks well. Starting keyed-3.", flush=True)
    env = {**os.environ, "FIRMO_LLM_CONCURRENCY": "2", "RERANK_CONCURRENCY": "2",
           "PYTHONUNBUFFERED": "1"}
    proc = subprocess.run(
        [sys.executable, str(HERE / "run_eval.py"), "--save", str(HERE / "runs" / "keyed-3.json")],
        cwd=str(BACKEND), env=env,
    )
    return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
