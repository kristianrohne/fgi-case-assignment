"""The detectors are the source of truth, so they get the most coverage.

These run against the real provided data with a pinned as-of date (2026-06-11),
asserting both the headline anomalies and the aggregate counts.
"""

from collections import Counter

from backend.app.models import Severity


def _ids(findings):
    return {f.id for f in findings}


# --- aggregate sanity ------------------------------------------------------- #
def test_total_and_severity_counts(findings):
    sev = Counter(f.severity.value for f in findings)
    assert len(findings) == 65
    assert sev["Critical"] == 25
    assert sev["Warning"] == 30
    assert sev["Info"] == 10


# --- structural integrity --------------------------------------------------- #
def test_circular_ownership(findings):
    cyc = [f for f in findings if f.id.startswith("circular-ownership")]
    assert len(cyc) == 1
    assert set(cyc[0].entity_ids) == {"FGI-012", "FGI-019"}
    assert cyc[0].severity is Severity.CRITICAL


def test_orphan_parent(findings):
    assert "orphan-parent-FGI-050" in _ids(findings)


# --- data quality ----------------------------------------------------------- #
def test_fictional_jurisdiction(findings):
    assert "bad-jurisdiction-FGI-033" in _ids(findings)


def test_future_incorporation(findings):
    assert "future-incorporation-FGI-041" in _ids(findings)


def test_missing_name(findings):
    assert "missing-name-FGI-052" in _ids(findings)


def test_duplicate_name(findings):
    dups = [f for f in findings if f.id.startswith("duplicate-name")]
    assert any(set(f.entity_ids) >= {"FGI-014", "FGI-015"} for f in dups)


# --- compliance deadlines --------------------------------------------------- #
def test_overdue_filings(findings):
    overdue = [f for f in findings if f.category == "Annual filing"]
    assert len(overdue) == 15
    assert all(f.severity is Severity.CRITICAL for f in overdue)
    # the broader rule also catches a passed due-date, not just the status label
    assert "overdue-filing-FGI-044" in _ids(findings)


def test_expired_mandates(findings):
    expired = {
        f.entity_ids[0]
        for f in findings
        if f.id.startswith("mandate-") and f.severity is Severity.CRITICAL
    }
    assert {"FGI-002", "FGI-034", "FGI-067"} <= expired


# --- letter reconciliation -------------------------------------------------- #
def test_letter_conflicts_present(findings):
    conflicts = [f for f in findings if f.id.startswith("letter-conflict")]
    ents = {f.entity_ids[0] for f in conflicts}
    assert "FGI-046" in ents  # Treasury & Financing: 2026-06-19 vs 2028-01-10
    assert "FGI-038" in ents  # Singapore Solar ≠ Singapore Hotel
    # Aurora Storage (a ghost) fuzzy-matches an "Aurora Solar" entity — flagged,
    # not silently trusted. We don't pin which duplicate it lands on.
    assert any("aurora storage" in f.detail.lower() for f in conflicts)


def test_letter_false_match_flagged_as_misidentification(findings):
    aurora = next(
        f
        for f in findings
        if f.id.startswith("letter-conflict") and "aurora storage" in f.detail.lower()
    )
    assert "misidentification" in aurora.detail.lower()
    assert aurora.severity is Severity.CRITICAL


def test_letter_ghost_entities(findings):
    ghosts = [f for f in findings if f.id.startswith("letter-ghost")]
    names = " ".join(str(f.evidence.get("entity_name")) for f in ghosts)
    assert "Amsterdam Office II" in names
    assert "Rotterdam Logistics I" in names


# --- the core principle: flag, never auto-correct --------------------------- #
def test_detectors_do_not_mutate_source(ingested):
    assert ingested.by_id["FGI-033"].jurisdiction == "Noveria"  # flagged, not fixed
    assert ingested.by_id["FGI-052"].entity_name is None
