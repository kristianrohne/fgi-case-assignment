"""Deterministic stand-in for the real LLM.

Produces plausible, category-aware text so the full app works with no API key.
It is intentionally rule-based (not random) so tests and demos are reproducible.
The interview talking point: the *facts* come from the detectors either way —
only the wording is mocked here.
"""

from __future__ import annotations

from datetime import date

from ..models import Finding, Severity
from .base import LLMClient

# Category -> recommendation template.
_PLAYBOOK = {
    "Annual filing": "Contact the registered agent to file immediately and confirm the new submission date; assess late-filing penalties.",
    "Board mandate": "Prepare and circulate board-renewal resolutions before the expiry date to keep the board able to act; escalate if already lapsed.",
    "Ownership structure": "Trace the ownership chain with corporate records and correct the register; do not rely on the current parent linkage for consolidation.",
    "Data quality": "Verify the field against source incorporation documents and correct the register; treat the current value as untrusted until confirmed.",
    "Lifecycle": "Confirm the entity's true status with the local agent and close out or formally re-open the listed governance items.",
    "Unmatched inbox": "Reconcile against the register — confirm whether the entity is missing from the register or the correspondence names it incorrectly.",
    "Letter reconciliation": "Reply to the external agent to reconcile the discrepancy; confirm the correct entity and value, then update the register or the agent's records accordingly.",
}


class MockLLMClient(LLMClient):
    def generate_digest_summary(
        self, *, as_of: date, counts: dict, findings: list[Finding]
    ) -> str:
        crit = counts.get("Critical", 0)
        warn = counts.get("Warning", 0)
        info = counts.get("Info", 0)
        top = [f.title for f in findings if f.severity == Severity.CRITICAL][:3]
        top_line = ("Most urgent: " + "; ".join(top) + ".") if top else ""
        return (
            f"As of {as_of.isoformat()}, the register surfaced {len(findings)} "
            f"issue(s): {crit} critical, {warn} warning, {info} informational. "
            f"{top_line} "
            "[Mock summary — set LLM_PROVIDER=anthropic for an AI-written digest.]"
        ).strip()

    def recommend_for_findings(self, findings: list[Finding]) -> dict[str, str]:
        return {
            f.id: _PLAYBOOK.get(
                f.category,
                "Review the flagged item and assign an owner on the legal team.",
            )
            for f in findings
        }
