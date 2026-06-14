import { useEffect, useState } from "react";
import { api } from "./api";
import type { Digest, Meta } from "./types";
import { SummaryBar } from "./components/SummaryBar";
import { FindingsView } from "./components/FindingsView";
import { EntitiesView } from "./components/EntitiesView";
import { InboxView } from "./components/InboxView";
import { LettersView } from "./components/LettersView";
import { HistoryView } from "./components/HistoryView";
import { AiReviewView } from "./components/AiReviewView";
import { GlobalSearch } from "./components/GlobalSearch";
import { HierarchyView } from "./components/HierarchyView";
import { MapView } from "./components/MapView";
import type { Finding } from "./types";

// Entities, Structure and Map are sub-views of the same "Entities" tab.
type EntityView = "table" | "tree" | "map";
type Tab = "dashboard" | "entities" | "inbox" | "letters" | "history" | "ai-review";

const TABS: Tab[] = ["dashboard", "entities", "inbox", "letters", "history", "ai-review"];
const TAB_LABELS: Record<Tab, string> = {
  dashboard: "Dashboard",
  entities:  "Entities",
  inbox:     "Inbox",
  letters:   "Letters",
  history:   "History",
  "ai-review": "AI review",
};

const ENTITY_VIEWS: { id: EntityView; label: string; icon: string }[] = [
  { id: "table", label: "Table",     icon: "M3 5h14M3 9h14M3 13h8" },
  { id: "tree",  label: "Structure", icon: "M3 6h3m0 0v8m0 0H3m3 0h3M9 6h3m3-3v3m0 0h-3m3 0v8m0 0h-3m3 0v3" },
  { id: "map",   label: "Map",       icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" },
];

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loadingDigest, setLoadingDigest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [entityView, setEntityView] = useState<EntityView>("table");
  // Entity ID to pre-select when navigating to the Entities tab from another view.
  const [entityFocus, setEntityFocus] = useState<string>("");
  // Tab to return to when the user navigated here from Inbox/Letters.
  const [returnToTab, setReturnToTab] = useState<Tab | null>(null);
  // Simulate date — defaults to today
  const [asOf, setAsOf] = useState<string>(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    api.meta().then(setMeta).catch((e) => setError(String(e)));
  }, []);

  async function fetchDigest() {
    setLoadingDigest(true);
    setError(null);
    try {
      setDigest(await api.digest(asOf || undefined));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingDigest(false);
    }
  }

  function updateFindingStatus(id: string, patch: Partial<Finding>) {
    setDigest((prev) =>
      prev
        ? { ...prev, findings: prev.findings.map((f) => (f.id === id ? { ...f, ...patch } : f)) }
        : prev,
    );
  }

  // GlobalSearch and MapView still pass the old tab names — handle gracefully.
  function navigate(t: string) {
    if (t === "structure") { setTab("entities"); setEntityView("tree"); }
    else if (t === "map")  { setTab("entities"); setEntityView("map");  }
    else                   { setTab(t as Tab); }
  }

  function navigateToEntity(id: string) {
    setReturnToTab(tab);   // remember where we came from
    setEntityFocus(id);
    setTab("entities");
    setEntityView("table");
  }

  return (
    <div className="min-h-full">
      {/* ── Dark institutional header ────────────────────────────────────── */}
      <header className="bg-[#0b1d38] shadow-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-3.5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">
              FGI Subsidiary Governance
            </h1>
            <p className="text-xs text-slate-400">
              Risk &amp; compliance · {meta?.entity_count ?? "—"} entities
              {meta && <> · {meta.as_of}</>}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <GlobalSearch onNavigate={navigate} onNavigateToEntity={navigateToEntity} />
            {/* Date override — simulate running on a different date */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-400 whitespace-nowrap">As of</label>
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="rounded border border-slate-600 bg-white/10 px-2 py-1 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 [color-scheme:dark]"
              />
              {asOf !== new Date().toISOString().slice(0, 10) && (
                <button
                  onClick={() => setAsOf(new Date().toISOString().slice(0, 10))}
                  title="Reset to today"
                  className="text-slate-400 hover:text-slate-200 text-xs leading-none"
                >✕</button>
              )}
            </div>

            {meta && (
              <span className="rounded bg-slate-700/60 px-2.5 py-1 text-xs font-medium text-slate-300">
                LLM: {meta.llm_provider}
              </span>
            )}
            <button
              onClick={fetchDigest}
              disabled={loadingDigest}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
            >
              {loadingDigest ? "Fetching…" : digest ? "Refresh digest" : "Fetch digest"}
            </button>
          </div>
        </div>
        {/* Tab nav */}
        <nav className="mx-auto flex max-w-6xl gap-0.5 px-6">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setReturnToTab(null); }}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
                tab === t
                  ? "border-white text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Dashboard ── */}
        {tab === "dashboard" &&
          (digest ? (
            <div className="space-y-6">
              <SummaryBar digest={digest} />
              <FindingsView findings={digest.findings} onStatusChange={updateFindingStatus} />
            </div>
          ) : (
            <EmptyState onFetch={fetchDigest} onNavigate={navigate} loading={loadingDigest} />
          ))}

        {/* ── Entities (Table / Structure / Map) ── */}
        {tab === "entities" && (
          <div className="space-y-4">
            {/* Sub-view switcher */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 w-fit">
              {ENTITY_VIEWS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setEntityView(v.id)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    entityView === v.id
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={v.icon} />
                  </svg>
                  {v.label}
                </button>
              ))}
            </div>

            {entityView === "table" && (
              <EntitiesView
                focusEntityId={entityFocus}
                onFocusConsumed={() => setEntityFocus("")}
                findings={digest?.findings ?? []}
                returnToTab={returnToTab}
                onReturn={() => { setTab(returnToTab!); setReturnToTab(null); }}
              />
            )}
            {entityView === "tree" && <HierarchyView />}
            {entityView === "map" && (
              <MapView
                onNavigate={navigate}
                onNavigateToEntity={navigateToEntity}
              />
            )}
          </div>
        )}

        {tab === "inbox"     && <InboxView   onEntityClick={navigateToEntity} />}
        {tab === "letters"   && <LettersView onEntityClick={navigateToEntity} />}
        {tab === "history"   && <HistoryView />}
        {tab === "ai-review" && <AiReviewView />}
      </main>
    </div>
  );
}

