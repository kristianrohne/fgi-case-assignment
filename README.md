# FGI Subsidiary Governance

A governance-risk tool for the legal team of **Fjord Global Investments** — a
(fictional) sovereign wealth fund with ~100 subsidiaries across 18 jurisdictions
whose corporate data lives in spreadsheets, an email inbox, and letters from
local agents. The tool ingests that messy data, **surfaces the risks the team
can't currently see**, and uses an LLM to summarise and recommend actions.

Built for the NBIM case assignment (see [`documents/case-brief.pdf`](documents/case-brief.pdf)).

---

## What it does

Click **Fetch digest** and the backend runs one pipeline:

```
ingest (CSV + JSON inbox + 3 PDF letters)
   │
   ▼
deterministic risk detectors  ──►  the facts (15 rules, fully reproducible)
   │
   ▼
LLM enrichment (Claude)        ──►  board-ready summary + a recommended action
                                    for every finding
   │
   ▼
React dashboard                ──►  severity-ranked findings, filters, entity
                                    browser, inbox & letter reconciliation
```

See [`documents/ARCHITECTURE.md`](documents/ARCHITECTURE.md) for the full diagram.

The headline design choice: **the detectors produce the facts; the LLM only
explains and recommends.** Every risk is reproducible from the data with no
model in the loop, which makes the tool trustworthy and makes "what the AI did
vs. what the rules did" an easy story to tell. See
[`documents/AI_LOG.md`](documents/AI_LOG.md) for the full process narrative.

A second principle: **we flag, we never auto-correct.** A dissolved entity that
still lists a board is surfaced for a human — not silently "fixed".

---

## Quickstart

Two terminals. Requires **Python 3.11** and **Node 20+**.

### 1. Backend (FastAPI, port 8000)

```bash
# from the repo root
python3.11 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/python -m uvicorn backend.app.main:app --reload --port 8000
```

The backend runs **with no API key out of the box** — it defaults to a
deterministic mock LLM, so the whole app is fully functional offline.

### 2. Frontend (React + Vite, port 5173)

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to the backend.

### 3. (Optional) Enable real Claude

```bash
cp backend/.env.example backend/.env
# then edit backend/.env:
#   LLM_PROVIDER=anthropic
#   ANTHROPIC_API_KEY=sk-ant-...
```

Restart the backend. The digest summary and recommendations are now written by
Claude. `.env` is gitignored — the key never enters the repo.

---

## Configuration (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | `mock` | `mock` (no key, deterministic) or `anthropic` (real Claude) |
| `ANTHROPIC_API_KEY` | — | required only when `LLM_PROVIDER=anthropic` |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` | model for the digest |
| `AS_OF_DATE` | today | pins the "current date" for all deadline maths (e.g. `2026-06-11`) so a demo stays reproducible |
| `DATABASE_URL` | local SQLite | set to `postgresql+psycopg://...` to run on Postgres instead (see below) |

All time-based risks (overdue filings, expiring mandates) are computed against a
single `as_of_date` rather than the wall clock — set it to keep a demo stable.

---

## What it detects

15 detectors across five categories (see [`backend/app/risk/detectors.py`](backend/app/risk/detectors.py)):

- **Ownership structure** — circular ownership (e.g. FGI-012 ↔ FGI-019), parents
  not in the register.
- **Data quality** — unrecognised jurisdiction (e.g. the fabricated "Noveria"),
  future incorporation dates, missing/duplicate names, unparseable dates,
  unknown filing status.
- **Annual filing** — overdue filings (by status *and* by a passed due date).
- **Board mandate** — expired or imminently-expiring mandates.
- **Lifecycle** — dissolved / in-liquidation entities that still have a live
  board or children.
