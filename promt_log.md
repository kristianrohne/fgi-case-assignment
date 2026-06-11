Alright so I have this job interview on monday. Read the case with me in the PDF and readme-file. I think we should start to plan how to approach this task. Probably we need to analayze the data,  (then)? figure out how to solve it with backend.

Also, they suggest using AI. Maybe we shall make a log throughout the case to like summarize how we use AI, idk.

Let me read the case files first.


Found files, read 4 files
Let me also read the three letters quickly.


Read 3 files
Alright, I've read everything. Let me break down what we're working with before we plan the build.

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

This sounds like a plan. 

But first. I dont excactly know the data, can you help me make a notebook with tables and plot that visualizes the data and structure. I want to know what I'm working with before we start doing everything. Using librarier like matplotlib (or something better), checkin Nan values, header and more interesting things about the data

Let me scaffold a solid EDA notebook for you.


Ran 3 commands
Good, everything installed. Now let me write the notebook.


Created a file, ran 5 commands
Can you create venv before installing libraries?

Good call. Let me set up a venv first.


Ran 5 commands
Now let's register the venv as a Jupyter kernel and execute the notebook:


Ran 2 commands
Notebook executed cleanly. Here's what you have:


Ran 4 commands
Everything is installed. Open the notebook like this — run this from the project folder:

.venv\Scripts\jupyter notebook eda.ipynb
Or open eda_executed.ipynb directly in VS Code (it already has all outputs rendered from the dry run).

Here's what the notebook covers, section by section:

#	Section	What you'll see
1	Shape & headers	100 rows × 16 columns, all dtypes
2	Missing values	Bar chart of NaN/empty % per column — parent_entity_id is the main one (root entities)
3	Jurisdiction & entity type	Side-by-side bar charts — Netherlands and Germany are heaviest; B.V./GmbH dominate
4	Status distribution	Pie chart — ~85% Active, but ~7 dissolved/liquidation
5	Asset class	Renewable Energy and Real Estate split roughly 50/50
6	Filing status	Pie + "overdue by jurisdiction" bar — 14 overdue entities, who and where
7	Mandate urgency	Color-coded bar (expired → >180 days) + table of urgent ones
8	Ownership anomalies	Circular FGI-012/019 flagged; JV table (non-100% holdings)
9	Data quality full scan	Table of all anomalies: Noveria, future date, duplicate name, orphan parent, missing name
10	Board updates analysis	Date format chaos shown; change type + source breakdown; unmatched/ghost entities
11	Ghost entities from letters	Cross-reference table of all entities in PDFs but absent from CSV
12	Risk summary chart	One horizontal bar chart with all risks colour-coded by severity
13	Board member load	Who sits on the most boards — Magnus Fjellström tops the list at ~13
14	Incorporation timeline	FGI-041's 2027 date flagged in red
Once you've looked through it, we're ready to scaffold the actual app.

Okay bra! Kan du forklare oppgaven til meg generelt. Jeg skjønner at det er data som vi skal jobbe med, lage en backend for å rydde opp, lage en LLM som tar seg av det? Og frontend osv. 

Men hva er dataen? Er mye variabler jeg ikke er kjent med. Hva slags type problemstilling jober vi med, hva er pdf-filene. Hva er json fila vi har fått, hva er variablene i csv fila og radene.

Skal forklare alt fra scratch, på norsk!

Hva er dette egentlig?
Tenk deg at du jobber i juridisk avdeling i et stort statlig investeringsfond (tenk: Oljefondet, men fiktivt). Fondet eier 100 datterselskaper spredt over 18 land — alt fra solparker i Brasil til hoteller i Dublin.

Problemet er at all styringsinformasjon lever i Excel-ark og e-poster. Ingen skikkelig oversikt. Og om noen dager er det styremøte.

Din jobb: bygg et verktøy som gir den lille juridiske teamet oversikt over kaos.

Hva er CSV-fila? (subsidiaries.csv)
Dette er selskapsregisteret — én rad per datterselskap. Her er hva hver kolonne betyr:

