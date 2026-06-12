# FGI Subsidiary Governance — Project Memory

> Interview case for NBIM (Norges Bank Investment Management), Monday 2026-06-16.
> Submission to tobias.hyldmo@nbim.no, martin.espeland@nbim.no, guh@nbim.no
> at least 24 h before the interview (i.e. by Sunday 2026-06-15 morning).

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Tailwind v4 + Vite 8 |
| Backend | FastAPI (Python) on port 8000 |
| Dev server | Vite on port 5173 |
| DB | SQLite (default) / Postgres via docker-compose |

Start both: `cd backend && uvicorn app.main:app --reload` + `cd frontend && npm run dev`

---

## Tabs & components

| Tab | Component | Purpose |
|---|---|---|
| Dashboard | `SummaryBar` + `FindingsView` | Fetch digest, view findings, change workflow status |
| Entities | `EntitiesView` | Filterable/sortable table of all 100 entities, expandable detail rows |
| Structure | `HierarchyView` | Collapsible tree (file-explorer style), orphan detection |
| Map | `MapView` | World map with country bubbles, search, fullscreen, entity drill-down |
| Inbox | `InboxView` | Board-update inbox with search |
| Letters | `LettersView` | Agent letter claims |
| History | `HistoryView` | Past digest runs |
| AI review | `AiReviewView` | Open-ended Claude sweep (separate from digest) |

---

## Architecture decisions

### Design system
- **Institutional / data-tool aesthetic** — think Bloomberg/Power BI, not startup landing page
- Dark navy header `#0b1d38`, white active tab underline
- `Card` = `rounded border border-slate-200 bg-white` (no shadow, no xl radius)
- Primary interactive colour: `blue-700/800` (not indigo)
- Inter font via Google Fonts
- Status colours: green = good, amber = warning, red = problem — never decorative

### Orphan entities (critical design principle)
- **Flag, never auto-correct.** If `parent_entity_id` doesn't exist in the register, the entity becomes a root tree with an amber warning. Do NOT fuzzy-match a parent.
- FGI-050 has `parent_entity_id = "FGI-099X"` — shown as independent root with warning.

### AI summary format
- Prompt instructs 3 paragraphs separated by `\n\n`: Posture / Priority items / Actions
- `SummaryBar` splits on blank lines and renders each with a left label
- Mock produces same 3-paragraph structure for offline dev

### Map (MapView.tsx)
- `react-simple-maps` v3 + world-atlas TopoJSON bundled at `/public/world-110m.json`
- No tile server — works offline
- Bubble radius = `√(count) × 8 / mapZoom` (constant screen size during zoom)
- `translateExtent` prevents dragging off-screen
- `ZoomableGroup` is controlled (`mapPosition` state) so fly-to animations work
- ISO 3166-1 numeric → jurisdiction name lookup for clickable country polygons
- Fullscreen: browser Fullscreen API on the map panel div; overlay panel replaces side panel
- "Open in Entities" sets `entityFocus` in App, EntitiesView applies it on mount

### HierarchyView tree
- `buildForest()` is cycle-safe; broken parent refs → orphan root (never placed under guessed parent)
- `subtreeMatches()` keeps ancestors visible during search
- `isOrphan` flag + `brokenParentRef` on TNode
- Asset-class colour palette shared with MapView

---

## Key files

```
frontend/src/
  App.tsx                     — tab routing, entityFocus state, onNavigateToEntity
  index.css                   — Inter font, country-scroll scrollbar, base styles
  react-simple-maps.d.ts      — hand-written type declarations for react-simple-maps v3
  components/
    ui.tsx                    — Card, StatusPill, SeverityBadge, Spinner
    MapView.tsx               — world map, CountryPanel (shared normal/fullscreen)
    HierarchyView.tsx         — collapsible tree, orphan detection, detail panel
    EntitiesView.tsx          — entities table, accepts focusEntityId prop
    FindingsView.tsx          — findings with severity/status/region filters
    GlobalSearch.tsx          — ⌘K global search, lazy-loads all data
    SummaryBar.tsx            — digest stat tiles + 3-paragraph AI summary card
    AiReviewView.tsx          — advisory AI sweep (separate from digest)
    InboxView.tsx             — board updates with inline search
backend/app/
  llm/mock.py                 — deterministic mock (no API key needed)
  llm/anthropic_client.py     — real Claude calls with prompt caching
  services/digest.py          — orchestrates ingest → detectors → LLM
  risk/                       — deterministic rule detectors
```

---

## Asset-class colour palette (shared across Map + Structure)

```
Real Estate:      #059669  (emerald)
Renewable Energy: #0ea5e9  (sky blue)
Holding:          #6366f1  (indigo)
Treasury:         #f59e0b  (amber)
Mixed/unknown:    #64748b  (slate)
```

---

## Git log (recent, newest first)

```
3eba996  Add Map view, institutional design refresh, and AI summary restructuring
7e97078  Stop guessing orphan parents — show as independent trees with warning
b003bd5  Add entity detail panel to Structure view
e305071  Replace SVG pan/zoom tree with collapsible list
a3d0998  Add interactive ownership-tree visualisation (Structure tab)
81ed599  Make parent entity chip clickable to filter by parent
e7026e4  Expand EntitiesView with full entity details
246e9e9  Add global search and inbox search
...
```

---

## Pending before submission

- [ ] Push to GitHub (`git push origin main`)
- [ ] Send submission email to tobias.hyldmo@nbim.no, martin.espeland@nbim.no, guh@nbim.no

---

## User preferences (observed)

- Prefers **honest anomaly reporting** over silent auto-correction (e.g. orphan entities)
- Design should feel **institutional and reliable**, not flashy
- Tables > fancy cards; information density matters
- Wants features explained briefly after implementation
- Norwegian speaker — messages sometimes in Norwegian, replies should be in English
