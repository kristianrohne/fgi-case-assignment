"""Store — the application-facing persistence API.

Returns plain Pydantic models, so the rest of the app never touches ORM objects
or sessions. One process-wide instance via get_store().
"""

from __future__ import annotations

from sqlalchemy import select

from ..models import Digest, DigestRun, VALID_STATUSES
from .db import SessionLocal
from .orm import DigestRunRow, FindingStatusRow


class Store:
    def record_digest(self, digest: Digest) -> DigestRun:
        c = digest.counts
        row = DigestRunRow(
            as_of=digest.as_of,
            total=c.get("total", 0),
            critical=c.get("Critical", 0),
            warning=c.get("Warning", 0),
            info=c.get("Info", 0),
            summary=digest.summary,
        )
        with SessionLocal() as s:
            s.add(row)
            s.commit()
            s.refresh(row)
            return _to_run(row)

    def list_runs(self, limit: int = 50) -> list[DigestRun]:
        with SessionLocal() as s:
            rows = s.scalars(
                select(DigestRunRow).order_by(DigestRunRow.id.desc()).limit(limit)
            ).all()
            return [_to_run(r) for r in rows]

    def all_statuses(self) -> dict[str, FindingStatusRow]:
        """finding_id -> row, for findings that are not in the default state."""
        with SessionLocal() as s:
            rows = s.scalars(select(FindingStatusRow)).all()
            return {r.finding_id: _detach(r) for r in rows}

    def set_status(
        self,
        finding_id: str,
        status: str,
        assignee: str | None = None,
        note: str | None = None,
    ) -> FindingStatusRow:
        if status not in VALID_STATUSES:
            raise ValueError(f"invalid status {status!r}; expected one of {sorted(VALID_STATUSES)}")
        with SessionLocal() as s:
            row = s.get(FindingStatusRow, finding_id)
            if row is None:
                row = FindingStatusRow(finding_id=finding_id)
                s.add(row)
            row.status = status
            row.assignee = assignee
            row.note = note
            s.commit()
            s.refresh(row)
            return _detach(row)


def _to_run(row: DigestRunRow) -> DigestRun:
    return DigestRun(
        id=row.id,
        created_at=row.created_at.isoformat(),
        as_of=row.as_of,
        total=row.total,
        critical=row.critical,
        warning=row.warning,
        info=row.info,
        summary=row.summary,
    )


def _detach(row: FindingStatusRow) -> FindingStatusRow:
    # A lightweight detached copy so callers can read fields after the session
    # closes without triggering lazy-load on a detached instance.
    copy = FindingStatusRow(
        finding_id=row.finding_id,
        status=row.status,
        assignee=row.assignee,
        note=row.note,
    )
    return copy


_store: Store | None = None


def get_store() -> Store:
    global _store
    if _store is None:
        _store = Store()
    return _store
