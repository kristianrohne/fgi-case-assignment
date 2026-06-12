import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { BoardUpdate } from "../types";
import { Card, MatchBadge, Spinner, Th } from "./ui";

export function InboxView({ onEntityClick }: { onEntityClick?: (id: string) => void }) {
  const [updates, setUpdates] = useState<BoardUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    api.boardUpdates(unmatchedOnly).then((u) => {
      setUpdates(u);
      setLoading(false);
    });
  }, [unmatchedOnly]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return updates;
    return updates.filter(
      (u) =>
        (u.entity_name ?? "").toLowerCase().includes(q) ||
        (u.change_type ?? "").toLowerCase().includes(q) ||
        (u.source ?? "").toLowerCase().includes(q) ||
        (u.matched_entity_id ?? "").toLowerCase().includes(q),
    );
  }, [updates, search]);

  if (loading) return <Spinner label="Loading inbox…" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entity, change type, source…"
            className="w-64 rounded border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-sm placeholder-slate-400"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={unmatchedOnly}
            onChange={(e) => setUnmatchedOnly(e.target.checked)}
          />
          Unmatched only
        </label>
        <span className="ml-auto text-sm text-slate-400">{filtered.length} of {updates.length}</span>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 [&_th]:overflow-visible">
              <tr>
                <Th tip="Date the governance change was reported. Agents use inconsistent formats — the system normalises them automatically." tipAlign="left">Date</Th>
                <Th tip="The entity name exactly as written in the agent's message, before any matching. May differ from the official name in the register.">Entity (as received)</Th>
                <Th tip="The type of governance event: board member appointment or resignation, address change, or mandate renewal.">Change</Th>
                <Th tip="The register entity the system matched this update to, plus a confidence score (0–100). Green = matched with sufficient confidence. Red = no confident match — could be a name variant, a typo, or a genuinely unknown entity.">Match</Th>
                <Th tip="How the information arrived: direct email from a corporate service agent, a scanned physical letter, or a transcribed phone note." tipAlign="right">Source</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((u, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                    {u.date_parsed ?? u.date_raw ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-800">{u.entity_name}</td>
                  <td className="px-3 py-2 text-slate-600">{u.change_type}</td>
                  <td className="px-3 py-2">
                    <MatchBadge
                      matched={u.matched}
                      matchedId={u.matched_entity_id}
                      score={u.match_score}
                      candidates={u.match_candidates ?? []}
                      onEntityClick={onEntityClick}
                    />
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
