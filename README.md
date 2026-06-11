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

The headline design choice: **the detectors produce the facts; the LLM only
explains and recommends.** Every risk is reproducible from the data with no
model in the loop, which makes the tool trustworthy and makes "what the AI did
vs. what the rules did" an easy story to tell. See
[`AI_LOG.md`](AI_LOG.md) for the full process narrative.

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

Interactive docs at <http://localhost:8000/docs> when the backend is running.

---

## Design decisions

- **In-memory store, not a database.** The data is small (~100 entities),
  read-only, and re-derived from source on load (cached). A DB would add setup
  friction with no benefit for this exercise; for production I'd move to
  Postgres. *(The brief explicitly cares about reasoning over infrastructure.)*
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
backend/app/
  config.py          single as-of date + paths + thresholds
  models.py          Entity / BoardUpdate / Letter / LetterClaim / Finding / Digest
  ingestion/         CSV, JSON inbox, PDF letters, fuzzy matching, claim extraction
  risk/detectors.py  15 deterministic detectors (the source of truth)
  llm/               interface + mock (key-free) + Anthropic client
  services/digest.py ingest → detect → LLM-enrich pipeline
  main.py            FastAPI routes
frontend/src/        React + TS + Tailwind: Dashboard / Entities / Inbox / Letters
data/                provided case data (CSV, JSON, 3 PDFs)
documents/           case brief & working notes
notebooks/           exploratory data analysis
```

## AI usage

This project was built with heavy use of AI tooling, as the brief encouraged.
[`AI_LOG.md`](AI_LOG.md) documents where AI helped, where it got things wrong,
and where I stepped in.
