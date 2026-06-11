import { useState } from "react";
import { api } from "../api";
import type { ReviewNote } from "../types";
import { Card, Spinner } from "./ui";

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-violet-100 text-violet-700",
  medium: "bg-blue-100 text-blue-700",
  low: "bg-slate-100 text-slate-600",
};

export function AiReviewView() {
  const [notes, setNotes] = useState<ReviewNote[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setNotes(await api.aiReview());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
        <strong>Advisory, not verified.</strong> This asks the LLM to sweep the whole
        register for concerns the deterministic rules might have missed. These are
        <em> suggestions</em> — lower trust than the dashboard findings, shown separately,
        and worth checking by hand. The model may also repeat things the rules already catch.
      </div>

      <button
        onClick={run}
        disabled={loading}
        className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-60"
      >
        {loading ? "Reviewing…" : notes ? "Run AI review again" : "Run AI review"}
      </button>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && <Spinner label="Claude is reviewing the register…" />}

      {notes && !loading && (
        <div className="space-y-3">
          {notes.length === 0 && (
            <p className="py-6 text-center text-slate-400">
              No additional concerns suggested.
            </p>
          )}
          {notes.map((n, i) => (
            <Card key={i} className="border-dashed p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{n.title}</h3>
                {n.confidence && (
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium capitalize ${
                      CONFIDENCE_STYLES[n.confidence] ?? CONFIDENCE_STYLES.low
                    }`}
                  >
                    {n.confidence} confidence
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-600">{n.detail}</p>
              {n.entity_ids.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {n.entity_ids.map((id) => (
                    <span
                      key={id}
                      className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600"
                    >
                      {id}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
