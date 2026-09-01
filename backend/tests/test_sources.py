"""The paper-handling functions every search depends on.

No network. Every connector returns the same paper shape, and everything after
the fan-out — deduplication, DOI normalisation, scoring, the circuit breaker —
is pure and can be pinned down exactly. That matters more here than coverage
for its own sake: two databases spent weeks returning nothing and the only
symptom was a benchmark number nobody was watching, so the cheap parts of this
pipeline should fail loudly in a second rather than quietly over a fortnight.

What is deliberately not here: live calls to the fourteen indexes. Those need
the network, they are slow, and they fail for reasons that have nothing to do
with our code. `eval/diag_fanout.py` is the tool for that question.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import sources as S


# ── DOIs ───────────────────────────────────────────────────────────────────
# A DOI is the only identifier that survives a paper appearing in six indexes
# under six slightly different titles, so normalising it is what makes
# deduplication work at all.

@pytest.mark.parametrize("raw,expected", [
    ("10.1038/nature12373", "10.1038/nature12373"),
    ("https://doi.org/10.1038/nature12373", "10.1038/nature12373"),
    ("http://dx.doi.org/10.1038/nature12373", "10.1038/nature12373"),
    ("doi:10.1038/nature12373", "10.1038/nature12373"),
    ("  10.1038/nature12373  ", "10.1038/nature12373"),
    ("10.1038/NATURE12373", "10.1038/nature12373"),
])
def test_normalize_doi_strips_every_prefix_it_arrives_with(raw, expected):
    assert S.normalize_doi(raw) == expected


@pytest.mark.parametrize("junk", [None, "", "   ", "not-a-doi", "12345", "http://example.com"])
def test_normalize_doi_refuses_things_that_are_not_dois(junk):
    assert S.normalize_doi(junk) is None


# ── Deduplication ──────────────────────────────────────────────────────────

def _paper(**kw):
    base = {"title": "A paper", "authors": ["X"], "year": 2020, "abstract": "abc",
            "url": "", "doi": None, "citationCount": 0, "source": "test"}
    base.update(kw)
    return base


def test_deduplicate_merges_the_same_doi_from_different_databases():
    papers = [
        _paper(doi="10.1/abc", source="openalex"),
        _paper(doi="https://doi.org/10.1/ABC", source="crossref"),
    ]
    assert len(S.deduplicate(papers)) == 1


def test_deduplicate_keeps_genuinely_different_papers():
    papers = [_paper(doi="10.1/abc"), _paper(doi="10.1/xyz", title="Another paper")]
    assert len(S.deduplicate(papers)) == 2


def test_deduplicate_matches_on_title_when_there_is_no_doi():
    # Working papers and books often reach us with no DOI at all, and would
    # otherwise appear once per database that holds them.
    papers = [
        _paper(title="The Effect of Minimum Wages on Low-Wage Jobs", source="a"),
        _paper(title="The effect of minimum wages on low-wage jobs.", source="b"),
    ]
    assert len(S.deduplicate(papers)) == 1


# ── The circuit breaker ────────────────────────────────────────────────────

def test_budget_exhaustion_is_told_apart_from_a_burst_limit():
    # Both arrive as 429 and they want very different cooldowns: one clears in
    # seconds, the other does not.
    class R:
        def __init__(self, t): self.text = t

    spent = R('{"error":"Rate limit exceeded","message":"Insufficient budget. '
              'This request costs $0.001 but you only have $0 remaining."}')
    busy = R('{"error":"Rate limit exceeded","message":"Too many requests"}')

    assert S._budget_exhausted(spent) is True
    assert S._budget_exhausted(busy) is False


def test_budget_cooldown_is_longer_than_the_burst_one_but_not_punitive():
    # Ten minutes was measured: after eight consecutive budget rejections the
    # same endpoint served 200s again within minutes.
    assert S._BUDGET_COOLDOWN_MAX_S > S._COOLDOWN_S


# ── Connector health ───────────────────────────────────────────────────────
# The check that would have caught Europe PMC and DOAJ.

def test_a_general_index_going_quiet_is_flagged_quickly():
    S._dead_streak.clear()
    for _ in range(S._DEAD_AFTER):
        S._note_yield("search_openalex", 0)
    assert "search_openalex" in S.connector_health()


def test_a_specialist_going_quiet_off_its_own_subject_is_not_flagged():
    # INSPIRE holding nothing on high-conflict divorce is INSPIRE working. If
    # this ever fails, every humanities session logs a false alarm.
    S._dead_streak.clear()
    for _ in range(S._DEAD_AFTER * 3):
        S._note_yield("search_inspire", 0)
    assert S.connector_health() == {}


def test_a_specialist_that_never_answers_anything_is_still_caught():
    # DOAJ was returning zero for every query on earth, and is not general
    # enough for the short window. The long one is what catches it.
    S._dead_streak.clear()
    for _ in range(S._DEAD_AFTER_SPECIALIST):
        S._note_yield("search_doaj", 0)
    assert "search_doaj" in S.connector_health()


def test_one_result_clears_the_streak():
    S._dead_streak.clear()
    for _ in range(S._DEAD_AFTER):
        S._note_yield("search_openalex", 0)
    S._note_yield("search_openalex", 5)
    assert S.connector_health() == {}


# ── The connector set ──────────────────────────────────────────────────────

def test_every_connector_is_an_awaitable_taking_the_same_arguments():
    import inspect
    for fn, limit in S.ALL_CONNECTORS:
        assert inspect.iscoroutinefunction(fn), fn.__name__
        params = inspect.signature(fn).parameters
        assert "query" in params and "limit" in params and "year_from" in params, fn.__name__
        assert isinstance(limit, int) and limit > 0, fn.__name__


def test_base_stays_out_unless_the_deployment_registered_for_it():
    # It authorises by IP. Unregistered, every call is a guaranteed failure
    # spending one of the fan-out's request slots.
    assert "search_base" not in [f.__name__ for f, _ in S.ALL_CONNECTORS]


def test_the_fast_subset_is_a_subset():
    everything = {f.__name__ for f, _ in S.ALL_CONNECTORS}
    for fn, _ in S.FAST_CONNECTORS:
        assert fn.__name__ in everything, fn.__name__


# ── Processing ─────────────────────────────────────────────────────────────

def test_process_papers_drops_the_untitled_and_keeps_the_rest():
    out = S.process_papers([_paper(title=""), _paper(title="Real paper", doi="10.1/a")])
    assert [p["title"] for p in out] == ["Real paper"]


def test_process_papers_honours_a_year_floor():
    out = S.process_papers(
        [_paper(year=1995, doi="10.1/old", title="An old paper"),
         _paper(year=2020, doi="10.1/new", title="A newer paper")],
        year_from=2000,
    )
    assert [p["year"] for p in out] == [2020]


def test_paper_id_is_stable_across_the_same_doi_written_differently():
    assert S.paper_id(_paper(doi="10.1/ABC")) == S.paper_id(_paper(doi="https://doi.org/10.1/abc"))


# ── Why the title outranks the DOI here ────────────────────────────────────
# Counter-intuitive, and measured. See deduplicate's docstring: on a live
# fan-out every title collision was one work twice, never two works.

def test_the_same_work_under_two_dois_collapses_to_one():
    # A JSTOR DOI and a publisher DOI for the same article. Trusting the DOIs
    # as distinct identities produced duplicates in the real result set.
    papers = [_paper(doi="10.1177/001979399204600105", title="Employment Effects of Minimum Wages"),
              _paper(doi="10.2307/2524738", title="Employment Effects of Minimum Wages")]
    assert len(S.deduplicate(papers)) == 1


def test_a_paper_with_no_doi_dedupes_against_the_same_paper_with_one():
    # ERIC supplies no DOI, OpenAlex does, and both hold the same paper. This
    # is the ordinary case and it happens in both orders.
    a = _paper(doi=None, title="The same paper", source="eric")
    b = _paper(doi="10.1/one", title="The Same Paper.", source="openalex")
    assert len(S.deduplicate([a, b])) == 1
    assert len(S.deduplicate([b, a])) == 1


def test_two_untitled_undoied_papers_do_not_collapse_into_one():
    papers = [_paper(doi=None, title="First"), _paper(doi=None, title="Second")]
    assert len(S.deduplicate(papers)) == 2


# ── Titles that arrive in capitals ─────────────────────────────────────────

@pytest.mark.parametrize("shouted,expected", [
    ("THE ECONOMIC IMPACT OF A HIGH NATIONAL MINIMUM WAGE",
     "The Economic Impact of a High National Minimum Wage"),
    ("MINIMUM WAGE EFFECTS ON EMPLOYMENT IN THE US AND THE EU",
     "Minimum Wage Effects on Employment in the US and the EU"),
    ("HIV PREVALENCE AND GDP GROWTH IN SUB-SAHARAN AFRICA",
     "HIV Prevalence and GDP Growth in Sub-Saharan Africa"),
    ("WORLD WAR II AND THE LABOUR SUPPLY",
     "World War II and the Labour Supply"),
])
def test_a_shouted_title_is_brought_back_down(shouted, expected):
    assert S._unshout(shouted) == expected


@pytest.mark.parametrize("already_fine", [
    "The RAND Health Insurance Experiment",
    "Minimum Wages and Employment: A Case Study",
    "DNA methylation and ageing",
    "eLife: a new model",
])
def test_a_title_with_any_real_lowercase_is_left_alone(already_fine):
    # Deliberate casing and its acronyms must survive untouched. Recasing by
    # guesswork is how the first version of this turned "IMPACT OF A HIGH" into
    # "Impact OF A HIGH".
    assert S._unshout(already_fine) == already_fine


def test_a_short_all_caps_string_is_not_a_shouted_title():
    assert S._unshout("NBER") == "NBER"


def test_de_shouting_runs_as_part_of_cleaning_a_paper():
    out = S.clean_paper(_paper(title="MINIMUM WAGES AND EMPLOYMENT IN NEW JERSEY"))
    assert out["title"] == "Minimum Wages and Employment in New Jersey"