function EmptyState({
  onFetch,
  onNavigate,
  loading = false,
}: {
  onFetch: () => void;
  onNavigate: (t: string) => void;
  loading?: boolean;
}) {
  return (
    <div className="space-y-6">

      {/* Hero */}
      <div className="rounded border border-slate-200 bg-white px-8 py-8">
        <h2 className="text-xl font-semibold text-slate-900">FGI Subsidiary Governance Monitor</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          A governance surveillance tool for FGI's portfolio of ~100 subsidiaries across 20+ jurisdictions.
          It ingests three data sources — the entity register, the board-update inbox and free-text agent
          letters — runs a set of deterministic risk detectors, then asks an AI model to summarise the
          findings and recommend prioritised actions. Everything is auditable: raw data, detection logic
          and AI reasoning are all visible.
        </p>
        {loading ? (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded border border-blue-200 bg-blue-50 px-4 py-3">
            <svg className="h-4 w-4 animate-spin text-blue-700" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm font-medium text-blue-800">
              Running ingestion → detectors → AI summary…
            </span>
            <span className="text-xs text-blue-600/80">
              Takes ~30s — explore the data below while it runs.
            </span>
          </div>
        ) : (
          <button
            onClick={onFetch}
            className="mt-6 rounded bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-600 transition"
          >
            Run governance digest
          </button>
        )}
      </div>

      {/* How the pipeline works */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">How it works</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              step: "1 — Ingest",
              icon: "M3 7h18M3 12h18M3 17h18",
              body: "The register CSV, board-update inbox JSON and PDF agent letters are parsed and normalised. Entity names in the inbox and letters are fuzzy-matched back to registered entities — mismatches and near-misses are flagged, never silently corrected.",
            },
            {
              step: "2 — Detect",
              icon: "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
              body: "A suite of deterministic rule detectors scans for expired board mandates, overdue annual filings, dissolved entities still showing as active, orphaned parent references, unmatched inbox entries, ownership conflicts and more.",
            },
            {
              step: "3 — Summarise",
              icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m1.636 6.364l.707-.707M12 21v-1m-6.364-1.636l.707-.707M15.536 8.464a5 5 0 11-7.072 7.072",
              body: "Claude reviews all findings and produces a prioritised governance summary: overall risk posture, the highest-priority items requiring action, and recommended next steps — with full traceability back to the raw evidence.",
            },
          ].map(({ step, icon, body }) => (
            <div key={step} className="rounded border border-slate-200 bg-white p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-blue-50">
                  <svg className="h-4 w-4 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                  </svg>
                </span>
                <span className="text-sm font-semibold text-slate-800">{step}</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">{body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* What each tab contains */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">What you can explore now — before running the digest</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { tab: "Entities",   to: "entities",  desc: "Full register of all ~100 subsidiaries. Filter by jurisdiction, status or asset class. Click any row for details." },
            { tab: "Structure",  to: "structure", desc: "Ownership tree visualised as a collapsible hierarchy. Broken parent references are flagged in amber." },
            { tab: "Map",        to: "map",       desc: "World map with entity counts per country. Click a country to see its subsidiaries, then drill into any entity." },
            { tab: "Inbox",      to: "inbox",     desc: "Board-update notifications from corporate service agents. Each entry is fuzzy-matched to the register — unmatched items indicate potential ghost entities." },
            { tab: "Letters",    to: "letters",   desc: "Free-text PDF letters from external agents. Entity names are extracted and matched; conflicts drive reconciliation findings." },
            { tab: "AI Review",  to: "ai-review", desc: "Open-ended advisory sweep: ask Claude to review the full register for anomalies beyond the rule-based detectors." },
          ].map(({ tab, to, desc }) => (
            <button
              key={tab}
              onClick={() => onNavigate(to)}
              className="group flex flex-col rounded border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700 group-hover:text-blue-800">
                {tab}
                <svg className="h-3.5 w-3.5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">{desc}</p>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
