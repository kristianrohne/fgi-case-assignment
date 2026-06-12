import { Fragment, useEffect, useState } from "react";
import { api } from "../api";
import type { DigestRun, EntitySnapshot } from "../types";
import { Card, Spinner } from "./ui";

function SnapshotPanel({ snap }: { snap: EntitySnapshot }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 px-4 pb-4 pt-2">
      <SnapshotGroup label="By status" counts={snap.by_status} />
      <SnapshotGroup label="By asset class" counts={snap.by_asset_class} />
      <SnapshotGroup label="By jurisdiction (top 8)" counts={snap.by_jurisdiction} limit={8} />
    </div>
  );
}

function SnapshotGroup({
  label,
  counts,
  limit,
}: {
  label: string;
  counts: Record<string, number>;
  limit?: number;
}) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const rows = limit ? sorted.slice(0, limit) : sorted;
  const total = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <table className="w-full text-xs">
        <tbody>
          {rows.map(([key, n]) => (
            <tr key={key}>
              <td className="py-0.5 text-slate-600 pr-3">{key}</td>
              <td className="py-0.5 text-right font-mono text-slate-800">{n}</td>
              <td className="py-0.5 pl-2 w-20">
                <div className="h-1.5 rounded bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded bg-slate-400"
                    style={{ width: `${Math.round((n / total) * 100)}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
          {limit && sorted.length > limit && (
            <tr>
              <td colSpan={3} className="pt-1 text-slate-400 italic">
                + {sorted.length - limit} more
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function HistoryView() {
  const [runs, setRuns] = useState<DigestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    api.digestRuns().then((r) => {
      setRuns(r);
      setLoading(false);
    });
  }, []);

  if (loading) return <Spinner label="Loading history…" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Every digest run is recorded so the team can see how the risk picture changes over
        time — e.g. between board meetings. Click a row to see a snapshot of the entity
        register at that point in time. (Persisted in the database.)
      </p>

      {runs.length === 0 ? (
        <p className="py-8 text-center text-slate-400">
          No runs yet — fetch a digest on the Dashboard.
        </p>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Run</th>
                <th className="px-4 py-2 font-semibold">When</th>
                <th className="px-4 py-2 font-semibold">As of</th>
                <th className="px-4 py-2 font-semibold">Total</th>
                <th className="px-4 py-2 font-semibold text-red-600">Critical</th>
                <th className="px-4 py-2 font-semibold text-amber-600">Warning</th>
                <th className="px-4 py-2 font-semibold text-slate-500">Info</th>
                <th className="px-4 py-2 font-semibold text-slate-400">Entities</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.map((r) => (
                <Fragment key={r.id}>
                  <tr
                    onClick={() => r.entity_snapshot && setExpanded(expanded === r.id ? null : r.id)}
                    className={`transition ${r.entity_snapshot ? "cursor-pointer" : "cursor-default"} ${
                      expanded === r.id ? "bg-slate-50" : r.entity_snapshot ? "hover:bg-slate-50" : ""
                    }`}
                  >
                    <td className="px-4 py-2 font-mono text-xs text-slate-400">#{r.id}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{r.as_of}</td>
                    <td className="px-4 py-2 font-semibold text-slate-800">{r.total}</td>
                    <td className="px-4 py-2 text-red-600">{r.critical}</td>
                    <td className="px-4 py-2 text-amber-600">{r.warning}</td>
                    <td className="px-4 py-2 text-slate-500">{r.info}</td>
                    <td className="px-4 py-2 text-xs">
                      {r.entity_snapshot ? (
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          {r.entity_snapshot.total}
                          <svg
                            className={`h-3 w-3 text-slate-400 transition-transform ${expanded === r.id ? "rotate-180" : ""}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </span>
                      ) : (
                        <span className="italic text-slate-300">no snapshot</span>
                      )}
                    </td>
                  </tr>
                  {expanded === r.id && r.entity_snapshot && (
                    <tr className="bg-slate-50">
                      <td colSpan={8} className="border-t border-slate-100">
                        <SnapshotPanel snap={r.entity_snapshot} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
