/**
 * HierarchyView — collapsible ownership tree for FGI subsidiaries.
 *
 * Replaces the pan/zoom SVG approach (hard to navigate with 100 nodes) with
 * an indented list — like a file explorer. Colour-coded by asset_class,
 * searchable (matching nodes + their ancestors stay visible), orphan nodes
 * flagged with ⚠ and a dashed-border row.
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Entity } from "../types";
import { Spinner } from "./ui";

// ── Asset-class colour palette ─────────────────────────────────────────────
type Swatch = { dot: string; bg: string; text: string };
const PALETTE: Record<string, Swatch> = {
  "Real Estate":    { dot: "#059669", bg: "#d1fae5", text: "#064e3b" },
  "Infrastructure": { dot: "#3b82f6", bg: "#dbeafe", text: "#1e3a8a" },
  "Private Equity": { dot: "#8b5cf6", bg: "#ede9fe", text: "#4c1d95" },
  "Equity":         { dot: "#f59e0b", bg: "#fef3c7", text: "#78350f" },
  "Fixed Income":   { dot: "#ec4899", bg: "#fce7f3", text: "#831843" },
  "Cash":           { dot: "#22c55e", bg: "#f0fdf4", text: "#14532d" },
};
const DEF: Swatch = { dot: "#94a3b8", bg: "#f1f5f9", text: "#475569" };
const sw = (ac: string | null | undefined): Swatch => (ac && PALETTE[ac]) ?? DEF;

// ── Tree types ─────────────────────────────────────────────────────────────
interface TNode {
  e: Entity;
  children: TNode[];
  suspected: TNode[];   // orphan children fuzzy-matched here
  isOrphan?: boolean;
  brokenParentRef?: string;
}

// ── Fuzzy parent lookup (longest-prefix match) ────────────────────────────
function findLikelyParent(brokenId: string, byId: Map<string, Entity>): Entity | null {
  let best: Entity | null = null;
  let bestLen = 0;
  for (const [id, entity] of byId) {
    if (brokenId.startsWith(id) && id.length > bestLen) {
      best = entity; bestLen = id.length;
    }
  }
  return best;
}

// ── Forest builder ─────────────────────────────────────────────────────────
function buildForest(entities: Entity[]): TNode[] {
  const byId       = new Map(entities.map(e => [e.entity_id, e]));
  const childMap   = new Map<string, string[]>();
  const suspMap    = new Map<string, string[]>();
  const brokenRefs = new Map<string, string>();
  const isChild    = new Set<string>();

  for (const e of entities) {
    const pid = e.parent_entity_id;
    if (!pid) continue;
    if (byId.has(pid)) {
      if (!childMap.has(pid)) childMap.set(pid, []);
      childMap.get(pid)!.push(e.entity_id);
      isChild.add(e.entity_id);
    } else {
      const likely = findLikelyParent(pid, byId);
      if (likely) {
        if (!suspMap.has(likely.entity_id)) suspMap.set(likely.entity_id, []);
        suspMap.get(likely.entity_id)!.push(e.entity_id);
        brokenRefs.set(e.entity_id, pid);
        isChild.add(e.entity_id);
      }
    }
  }

  function build(id: string, seen: Set<string>): TNode | null {
    if (seen.has(id)) return null;
    const e = byId.get(id);
    if (!e) return null;
    const next = new Set(seen); next.add(id);
    const children  = (childMap.get(id) ?? []).map(c => build(c, next)).filter((n): n is TNode => n !== null);
    const suspected = (suspMap.get(id) ?? []).map(c => {
      const node = build(c, next);
      if (node) { node.isOrphan = true; node.brokenParentRef = brokenRefs.get(c); }
      return node;
    }).filter((n): n is TNode => n !== null);
    return { e, children, suspected };
  }

  return entities
    .filter(e => !isChild.has(e.entity_id))
    .map(e => build(e.entity_id, new Set()))
    .filter((n): n is TNode => n !== null);
}

// ── Search helpers ─────────────────────────────────────────────────────────
function nodeMatches(n: TNode, q: string): boolean {
  return (
    (n.e.entity_name ?? "").toLowerCase().includes(q) ||
    n.e.entity_id.toLowerCase().includes(q) ||
    (n.e.jurisdiction ?? "").toLowerCase().includes(q) ||
    (n.e.asset_class ?? "").toLowerCase().includes(q) ||
    (n.e.status ?? "").toLowerCase().includes(q)
  );
}

/** True if this node or any descendant matches the query. */
function subtreeMatches(n: TNode, q: string): boolean {
  if (!q) return true;
  if (nodeMatches(n, q)) return true;
  return [...n.children, ...n.suspected].some(c => subtreeMatches(c, q));
}

