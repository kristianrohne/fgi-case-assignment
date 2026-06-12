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
import { Spinner } from "./components/ui";
import type { Finding } from "./types";

type Tab = "dashboard" | "entities" | "structure" | "map" | "inbox" | "letters" | "history" | "ai-review";

const TABS: Tab[] = ["dashboard", "entities", "structure", "map", "inbox", "letters", "history", "ai-review"];
const TAB_LABELS: Record<Tab, string> = {
  dashboard: "Dashboard",
  entities: "Entities",
  structure: "Structure",
  map: "Map",
  inbox: "Inbox",
  letters: "Letters",
  history: "History",
  "ai-review": "AI review",
};

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loadingDigest, setLoadingDigest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  // Entity ID to pre-select when navigating to the Entities tab from another view.
  const [entityFocus, setEntityFocus] = useState<string>("");

  useEffect(() => {
    api.meta().then(setMeta).catch((e) => setError(String(e)));
  }, []);

  async function fetchDigest() {
    setLoadingDigest(true);
    setError(null);
    try {
      setDigest(await api.digest());
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
            <GlobalSearch onNavigate={setTab} />
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
        {/* Tab nav — sits on the dark header */}
        <nav className="mx-auto flex max-w-6xl gap-0.5 px-6">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
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

        {tab === "dashboard" &&
          (loadingDigest ? (
            <Spinner label="Running ingestion → detectors → AI summary…" />
          ) : digest ? (
            <div className="space-y-6">
              <SummaryBar digest={digest} />
              <FindingsView findings={digest.findings} onStatusChange={updateFindingStatus} />
            </div>
          ) : (
            <EmptyState onFetch={fetchDigest} />
          ))}

        {tab === "entities" && <EntitiesView focusEntityId={entityFocus} onFocusConsumed={() => setEntityFocus("")} />}
        {tab === "structure" && <HierarchyView />}
        {tab === "map" && (
          <MapView
            onNavigate={setTab}
            onNavigateToEntity={(id) => { setEntityFocus(id); setTab("entities"); }}
          />
        )}
        {tab === "inbox" && <InboxView />}
        {tab === "letters" && <LettersView />}
        {tab === "history" && <HistoryView />}
        {tab === "ai-review" && <AiReviewView />}
      </main>
    </div>
  );
}

function EmptyState({ onFetch }: { onFetch: () => void }) {
  return (
    <div className="rounded border border-dashed border-slate-300 bg-white p-12 text-center">
      <h2 className="text-base font-semibold text-slate-800">Fetch the governance digest</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        Ingests the subsidiary register, the board-update inbox and the agent letters,
        runs the risk detectors, then asks the LLM to summarise and recommend actions.
      </p>
      <button
        onClick={onFetch}
        className="mt-5 rounded bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-600"
      >
        Fetch digest
      </button>
    </div>
  );
}
