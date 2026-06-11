"""Test configuration.

We set env vars BEFORE importing any backend module so the app picks up a
deterministic setup: a fixed as-of date, the mock LLM (no API cost, reproducible
output) and an isolated SQLite database in the temp dir.
"""

import os
import pathlib
import tempfile
from datetime import date

import pytest

_TEST_DB = pathlib.Path(tempfile.gettempdir()) / "fgi_test.db"
if _TEST_DB.exists():
    _TEST_DB.unlink()

os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["AS_OF_DATE"] = "2026-06-11"


@pytest.fixture(scope="session")
def today() -> date:
    return date(2026, 6, 11)


@pytest.fixture(scope="session")
def ingested():
    from backend.app.ingestion import ingest

    return ingest()


@pytest.fixture(scope="session")
def findings(ingested, today):
    from backend.app.risk import detect_findings

    return detect_findings(ingested, today=today)


@pytest.fixture()
def client():
    from fastapi.testclient import TestClient

    from backend.app.main import app

    return TestClient(app)
