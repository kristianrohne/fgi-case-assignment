"""API surface via FastAPI TestClient (mock LLM, fixed date)."""


def test_meta(client):
    m = client.get("/api/meta").json()
    assert m["entity_count"] == 100
    assert m["llm_provider"] == "mock"
    assert m["as_of"] == "2026-06-11"


def test_entities_filter(client):
    germany = client.get("/api/entities", params={"jurisdiction": "Germany"}).json()
    assert len(germany) > 0
    assert all(e["jurisdiction"] == "Germany" for e in germany)


def test_entity_404(client):
    assert client.get("/api/entities/FGI-DOES-NOT-EXIST").status_code == 404


def test_letters_have_matched_claims(client):
    letters = client.get("/api/letters").json()
    assert len(letters) == 3
    assert sum(len(l["claims"]) for l in letters) >= 6


def test_digest_with_mock_llm(client):
    d = client.post("/api/digest").json()
    assert d["counts"]["total"] == 65
    assert d["summary"]  # mock summary present
    assert all(f["recommendation"] for f in d["findings"])  # every finding enriched


def test_status_workflow_reflected_in_findings(client):
    fid = "overdue-filing-FGI-007"
    r = client.patch(f"/api/findings/{fid}/status", json={"status": "resolved", "assignee": "X"})
    assert r.status_code == 200
    match = next(f for f in client.get("/api/findings").json() if f["id"] == fid)
    assert match["status"] == "resolved"
    assert match["assignee"] == "X"


def test_invalid_status_rejected(client):
    r = client.patch("/api/findings/whatever/status", json={"status": "nope"})
    assert r.status_code == 422


def test_digest_runs_recorded(client):
    client.post("/api/digest", params={"use_llm": False})
    assert len(client.get("/api/digest-runs").json()) >= 1
