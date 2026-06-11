"""Persistence layer (runs on the isolated test SQLite from conftest)."""

from datetime import date

import pytest

from backend.app.models import Digest
from backend.app.persistence import get_store, init_db


def setup_module(module):
    init_db()


def test_set_and_read_status():
    store = get_store()
    store.set_status("test-finding-1", "assigned", assignee="Kris", note="chasing")
    row = store.all_statuses()["test-finding-1"]
    assert row.status == "assigned"
    assert row.assignee == "Kris"
    assert row.note == "chasing"


def test_status_update_overwrites():
    store = get_store()
    store.set_status("test-finding-2", "open")
    store.set_status("test-finding-2", "resolved")
    assert store.all_statuses()["test-finding-2"].status == "resolved"


def test_invalid_status_raises():
    with pytest.raises(ValueError):
        get_store().set_status("test-finding-3", "banana")


def test_record_and_list_runs():
    store = get_store()
    digest = Digest(
        as_of=date(2026, 6, 11),
        generated_at="t",
        counts={"total": 3, "Critical": 1, "Warning": 1, "Info": 1},
    )
    run = store.record_digest(digest)
    assert run.id >= 1
    assert run.total == 3 and run.critical == 1
    assert len(store.list_runs()) >= 1
