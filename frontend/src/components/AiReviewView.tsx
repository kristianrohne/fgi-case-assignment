import { useState } from "react";
import { api } from "../api";
import type { ReviewNote } from "../types";
import { Card, Spinner } from "./ui";

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-blue-100 text-blue-800",
  medium: "bg-slate-100 text-slate-700",
  low: "bg-slate-100 text-slate-500",
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
      <div className="space-y-2 rounded border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p>
          <strong>Advisory — separate from the Dashboard digest.</strong> The digest's
          findings come from deterministic rules and are the source of truth. This is an
          independent, open-ended sweep where Claude looks for concerns those rules might
          have missed. It is a different action, not a step in the digest.
        </p>
        <p>
          Treat these as <em>leads to check by hand</em>, not facts. The model can repeat
          things the rules already catch, and can get details on individual rows wrong —
          verify against the data before acting on anything here.
        </p>
      </div>

      <button
        onClick={run}
        disabled={loading}
        className="rounded bg-blue-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-60"
      >
        {loading ? "Reviewing…" : notes ? "Run AI review again" : "Run AI review"}
      </button>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
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