Kolonne	Hva det er	Eksempel
entity_id	Unik ID for selskapet	FGI-001
entity_name	Navn på selskapet	FGI Europe Holdings B.V.
entity_type	Selskapsform (tilsvarer AS, LLC osv)	B.V. = nederlandsk AS
jurisdiction	Landet selskapet er registrert i	Netherlands
incorporation_date	Stiftelsesdato	2015-06-02
parent_entity_id	Hvem eier dette selskapet? (peker på en annen rad)	FGI-001
ownership_pct	Hvor stor eierandel har morselskapet	100.0 eller 60.0 (JV)
registered_address	Offisiell forretningsadresse	Laralaan 32, Rotterdam
board_members	Hvem sitter i styret	Tricia Valencia, Noah Rhodes
board_mandate_expiry	Når løper styrets mandat ut	2026-06-03 ← viktig!
annual_filing_due	Frist for å levere årsregnskap til myndighetene	2027-01-23
annual_filing_status	Er det levert?	Filed / Pending / Overdue
registered_agent	Det lokale advokatfirmaet/agenten som hjelper dem	Goyaerts van Waderle B.V.
status	Er selskapet aktivt?	Active / Dissolved / In liquidation
asset_class	Hva slags investering er dette	Real Estate / Renewable Energy / Holding
asset_description	Konkret hva de eier	400MW onshore wind farm
Strukturen er et tre: FGI-001 (Norsk toppselskap) eier FGI-002 (Europeisk holdingselskap), som igjen eier 50+ datterselskaper i Europa. Separate grener for Amerika og Asia-Pacific.

Hva er JSON-fila? (board_updates.json)
Dette simulerer innboksen til juristene — e-poster, telefonnotater og skannede brev fra lokale agenter rundt om i verden som melder fra om endringer i styrene.

Typiske meldinger:

"Tricia Valencia har trukket seg fra styret i FGI Copenhagen Retail"
"Styremandatet er fornyet — nytt utløp 2027-05-28"
"Adressen er endret"
Problemet: Disse meldingene er rotete. Datoene er i tre forskjellige formater (15 May 2026, 2026-05-31, 05/25/2026). Selskapsnavn matcher ikke alltid CSV-en. Og noen meldinger refererer til selskaper som ikke finnes i registeret i det hele tatt — ghost entities.

Hva er PDF-filene?
Tre formelle brev fra lokale forvaltningsagenter (firmaer fondet betaler for å håndtere lokale juridiske krav):

Fil	Hvem	Hva de sier
luxembourg_mandate_warning.pdf	Lux Corporate Management	"Disse 3 Luxembourg-selskapene har styremandat som løper ut innen 60 dager"
singapore_compliance_update.pdf	Pacific Corporate Advisory	"FGI Singapore Solar III er markert som oppløst hos dere, men vi har fortsatt åpne compliance-saker"
netherlands_filing_reminder.pdf	Van der Berg Corporate Services	"2 nederlandske selskaper har forfalt årsregnskap"
Twisten: Disse brevene nevner selskaper og detaljer som ikke stemmer med CSV-en — enten fordi registeret er utdatert, eller fordi noen har rotet det til.

Hva er selve problemstillingen?
Det er tre praktiske juridiske risikoer en slik avdeling alltid jakter på:

1. Forfalt årsregnskap
Hvert land krever at selskaper leverer årsregnskap. Gjør du ikke det → bøter, i verste fall tvangsmessig avvikling. 14 selskaper i registeret er allerede Overdue.

2. Utløpende styremandat
Styremedlemmer har et mandat med utløpsdato. Løper det ut uten fornyelse → selskapet har teknisk sett et ugyldig styre → kan ikke fatte vedtak lovlig. Noen mandater løper ut om dager.

3. Datakvalitetsproblemer
Registeret er ikke til å stole på blindt:

Sirkulær eierskap (to selskaper eier hverandre)
Et selskap registrert i et ikke-eksisterende land ("Noveria" — fra et videospill)
Et selskap stiftet i 2027 (fremtiden)
Selskaper som er oppløst men fortsatt har åpne forpliktelser
Hva skal appen gjøre?
Data (CSV + JSON + PDFs)
        ↓
  FastAPI backend
  - Renser og normaliserer data
  - Matcher board-updates til riktig selskap
  - Oppdager risikoer automatisk
  - Spør LLM: "Hva bør teamet gjøre med dette?"
        ↓
  React frontend
  - Dashboard med risikoer rangert etter alvor
  - Tabell med alle selskaper (filtrerbart)
  - AI-genererte anbefalinger per selskap
LLM-rollen er: ta all rotete input (brev, JSON-meldinger, CSV-data) → gi strukturert output på naturlig språk: "FGI Treasury & Financing: Styremandatet løper ut 19. juni. Konflikt mellom brevet og registeret — avklar umiddelbart."

Kort sagt: det er et governance-verktøy for et juridisk team som drukner i manuelt arbeid. Du bygger det som skal redde dem fra å misse kritiske frister.

Klar til å starte på selve koden?