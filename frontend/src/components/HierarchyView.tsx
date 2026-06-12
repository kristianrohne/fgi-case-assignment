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
  "Real Estate":      { dot: "#059669", bg: "#d1fae5", text: "#064e3b" },
  "Renewable Energy": { dot: "#0ea5e9", bg: "#e0f2fe", text: "#0c4a6e" },
  "Holding":          { dot: "#6366f1", bg: "#ede9fe", text: "#3730a3" },
  "Treasury":         { dot: "#f59e0b", bg: "#fef3c7", text: "#78350f" },
};
const DEF: Swatch = { dot: "#94a3b8", bg: "#f1f5f9", text: "#475569" };
const sw = (ac: string | null | undefined): Swatch => (ac && PALETTE[ac]) ?? DEF;

// ── Tree types ─────────────────────────────────────────────────────────────
interface TNode {
  e: Entity;
  children: TNode[];
  isOrphan?: boolean;      // parent_entity_id declared but not found in register
  brokenParentRef?: string;
}

// ── Forest builder ─────────────────────────────────────────────────────────
function buildForest(entities: Entity[]): TNode[] {
  const byId     = new Map(entities.map(e => [e.entity_id, e]));
  const childMap = new Map<string, string[]>();
  const isChild  = new Set<string>();

  for (const e of entities) {
    const pid = e.parent_entity_id;
    if (!pid) continue;
    if (byId.has(pid)) {
      // Confirmed parent — add to child map
      if (!childMap.has(pid)) childMap.set(pid, []);
      childMap.get(pid)!.push(e.entity_id);
      isChild.add(e.entity_id);
    }
    // Broken reference → entity is NOT added to isChild,
    // so it becomes its own root node and gets the orphan marker below.
  }

  function build(id: string, seen: Set<string>): TNode | null {
    if (seen.has(id)) return null; // cycle guard
    const e = byId.get(id);
    if (!e) return null;
    const next = new Set(seen); next.add(id);
    const children = (childMap.get(id) ?? [])
      .map(c => build(c, next))
      .filter((n): n is TNode => n !== null);
    return { e, children };
  }

  return entities
    .filter(e => !isChild.has(e.entity_id))
    .map(e => {
      const node = build(e.entity_id, new Set());
      if (!node) return null;
      // Mark orphans: has a declared parent that doesn't exist in register
      if (e.parent_entity_id && !byId.has(e.parent_entity_id)) {
        node.isOrphan = true;
        node.brokenParentRef = e.parent_entity_id;
      }
      return node;
    })
    .filter((n): n is TNode => n !== null);
}

// ── Search helpers ─────────────────────────────────────────────────────────
function nodeMatches(n: TNode, q: string, ac: string): boolean {
  const textOk = !q || (
    (n.e.entity_name ?? "").toLowerCase().includes(q) ||
    n.e.entity_id.toLowerCase().includes(q) ||
    (n.e.jurisdiction ?? "").toLowerCase().includes(q) ||
    (n.e.asset_class ?? "").toLowerCase().includes(q) ||
    (n.e.status ?? "").toLowerCase().includes(q)
  );
  const classOk = !ac || n.e.asset_class === ac;
  return textOk && classOk;
}

/** True if this node or any descendant matches both query and asset-class filter. */
function subtreeMatches(n: TNode, q: string, ac: string): boolean {
  if (nodeMatches(n, q, ac)) return true;
  return n.children.some(c => subtreeMatches(c, q, ac));
}

function countAll(n: TNode): number {
  return 1 + n.children.reduce((s, c) => s + countAll(c), 0);
}