- **Inbox & letter reconciliation** — board updates and letter claims matched
  back to the register; **ghost entities** (named externally, absent from the
  register), **conflicts** (a letter contradicts the register), and **likely
  false matches** (a fuzzy name match that is semantically wrong, e.g. "Aurora
  *Storage*" vs "Aurora *Solar*").

---

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/meta` | as-of date, LLM provider, entity count |
| `GET` | `/api/entities` | register, filterable by `jurisdiction`/`status`/`asset_class`/`q` |
| `GET` | `/api/entities/{id}` | one entity |
| `GET` | `/api/board-updates` | the inbox, `?unmatched_only=true` for ghosts |
| `GET` | `/api/letters` | letters with extracted, register-matched claims |
| `GET` | `/api/findings` | deterministic findings only (instant, no LLM) |
| `POST` | `/api/digest` | **the headline action**: findings + LLM summary & recommendations |
| `PATCH` | `/api/findings/{id}/status` | set workflow status (`open`/`acknowledged`/`assigned`/`resolved`) |
| `GET` | `/api/digest-runs` | history of past digest runs |
| `POST` | `/api/ai-review` | advisory LLM sweep for concerns the rules didn't flag (kept separate) |

Interactive docs at <http://localhost:8000/docs> when the backend is running.

---

## Persistence & workflow

The *input* data (register, inbox, letters) is read-only and small, so it lives
in memory. What needs to be **durable** is the part that makes this an ongoing
tool rather than a one-shot report:

- **Finding workflow** — mark a finding `acknowledged` / `assigned` / `resolved`.
  Findings have stable, deterministic ids, so a status set today re-attaches to
  the same finding on the next run.
- **Digest history** — every run is recorded (counts + summary), so the team can
  see how the risk picture changes between board meetings.

This is the reason the app has a database at all. It runs on **SQLite by
default** (zero setup). To run the *identical* SQLAlchemy layer on **Postgres**:

```bash
docker compose up -d
echo 'DATABASE_URL=postgresql+psycopg://fgi:fgi@localhost:5433/fgi' >> backend/.env
# restart the backend — tables are created automatically
```

`docker compose up -d` also starts **Adminer**, a web DB browser, at
<http://localhost:8080> — log in with System `PostgreSQL`, Server `db`, user /
password `fgi` / `fgi`, database `fgi` to click through the tables.

---

## Tests

```bash
.venv/bin/pytest
```

31 tests covering the detectors (against the real data, with a pinned date),
tolerant date parsing, fuzzy matching, letter-claim extraction, the persistence
layer, and the API. They run on the mock LLM and an isolated SQLite db — no key,
no network.

---

## Design decisions

- **Input data in memory; workflow & history in a database.** The register is
  small, read-only and re-derived on load — a DB buys nothing there. But the
  *team's* state (finding status, run history) genuinely needs to persist, so
  that goes in a database. SQLite by default for frictionless setup; the same
  SQLAlchemy layer runs on Postgres via one env var. *(The brief cares about
  reasoning over infrastructure — this is the reasoning: store what must
  survive a restart, not what can be recomputed.)*
- **Deterministic core + LLM on top.** Facts are computed by rules; the LLM adds
  narrative and recommendations. Swapping the mock for Claude changes nothing
  upstream.
- **Tolerant ingestion.** Bad dates/values become `None` with the raw string
  kept — the loader never crashes on messy data; detecting the mess is a
  downstream job.
- **stdlib `difflib` for fuzzy matching** instead of a compiled dependency —
  keeps `pip install` painless across machines.

---

## Project structure

```
fgi-case-assignment/
├── README.md                  this file
├── docker-compose.yml         optional local Postgres + Adminer (DB browser)
├── pytest.ini                 test config
├── .python-version            pins Python 3.11
│
├── backend/
│   ├── requirements.txt
│   ├── .env.example           copy to .env to configure (LLM, DB, as-of date)
│   ├── app/
│   │   ├── config.py          settings: as-of date, paths, LLM + DB toggles
│   │   ├── models.py          Pydantic models (Entity, BoardUpdate, Letter,
│   │   │                       LetterClaim, Finding, Digest, ReviewNote, …)
│   │   ├── main.py            FastAPI app + all routes
│   │   ├── ingestion/         messy sources → clean Python objects
│   │   │   ├── dates.py         tolerant date parsing (one function)
│   │   │   ├── entities.py      subsidiaries.csv → Entity
│   │   │   ├── board_updates.py board_updates.json → BoardUpdate + fuzzy matcher
│   │   │   ├── letters.py       PDF → text (pdfplumber)
│   │   │   ├── letter_claims.py letter text → LetterClaim + fuzzy matcher
│   │   │   └── pipeline.py      runs all three → one IngestResult
│   │   ├── risk/detectors.py  15 deterministic detectors (the source of truth)
│   │   ├── llm/               the LLM seam
│   │   │   ├── base.py          interface every client implements
│   │   │   ├── mock.py          deterministic, no API key
│   │   │   ├── anthropic_client.py  real Claude
│   │   │   └── factory.py       picks one from config (falls back to mock)
│   │   ├── persistence/       Store over SQLAlchemy (SQLite default / Postgres)
│   │   │   ├── db.py            engine + session
│   │   │   ├── orm.py           tables: digest_runs, finding_status
│   │   │   └── store.py         app-facing API (returns Pydantic, not ORM)
│   │   └── services/digest.py  ingest → detect → LLM-enrich orchestration
│   └── tests/                 pytest: detectors, ingestion, persistence, API
│
├── frontend/                  React 19 + TypeScript + Tailwind v4 (Vite)
│   ├── vite.config.ts          dev-proxies /api → backend :8000
│   └── src/
│       ├── App.tsx             shell, tabs, "Fetch digest" action
│       ├── api.ts              typed fetch wrapper
│       ├── types.ts            mirrors the backend models
│       └── components/         Dashboard · Entities · Inbox · Letters ·
│                               History · AI review (+ shared ui.tsx)
│
├── data/                      provided case data (CSV, JSON, 3 PDF letters)
├── documents/                 ARCHITECTURE.md · BACKEND.md · AI_LOG.md · DATA_STORAGE.md + case brief & notes
└── notebooks/                 exploratory data analysis (EDA)
```

## Documentation

- [`documents/ARCHITECTURE.md`](documents/ARCHITECTURE.md) — the system at a glance (diagram + principles)
- [`documents/BACKEND.md`](documents/BACKEND.md) — closer walkthrough: data flow, fuzzy matching, request lifecycle
- [`documents/DATA_STORAGE.md`](documents/DATA_STORAGE.md) — data storage design and production evolution
- [`documents/AI_LOG.md`](documents/AI_LOG.md) — where AI helped, where it got things wrong, and where I stepped in
