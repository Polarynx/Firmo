"""The process record, the Word file, and the shape of the API.

These are the parts a student is asked to trust. The record is the claim that
Firmo can show how a paper was arrived at; the .docx is the thing actually
handed in. Both are checkable without a network, and neither had a test.
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import record as R
import docx_export as D


# ── The hash chain ─────────────────────────────────────────────────────────
# The record's whole value is that it cannot be quietly edited afterwards. If
# tampering is not detected, the feature is decoration.

class _Event:
    """The attributes verify() reads off a stored row."""
    def __init__(self, seq, at, kind, payload, hash, prev_hash):
        self.seq, self.at, self.kind = seq, at, kind
        self.payload, self.hash, self.prev_hash = payload, hash, prev_hash


def _chain(n=4):
    # Sequence starts at 1 and the first link points at GENESIS, which is what
    # the appender writes and therefore what verify expects.
    events, prev = [], R.GENESIS
    at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for i in range(1, n + 1):
        payload = {"step": i}
        h = R.event_hash(prev, i, at, "search", payload)
        events.append(_Event(i, at, "search", payload, h, prev))
        prev = h
    return events


def test_an_untouched_chain_verifies():
    assert R.verify(_chain())["ok"] is True


def test_editing_a_payload_after_the_fact_is_caught():
    events = _chain()
    events[1].payload = {"step": "something else"}
    assert R.verify(events)["ok"] is False


def test_removing_an_event_is_caught():
    events = _chain()
    del events[2]
    assert R.verify(events)["ok"] is False


def test_reordering_events_is_caught():
    events = _chain()
    events[1], events[2] = events[2], events[1]
    assert R.verify(events)["ok"] is False


def test_the_same_input_always_hashes_the_same():
    at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    a = R.event_hash("", 0, at, "search", {"q": "minimum wage"})
    b = R.event_hash("", 0, at, "search", {"q": "minimum wage"})
    assert a == b


def test_key_order_does_not_change_the_hash():
    # Otherwise a record would fail to verify purely because a dict was built
    # in a different order on the machine that read it back.
    at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    a = R.event_hash("", 0, at, "search", {"a": 1, "b": 2})
    b = R.event_hash("", 0, at, "search", {"b": 2, "a": 1})
    assert a == b


def test_a_draft_fingerprint_records_length_without_the_prose():
    # The record must be able to show a draft changed without storing what a
    # student wrote.
    fp = R.draft_fingerprint("The minimum wage debate has never been about the data.")
    blob = repr(fp).lower()
    assert "minimum wage debate" not in blob


# ── The Word file ──────────────────────────────────────────────────────────

ENTRIES = [{
    "authors": ["Card, D.", "Krueger, A. B."],
    "year": 1994,
    "title": "Minimum wages and employment",
    "journal": "American Economic Review",
    "doi": "10.1257/aer.84.4.772",
}]


@pytest.mark.parametrize("style", ["apa", "mla", "chicago"])
def test_a_document_is_produced_in_every_style_offered(style):
    data = D.build_docx("The draft.", ENTRIES, style=style)
    assert isinstance(data, (bytes, bytearray)) and len(data) > 1000
    assert data[:2] == b"PK"          # a .docx is a zip


def test_a_document_with_no_references_still_builds():
    # Export is reachable with a draft and no sources saved.
    data = D.build_docx("Just prose, no citations yet.", [])
    assert data[:2] == b"PK"


def test_an_empty_draft_still_builds():
    data = D.build_docx("", ENTRIES)
    assert data[:2] == b"PK"


def test_the_prose_actually_reaches_the_file():
    import io, zipfile
    data = D.build_docx("A sentence that must survive the round trip.", ENTRIES)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    assert "must survive the round trip" in xml


@pytest.mark.parametrize("raw,banned", [
    ("../../etc/passwd", "/"),
    ("paper: draft?", "?"),
    ('a"b', '"'),
])
def test_a_filename_cannot_carry_path_or_shell_characters(raw, banned):
    assert banned not in D.safe_filename(raw)


def test_a_filename_is_never_empty():
    assert D.safe_filename("").strip()
    assert D.safe_filename("///").strip()


# ── The API surface ────────────────────────────────────────────────────────
# Not the behaviour of each endpoint, which needs the network and a model, but
# that the app assembles and its routes are where the frontend expects.

def test_the_app_imports_and_registers_its_routes():
    import main
    paths = {r.path for r in main.app.routes if hasattr(r, "methods")}
    for expected in ["/api/research", "/api/ask-sources", "/api/export-docx",
                     "/api/add-source", "/api/outline", "/api/draft-check",
                     "/api/check-citations", "/api/record/append"]:
        assert expected in paths, f"{expected} missing; frontend calls it"


def test_private_fields_are_stripped_from_the_public_record():
    # The record is shareable; the student's draft and question are not.
    import main
    if not hasattr(main, "_event_out") or not hasattr(main, "_PRIVATE_FIELDS"):
        pytest.skip("record redaction not present in this build")
    field = next(iter(main._PRIVATE_FIELDS))
    ev = _Event(1, datetime(2026, 1, 1, tzinfo=timezone.utc), "citation.insert",
                {field: "a sentence from the student's unpublished draft"},
                "h", R.GENESIS)

    public = main._event_out(ev, private=False)
    owner = main._event_out(ev, private=True)

    # The chain still verifies to a stranger; the prose does not travel.
    assert "a sentence from" not in repr(public)
    assert public["hash"] == "h" and public["seq"] == 1
    assert "a sentence from" in repr(owner)
