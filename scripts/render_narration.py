#!/usr/bin/env python3
"""Render the demo's narration to audio files, once, on a developer's machine.

The demo used to speak through the browser's Web Speech API, which is free and
instant and entirely at the mercy of the viewer's machine — Windows ships both a
2005 synthesiser and an Azure neural set, and which one a visitor has is a
lottery. The cloud alternative sounds identical for everyone and wants a credit
card for a free tier.

Neither is necessary. The script is eighteen fixed lines that do not change
between visitors, so they are synthesised once, here, and committed. Production
serves static MP3s: no key, no quota, no latency, no runtime dependency at all.

`edge-tts` needs no account. Calling an undocumented endpoint on every page view
would be ToS-grey and fragile; calling it at build time, on a laptop, to produce
an artefact that is then committed, is neither.

    python scripts/render_narration.py            # render anything missing
    python scripts/render_narration.py --check    # CI: fail if out of sync
    python scripts/render_narration.py --force    # re-render everything
    python scripts/render_narration.py --voice en-GB-ThomasNeural

The drift problem, and how it is solved
---------------------------------------
Pre-rendered audio's one real failure is the script changing while the voice
keeps reading the old line — a demo that says something the screen is no longer
doing, with nothing to warn you. So each file is named for the SHA of the text
it speaks. Editing a line changes its hash, which orphans the old file and marks
the new one missing; `--check` then fails. Audio cannot silently disagree with
the script because the filename *is* the script.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    sys.exit("edge-tts is not installed. Run:  pip install edge-tts")

ROOT = Path(__file__).resolve().parent.parent
SCRIPT_FILE = ROOT / "frontend" / "src" / "lib" / "demo.js"
OUT_DIR = ROOT / "frontend" / "public" / "narration"
MANIFEST = OUT_DIR / "manifest.json"

DEFAULT_VOICE = "en-US-AndrewMultilingualNeural"   # warm, confident, authentic
# Chosen by ear over the en-GB set. Azure's Multilingual voices are a newer
# generation than the standard *Neural ones and audibly less synthetic; there is
# no en-GB Multilingual, so this trades the accent for the naturalness. British
# alternatives if that trade stops being worth it: en-GB-RyanNeural,
# en-GB-ThomasNeural. Non-American newer generation: en-AU-WilliamMultilingualNeural.
DEFAULT_RATE = "+6%"                 # neural voices carry a quicker read


def line_id(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def spoken(text: str) -> str:
    """The line as it should be read, rather than as it is written.

    An em dash is punctuation to a reader and a full stop to a neural TTS, and
    the script uses them mid-sentence for pace. Read literally, every one lands
    as a hard break in the middle of a thought.
    """
    return re.sub(r"\s*—\s*", ", ", text).strip()


def extract_lines() -> list[str]:
    """Every `say:` string in the demo script, in order.

    Parsed out of the JavaScript rather than duplicated into a data file,
    because a second copy of the script is a second thing to keep in step and
    the entire point of this tool is that nothing drifts.
    """
    src = SCRIPT_FILE.read_text(encoding="utf-8")
    body = src[src.index("export const SCRIPT"):]
    out, seen = [], set()
    for m in re.finditer(r"say:\s*'((?:[^'\\]|\\.)*)'", body):
        text = m.group(1).replace("\\'", "'").replace("\\\\", "\\")
        if text not in seen:
            seen.add(text)
            out.append(text)
    return out


async def render(text: str, voice: str, rate: str, path: Path) -> None:
    comm = edge_tts.Communicate(spoken(text), voice, rate=rate)
    await comm.save(str(path))


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default=DEFAULT_VOICE)
    ap.add_argument("--rate", default=DEFAULT_RATE)
    ap.add_argument("--force", action="store_true", help="re-render every line")
    ap.add_argument("--check", action="store_true",
                    help="exit non-zero if any line is missing audio; renders nothing")
    ap.add_argument("--list-voices", action="store_true")
    args = ap.parse_args()

    if args.list_voices:
        voices = await edge_tts.list_voices()
        for v in sorted(voices, key=lambda x: x["ShortName"]):
            if v["Locale"].startswith("en"):
                print(f"  {v['ShortName']:<34} {v['Gender']:<7} {v['Locale']}")
        return 0

    lines = extract_lines()
    if not lines:
        sys.exit("No say: lines found — has the SCRIPT format changed?")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    entries = {line_id(t): t for t in lines}

    missing = [t for h, t in entries.items() if not (OUT_DIR / f"{h}.mp3").exists()]

    if args.check:
        if missing:
            print(f"{len(missing)} line(s) have no audio:\n")
            for t in missing:
                print(f"  - {t[:88]}")
            print("\nRun:  python scripts/render_narration.py")
            return 1
        print(f"All {len(lines)} lines have audio.")
        return 0

    todo = list(entries.items()) if args.force else [
        (h, t) for h, t in entries.items() if not (OUT_DIR / f"{h}.mp3").exists()
    ]

    if todo:
        print(f"Rendering {len(todo)} line(s) as {args.voice} at {args.rate}…\n")
        for h, text in todo:
            path = OUT_DIR / f"{h}.mp3"
            try:
                await render(text, args.voice, args.rate, path)
                print(f"  ok   {path.stat().st_size / 1024:6.1f} KB  {text[:64]}")
            except Exception as e:
                print(f"  FAIL {type(e).__name__}: {e}\n    {text[:64]}")
                return 1
    else:
        print("Every line already has audio. Use --force to re-render.")

    # Text to filename, so the player can find a line's audio without
    # reimplementing the hash. Also the record of which voice was used.
    MANIFEST.write_text(
        json.dumps(
            {"voice": args.voice, "rate": args.rate,
             "lines": {t: f"{h}.mp3" for h, t in entries.items()}},
            indent=1, ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    # Files whose line no longer exists in the script. Left in place rather than
    # deleted, because a half-finished edit should not destroy audio you are
    # about to need again — but named, so they do not accumulate unnoticed.
    orphans = [p for p in OUT_DIR.glob("*.mp3") if p.stem not in entries]
    if orphans:
        print(f"\n{len(orphans)} orphaned file(s) from edited lines:")
        for p in orphans:
            print(f"  {p.name}")
        print("Delete them once you are happy with the script.")

    total = sum(p.stat().st_size for p in OUT_DIR.glob("*.mp3")) / 1024
    print(f"\n{len(entries)} lines - {total:.0f} KB total - manifest written")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
