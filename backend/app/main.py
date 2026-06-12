"""FastAPI surface.

Endpoints split deterministic data (instant, no LLM) from the LLM-backed
digest, so the UI stays responsive and the costly call only happens on the
explicit "fetch digest" action.
"""

from __future__ import annotations

from datetime import date
from functools import lru_cache

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .ingestion import IngestResult, ingest
from .models import (
    BoardUpdate,
    Digest,
    DigestRun,
    Entity,
    Finding,
    FindingStatusUpdate,
    Letter,
    ReviewNote,
)
from .persistence import get_store, init_db
from .services.digest import build_digest, compute_findings, run_ai_review

app = FastAPI(title="FGI Subsidiary Governance API", version="0.1.0")
init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def _data() -> IngestResult:
    """Ingest once and reuse. Cleared via /api/reload if data changes."""
    return ingest()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/meta")
def meta() -> dict:
    return {
        "as_of": settings.today.isoformat(),
        "llm_provider": settings.llm_provider,
        "entity_count": len(_data().entities),
    }


@app.post("/api/reload")
def reload_data() -> dict:
    _data.cache_clear()
    n = len(_data().entities)
    return {"reloaded": True, "entity_count": n}


@app.get("/api/entities", response_model=list[Entity])
def list_entities(
    jurisdiction: str | None = None,
    status: str | None = None,
    asset_class: str | None = None,
    q: str | None = Query(None, description="case-insensitive name/id search"),
) -> list[Entity]:
    items = _data().entities
    if jurisdiction:
        items = [e for e in items if e.jurisdiction == jurisdiction]
    if status:
        items = [e for e in items if e.status == status]
    if asset_class:
        items = [e for e in items if e.asset_class == asset_class]
    if q:
        ql = q.lower()
        items = [
            e
            for e in items
            if ql in (e.entity_name or "").lower() or ql in e.entity_id.lower()
        ]
    return items


@app.get("/api/entities/{entity_id}", response_model=Entity)
def get_entity(entity_id: str) -> Entity:
    entity = _data().by_id.get(entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=f"Unknown entity {entity_id}")
    return entity


@app.get("/api/board-updates", response_model=list[BoardUpdate])
def list_board_updates(unmatched_only: bool = False) -> list[BoardUpdate]:
    items = _data().board_updates
    if unmatched_only:
        items = [u for u in items if not u.matched]
    return items


@app.get("/api/letters", response_model=list[Letter])
def list_letters() -> list[Letter]:
    """The agent letters with their extracted, register-matched claims."""
    return _data().letters


@app.get("/api/findings", response_model=list[Finding])
def list_findings(severity: str | None = None, category: str | None = None) -> list[Finding]:
    """Deterministic findings only — fast, no LLM, no recommendations."""
    findings = compute_findings(_data(), settings.today)
    if severity:
        findings = [f for f in findings if f.severity.value.lower() == severity.lower()]
    if category:
        findings = [f for f in findings if f.category == category]
    return findings


@app.post("/api/digest", response_model=Digest)
def digest(use_llm: bool = True, as_of: date | None = None) -> Digest:
    """The headline action: full pipeline + LLM summary and recommendations.

    Pass as_of=YYYY-MM-DD to simulate running on a different date (past or future).
    Each run is recorded for the history view."""
    data = _data()
    result = build_digest(data, use_llm=use_llm, today=as_of)
    get_store().record_digest(result, entities=data.entities)
    return result


@app.get("/api/digest-runs", response_model=list[DigestRun])
def digest_runs(limit: int = 50) -> list[DigestRun]:
    """History of past digest executions (audit trail / 'what changed')."""
    return get_store().list_runs(limit=limit)


@app.post("/api/ai-review", response_model=list[ReviewNote])
def ai_review() -> list[ReviewNote]:
    """Advisory AI sweep for concerns the deterministic rules didn't flag.

    Separate from the digest and clearly lower-trust — suggestions, not facts."""
    return run_ai_review(_data())


@app.patch("/api/findings/{finding_id}/status")
def set_finding_status(finding_id: str, update: FindingStatusUpdate) -> dict:
    """Set a finding's workflow status (open / acknowledged / assigned / resolved)."""
    try:
        row = get_store().set_status(
            finding_id, update.status, update.assignee, update.note
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {
        "finding_id": row.finding_id,
        "status": row.status,
        "assignee": row.assignee,
        "note": row.note,
    }
