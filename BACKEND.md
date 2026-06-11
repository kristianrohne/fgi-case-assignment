# Backend walkthrough

A closer look at what the backend actually does, module by module, and what
happens on each request. For the high-level picture see
[`ARCHITECTURE.md`](ARCHITECTURE.md).

## The shape

```
backend/app/
  config.py            settings: as-of date, data paths, LLM + DB toggles
  models.py            Pydantic models (the shared vocabulary)
  ingestion/           messy sources -> clean Python objects
    dates.py             tolerant date parsing (one function)
    entities.py          subsidiaries.csv  -> Entity
    board_updates.py     board_updates.json -> BoardUpdate + fuzzy matcher
    letters.py           PDF -> text (pdfplumber)
    letter_claims.py     letter text -> LetterClaim + fuzzy matcher
    pipeline.py          runs all three, returns one IngestResult
  risk/detectors.py    15 deterministic detectors -> Finding[]
  llm/                 the LLM seam
    base.py              the interface every client implements
    mock.py              deterministic, no API key
    anthropic_client.py  real Claude
    factory.py           pick one from config (safe fallback to mock)
  persistence/         Store over SQLAlchemy (SQLite default / Postgres)
  services/digest.py   the orchestration
  main.py              FastAPI routes
```

## The golden rule

**The detectors compute facts. The LLM only explains and recommends.** Nothing
the model says can change a number on the dashboard — those come from
`risk/detectors.py`, which never calls an LLM and is fully reproducible from the
data. This is also why the AI-review feature is kept *separate* and labelled
advisory: it is a second, lower-trust opinion, not a source of truth.

A second rule: **flag, never auto-correct.** Ingestion is tolerant (bad values
become `None`, raw strings are kept) and detectors *surface* problems — they
never mutate the register.

## How the data is processed

### CSV — `ingestion/entities.py`
`csv.DictReader` reads each row into an `Entity`. Numbers and dates are parsed
defensively: a bad `ownership_pct` or date becomes `None` while the original
text is preserved (`incorporation_date_raw`, etc.), so the `unparseable_dates`
detector can flag it later. `board_members` is split on commas into a list.

### JSON inbox — `ingestion/board_updates.py`
`json.load` -> `BoardUpdate` objects. The date is parsed (see below), then each
update is **fuzzy-matched** to a register entity. Anything that can't be matched
confidently is left unmatched and becomes a "ghost" finding.

### PDF letters — `ingestion/letters.py` + `letter_claims.py`
`pdfplumber` extracts the text. Then a small tokeniser walks the text, pulls out
each `FGI …` entity mention (stopping at a legal suffix or a roman numeral, so
prose like "FGI Netherlands entities" is dropped), grabs nearby dates and status
words, and fuzzy-matches each mention to the register. The result is a list of
`LetterClaim`s that the letter detectors reconcile against the CSV.

### Dates — `ingestion/dates.py`
One function, `parse_date`, handles every format via `dateutil`:

| Input | Parsed |
|---|---|
| `"15 May 2026"` | 2026-05-15 |
| `"2026-05-31"` | 2026-05-31 |
| `"05/25/2026"` | 2026-05-25 (`dayfirst=False`, US month-first) |

On failure it returns `None` instead of raising — the caller keeps the raw
string so the bad value can be surfaced.

### Fuzzy matching — `ingestion/board_updates.py`
Names don't match exactly (`"FGI- Copenhagen Retail VII ApS"` vs the register's
`"FGI Copenhagen Retail VII ApS"`). So we:
1. **normalise** both (lowercase, strip legal suffixes like `B.V.`/`GmbH`/`S.à r.l.`, drop punctuation), then
2. **score** similarity 0–100 with stdlib `difflib` (a blend of whole-string ratio and shared-word ratio).

Score ≥ **85** → accept the match; below → unmatched (ghost). The matcher is
deliberately simple — and its brittleness is itself surfaced: a high score on a
semantically-different name (e.g. "Aurora *Storage*" vs "Aurora *Solar*") is
flagged as a likely misidentification by the letter detector, rather than
trusted.

## Request lifecycle

### `POST /api/digest` (the headline action)
1. `ingest()` builds the `IngestResult` (cached after first load).
2. `detect_findings()` runs all 15 detectors -> `Finding[]` (the facts).
3. Persisted workflow status is merged onto the findings by id.
4. Two LLM calls run **in parallel** (summary + per-finding recommendations).
5. The run is recorded in the database (history), and the `Digest` is returned.

`GET /api/findings` is the same minus steps 4–5 — instant, no LLM, no cost.

### `POST /api/ai-review` (advisory)
Ingests, computes the deterministic findings (so the model knows what's
*already* covered), then asks the LLM for up to six *additional* concerns the
rules might have missed. Returns `ReviewNote[]` — kept separate from findings.

## The seams (both toggled by env var)

- **LLM** — `LLM_PROVIDER=mock` (default, no key) or `anthropic`. The factory
  falls back to mock if the key/package is missing, so the app never hard-fails.
- **Persistence** — `DATABASE_URL` blank = SQLite file; set to
  `postgresql+psycopg://…` for Postgres. Same SQLAlchemy code either way.

## Endpoints

| Method | Path | LLM? | Purpose |
|---|---|---|---|
| GET | `/api/meta` | no | as-of date, provider, entity count |
| GET | `/api/entities` `/{id}` | no | register (filterable) / one entity |
| GET | `/api/board-updates` | no | inbox with match status |
| GET | `/api/letters` | no | letters + extracted claims |
| GET | `/api/findings` | no | deterministic findings only |
| POST | `/api/digest` | yes | findings + summary + recommendations |
| PATCH | `/api/findings/{id}/status` | no | workflow status |
| GET | `/api/digest-runs` | no | run history |
| POST | `/api/ai-review` | yes | advisory sweep (separate from findings) |
