import { useEffect, useState } from "react";
import { api } from "../api";
import type { DigestRun } from "../types";
import { Card, Spinner } from "./ui";

export function HistoryView() {
  const [runs, setRuns] = useState<DigestRun[]>([]);
  const [loading, setLoading] = useState(true);

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
        time — e.g. between board meetings. (Persisted in the database.)
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs text-slate-400">#{r.id}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{r.as_of}</td>
                  <td className="px-4 py-2 font-semibold text-slate-800">{r.total}</td>
                  <td className="px-4 py-2 text-red-600">{r.critical}</td>
                  <td className="px-4 py-2 text-amber-600">{r.warning}</td>
                  <td className="px-4 py-2 text-slate-500">{r.info}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
