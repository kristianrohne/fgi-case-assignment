# Data Storage — FGI Subsidiary Governance Monitor

## Overview

The system separates **source data** (read-only flat files) from **durable state** (SQLite database). Source files are treated as an authoritative external feed and are never written to by the application. Only two things are persisted to the database: digest run history and finding workflow status.

---

## Source data (flat files, read-only)

Located in the `data/` folder at the repo root.

| File | What it contains | How it is used |
|---|---|---|
| `data/subsidiaries.csv` | The full entity register — ~100 subsidiaries with legal name, jurisdiction, parent, status, asset class, board mandate dates, filing deadlines, etc. | Read fresh on every digest run. Parsed into `Entity` objects in memory. |
| `data/board_updates.json` | Board-update notifications from corporate service agents. Each entry has a raw entity name, topic, and dates. | Read fresh on every request to `/inbox`. Entity names are fuzzy-matched to the register on ingest. |
| `data/letters/` | One `.txt` file per agent letter. Each letter is free text extracted from a PDF. | Read fresh on every request to `/letters`. Entity name mentions are extracted and fuzzy-matched. |

**Important:** these files are never written to by the application. To update the data (e.g. a new entity is registered, or a mandate date changes), you edit the file directly. The next digest run will pick up the change automatically.

**Limitation:** overwriting a file loses the previous state. In a production system you would use a database with change history (see *Production path* below).

---

## Durable state (SQLite database)

File: **`backend/fgi.db`**

Managed by SQLAlchemy. Two tables:

### `digest_runs` — audit history

One row per digest execution. Stored so the History tab can show what was found on each run.

| Column | Type | Description |
|---|---|---|
| `id` | integer (PK) | Auto-increment run ID |
| `created_at` | datetime | When the digest was run (UTC) |
| `as_of` | date | The "as of" date used for the run |
| `total` | integer | Total findings count |
| `critical` | integer | Critical findings count |
| `warning` | integer | Warning findings count |
| `info` | integer | Info findings count |
| `summary` | text | The AI-generated governance summary |

### `finding_status` — workflow state

One row per finding that has been acted on (open findings with no action taken have no row — the default state is `open`). Keyed by a stable deterministic finding ID so status survives across digest runs.

| Column | Type | Description |
|---|---|---|
| `finding_id` | string (PK) | Stable ID derived from the finding's content (e.g. `expired-mandate-FGI-007`) |
| `status` | string | `open` / `in-review` / `resolved` |
| `assignee` | string (nullable) | Who the finding is assigned to |
| `note` | text (nullable) | Free-text note from the analyst |
| `updated_at` | datetime | Last time the status was changed |

---

## What is NOT persisted

| Data | Why not persisted |
|---|---|
| Parsed entities | Always recomputed from `subsidiaries.csv`; 100 rows is negligible |
| Inbox entries | Always recomputed from `board_updates.json` |
| Letter claims | Always recomputed from `data/letters/` |
| Findings (the risk detections themselves) | Deterministic — same inputs always produce the same findings. Only the *workflow state* is stored, not the finding itself. |

---

## Switching to Postgres

The persistence layer is database-agnostic. To use Postgres instead of SQLite, set one environment variable in `backend/.env`:

```
DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/fgi
```

A `docker-compose.yml` is included for local Postgres setup.

---

## Production path (how this would evolve at scale)

| Concern | Current approach | Production approach |
|---|---|---|
| Entity register | CSV (manual handoff) | Push from source system (ERP / company registry API); entities table with change history (`valid_from` / `valid_to`) |
| Inbox | Static JSON file | Event stream — emails or API webhooks append rows to a DB table as they arrive |
| Letters | Text files in a folder | Document storage (S3 / blob store); ingestion pipeline triggered on upload |
| Findings | Recomputed every run | Finding rows with `created_at` / `last_seen` / `resolved_at` to deduplicate across runs |
| Entity register history | None (overwrite loses history) | Append-only audit log so every field change is traceable with a timestamp |
