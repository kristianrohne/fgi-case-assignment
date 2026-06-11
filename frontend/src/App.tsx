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
import { Spinner } from "./components/ui";
import type { Finding } from "./types";

type Tab = "dashboard" | "entities" | "structure" | "inbox" | "letters" | "history" | "ai-review";

const TABS: Tab[] = ["dashboard", "entities", "structure", "inbox", "letters", "history", "ai-review"];
const TAB_LABELS: Record<Tab, string> = {
  dashboard: "Dashboard",
  entities: "Entities",
  structure: "Structure",
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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">FGI Subsidiary Governance</h1>
            <p className="text-sm text-slate-500">
              Risk &amp; compliance digest across {meta?.entity_count ?? "—"} entities
              {meta && <> · as of {meta.as_of}</>}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <GlobalSearch onNavigate={setTab} />
            {meta && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                LLM: {meta.llm_provider}
              </span>
            )}
            <button
              onClick={fetchDigest}
              disabled={loadingDigest}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {loadingDigest ? "Fetching…" : digest ? "Refresh digest" : "Fetch digest"}
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-6">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
                tab === t
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
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

        {tab === "entities" && <EntitiesView />}
        {tab === "structure" && <HierarchyView />}
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
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
      <h2 className="text-lg font-semibold text-slate-800">Fetch the governance digest</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        Ingests the subsidiary register, the board-update inbox and the agent letters,
        runs the risk detectors, then asks the LLM to summarise and recommend actions.
      </p>
      <button
        onClick={onFetch}
        className="mt-5 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
      >
        Fetch digest
      </button>
    </div>
  );
}
