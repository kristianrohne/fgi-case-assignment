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
