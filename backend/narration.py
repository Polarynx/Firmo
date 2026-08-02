"""The demo's voice, synthesised once and then served from disk.

The demo narrates itself through the browser's Web Speech API, which is free and
instant and entirely at the mercy of the viewer's machine. Windows ships two
generations of voice at once — a 2005 synthesiser and an Azure neural set — and
which one a given visitor has is a lottery. A landing-page demo cannot sound
like a robot to half the people who watch it.

So the same Azure voices are reached directly, server side, and every visitor
hears the identical read. `en-GB-RyanNeural` is the young British male the demo
was written for.

Two properties make this cheap enough to be uncontroversial:

Cached by content. The key is a hash of the text, the voice and the rate, so a
line is synthesised the first time anybody plays the demo and served from disk
forever after. The whole script is about 1,800 characters; Azure's free tier is
500,000 a month. Editing a line re-synthesises that line and nothing else.

Optional. With no key configured every endpoint here returns 503 and the
frontend falls back to Web Speech, which is exactly where it was before. Nothing
about the demo depends on this being deployed.
"""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from typing import Optional

import httpx

AZURE_KEY = os.getenv("AZURE_SPEECH_KEY", "").strip()
AZURE_REGION = os.getenv("AZURE_SPEECH_REGION", "eastus").strip()

# Young, British, male. The rest of the en-GB neural set is listed because the
# only way to judge a voice is to hear it, and swapping this is a one-word
# change: RyanNeural, ThomasNeural, AlfieNeural, ElliotNeural, NoahNeural.
VOICE = os.getenv("FIRMO_NARRATION_VOICE", "en-GB-RyanNeural")

# Neural voices carry a slightly quicker read than synthesisers; at the default
# rate they sound like someone being careful with you.
RATE = os.getenv("FIRMO_NARRATION_RATE", "+6%")

CACHE_DIR = Path(os.getenv("FIRMO_NARRATION_CACHE", Path(__file__).parent / ".narration"))

# A demo line, not an essay. The cap is a cost ceiling and an abuse ceiling at
# once: this endpoint is unauthenticated, because the demo plays before anyone
# signs in, so it must not be usable as a free TTS service.
MAX_CHARS = 400

_ENDPOINT = "https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"

# audio-24khz-48kbitrate-mono-mp3 is the smallest format that still sounds like
# a voice rather than a phone call; a demo line lands around 25 KB.
_FORMAT = "audio-24khz-48kbitrate-mono-mp3"


def available() -> bool:
    return bool(AZURE_KEY)


def _key(text: str) -> str:
    raw = f"{VOICE}|{RATE}|{text}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]


def cached_path(text: str) -> Path:
    return CACHE_DIR / f"{_key(text)}.mp3"


def _escape(text: str) -> str:
    """SSML is XML, and the script contains ampersands and quotes."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _ssml(text: str) -> str:
    # An em dash reads as a hard stop in neural TTS, which is right for prose and
    # wrong for narration — the script uses them mid-sentence for pace. A comma
    # gives the pause without the full stop.
    spoken = re.sub(r"\s*—\s*", ", ", text)
    return (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB">'
        f'<voice name="{VOICE}">'
        f'<prosody rate="{RATE}">{_escape(spoken)}</prosody>'
        "</voice></speak>"
    )


async def synthesize(text: str, client: Optional[httpx.AsyncClient] = None) -> Optional[bytes]:
    """MP3 for one line, from cache when possible. None when unavailable.

    Returning None rather than raising is deliberate: a failed narration must
    cost the viewer a voice, never the demo. The caller answers 503 and the
    browser speaks the line itself.
    """
    text = (text or "").strip()
    if not text or len(text) > MAX_CHARS or not AZURE_KEY:
        return None

    path = cached_path(text)
    if path.exists():
        try:
            return path.read_bytes()
        except OSError:
            pass

    owns = client is None
    client = client or httpx.AsyncClient()
    try:
        resp = await client.post(
            _ENDPOINT.format(region=AZURE_REGION),
            headers={
                "Ocp-Apim-Subscription-Key": AZURE_KEY,
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": _FORMAT,
                "User-Agent": "firmo-demo",
            },
            content=_ssml(text).encode("utf-8"),
            timeout=20.0,
        )
        if resp.status_code != 200 or not resp.content:
            print(f"[narration] azure returned {resp.status_code}: {resp.text[:200]}")
            return None
        audio = resp.content
    except Exception as e:
        print(f"[narration] {type(e).__name__}: {e}")
        return None
    finally:
        if owns:
            await client.aclose()

    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path.write_bytes(audio)
    except OSError as e:
        # An unwritable cache is a cost problem, not a correctness one.
        print(f"[narration] could not cache: {e}")

    return audio
