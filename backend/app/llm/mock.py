"""Deterministic stand-in for the real LLM.

Produces plausible, category-aware text so the full app works with no API key.
It is intentionally rule-based (not random) so tests and demos are reproducible.
The interview talking point: the *facts* come from the detectors either way —
only the wording is mocked here.
"""

from __future__ import annotations

from datetime import date

from ..models import Entity, Finding, ReviewNote, Severity
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
        total = len(findings)

        # Para 1 — overall posture
        if crit == 0:
            posture = "no critical issues"
        elif crit == 1:
            posture = "1 critical issue requiring immediate attention"
        else:
            posture = f"{crit} critical issues requiring immediate attention"
        para1 = (
            f"As of {as_of.isoformat()}, the governance register surfaced {total} "
            f"finding(s) across the portfolio: {posture}, {warn} warning(s), and "
            f"{info} informational item(s)."
        )

        # Para 2 — top urgent items
        top = [f for f in findings if f.severity == Severity.CRITICAL][:3]
        if top:
            items = "; ".join(f.title for f in top)
            para2 = f"Priority items: {items}."
        else:
            warn_top = [f for f in findings if f.severity == Severity.WARNING][:2]
            if warn_top:
                items = "; ".join(f.title for f in warn_top)
                para2 = f"Notable warnings: {items}."
            else:
                para2 = "No critical or warning-level items detected at this time."

        # Para 3 — mock notice
        para3 = (
            "[Mock summary — set LLM_PROVIDER=anthropic for an AI-written narrative "
            "with entity-specific context and board-ready language.]"
        )

        return f"{para1}\n\n{para2}\n\n{para3}"

    def recommend_for_findings(self, findings: list[Finding]) -> dict[str, str]:
        return {
            f.id: _PLAYBOOK.get(
                f.category,
                "Review the flagged item and assign an owner on the legal team.",
            )
            for f in findings
        }

    def review_data(
        self, *, entities: list[Entity], known_findings: list[Finding]
    ) -> list[ReviewNote]:
        # The mock can't reason over the data; return one explanatory note so the
        # UI shows the feature works, with a clear pointer to the real model.
        return [
            ReviewNote(
                title="AI review runs with a real model",
                detail=(
                    "Set LLM_PROVIDER=anthropic to have Claude sweep the register "
                    "for concerns the deterministic rules did not flag. This mock "
                    "response is a placeholder."
                ),
                confidence="low",
            )
        ]
