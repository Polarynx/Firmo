"""The process record: how a paper was made, in a form that can be checked.

Firmo's whole position rests on this file. Every other tool in this space either
writes the paper for you — which is what gets a tool banned by a department — or
tries to catch you afterwards, which does not work. Firmo sits on the student's
side and produces the one artefact the institution actually wants: evidence of
the process, generated as a by-product of doing the work.

Two properties make that artefact worth anything:

  Only Firmo can generate it. The searches, the sources, the draft, the claim
  layer and the chat all happen on one surface, so the events can be recorded
  as a single ordered log. A tool that owns one slice of the workflow cannot
  produce this no matter how good it is.

  It records the refusals. `CHAT_SYSTEM` already refuses to write prose. Until
  now that rule was merely claimed; logging the refusals makes it *provable*,
  and a tool whose business is writing your paper for you structurally cannot
  produce that log.

The chain here is tamper-**evident**, not tamper-proof, and the export says so
in those words. Firmo's server could rewrite a whole chain if it wanted to. What
the chain rules out is quiet editing: change one payload and that row's hash
changes, which breaks every hash after it, and the verifier says exactly which
row broke. That is the honest claim, and overstating it would be the fastest way
to lose the trust the whole idea depends on.
"""
import hashlib
import json
from datetime import datetime, timezone
from typing import Iterable, Optional

GENESIS = "0" * 64

# The events worth recording. Anything not on this list is dropped rather than
# stored: a record nobody can read is not evidence, and an unbounded event
# vocabulary turns into one.
KINDS = {
    "search.run",          # a topic was searched, with the fan-out queries used
    "search.expand",       # the citation hop ran
    "source.open",         # a result was opened
    "source.save",         # a source joined the project
    "source.remove",
    "import.run",          # references brought in from RIS/BibTeX/DOI
    "draft.snapshot",      # the draft as it stood, hashed rather than stored
    "draft.check",         # the claim layer ran over the draft
    "claim.flagged",       # a sentence was marked as needing a source
    "claim.resolved",      # …and what resolved it
    "citation.insert",
    "citations.audit",     # a reference list was checked against publisher records
    "chat.turn",           # a question asked of Firmo, and what kind of answer came back
    "chat.refusal",        # Firmo declined to write prose. The load-bearing one.
    "export.docx",
}

# Payload keys are capped so a draft cannot be smuggled into the log wholesale.
# The record proves *that* you wrote, not *what* you wrote: it stores a hash of
# each draft snapshot and its length, never the prose. A student should be able
# to hand this to an instructor without handing over an unfinished essay.
MAX_PAYLOAD_CHARS = 4000


def canonical(payload: dict) -> str:
    """One byte-for-byte spelling of a payload, so hashes are reproducible.

    Sorted keys and no incidental whitespace: without this, two JSON encoders
    that disagree about key order would compute different hashes for the same
    event and every verification would fail for no reason.
    """
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def event_hash(prev_hash: str, seq: int, at: datetime, kind: str, payload: dict) -> str:
    at_utc = at.astimezone(timezone.utc) if at.tzinfo else at.replace(tzinfo=timezone.utc)
    material = "\n".join([
        prev_hash or GENESIS,
        str(seq),
        at_utc.isoformat(timespec="milliseconds"),
        kind,
        canonical(payload),
    ])
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def draft_fingerprint(text: str) -> dict:
    """What a draft snapshot records: its shape, never its content."""
    normalised = " ".join((text or "").split())
    return {
        "chars": len(text or ""),
        "words": len(normalised.split()) if normalised else 0,
        "sha256": hashlib.sha256(normalised.encode("utf-8")).hexdigest(),
    }


def clean_payload(payload: Optional[dict]) -> dict:
    """Trim a payload to something safe and bounded to store."""
    if not isinstance(payload, dict):
        return {}
    out = {}
    for key, value in payload.items():
        if not isinstance(key, str) or len(key) > 40:
            continue
        if isinstance(value, str):
            out[key] = value[:600]
        elif isinstance(value, (int, float, bool)) or value is None:
            out[key] = value
        elif isinstance(value, list):
            out[key] = [v[:300] if isinstance(v, str) else v for v in value[:20]]
        elif isinstance(value, dict):
            out[key] = {
                k: (v[:300] if isinstance(v, str) else v)
                for k, v in list(value.items())[:20]
                if isinstance(k, str)
            }
    if len(canonical(out)) > MAX_PAYLOAD_CHARS:
        # Drop the largest values until it fits, rather than rejecting the event
        # outright: a truncated record of something that happened beats no
        # record of it.
        for key in sorted(out, key=lambda k: len(canonical({k: out[k]})), reverse=True):
            del out[key]
            out["_truncated"] = True
            if len(canonical(out)) <= MAX_PAYLOAD_CHARS:
                break
    return out


def verify(events: Iterable) -> dict:
    """Walk a chain and report where, if anywhere, it stops adding up.

    Returns the first break rather than a count, because one break invalidates
    everything after it and reporting forty consequential failures would hide
    the one that matters.
    """
    prev = GENESIS
    expected_seq = 1
    count = 0
    for ev in events:
        count += 1
        if ev.seq != expected_seq:
            return {"ok": False, "broken_at": ev.seq, "reason": "sequence gap", "checked": count}
        if (ev.prev_hash or GENESIS) != prev:
            return {"ok": False, "broken_at": ev.seq, "reason": "chain mismatch", "checked": count}
        if event_hash(prev, ev.seq, ev.at, ev.kind, ev.payload or {}) != ev.hash:
            return {"ok": False, "broken_at": ev.seq, "reason": "hash mismatch", "checked": count}
        prev = ev.hash
        expected_seq += 1
    return {"ok": True, "broken_at": None, "reason": None, "checked": count}
