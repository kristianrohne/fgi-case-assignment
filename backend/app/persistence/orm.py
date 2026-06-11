"""ORM tables. Two of them, matching the two durable concerns."""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DigestRunRow(Base):
    """One historical digest execution — the audit trail / 'what changed'."""

    __tablename__ = "digest_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    as_of: Mapped[date] = mapped_column(Date)
    total: Mapped[int] = mapped_column(Integer)
    critical: Mapped[int] = mapped_column(Integer)
    warning: Mapped[int] = mapped_column(Integer)
    info: Mapped[int] = mapped_column(Integer)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)


class FindingStatusRow(Base):
    """Workflow state for a finding, keyed by its stable deterministic id."""

    __tablename__ = "finding_status"

    finding_id: Mapped[str] = mapped_column(String(200), primary_key=True)
    status: Mapped[str] = mapped_column(String(20), default="open")
    assignee: Mapped[str | None] = mapped_column(String(120), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )
