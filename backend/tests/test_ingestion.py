"""Ingestion: tolerant date parsing, fuzzy matching, letter claim extraction."""

from datetime import date

from backend.app.ingestion.board_updates import _similarity, normalize_name
from backend.app.ingestion.letter_claims import extract_claims
from backend.app.models import Letter


def test_parse_date_mixed_formats():
    from backend.app.ingestion.dates import parse_date

    assert parse_date("15 May 2026") == date(2026, 5, 15)
    assert parse_date("2026-05-31") == date(2026, 5, 31)
    assert parse_date("05/25/2026") == date(2026, 5, 25)  # US month-first


def test_parse_date_bad_values_return_none():
    from backend.app.ingestion.dates import parse_date

    assert parse_date("") is None
    assert parse_date(None) is None
    assert parse_date("not a date") is None


def test_normalize_name_strips_legal_suffix():
    assert normalize_name("FGI Europe Holdings B.V.") == "fgi europe holdings"
    assert normalize_name("FGI Treasury & Financing S.à r.l.") == "fgi treasury financing"


def test_similarity_bounds():
    assert _similarity("fgi copenhagen retail vii", "fgi copenhagen retail vii") == 100
    assert _similarity("aaaa", "zzzz") < 50


def test_letter_extraction_drops_prose_fragments():
    # "FGI Netherlands entities" is prose — no legal suffix or ordinal — so dropped.
    letter = Letter(filename="x.pdf", text="the four FGI Netherlands entities we administer")
    assert extract_claims(letter) == []


def test_letter_extraction_pulls_real_name_and_date():
    letter = Letter(
        filename="x.pdf",
        text="FGI Oslo Retail II ApS — mandate expiry 2026-07-01",
    )
    claims = extract_claims(letter)
    assert len(claims) == 1
    assert claims[0].entity_name_raw == "FGI Oslo Retail II"
    assert "2026-07-01" in claims[0].claimed_dates


def test_fuzzy_match_scores_similar_names_above_threshold():
    """Aurora Storage Holdings scores above the match threshold against Aurora Solar Holdings.

    The names are structurally near-identical (differ only in one word), so the
    raw similarity is ~86 — above the 85 threshold. The matcher accepts it.
    The misidentification is then caught *downstream* by the risk detector, which
    checks whether the distinguishing keyword differs and flags it as a likely
    false match. This test pins the matcher's behaviour; the detector test
    (test_letter_false_match_flagged_as_misidentification) pins the flagging.
    """
    from backend.app.ingestion.board_updates import (
        MATCH_THRESHOLD,
        _similarity,
        match_updates,
        normalize_name,
    )
    from backend.app.models import BoardUpdate, Entity

    score = _similarity(
        normalize_name("Aurora Storage Holdings"),
        normalize_name("Aurora Solar Holdings GmbH"),
    )
    # Score is above threshold — the matcher will accept this match
    assert score >= MATCH_THRESHOLD

    # Verify match_updates actually sets matched=True for this pair
    upd = BoardUpdate(entity_name="Aurora Storage Holdings")
    entities = [
        Entity(entity_id="FGI-014", entity_name="Aurora Solar Holdings GmbH"),
        Entity(entity_id="FGI-015", entity_name="Aurora Solar Holdings S.à r.l."),
    ]
    match_updates([upd], entities)
    assert upd.matched is True
    assert upd.matched_entity_id in {"FGI-014", "FGI-015"}
    # Candidates must be populated so the detector can inspect them
    assert len(upd.match_candidates) > 0
