Data Analysis — Key Findings
Before writing a line of code, here are the actual governance risks and data surprises the app needs to surface:

Critical anomalies (the "surprises" the README hints at)
#	Issue	Detail
1	Circular ownership	FGI-012's parent is FGI-019, and FGI-019's parent is FGI-012. Impossible structure.
2	Fictional jurisdiction	FGI-033 is incorporated in "Noveria" at "Port Hanshan Plaza" — this is a location from the Mass Effect video game.
3	Future incorporation date	FGI-041 has incorporation date 2027-03-15, which hasn't happened yet.
4	Orphan parent	FGI-050's parent is FGI-099X — doesn't exist in the register.
5	Duplicate name, different entity	FGI-014 and FGI-015 are both named "FGI Madrid Retail II S.L." at the same address, different parents and assets.
6	Missing entity name	FGI-052 has an empty entity_name.
7	Cap table impossible	board_updates.json says FGI-010 is "60% held by FGI Europe Holdings AND 55% held by FGI Americas Holdings" = 115%.
8	Ghost entities in letters	Luxembourg letter names 2 entities not in the CSV. Netherlands letter names 2 more. Singapore letter references "FGI Singapore Solar III" as dissolved with open items — not in CSV at all.
9	Board update conflicts with CSV	Luxembourg letter says FGI Treasury & Financing mandate expires 2026-06-19 with different board members than the CSV (which says 2028-01-10).
10	Dissolved entity with open governance	FGI-003 is "Dissolved" but has board members listed and is a parent entity. The Singapore Solar III letter raises the same pattern.
11	Duplicate board update	Anthony Rodriguez's resignation from Copenhagen Residential VIII appears twice with different source documents.
Filing/mandate urgency (today = 2026-06-10)
Overdue filings: FGI-004, 007, 011, 022, 030, 037, 055, 062, 075, 079, 080, 087, 089, 093 + 2 Netherlands entities from the letter
Mandates expiring within 30 days: FGI-034 (2026-06-02 — already past!), FGI-067 (2026-06-04), FGI-005 (2026-06-19), and the Luxembourg letter entities
Entities in liquidation with active governance needs: FGI-008, 017, 034, 053, 092
Proposed Architecture
React frontend
    ↕ REST
FastAPI backend
    ├── Data ingestion layer (CSV + JSON + PDF letters → SQLite)
    ├── LLM service (Claude API) — summarize, flag risks, recommend actions
    └── SQLite (local, zero setup, easy to demo)
Why SQLite: dead simple for a demo, no docker/postgres needed, interviewer can clone and run immediately. You can justify it: "for production I'd use Postgres, but this keeps the demo frictionless."

Feature Plan
Minimum (required):

Trigger a "digest fetch" button → LLM analyses all data → returns risk summary + per-entity action recommendations
View results in a table
What will impress:

Risk dashboard — colour-coded severity cards (Critical / Warning / Info) grouping the anomalies above
Entity browser — filter by jurisdiction, status, asset class; sort by filing due date or mandate expiry
"Unmatched" inbox — board updates and letter entities that couldn't be matched to the register (ghost entities)
AI chat — ask free-text questions against the data ("which entities in Germany have overdue filings?")
Conflict highlighting — where external letters contradict the CSV
AI Log Idea
Yes, keep one — it'll be a strong talking point in the interview. A simple ai-log.md with entries like:

## 2026-06-10 — Data analysis
Used Claude to scan the CSV for structural anomalies. It caught the circular
ownership (FGI-012/019) and the Noveria jurisdiction. I independently verified
the future incorporation date and cap table overflow by manual check.
Decided NOT to let AI auto-correct the data — flag and surface instead.
They explicitly said they want to explore "where AI helped and where you stepped in." This log is the answer.

Suggested Order of Work
Data ingestion + anomaly detection script (Python) — parse CSV/JSON/PDFs, find all the issues above, load into SQLite
FastAPI backend — endpoints: GET /entities, GET /risks, POST /digest (triggers LLM), GET /unmatched
LLM integration — prompt Claude to summarize risks and generate action recommendations per entity
React frontend — dashboard first, then entity browser, then the extras
AI log — write entries as you go
What do you want to start with — should we scaffold the project structure and tackle the ingestion layer first?