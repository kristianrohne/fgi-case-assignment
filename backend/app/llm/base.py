"""The LLM seam.

The rest of the app only knows this interface. The deterministic detectors
produce the *facts*; the LLM produces the *narrative summary* and the
*per-finding recommendations*. Swapping `mock` for `anthropic` changes nothing
upstream — that's what lets the whole thing run with no API key during
development and light up with real Claude calls for the demo.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date

from ..models import Entity, Finding, ReviewNote


class LLMClient(ABC):
    @abstractmethod
    def generate_digest_summary(
        self, *, as_of: date, counts: dict, findings: list[Finding]
    ) -> str:
        """A short board-ready narrative over the whole findings set."""

    @abstractmethod
    def recommend_for_findings(self, findings: list[Finding]) -> dict[str, str]:
        """Map finding.id -> a concrete recommended action for the legal team."""

    @abstractmethod
    def review_data(
        self, *, entities: list[Entity], known_findings: list[Finding]
    ) -> list[ReviewNote]:
        """Open-ended advisory sweep: look for concerns the deterministic rules
        did NOT already flag. Advisory only — never the source of truth."""
