"""Real Claude implementation of the LLM seam.

Kept deliberately simple and defensive: the detectors already guarantee the
facts, so if a call fails or returns unparseable output we degrade gracefully
rather than break the digest. Uses prompt caching on the static system prompt
to keep cost down across the two calls.

NOTE: only imported/instantiated when LLM_PROVIDER=anthropic and a key is set,
so the app has zero hard dependency on a key during development.
"""

from __future__ import annotations

import json
from datetime import date

from ..config import settings
from ..models import Entity, Finding, ReviewNote
from .base import LLMClient

_SYSTEM = (
    "You are a corporate-governance analyst supporting the legal team of a "
    "sovereign wealth fund that owns ~100 subsidiaries across 18 jurisdictions. "
    "You are given pre-computed, verified findings about governance risks and "
    "data-quality issues. Be precise, concise and action-oriented. Never invent "
    "facts beyond what the findings state. Recommendations must be concrete steps "
    "a small legal team can take this week."
)


def _finding_brief(f: Finding) -> dict:
    return {
        "id": f.id,
        "severity": f.severity.value,
        "category": f.category,
        "title": f.title,
        "detail": f.detail,
        "entity_ids": f.entity_ids,
    }


class AnthropicLLMClient(LLMClient):
    def __init__(self) -> None:
        import anthropic  # imported lazily so the package is optional

        if not settings.anthropic_api_key:
            raise RuntimeError("LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set")
        self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self._model = settings.anthropic_model

    def _system_blocks(self) -> list[dict]:
        return [{"type": "text", "text": _SYSTEM, "cache_control": {"type": "ephemeral"}}]

    def generate_digest_summary(
        self, *, as_of: date, counts: dict, findings: list[Finding]
    ) -> str:
        payload = {
            "as_of": as_of.isoformat(),
            "counts": counts,
            "findings": [_finding_brief(f) for f in findings],
        }
        prompt = (
            "Write a 4-6 sentence board-ready summary of the governance posture "
            "from these findings. Lead with the most urgent items. Return plain "
            "prose only: no markdown, no headings, no bullet points, no title.\n\n"
            + json.dumps(payload)
        )
        resp = self._client.messages.create(
            model=self._model,
            max_tokens=600,
            system=self._system_blocks(),
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in resp.content if b.type == "text").strip()
        # Defensively drop any leading markdown heading line the model may add.
        lines = [ln for ln in text.splitlines() if not ln.lstrip().startswith("#")]
        return "\n".join(lines).strip()

    def recommend_for_findings(self, findings: list[Finding]) -> dict[str, str]:
        if not findings:
            return {}
        briefs = [_finding_brief(f) for f in findings]
        prompt = (
            "For each finding, give ONE concrete recommended action for the legal "
            "team. Return ONLY a JSON object mapping finding id -> recommendation "
            "string. No prose outside the JSON.\n\n" + json.dumps(briefs)
        )
        resp = self._client.messages.create(
            model=self._model,
            max_tokens=4000,
            system=self._system_blocks(),
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in resp.content if b.type == "text").strip()
        try:
            start, end = text.index("{"), text.rindex("}") + 1
            data = json.loads(text[start:end])
            return {str(k): str(v) for k, v in data.items()}
        except (ValueError, json.JSONDecodeError):
            return {}

    def review_data(
        self, *, entities: list[Entity], known_findings: list[Finding]
    ) -> list[ReviewNote]:
        register = [
            {
                "id": e.entity_id,
                "name": e.entity_name,
                "type": e.entity_type,
                "jurisdiction": e.jurisdiction,
                "incorporated": e.incorporation_date_raw,
                "parent": e.parent_entity_id,
                "ownership_pct": e.ownership_pct,
                "status": e.status,
                "filing_status": e.annual_filing_status,
                "mandate_expiry": e.board_mandate_expiry_raw,
                "asset_class": e.asset_class,
            }
            for e in entities
        ]
        already = sorted({f.title for f in known_findings})
        prompt = (
            "Below is the full subsidiary register, and the list of issue types "
            "ALREADY detected by deterministic rules. Identify up to 6 ADDITIONAL "
            "concerns that are NOT already covered by those rules — subtle "
            "inconsistencies, suspicious patterns, or risks a rules engine might "
            "miss. Be conservative: only flag genuine concerns, and do not repeat "
            "the known issue types. Return ONLY a JSON array of objects with keys "
            "title, detail, entity_ids (array of ids), confidence (low|medium|high)."
            "\n\nALREADY DETECTED:\n" + json.dumps(already)
            + "\n\nREGISTER:\n" + json.dumps(register)
        )
        resp = self._client.messages.create(
            model=self._model,
            max_tokens=2000,
            system=self._system_blocks(),
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in resp.content if b.type == "text").strip()
        try:
            start, end = text.index("["), text.rindex("]") + 1
            data = json.loads(text[start:end])
            return [
                ReviewNote(
                    title=str(item.get("title", "")),
                    detail=str(item.get("detail", "")),
                    entity_ids=[str(x) for x in item.get("entity_ids", [])],
                    confidence=item.get("confidence"),
                )
                for item in data
                if item.get("title")
            ]
        except (ValueError, json.JSONDecodeError):
            return []
