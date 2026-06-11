"""Persistence layer.

A thin `Store` over SQLAlchemy. The *input* data (register, inbox, letters)
stays in memory — it is small and read-only. What lives here is the part that
genuinely needs to be durable and to outlive a restart: the team's workflow
state on each finding, and the history of digest runs. That is the real reason
this app has a database at all.

SQLite by default (zero setup). Set DATABASE_URL=postgresql+psycopg://... to run
the identical layer on Postgres.
"""

from .store import Store, get_store
from .db import init_db

__all__ = ["Store", "get_store", "init_db"]
