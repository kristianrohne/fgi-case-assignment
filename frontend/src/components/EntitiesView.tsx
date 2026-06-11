import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Entity } from "../types";
import { Card, Spinner, StatusPill } from "./ui";

type SortKey = "entity_id" | "entity_name" | "annual_filing_due" | "board_mandate_expiry" | "ownership_pct";

export function EntitiesView() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [jurisdiction, setJurisdiction] = useState("All");
  const [status, setStatus] = useState("All");
  const [assetClass, setAssetClass] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("entity_id");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
  const assetClasses = useMemo(
    () => ["All", ...Array.from(new Set(entities.map((e) => e.asset_class).filter(Boolean))).sort()],
    [entities],
  );

  const rows = useMemo(() => {
    const filtered = entities.filter(
      (e) =>
        (jurisdiction === "All" || e.jurisdiction === jurisdiction) &&
        (status === "All" || e.status === status) &&
        (assetClass === "All" || e.asset_class === assetClass) &&
        (q === "" ||
          (e.entity_name ?? "").toLowerCase().includes(q.toLowerCase()) ||
          e.entity_id.toLowerCase().includes(q.toLowerCase()) ||
          (e.parent_entity_id ?? "").toLowerCase().includes(q.toLowerCase()) ||
          (e.registered_agent ?? "").toLowerCase().includes(q.toLowerCase())),
    );
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (sortKey === "ownership_pct") return (Number(bv) || 0) - (Number(av) || 0);
      return String(av).localeCompare(String(bv));
    });
  }, [entities, jurisdiction, status, assetClass, q, sortKey]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) return <Spinner label="Loading entities…" />;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, ID, parent, agent…"
            className="w-60 rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-sm placeholder-slate-400"
          />
          {q && (
            <button onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">
              ✕
            </button>
          )}
        </div>
        <Select value={jurisdiction} options={jurisdictions} onChange={setJurisdiction} label="Jurisdiction:" />
        <Select value={status} options={statuses} onChange={setStatus} label="Status:" />
        <Select value={assetClass} options={assetClasses} onChange={setAssetClass} label="Asset class:" />
        <Select
          value={sortKey}
          options={["entity_id", "entity_name", "annual_filing_due", "board_mandate_expiry", "ownership_pct"]}
          onChange={(v) => setSortKey(v as SortKey)}
          label="Sort:"
        />
        <span className="ml-auto text-sm text-slate-400">{rows.length} of {entities.length} entities</span>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <Th />
                <Th>ID</Th>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Jurisdiction</Th>
                <Th>Parent · %</Th>
                <Th>Status</Th>
                <Th>Filing</Th>
                <Th>Filing due</Th>
                <Th>Mandate expiry</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((e) => {
                const isOpen = expanded.has(e.entity_id);
                return (
                  <>
                    <tr
                      key={e.entity_id}
                      onClick={() => toggleExpand(e.entity_id)}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                      title="Click to expand details"
                    >
                      {/* Chevron */}
                      <td className="w-6 pl-3 pr-0 py-2 text-slate-400">
                        <svg className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
                          fill="none" viewBox="0 0 16 16" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4l4 4-4 4" />
                        </svg>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">
                        {e.entity_id}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800 max-w-[200px] truncate">
                        {e.entity_name ?? <span className="text-red-500">(missing)</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">
                        {e.entity_type ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{e.jurisdiction}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {e.parent_entity_id ? (
                          <button
                            title="Filter by this parent"
                            onClick={(ev) => { ev.stopPropagation(); setQ(e.parent_entity_id!); }}
                            className="font-mono text-xs text-indigo-700 bg-indigo-50 rounded px-1.5 py-0.5 hover:bg-indigo-100 hover:text-indigo-900 transition-colors cursor-pointer"
                          >
                            {e.parent_entity_id}
                            {e.ownership_pct != null && (
                              <span className="ml-1 text-indigo-400">· {e.ownership_pct}%</span>
                            )}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-300">— root</span>
                        )}
                      </td>
                      <td className="px-3 py-2"><StatusPill status={e.status} /></td>
                      <td className="px-3 py-2"><FilingPill status={e.annual_filing_status} /></td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{e.annual_filing_due ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{e.board_mandate_expiry ?? "—"}</td>
                    </tr>

                    {/* Expanded detail row */}
                    {isOpen && (
                      <tr key={`${e.entity_id}-detail`} className="bg-slate-50">
                        <td />
                        <td colSpan={9} className="px-3 pb-4 pt-2">
                          <EntityDetail entity={e} onFilterByParent={(id) => { setQ(id); setExpanded(new Set()); }} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/** Expanded detail card shown when a row is clicked. */
function EntityDetail({ entity: e, onFilterByParent }: { entity: Entity; onFilterByParent: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* Ownership */}
      <DetailSection title="Structure">
        <DL>
          <DT>Parent entity</DT>
          <DD>
            {e.parent_entity_id ? (
              <button
                onClick={() => onFilterByParent(e.parent_entity_id!)}
                title="Filter by this parent"
                className="font-mono text-indigo-700 hover:underline"
              >
                {e.parent_entity_id}
              </button>
            ) : "—"}
          </DD>
          <DT>Ownership</DT>
          <DD>{e.ownership_pct != null ? `${e.ownership_pct}%` : "—"}</DD>
          <DT>Entity type</DT>
          <DD>{e.entity_type ?? "—"}</DD>
          <DT>Asset class</DT>
          <DD>{e.asset_class ?? "—"}</DD>
          <DT>Asset description</DT>
          <DD>{e.asset_description ?? "—"}</DD>
        </DL>
      </DetailSection>

      {/* Governance */}
      <DetailSection title="Governance">
        <DL>
          <DT>Mandate expiry</DT>
          <DD>{e.board_mandate_expiry ?? "—"}</DD>
          <DT>Board members</DT>
          <DD>
            {e.board_members.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {e.board_members.map((m) => (
                  <span key={m}
                    className="rounded bg-white border border-slate-200 px-1.5 py-0.5 text-xs text-slate-700">
                    {m}
                  </span>
                ))}
              </div>
            ) : (
              "—"
            )}
          </DD>
        </DL>
      </DetailSection>

      {/* Registration */}
      <DetailSection title="Registration">
        <DL>
          <DT>Incorporated</DT>
          <DD>{e.incorporation_date ?? e.incorporation_date_raw ?? "—"}</DD>
          <DT>Jurisdiction</DT>
          <DD>{e.jurisdiction ?? "—"}</DD>
          <DT>Registered address</DT>
          <DD>{e.registered_address ?? "—"}</DD>
          <DT>Registered agent</DT>
          <DD>{e.registered_agent ?? "—"}</DD>
        </DL>
      </DetailSection>
    </div>
  );
}

// ── Small layout helpers ──────────────────────────────────────────────────────

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      {children}
    </div>
  );
}

function DL({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">{children}</dl>;
}

function DT({ children }: { children: React.ReactNode }) {
  return <dt className="text-xs text-slate-400 self-start pt-0.5">{children}</dt>;
}

function DD({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <dd className={`text-xs text-slate-700 ${mono ? "font-mono" : ""}`}>
      {children}
    </dd>
  );
}

// ── Shared table helpers ──────────────────────────────────────────────────────

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

function Th({ children }: { children?: React.ReactNode }) {
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
    <label className="flex items-center gap-1 text-sm text-slate-500">
      {label && <span className="font-medium text-slate-400">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
