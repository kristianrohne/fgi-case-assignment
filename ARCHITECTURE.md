# Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES  (read-only, messy)                    │
│   data/subsidiaries.csv     data/board_updates.json    data/letters/*.pdf  │
│   100-entity register       ~30 inbox messages         3 free-text letters │
└──────────┬──────────────────────────┬──────────────────────────┬──────────┘
           │                          │                          │
           ▼                          ▼                          ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  INGESTION   backend/app/ingestion/        — tolerant parsing, never crashes │
│   entities.py            board_updates.py              letter_claims.py      │
│   CSV → Entity           JSON → BoardUpdate            PDF → text → claims    │
│                          + fuzzy-match to register     + fuzzy-match          │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                     ▼
                       IngestResult  (held in memory, cached)
                                     │
              ┌──────────────────────┴───────────────────────┐
              ▼                                                │
┌────────────────────────────────────────────┐               │
│  RISK DETECTORS   risk/detectors.py          │   ◄── THE FACTS
│  15 deterministic Python rules               │       fully reproducible,
│  ownership · data quality · filings ·        │       NO model in the loop
│  mandates · lifecycle · letter reconciliation│
└──────────────────────┬───────────────────────┘
                       ▼
                  Findings  (e.g. 65)
                       │
                       ▼
┌────────────────────────────────────────────┐
│  LLM ENRICHMENT   llm/                        │   ◄── THE NARRATIVE
│   interface ─┬─ mock        (no API key)      │       board-ready summary
│              └─ anthropic   (real Claude)     │       + 1 recommendation / finding
└──────────────────────┬───────────────────────┘
                       ▼
                    Digest  (summary + counts + enriched findings)
                       │
         ┌─────────────┴──────────────┐        ┌──────────────────────────────┐
         │  FastAPI   main.py          │◄──────►│  PERSISTENCE   persistence/    │
         │  REST + CORS                │        │  Store over SQLAlchemy         │
         │  /digest /entities /findings│        │   • finding workflow status    │
         │  /letters /digest-runs      │        │   • digest run history         │
         │  PATCH /findings/{id}/status│        │  SQLite default / Postgres     │
         └─────────────┬──────────────┘        └──────────────────────────────┘
                       │   (Vite dev-proxy /api → :8000)
                       ▼
┌──────────────────────────────────────────────────────┐
│  FRONTEND   React + TS + Tailwind (Vite)               │
│  Dashboard │ Entities │ Inbox │ Letters │ History       │
└──────────────────────────────────────────────────────┘
```

## Two principles the diagram encodes

1. **Deterministic core, LLM on top.** The detectors compute the *facts*; the
   LLM only writes the *summary* and the *recommendations*. The numbers on the
   dashboard come from code, never the model — so the model cannot mislead.

2. **Pluggable seams.** The LLM is behind an interface (`mock` ↔ `anthropic`)
   and persistence is behind a `Store` (SQLite ↔ Postgres), each toggled by env
   var. The app runs fully with zero external services by default.

3. **Store what must survive, recompute the rest.** The read-only input data
   stays in memory; only the team's workflow state and run history are persisted
   — that is the entire justification for the database.

## Configuration

A single `as_of_date` (env-pinnable) drives every deadline calculation, so a
demo is reproducible regardless of the wall clock.
