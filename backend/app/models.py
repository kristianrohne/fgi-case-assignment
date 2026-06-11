"""Domain models.

Parsing is deliberately *tolerant*: the source data is messy, so we keep both
the raw string and a parsed value where parsing can fail (dates especially).
We never throw away the original — the whole point of the tool is to surface
bad data, not crash on it.
"""

from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Severity(str, Enum):
    CRITICAL = "Critical"
    WARNING = "Warning"
    INFO = "Info"


# Ordering for sorting findings by urgency.
SEVERITY_RANK = {Severity.CRITICAL: 0, Severity.WARNING: 1, Severity.INFO: 2}


class Entity(BaseModel):
    entity_id: str
    entity_name: Optional[str] = None
    entity_type: Optional[str] = None
    jurisdiction: Optional[str] = None

    incorporation_date: Optional[date] = None
    incorporation_date_raw: Optional[str] = None

    parent_entity_id: Optional[str] = None
    ownership_pct: Optional[float] = None
    registered_address: Optional[str] = None
    board_members: list[str] = Field(default_factory=list)

    board_mandate_expiry: Optional[date] = None
    board_mandate_expiry_raw: Optional[str] = None

    annual_filing_due: Optional[date] = None
    annual_filing_due_raw: Optional[str] = None
    annual_filing_status: Optional[str] = None

    registered_agent: Optional[str] = None
    status: Optional[str] = None
    asset_class: Optional[str] = None
    asset_description: Optional[str] = None


class BoardUpdate(BaseModel):
    """One entry from board_updates.json (the messy 'inbox')."""

    date_raw: Optional[str] = None
    date_parsed: Optional[date] = None
    entity_name: Optional[str] = None
    change_type: Optional[str] = None
    details: Optional[str] = None
    source: Optional[str] = None

    # Resolution against the register (filled by the matcher).
    matched_entity_id: Optional[str] = None
    match_score: Optional[float] = None  # 0-100 fuzzy confidence
    matched: bool = False


class LetterClaim(BaseModel):
    """A single assertion pulled out of an agent letter, resolved against the
    register. The letters are free text from third parties, so every claim is
    treated as something to *reconcile*, never as ground truth."""

    letter_filename: str
    provider: Optional[str] = None
    topic: Optional[str] = None  # "mandate" | "filing" | "status" | "other"
    entity_name_raw: str = ""
    context: str = ""  # the line/sentence the claim came from
    claimed_dates: list[str] = Field(default_factory=list)
    claimed_status_terms: list[str] = Field(default_factory=list)

    matched_entity_id: Optional[str] = None
    match_score: Optional[float] = None
    matched: bool = False


class Letter(BaseModel):
    """A parsed PDF letter from an external agent."""

    filename: str
    provider: Optional[str] = None
    text: str = ""
    claims: list[LetterClaim] = Field(default_factory=list)


class Finding(BaseModel):
    """A single surfaced governance risk or data-quality issue.

    `recommendation` is left empty by the deterministic detectors and filled in
    later by the LLM layer — that separation keeps the 'what AI did vs. what the
    rules did' story clean.
    """

    id: str
    category: str
    severity: Severity
    title: str
    detail: str
    entity_ids: list[str] = Field(default_factory=list)
    evidence: dict = Field(default_factory=dict)
    recommendation: Optional[str] = None

    # Workflow state, merged in from the persistence layer (not the detectors).
    # Findings have stable, deterministic ids, so status survives across digest
    # runs and re-attaches to the same finding next time.
    status: str = "open"  # open | acknowledged | assigned | resolved
    assignee: Optional[str] = None
    note: Optional[str] = None


VALID_STATUSES = {"open", "acknowledged", "assigned", "resolved"}


class Digest(BaseModel):
    """The full result of a 'digest fetch'."""

    as_of: date
    generated_at: str
    summary: Optional[str] = None  # LLM narrative; None when not yet generated
    counts: dict = Field(default_factory=dict)
    findings: list[Finding] = Field(default_factory=list)


class FindingStatusUpdate(BaseModel):
    """PATCH body for changing a finding's workflow status."""

    status: str
    assignee: Optional[str] = None
    note: Optional[str] = None


class DigestRun(BaseModel):
    """One historical digest execution (for the History view)."""

    id: int
    created_at: str
    as_of: date
    total: int
    critical: int
    warning: int
    info: int
    summary: Optional[str] = None
