"""The 'digest fetch' pipeline — the one hard requirement of the brief.

ingest (CSV + JSON + PDFs)  ->  deterministic detectors  ->  LLM enrichment
                                                              (summary + recs)

The deterministic findings are the source of truth; the LLM only adds the
narrative and per-item recommendations on top. `use_llm=False` returns the
facts instantly with no external call, which is what the fast endpoints use.
"""

from __future__ import annotations

from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone

from ..config import settings
from ..ingestion import IngestResult, ingest
from ..llm import get_llm_client
from ..models import Digest, Finding, ReviewNote
from ..persistence import get_store
from ..risk import detect_findings


def compute_findings(result: IngestResult, today: date) -> list[Finding]:
    findings = detect_findings(result, today=today)
    apply_statuses(findings)
    return findings


def apply_statuses(findings: list[Finding]) -> None:
    """Merge persisted workflow state onto freshly-computed findings (in place).

    Findings have stable ids, so a status set on a previous run re-attaches to
    the same finding here."""
    statuses = get_store().all_statuses()
    for f in findings:
        row = statuses.get(f.id)
        if row is not None:
            f.status = row.status
            f.assignee = row.assignee
            f.note = row.note


def _counts(findings: list[Finding]) -> dict:
    by_sev = Counter(f.severity.value for f in findings)
    by_cat = Counter(f.category for f in findings)
    return {
        "total": len(findings),
        "Critical": by_sev.get("Critical", 0),
        "Warning": by_sev.get("Warning", 0),
        "Info": by_sev.get("Info", 0),
        "by_category": dict(by_cat),
    }


def build_digest(result: IngestResult | None = None, *, use_llm: bool = True) -> Digest:
    today = settings.today
    result = result or ingest()
    findings = compute_findings(result, today)
    counts = _counts(findings)

    summary: str | None = None
    if use_llm:
        llm = get_llm_client()
        # The summary and the per-finding recommendations are independent calls,
        # so run them concurrently — roughly halves the wall-clock latency.
        with ThreadPoolExecutor(max_workers=2) as pool:
            recs_future = pool.submit(llm.recommend_for_findings, findings)
            summary_future = pool.submit(
                llm.generate_digest_summary, as_of=today, counts=counts, findings=findings
            )
            recs = recs_future.result()
            summary = summary_future.result()
        for f in findings:
            f.recommendation = recs.get(f.id)

    return Digest(
        as_of=today,
        generated_at=datetime.now(timezone.utc).isoformat(),
        summary=summary,
        counts=counts,
        findings=findings,
    )


def run_ai_review(result: IngestResult | None = None) -> list[ReviewNote]:
    """Advisory LLM sweep for concerns the deterministic rules didn't flag.

    Kept entirely separate from the digest: the findings remain the source of
    truth; this is a second, lower-trust opinion."""
    result = result or ingest()
    known = compute_findings(result, settings.today)
    return get_llm_client().review_data(entities=result.entities, known_findings=known)