// ── Component ──────────────────────────────────────────────────────────────
export function HierarchyView() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading]   = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [inited, setInited]     = useState(false);
  const [search, setSearch]       = useState("");
  const [assetClass, setAssetClass] = useState("");
  const [selected, setSelected]   = useState<{ e: Entity; isOrphan?: boolean; brokenRef?: string } | null>(null);

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
      if (depth >= 1 && n.children.length > 0) { ids.add(n.e.entity_id); return; }
      for (const c of n.children) walk(c, depth + 1);
    }
    for (const root of forest) walk(root, 0);
    setCollapsed(ids);
    setInited(true);
  }, [forest, inited]);

  const q = search.trim().toLowerCase();

  const assetClasses = useMemo(() =>
    Array.from(new Set(entities.map(e => e.asset_class).filter(Boolean) as string[])).sort(),
    [entities],
  );

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

        {/* Asset class filter */}
        <select
          value={assetClass}
          onChange={e => setAssetClass(e.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
        >
          <option value="">All asset classes</option>
          {assetClasses.map(cls => (
            <option key={cls} value={cls}>{cls}</option>
          ))}
        </select>

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

      </div>

      {/* Tree + detail panel side by side */}
      <div className="flex items-start gap-4">

        {/* Tree list */}
        <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="divide-y divide-slate-50">
            {forest.map(root =>
              subtreeMatches(root, q, assetClass) ? (
                <TreeNode
                  key={root.e.entity_id}
                  node={root}
                  depth={0}
                  collapsed={collapsed}
                  onToggle={toggle}
                  onSelect={sel => setSelected(sel)}
                  selectedId={selected?.e.entity_id ?? null}
                  q={q}
                  ac={assetClass}
                />
              ) : null
            )}
          </div>
          {(q || assetClass) && forest.every(r => !subtreeMatches(r, q, assetClass)) && (
            <p className="px-6 py-8 text-center text-sm text-slate-400">
              No entities match the current filters
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
  node: n, depth, collapsed, onToggle, onSelect, selectedId, q, ac,
}: {
  node: TNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (sel: { e: Entity; isOrphan?: boolean; brokenRef?: string }) => void;
  selectedId: string | null;
  q: string;
  ac: string;
}) {
  const hasKids  = n.children.length > 0;
  const isCol    = collapsed.has(n.e.entity_id);
  const swatch   = sw(n.e.asset_class);
  const matches  = nodeMatches(n, q, ac);
  const isActive = selectedId === n.e.entity_id;
  const visible  = n.children.filter(c => subtreeMatches(c, q, ac));

  return (
    <div>
      {/* Row — click anywhere (except chevron) to open detail panel */}
      <div
        onClick={() => onSelect({ e: n.e, isOrphan: n.isOrphan, brokenRef: n.brokenParentRef })}
        className={`group flex cursor-pointer items-center gap-2 py-2 pr-3 transition-colors
          ${isActive  ? "bg-slate-100" : matches ? "bg-slate-50 hover:bg-slate-100" : "hover:bg-slate-50"}
          ${n.isOrphan ? "border-l-2 border-amber-300" : isActive ? "border-l-2 border-slate-400" : "border-l-2 border-transparent"}`}
        style={{ paddingLeft: `${12 + depth * 28}px` }}
      >
        {/* Expand/collapse chevron — leaf nodes get an empty spacer instead */}
        <span className="w-5 shrink-0 flex items-center justify-center">
          {hasKids && (
            <button
              onClick={ev => { ev.stopPropagation(); onToggle(n.e.entity_id); }}
              className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
            >
              <svg className={`h-3 w-3 transition-transform ${!isCol ? "rotate-90" : ""}`}
                fill="none" viewBox="0 0 12 12" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 3l4 3-4 3" />
              </svg>
            </button>
          )}
        </span>


        {/* Name */}
        <span className={`font-medium text-sm ${isActive ? "text-slate-900" : "text-slate-800"}`}>
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

        <StatusPill status={n.e.status} />

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
              ac={ac}
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
            exist in the register. This entity is shown as an independent tree rather than
            placed under a guessed parent. Verify the correct parent against source documents.
          </p>
        </div>
      )}

      <div className="overflow-y-auto max-h-[70vh] country-scroll">

        {/* ── Structure ── */}
        <Section title="Structure">
          <Row label="Entity type"  value={e.entity_type} />
          <Row label="Status">
            <StatusPill status={e.status} />
          </Row>
          <Row label="Asset class"  value={e.asset_class} />
          <Row label="Asset"        value={e.asset_description} />
          <Row label="Parent">
            {e.parent_entity_id ? (
              <span className="font-mono text-slate-500">
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

function StatusPill({ status }: { status: string | null }) {
  if (!status) return null;
  const cls =
    status === "Active"         ? "bg-emerald-100 text-emerald-800" :
    status === "Dissolved"      ? "bg-red-100 text-red-700" :
    status === "In liquidation" ? "bg-amber-100 text-amber-700" :
    status === "Dormant"        ? "bg-slate-100 text-slate-600" :
                                  "bg-slate-100 text-slate-500";
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {status}
    </span>
  );
}
