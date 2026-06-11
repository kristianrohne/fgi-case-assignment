"""SQLAlchemy engine + session, dialect-agnostic.

The same code runs on SQLite and Postgres; only `settings.database_url`
differs. `init_db()` creates the tables on startup (create_all is enough for
this project; a real service would use Alembic migrations).
"""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from ..config import settings


class Base(DeclarativeBase):
    pass


# SQLite + FastAPI's threadpool needs check_same_thread disabled.
_connect_args = (
    {"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {}
)

engine = create_engine(settings.database_url, connect_args=_connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)


def init_db() -> None:
    from . import orm  # noqa: F401 — register mappers before create_all

    Base.metadata.create_all(engine)
