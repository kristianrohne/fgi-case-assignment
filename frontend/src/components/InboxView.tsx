import { useEffect, useState } from "react";
import { api } from "../api";
import type { BoardUpdate } from "../types";
import { Card, Spinner } from "./ui";

export function InboxView() {
  const [updates, setUpdates] = useState<BoardUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.boardUpdates(unmatchedOnly).then((u) => {
      setUpdates(u);
      setLoading(false);
    });
  }, [unmatchedOnly]);

  if (loading) return <Spinner label="Loading inbox…" />;

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={unmatchedOnly}
          onChange={(e) => setUnmatchedOnly(e.target.checked)}
        />
        Show only unmatched (ghost) entities
      </label>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Entity (as received)</th>
                <th className="px-3 py-2 font-semibold">Change</th>
                <th className="px-3 py-2 font-semibold">Match</th>
                <th className="px-3 py-2 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {updates.map((u, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                    {u.date_parsed ?? u.date_raw ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-800">{u.entity_name}</td>
                  <td className="px-3 py-2 text-slate-600">{u.change_type}</td>
                  <td className="px-3 py-2">
                    {u.matched ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        {u.matched_entity_id}
                        {u.match_score != null && (
                          <span className="text-emerald-600/70">({Math.round(u.match_score)})</span>
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        unmatched
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{u.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