function countAll(n: TNode): number {
  return 1 + [...n.children, ...n.suspected].reduce((s, c) => s + countAll(c), 0);
}

// ── Component ──────────────────────────────────────────────────────────────
export function HierarchyView() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading]   = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [inited, setInited]     = useState(false);
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState<{ e: Entity; isOrphan?: boolean; brokenRef?: string } | null>(null);

  useEffect(() => {
    api.entities().then(list => { setEntities(list); setLoading(false); });
  }, []);

  const forest = useMemo(() => buildForest(entities), [entities]);

  const allParentIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of entities) if (e.parent_entity_id) s.add(e.parent_entity_id);
    return s;
  }, [entities]);

  // Start: collapse depth ≥ 1 nodes (show roots + direct children)
  useEffect(() => {
    if (inited || forest.length === 0) return;
    const ids = new Set<string>();
    function walk(n: TNode, depth: number) {
      const all = [...n.children, ...n.suspected];
      if (depth >= 1 && all.length > 0) { ids.add(n.e.entity_id); return; }
      for (const c of all) walk(c, depth + 1);
    }
    for (const root of forest) walk(root, 0);
    setCollapsed(ids);
    setInited(true);
  }, [forest, inited]);

  const q = search.trim().toLowerCase();

  const orphanCount = useMemo(
    () => entities.filter(e => {
      const pid = e.parent_entity_id;
      return pid && !entities.some(x => x.entity_id === pid);
    }).length,
    [entities],
  );

  function toggle(id: string) {
    setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  if (loading) return <Spinner label="Loading entity hierarchy…" />;
  if (entities.length === 0) return <p className="text-center text-slate-400 py-12">No entities.</p>;

  return (
    <div className="space-y-3">

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, ID, jurisdiction, asset class…"
            className="w-72 rounded-lg border border-slate-300 bg-white pl-9 pr-8 py-1.5 text-sm placeholder-slate-400"
          />
          {search && (
            <button onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">
              ✕
            </button>
          )}
        </div>

        <button onClick={() => setCollapsed(new Set())}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
          Expand all
        </button>
        <button onClick={() => setCollapsed(new Set(allParentIds))}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
          Collapse all
        </button>

        {orphanCount > 0 && (
          <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            ⚠ {orphanCount} broken parent ref{orphanCount > 1 ? "s" : ""}
          </span>
        )}

        {/* Legend */}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {(Object.entries(PALETTE) as [string, Swatch][]).map(([cls, c]) => (
            <span key={cls} className="flex items-center gap-1.5 text-xs" style={{ color: c.text }}>
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: c.dot }} />
              {cls}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300" />
            Other
          </span>
        </div>
      </div>

      {/* Tree + detail panel side by side */}
      <div className="flex items-start gap-4">

        {/* Tree list */}
        <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="divide-y divide-slate-50">
            {forest.map(root =>
              subtreeMatches(root, q) ? (
                <TreeNode
                  key={root.e.entity_id}
                  node={root}
                  depth={0}
                  collapsed={collapsed}
                  onToggle={toggle}
                  onSelect={sel => setSelected(sel)}
                  selectedId={selected?.e.entity_id ?? null}
                  q={q}
                />
              ) : null
            )}
          </div>
          {q && forest.every(r => !subtreeMatches(r, q)) && (
            <p className="px-6 py-8 text-center text-sm text-slate-400">
              No entities match <span className="font-medium text-slate-600">"{search}"</span>
            </p>
          )}
        </div>

        {/* Detail panel — appears when a row is clicked */}
        {selected && (
          <EntityPanel
            entity={selected.e}
            isOrphan={selected.isOrphan}
            brokenRef={selected.brokenRef}
            allEntities={entities}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

// ── Tree row ───────────────────────────────────────────────────────────────
function TreeNode({
  node: n, depth, collapsed, onToggle, onSelect, selectedId, q,
}: {
  node: TNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (sel: { e: Entity; isOrphan?: boolean; brokenRef?: string }) => void;
  selectedId: string | null;
  q: string;
}) {
  const all      = [...n.children, ...n.suspected];
  const hasKids  = all.length > 0;
  const isCol    = collapsed.has(n.e.entity_id);
  const swatch   = sw(n.e.asset_class);
  const matches  = q ? nodeMatches(n, q) : false;
  const isActive = selectedId === n.e.entity_id;
  const visible  = all.filter(c => !q || subtreeMatches(c, q));

  return (
    <div>
      {/* Row — click anywhere (except chevron) to open detail panel */}
      <div
        onClick={() => onSelect({ e: n.e, isOrphan: n.isOrphan, brokenRef: n.brokenParentRef })}
        className={`group flex cursor-pointer items-center gap-2 py-2 pr-3 transition-colors
          ${isActive  ? "bg-indigo-100 ring-1 ring-inset ring-indigo-200" :
            matches   ? "bg-indigo-50 hover:bg-indigo-100" :
                        "hover:bg-slate-50"}
          ${n.isOrphan ? "border-l-2 border-amber-300" : "border-l-2 border-transparent"}`}
        style={{ paddingLeft: `${12 + depth * 28}px` }}
      >
        {/* Expand/collapse chevron — stopPropagation so it doesn't select */}
        <span className="w-5 shrink-0 flex items-center justify-center">
          {hasKids ? (
            <button
              onClick={ev => { ev.stopPropagation(); onToggle(n.e.entity_id); }}
              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
            >
              <svg className={`h-3 w-3 transition-transform ${!isCol ? "rotate-90" : ""}`}
                fill="none" viewBox="0 0 12 12" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 3l4 3-4 3" />
              </svg>
            </button>
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-slate-200 mx-auto" />
          )}
        </span>

        {/* Asset-class colour dot */}
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: swatch.dot }} />

        {/* Name */}
        <span className={`font-medium text-sm ${isActive ? "text-indigo-900" : matches ? "text-indigo-800" : "text-slate-800"}`}>
          {highlight(n.e.entity_name ?? "—", q)}
        </span>

        {/* Entity ID */}
        <span className="font-mono text-xs text-slate-400">
          {highlight(n.e.entity_id, q)}
        </span>

        {/* Orphan warning badge */}
        {n.isOrphan && (
          <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            ⚠ {n.brokenParentRef}
          </span>
        )}

        <span className="flex-1" />

        {/* Jurisdiction */}
        {n.e.jurisdiction && (
          <span className="hidden text-xs text-slate-400 sm:block">
            {highlight(n.e.jurisdiction, q)}
          </span>
        )}

        {/* Ownership */}
        {n.e.ownership_pct != null && (
          <span className="text-xs text-slate-400">{n.e.ownership_pct}%</span>
        )}

        {/* Asset class pill */}
        {n.e.asset_class && (
          <span className="hidden rounded-full px-2 py-0.5 text-[10px] font-medium lg:block"
            style={{ background: swatch.bg, color: swatch.text }}>
            {n.e.asset_class}
          </span>
        )}

        <StatusDot status={n.e.status} />

        {isCol && hasKids && (
          <span className="text-xs text-slate-400">+{countAll(n) - 1}</span>
        )}
      </div>

      {/* Children */}
      {!isCol && visible.length > 0 && (
        <div className="relative">
          <div className="absolute top-0 bottom-0 w-px bg-slate-100"
            style={{ left: `${12 + depth * 28 + 14}px` }} />
          {visible.map(child => (
            <TreeNode
              key={child.e.entity_id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
              onSelect={onSelect}
              selectedId={selectedId}
              q={q}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Entity detail panel ────────────────────────────────────────────────────
function EntityPanel({
  entity: e, isOrphan, brokenRef, allEntities, onClose,
}: {
  entity: Entity;
  isOrphan?: boolean;
  brokenRef?: string;
  allEntities: Entity[];
  onClose: () => void;
}) {
  const s = sw(e.asset_class);

  // Resolve parent entity name for display
  const parentEntity = e.parent_entity_id
    ? allEntities.find(x => x.entity_id === e.parent_entity_id) ?? null
    : null;

  // Direct children in the register
  const children = allEntities.filter(x => x.parent_entity_id === e.entity_id);

  return (
    <div className="w-80 shrink-0 sticky top-4 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden text-sm">

      {/* Header — coloured by asset class */}
      <div className="px-4 py-3 flex items-start justify-between gap-2"
        style={{ background: s.bg, borderBottom: `2px solid ${s.dot}` }}>
        <div className="min-w-0">
          <div className="font-bold text-base leading-snug" style={{ color: s.text }}>
            {e.entity_name ?? "—"}
          </div>
          <div className="font-mono text-xs mt-0.5 opacity-70" style={{ color: s.text }}>
            {e.entity_id}
          </div>
          {e.jurisdiction && (
            <div className="text-xs mt-0.5 opacity-60" style={{ color: s.text }}>
              {e.jurisdiction}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-black/10 hover:text-slate-700 transition"
          title="Close"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 16 16" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      {/* Orphan warning — honest about the heuristic */}
      {isOrphan && brokenRef && (
        <div className="border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <div className="font-semibold mb-0.5">⚠ Broken parent reference</div>
          <p>
            Declared parent <span className="font-mono font-semibold">{brokenRef}</span> does not
            exist in the register. This entity is shown here based on an ID prefix match only —
            the connection is <span className="font-semibold">unverified</span> and may be wrong.
            Verify against source documents before relying on this placement.
          </p>
        </div>
      )}

      <div className="overflow-y-auto max-h-[70vh] country-scroll">

        {/* ── Structure ── */}
        <Section title="Structure">
          <Row label="Entity type"  value={e.entity_type} />
          <Row label="Status">
            <StatusDot status={e.status} />
            <span className="ml-1.5">{e.status ?? "—"}</span>
          </Row>
          <Row label="Asset class"  value={e.asset_class} />
          <Row label="Asset"        value={e.asset_description} />
          <Row label="Parent">
            {e.parent_entity_id ? (
              <span className="font-mono text-indigo-700">
                {e.parent_entity_id}
                {parentEntity && (
                  <span className="ml-1 font-sans text-slate-400 text-[10px] not-italic">
                    ({parentEntity.entity_name})
                  </span>
                )}
                {!parentEntity && (
                  <span className="ml-1 text-amber-600 text-[10px]">(not in register)</span>
                )}
              </span>
            ) : (
              <span className="text-slate-400">— root entity</span>
            )}
          </Row>
          <Row label="Ownership"    value={e.ownership_pct != null ? `${e.ownership_pct}%` : null} />
        </Section>

        {/* ── Governance ── */}
        <Section title="Governance">
          <Row label="Mandate expiry" value={e.board_mandate_expiry} />
          <Row label="Board members">
            {e.board_members.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {e.board_members.map(m => (
                  <span key={m}
                    className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-700">
                    {m}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </Row>
        </Section>

        {/* ── Filing ── */}
        <Section title="Filing">
          <Row label="Filing status" value={e.annual_filing_status} />
          <Row label="Filing due"    value={e.annual_filing_due} />
          <Row label="Registered agent" value={e.registered_agent} />
        </Section>

        {/* ── Registration ── */}
        <Section title="Registration">
          <Row label="Incorporated"  value={e.incorporation_date ?? e.incorporation_date_raw} />
          <Row label="Address"       value={e.registered_address} />
        </Section>

        {/* ── Direct children ── */}
        {children.length > 0 && (
          <Section title={`Direct subsidiaries (${children.length})`}>
            <div className="flex flex-col gap-1">
              {children.map(c => (
                <div key={c.entity_id}
                  className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: sw(c.asset_class).dot }} />
                  <span className="font-medium text-slate-800 text-xs truncate">{c.entity_name ?? c.entity_id}</span>
                  <span className="ml-auto font-mono text-[10px] text-slate-400 shrink-0">{c.entity_id}</span>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 px-4 py-3 last:border-b-0">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  label, value, children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  const content = children ?? (value ? <span className="text-slate-700">{value}</span> : <span className="text-slate-300">—</span>);
  return (
    <div className="flex items-start gap-2">
      <span className="w-28 shrink-0 text-xs text-slate-400">{label}</span>
      <div className="flex-1 text-xs">{content}</div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Highlight matching substring in yellow. */
function highlight(text: string, q: string): React.ReactNode {
  if (!q || !text.toLowerCase().includes(q)) return text;
  const idx = text.toLowerCase().indexOf(q);
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-yellow-200 text-yellow-900 px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function StatusDot({ status }: { status: string | null }) {
  if (!status) return null;
  const cls =
    status === "Active"    ? "bg-emerald-500" :
    status === "Dissolved" ? "bg-red-400" :
    status === "Pending"   ? "bg-amber-400" :
                             "bg-slate-300";
  return (
    <span title={status}
      className={`h-2 w-2 shrink-0 rounded-full ${cls}`} />
  );
}
