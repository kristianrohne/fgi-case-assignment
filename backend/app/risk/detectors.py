"""Deterministic governance-risk and data-quality detectors.

Design principles:
- Every finding is reproducible from the data alone (no LLM here). The LLM only
  *explains and recommends* later, on top of these facts.
- We flag, we never auto-correct. A dissolved entity that still has a board is
  surfaced, not "fixed".
- Each finding carries `evidence` so the UI (and a reviewer) can see exactly
  why it fired.

Each detector is `fn(ctx) -> list[Finding]`. `register` collects them so
`detect_findings` runs the whole suite.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from typing import Callable

from ..config import settings
from ..ingestion import IngestResult
from ..models import BoardUpdate, Entity, Finding, Letter, LetterClaim, Severity

# The 18 real jurisdictions present in the register. Anything else is suspect
# (this is what catches "Noveria").
REAL_JURISDICTIONS = {
    "Australia", "Brazil", "Canada", "Denmark", "France", "Germany", "Ireland",
    "Japan", "Luxembourg", "Netherlands", "Norway", "Singapore", "South Korea",
    "Spain", "Sweden", "Switzerland", "USA (Delaware)", "United Kingdom",
}

# Statuses that mean the entity should be winding down, not governing.
INACTIVE_STATUSES = {"Dissolved", "In liquidation"}


@dataclass
class Context:
    result: IngestResult
    today: date

    @property
    def entities(self) -> list[Entity]:
        return self.result.entities

    @property
    def by_id(self) -> dict[str, Entity]:
        return self.result.by_id

    @property
    def updates(self) -> list[BoardUpdate]:
        return self.result.board_updates

    @property
    def letters(self) -> list[Letter]:
        return self.result.letters


Detector = Callable[[Context], list[Finding]]
_REGISTRY: list[Detector] = []


def register(fn: Detector) -> Detector:
    _REGISTRY.append(fn)
    return fn


# --------------------------------------------------------------------------- #
# Structural integrity
# --------------------------------------------------------------------------- #
@register
def circular_ownership(ctx: Context) -> list[Finding]:
    parent = {e.entity_id: e.parent_entity_id for e in ctx.entities}
    findings: list[Finding] = []
    seen_cycles: set[frozenset[str]] = set()

    for start in parent:
        path: list[str] = []
        node = start
        while node is not None and node in parent:
            if node in path:
                cycle = path[path.index(node):]
                key = frozenset(cycle)
                if key not in seen_cycles:
                    seen_cycles.add(key)
                    findings.append(
                        Finding(
                            id=f"circular-ownership-{'-'.join(sorted(cycle))}",
                            category="Ownership structure",
                            severity=Severity.CRITICAL,
                            title="Circular ownership detected",
                            detail=(
                                "Entities form an ownership loop: "
                                + " → ".join(cycle + [cycle[0]])
                                + ". This is structurally impossible and blocks "
                                "any clean consolidation or control analysis."
                            ),
                            entity_ids=sorted(cycle),
                            evidence={"cycle": cycle},
                        )
                    )
                break
            path.append(node)
            node = parent[node]
    return findings


@register
def orphan_parent(ctx: Context) -> list[Finding]:
    ids = set(ctx.by_id)
    findings: list[Finding] = []
    for e in ctx.entities:
        if e.parent_entity_id and e.parent_entity_id not in ids:
            findings.append(
                Finding(
                    id=f"orphan-parent-{e.entity_id}",
                    category="Ownership structure",
                    severity=Severity.WARNING,
                    title="Parent entity not in register",
                    detail=(
                        f"{e.entity_id} lists parent {e.parent_entity_id!r}, "
                        "which does not exist in the register. The ownership "
                        "chain is broken above this entity."
                    ),
                    entity_ids=[e.entity_id],
                    evidence={"missing_parent": e.parent_entity_id},
                )
            )
    return findings


# --------------------------------------------------------------------------- #
# Data quality
# --------------------------------------------------------------------------- #
@register
def fictional_jurisdiction(ctx: Context) -> list[Finding]:
    findings: list[Finding] = []
    for e in ctx.entities:
        if e.jurisdiction and e.jurisdiction not in REAL_JURISDICTIONS:
            findings.append(
                Finding(
                    id=f"bad-jurisdiction-{e.entity_id}",
                    category="Data quality",
                    severity=Severity.CRITICAL,
                    title="Unrecognised jurisdiction",
                    detail=(
                        f"{e.entity_id} is incorporated in {e.jurisdiction!r}, "
                        "which is not a recognised jurisdiction. Registered "
                        f"address: {e.registered_address!r}. Either the record "
                        "is fabricated/corrupt or mis-keyed."
                    ),
                    entity_ids=[e.entity_id],
                    evidence={"jurisdiction": e.jurisdiction, "address": e.registered_address},
                )
            )
    return findings


@register
def future_incorporation(ctx: Context) -> list[Finding]:
    findings: list[Finding] = []
    for e in ctx.entities:
        if e.incorporation_date and e.incorporation_date > ctx.today:
            findings.append(
                Finding(
                    id=f"future-incorporation-{e.entity_id}",
                    category="Data quality",
                    severity=Severity.WARNING,
                    title="Incorporation date in the future",
                    detail=(
                        f"{e.entity_id} has incorporation date "
                        f"{e.incorporation_date.isoformat()}, which is after the "
                        f"current date ({ctx.today.isoformat()}). An entity "
                        "cannot already exist before it was incorporated."
                    ),
                    entity_ids=[e.entity_id],
                    evidence={"incorporation_date": e.incorporation_date.isoformat()},
                )
            )
    return findings


@register
def missing_name(ctx: Context) -> list[Finding]:
    findings: list[Finding] = []
    for e in ctx.entities:
        if not e.entity_name:
            findings.append(
                Finding(
                    id=f"missing-name-{e.entity_id}",
                    category="Data quality",
                    severity=Severity.WARNING,
                    title="Missing entity name",
                    detail=(
                        f"{e.entity_id} has no entity_name. It cannot be reliably "
                        "matched against agent correspondence or filings."
                    ),
                    entity_ids=[e.entity_id],
                    evidence={},
                )
            )
    return findings


@register
def duplicate_name(ctx: Context) -> list[Finding]:
    by_name: dict[str, list[Entity]] = defaultdict(list)
    for e in ctx.entities:
        if e.entity_name:
            by_name[e.entity_name.strip().lower()].append(e)

    findings: list[Finding] = []
    for group in by_name.values():
        if len(group) > 1:
            ids = sorted(e.entity_id for e in group)
            same_addr = len({e.registered_address for e in group}) == 1
            findings.append(
                Finding(
                    id=f"duplicate-name-{'-'.join(ids)}",
                    category="Data quality",
                    severity=Severity.WARNING,
                    title="Duplicate entity name",
                    detail=(
                        f"{', '.join(ids)} share the name "
                        f"{group[0].entity_name!r}"
                        + (" at the same registered address" if same_addr else "")
                        + ". They have different parents/assets, so this is either "
                        "a duplicate record or a genuine naming collision that "
                        "will break name-based matching."
                    ),
                    entity_ids=ids,
                    evidence={"name": group[0].entity_name, "same_address": same_addr},
                )
            )
    return findings


@register
def unparseable_dates(ctx: Context) -> list[Finding]:
    findings: list[Finding] = []
    for e in ctx.entities:
        bad = []
        if e.incorporation_date_raw and e.incorporation_date is None:
            bad.append(("incorporation_date", e.incorporation_date_raw))
        if e.board_mandate_expiry_raw and e.board_mandate_expiry is None:
            bad.append(("board_mandate_expiry", e.board_mandate_expiry_raw))
        if e.annual_filing_due_raw and e.annual_filing_due is None:
            bad.append(("annual_filing_due", e.annual_filing_due_raw))
        if bad:
            findings.append(
                Finding(
                    id=f"unparseable-date-{e.entity_id}",
                    category="Data quality",
                    severity=Severity.INFO,
                    title="Unparseable date field",
                    detail=(
                        f"{e.entity_id} has date values that could not be parsed: "
                        + "; ".join(f"{k}={v!r}" for k, v in bad)
                    ),
                    entity_ids=[e.entity_id],
                    evidence={"fields": dict(bad)},
                )
            )
    return findings


@register
def unknown_filing_status(ctx: Context) -> list[Finding]:
    findings: list[Finding] = []
    for e in ctx.entities:
        if (e.annual_filing_status or "").strip().lower() in ("", "unknown"):
            findings.append(
                Finding(
                    id=f"unknown-filing-status-{e.entity_id}",
                    category="Data quality",
                    severity=Severity.INFO,
                    title="Filing status unknown",
                    detail=(
                        f"{e.entity_id} has an unknown annual filing status. "
                        "Compliance posture cannot be confirmed without follow-up."
                    ),
                    entity_ids=[e.entity_id],
                    evidence={"annual_filing_status": e.annual_filing_status},
                )
            )
    return findings


# --------------------------------------------------------------------------- #
# Compliance deadlines
# --------------------------------------------------------------------------- #
@register
def overdue_filing(ctx: Context) -> list[Finding]:
    findings: list[Finding] = []
    for e in ctx.entities:
        status = (e.annual_filing_status or "").strip().lower()
        due_passed = e.annual_filing_due is not None and e.annual_filing_due < ctx.today
        if status == "overdue" or (due_passed and status != "filed"):
            findings.append(
                Finding(
                    id=f"overdue-filing-{e.entity_id}",
                    category="Annual filing",
                    severity=Severity.CRITICAL,
                    title="Annual filing overdue",
                    detail=(
                        f"{e.entity_id} ({e.entity_name}) in {e.jurisdiction} has "
                        f"filing status {e.annual_filing_status!r}"
                        + (
                            f", due {e.annual_filing_due.isoformat()}"
                            if e.annual_filing_due
                            else ""
                        )
                        + ". Late filings risk fines and, in some jurisdictions, "
                        "forced strike-off."
                    ),
                    entity_ids=[e.entity_id],
                    evidence={
                        "annual_filing_status": e.annual_filing_status,
                        "annual_filing_due": e.annual_filing_due.isoformat()
                        if e.annual_filing_due
                        else None,
                        "jurisdiction": e.jurisdiction,
                    },
                )
            )
    return findings


@register
def expiring_mandate(ctx: Context) -> list[Finding]:
    findings: list[Finding] = []
    for e in ctx.entities:
        expiry = e.board_mandate_expiry
        if expiry is None:
            continue
        days = (expiry - ctx.today).days
        if days > settings.mandate_warning_days:
            continue
        expired = days < 0
        findings.append(
            Finding(
                id=f"mandate-{e.entity_id}",
                category="Board mandate",
                severity=Severity.CRITICAL if expired else Severity.WARNING,
                title="Board mandate expired" if expired else "Board mandate expiring soon",
                detail=(
                    f"{e.entity_id} ({e.entity_name}) board mandate "
                    + (
                        f"expired {abs(days)} day(s) ago on {expiry.isoformat()}. "
                        "The board may no longer be able to act validly."
                        if expired
                        else f"expires in {days} day(s) on {expiry.isoformat()}."
                    )
                ),
                entity_ids=[e.entity_id],
                evidence={"board_mandate_expiry": expiry.isoformat(), "days_to_expiry": days},
            )
        )
    return findings


# --------------------------------------------------------------------------- #
# Lifecycle consistency
# --------------------------------------------------------------------------- #
@register
def dissolved_with_governance(ctx: Context) -> list[Finding]:
    has_children: set[str] = {
        e.parent_entity_id for e in ctx.entities if e.parent_entity_id
    }
    findings: list[Finding] = []
    for e in ctx.entities:
        if e.status not in INACTIVE_STATUSES:
            continue
        reasons = []
        if e.board_members:
            reasons.append(f"{len(e.board_members)} board member(s) still listed")
        if e.entity_id in has_children:
            reasons.append("still listed as a parent of other entities")
        if not reasons:
            continue
        findings.append(
            Finding(
                id=f"inactive-with-governance-{e.entity_id}",
                category="Lifecycle",
                severity=Severity.WARNING,
                title=f"{e.status} entity has open governance",
                detail=(
                    f"{e.entity_id} ({e.entity_name}) is marked {e.status!r} but "
                    + " and ".join(reasons)
                    + ". Open obligations on a winding-down entity need closing out."
                ),
                entity_ids=[e.entity_id],
                evidence={"status": e.status, "board_members": e.board_members},
            )
        )
    return findings


# --------------------------------------------------------------------------- #
# Inbox reconciliation
# --------------------------------------------------------------------------- #
@register
def ghost_board_updates(ctx: Context) -> list[Finding]:
    findings: list[Finding] = []
    for i, upd in enumerate(ctx.updates):
        if upd.matched:
            continue
        findings.append(
            Finding(
                id=f"ghost-update-{i}",
                category="Unmatched inbox",
                severity=Severity.WARNING,
                title="Board update references unknown entity",
                detail=(
                    f"Update from {upd.source!r} concerns "
                    f"{upd.entity_name!r} ({upd.change_type}), which could not be "
                    f"matched to the register (best match score "
                    f"{upd.match_score:.0f}). Either the register is missing this "
                    "entity or the name is wrong."
                ),
                entity_ids=[],
                evidence={
                    "entity_name": upd.entity_name,
                    "change_type": upd.change_type,
                    "details": upd.details,
                    "source": upd.source,
                    "match_score": upd.match_score,
                },
            )
        )
    return findings


@register
def duplicate_board_updates(ctx: Context) -> list[Finding]:
    seen: dict[tuple, list[BoardUpdate]] = defaultdict(list)
    for upd in ctx.updates:
        key = (
            (upd.entity_name or "").strip().lower(),
            (upd.change_type or "").strip().lower(),
            (upd.details or "").strip().lower()[:40],
        )
        seen[key].append(upd)

    findings: list[Finding] = []
    for idx, (key, group) in enumerate(seen.items()):
        if len(group) > 1 and len({u.source for u in group}) > 1:
            findings.append(
                Finding(
                    id=f"duplicate-update-{idx}",
                    category="Unmatched inbox",
                    severity=Severity.INFO,
                    title="Duplicate board update from different sources",
                    detail=(
                        f"The same change for {group[0].entity_name!r} "
                        f"({group[0].change_type}) arrived from multiple sources: "
                        + ", ".join(sorted({str(u.source) for u in group}))
                        + ". Confirm it is one event, not two."
                    ),
                    entity_ids=[g.matched_entity_id for g in group if g.matched_entity_id],
                    evidence={"sources": sorted({str(u.source) for u in group})},
                )
            )
    return findings


# --------------------------------------------------------------------------- #
# Letter reconciliation (cross-source)
# --------------------------------------------------------------------------- #
# Words that distinguish otherwise-similar entity names. A mismatch here on an
# otherwise high-scoring fuzzy match is the tell-tale of a false positive
# ("Aurora Storage" vs "Aurora Solar", "Singapore Solar" vs "Singapore Hotel").
_DISTINCTIVE = {
    "solar", "storage", "hotel", "office", "retail", "wind", "logistics",
    "residential", "mixed-use", "grid", "hydro", "treasury", "financing",
    "tactical", "data", "wave", "tidal", "geothermal",
}


def _distinctive_tokens(name: str | None) -> set[str]:
    if not name:
        return set()
    return {w for w in re.findall(r"[a-z]+(?:-[a-z]+)?", name.lower()) if w in _DISTINCTIVE}


@register
def letter_ghost_entity(ctx: Context) -> list[Finding]:
    findings: list[Finding] = []
    for letter in ctx.letters:
        for j, claim in enumerate(letter.claims):
            if claim.matched:
                continue
            urgent = any(
                t in ("overdue", "dissolved", "wound up") for t in claim.claimed_status_terms
            )
            asserts = ", ".join(claim.claimed_status_terms + claim.claimed_dates)
            findings.append(
                Finding(
                    id=f"letter-ghost-{letter.filename}-{j}",
                    category="Letter reconciliation",
                    severity=Severity.CRITICAL if urgent else Severity.WARNING,
                    title="Letter names an entity not in the register",
                    detail=(
                        f"{claim.provider} ({letter.filename}) refers to "
                        f"{claim.entity_name_raw!r}, with no confident match in the "
                        f"register (best score {claim.match_score:.0f})."
                        + (f" Letter asserts: {asserts}." if asserts else "")
                        + " The register is either missing this entity or the name is wrong."
                    ),
                    entity_ids=[],
                    evidence={
                        "entity_name": claim.entity_name_raw,
                        "letter": letter.filename,
                        "provider": claim.provider,
                        "context": claim.context,
                        "claimed_dates": claim.claimed_dates,
                        "claimed_terms": claim.claimed_status_terms,
                        "match_score": claim.match_score,
                    },
                )
            )
    return findings


@register
def letter_register_conflict(ctx: Context) -> list[Finding]:
    findings: list[Finding] = []
    for letter in ctx.letters:
        for j, claim in enumerate(letter.claims):
            if not claim.matched:
                continue
            ent = ctx.by_id.get(claim.matched_entity_id or "")
            if ent is None:
                continue
            issues: list[str] = []
            severity = Severity.WARNING

            lt, et = _distinctive_tokens(claim.entity_name_raw), _distinctive_tokens(ent.entity_name)
            if lt and et and lt != et:
                issues.append(
                    f"likely misidentification — letter says {claim.entity_name_raw!r} but the "
                    f"closest register entity is {ent.entity_name!r} (fuzzy score "
                    f"{claim.match_score:.0f}); these are different businesses, so this is "
                    "probably a ghost entity, not a real match"
                )
                severity = Severity.CRITICAL

            if claim.claimed_dates:
                cd = claim.claimed_dates[0]
                if (
                    claim.topic == "mandate"
                    and ent.board_mandate_expiry
                    and cd != ent.board_mandate_expiry.isoformat()
                ):
                    issues.append(
                        f"mandate expiry — letter says {cd}, register says "
                        f"{ent.board_mandate_expiry.isoformat()}"
                    )
                    severity = Severity.CRITICAL
                if (
                    claim.topic == "filing"
                    and ent.annual_filing_due
                    and cd != ent.annual_filing_due.isoformat()
                ):
                    issues.append(
                        f"filing due date — letter says {cd}, register says "
                        f"{ent.annual_filing_due.isoformat()}"
                    )

            terms = set(claim.claimed_status_terms)
            if {"dissolved", "wound up"} & terms and ent.status not in INACTIVE_STATUSES:
                issues.append(
                    f"status — letter implies the entity is dissolved/wound up with open "
                    f"items, register says {ent.status!r}"
                )
                severity = Severity.CRITICAL
            if "overdue" in terms and (ent.annual_filing_status or "").lower() != "overdue":
                issues.append(
                    f"filing status — letter says overdue, register says "
                    f"{ent.annual_filing_status!r}"
                )

            if not issues:
                continue
            findings.append(
                Finding(
                    id=f"letter-conflict-{letter.filename}-{j}",
                    category="Letter reconciliation",
                    severity=severity,
                    title="Letter contradicts the register",
                    detail=(
                        f"{claim.provider} ({letter.filename}) on {ent.entity_id} "
                        f"({ent.entity_name}): " + "; ".join(issues) + "."
                    ),
                    entity_ids=[ent.entity_id],
                    evidence={
                        "letter": letter.filename,
                        "provider": claim.provider,
                        "context": claim.context,
                        "claimed_dates": claim.claimed_dates,
                        "claimed_terms": claim.claimed_status_terms,
                        "match_score": claim.match_score,
                    },
                )
            )
    return findings


def detect_findings(result: IngestResult, today: date | None = None) -> list[Finding]:
    ctx = Context(result=result, today=today or settings.today)
    findings: list[Finding] = []
    for detector in _REGISTRY:
        findings.extend(detector(ctx))
    findings.sort(key=lambda f: ({Severity.CRITICAL: 0, Severity.WARNING: 1, Severity.INFO: 2}[f.severity], f.category))
    return findings
