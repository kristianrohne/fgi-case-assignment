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


def test_entity_snapshot_stored_and_retrieved():
    from backend.app.models import Entity

    store = get_store()
    entities = [
        Entity(entity_id="T-001", jurisdiction="Germany", status="Active", asset_class="Holding"),
        Entity(entity_id="T-002", jurisdiction="Germany", status="Dissolved", asset_class="Holding"),
        Entity(entity_id="T-003", jurisdiction="Norway", status="Active", asset_class="Real Estate"),
    ]
    digest = Digest(
        as_of=date(2026, 6, 11),
        generated_at="t",
        counts={"total": 0, "Critical": 0, "Warning": 0, "Info": 0},
    )
    run = store.record_digest(digest, entities=entities)

    assert run.entity_snapshot is not None
    snap = run.entity_snapshot
    assert snap["total"] == 3
    assert snap["by_jurisdiction"]["Germany"] == 2
    assert snap["by_jurisdiction"]["Norway"] == 1
    assert snap["by_status"]["Active"] == 2
    assert snap["by_status"]["Dissolved"] == 1
    assert snap["by_asset_class"]["Holding"] == 2

    # Verify it survives a round-trip through the DB
    retrieved = next(r for r in store.list_runs() if r.id == run.id)
    assert retrieved.entity_snapshot == snap
