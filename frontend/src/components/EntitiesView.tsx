import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Entity } from "../types";
import { Card, Spinner, StatusPill } from "./ui";

type SortKey = "entity_id" | "annual_filing_due" | "board_mandate_expiry";

export function EntitiesView() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [jurisdiction, setJurisdiction] = useState("All");
  const [status, setStatus] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("entity_id");

  useEffect(() => {
    api.entities().then((e) => {
      setEntities(e);
      setLoading(false);
    });
  }, []);

  const jurisdictions = useMemo(
    () => ["All", ...Array.from(new Set(entities.map((e) => e.jurisdiction).filter(Boolean))).sort()],
    [entities],
  );
  const statuses = useMemo(
    () => ["All", ...Array.from(new Set(entities.map((e) => e.status).filter(Boolean))).sort()],
    [entities],
  );

  const rows = useMemo(() => {
    const filtered = entities.filter(
      (e) =>
        (jurisdiction === "All" || e.jurisdiction === jurisdiction) &&
        (status === "All" || e.status === status) &&
        (q === "" ||
          (e.entity_name ?? "").toLowerCase().includes(q.toLowerCase()) ||
          e.entity_id.toLowerCase().includes(q.toLowerCase())),
    );
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      return String(av).localeCompare(String(bv));
    });
  }, [entities, jurisdiction, status, q, sortKey]);

  if (loading) return <Spinner label="Loading entities…" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or ID…"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <Select value={jurisdiction} options={jurisdictions} onChange={setJurisdiction} />
        <Select value={status} options={statuses} onChange={setStatus} />
        <Select
          value={sortKey}
          options={["entity_id", "annual_filing_due", "board_mandate_expiry"]}
          onChange={(v) => setSortKey(v as SortKey)}
          label="Sort: "
        />
        <span className="ml-auto text-sm text-slate-500">{rows.length} entities</span>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <Th>ID</Th>
                <Th>Name</Th>
                <Th>Jurisdiction</Th>
                <Th>Status</Th>
                <Th>Filing</Th>
                <Th>Filing due</Th>
                <Th>Mandate expiry</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((e) => (
                <tr key={e.entity_id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{e.entity_id}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">
                    {e.entity_name ?? <span className="text-red-500">(missing)</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{e.jurisdiction}</td>
                  <td className="px-3 py-2"><StatusPill status={e.status} /></td>
                  <td className="px-3 py-2">
                    <FilingPill status={e.annual_filing_status} />
                  </td>
                  <td className="px-3 py-2 text-slate-600">{e.annual_filing_due ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{e.board_mandate_expiry ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function FilingPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-400">—</span>;
  const cls =
    status === "Overdue"
      ? "bg-red-100 text-red-800"
      : status === "Filed"
        ? "bg-emerald-100 text-emerald-800"
        : status === "Pending"
          ? "bg-amber-100 text-amber-800"
          : "bg-slate-100 text-slate-600";
  return <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-semibold">{children}</th>;
}

function Select({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: (string | null)[];
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <label className="text-sm text-slate-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ml-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
