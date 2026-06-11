/**
 * HierarchyView — interactive ownership-tree for FGI subsidiaries.
 *
 * • Nodes are coloured by asset_class
 * • Click a node with children to expand / collapse its subtree
 * • Drag the canvas to pan, scroll wheel to zoom
 * • Hover a node for a full-detail tooltip
 * • Starts with roots + one level of children visible
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { Entity } from "../types";
import { Spinner } from "./ui";

// ── Layout constants ────────────────────────────────────────────────────────
const NW = 152;   // node width  (px in SVG space)
const NH = 60;    // node height
const H_GAP = 22; // min gap between sibling subtrees
const V_GAP = 74; // vertical gap between levels

// ── Colour palette by asset class ──────────────────────────────────────────
type Swatch = { fill: string; stroke: string; title: string; sub: string };

const PALETTE: Record<string, Swatch> = {
  "Real Estate":    { fill: "#d1fae5", stroke: "#059669", title: "#064e3b", sub: "#047857" },
  "Infrastructure": { fill: "#dbeafe", stroke: "#3b82f6", title: "#1e3a8a", sub: "#1d4ed8" },
  "Private Equity": { fill: "#ede9fe", stroke: "#8b5cf6", title: "#3b0764", sub: "#6d28d9" },
  "Equity":         { fill: "#fef3c7", stroke: "#f59e0b", title: "#78350f", sub: "#b45309" },
  "Fixed Income":   { fill: "#fce7f3", stroke: "#ec4899", title: "#831843", sub: "#be185d" },
  "Cash":           { fill: "#f0fdf4", stroke: "#22c55e", title: "#14532d", sub: "#16a34a" },
};
const DEF: Swatch = { fill: "#f8fafc", stroke: "#94a3b8", title: "#1e293b", sub: "#64748b" };
const sw = (ac: string | null | undefined): Swatch => (ac && PALETTE[ac]) ?? DEF;

// ── Tree data structures ────────────────────────────────────────────────────
interface TNode {
  e: Entity;
  children: TNode[];
  x: number;   // centre-x in SVG space
  y: number;   // top-y in SVG space
  sw: number;  // total horizontal space this subtree occupies
}

/** Build a forest (multiple root trees) from a flat entity list. Cycle-safe. */
function buildForest(entities: Entity[]): TNode[] {
  const byId = new Map(entities.map(e => [e.entity_id, e]));
  const childMap = new Map<string, string[]>(); // parent_id → child_ids
  const isChild = new Set<string>();

  for (const e of entities) {
    const pid = e.parent_entity_id;
    if (pid && byId.has(pid)) {
      if (!childMap.has(pid)) childMap.set(pid, []);
      childMap.get(pid)!.push(e.entity_id);
      isChild.add(e.entity_id);
    }
  }

  function build(id: string, seen: Set<string>): TNode | null {
    if (seen.has(id)) return null; // cycle guard
    const e = byId.get(id);
    if (!e) return null;
    const next = new Set(seen);
    next.add(id);
    const children = (childMap.get(id) ?? [])
      .map(cid => build(cid, next))
      .filter((n): n is TNode => n !== null);
    return { e, children, x: 0, y: 0, sw: 0 };
  }

  return entities
    .filter(e => !isChild.has(e.entity_id))
    .map(e => build(e.entity_id, new Set()))
    .filter((n): n is TNode => n !== null);
}

/** Assign x/y positions to every node. Mutates nodes in place. */
function layoutNode(n: TNode, depth: number, left: number, collapsed: Set<string>): void {
  n.y = depth * (NH + V_GAP);
  if (collapsed.has(n.e.entity_id) || n.children.length === 0) {
    n.sw = NW + H_GAP;
    n.x = left + NW / 2;
    return;
  }
  let cur = left;
  for (const child of n.children) {
    layoutNode(child, depth + 1, cur, collapsed);
    cur += child.sw;
  }
  n.sw = cur - left;
  const first = n.children[0];
  const last = n.children[n.children.length - 1];
  n.x = (first.x + last.x) / 2;
}

/** Collect all visible nodes in render order. */
function visibleNodes(n: TNode, col: Set<string>): TNode[] {
  const out: TNode[] = [n];
  if (!col.has(n.e.entity_id))
    for (const c of n.children) out.push(...visibleNodes(c, col));
  return out;
}

/** Collect all visible [parent, child] edge pairs. */
function visibleEdges(n: TNode, col: Set<string>): [TNode, TNode][] {
  if (col.has(n.e.entity_id)) return [];
  const out: [TNode, TNode][] = [];
  for (const c of n.children) {
    out.push([n, c]);
    out.push(...visibleEdges(c, col));
  }
  return out;
}

/** Count all descendants of a node. */
function countDesc(n: TNode): number {
  return n.children.reduce((s, c) => s + 1 + countDesc(c), 0);
}

/** Cubic-bezier path between parent bottom-centre and child top-centre. */
function bezier(p: TNode, c: TNode): string {
  const x1 = p.x, y1 = p.y + NH;
  const x2 = c.x, y2 = c.y;
  const my = (y1 + y2) / 2;
  return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
}

function clip(s: string | null | undefined, n: number): string {
  if (!s) return "—";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// ── Component ──────────────────────────────────────────────────────────────

export function HierarchyView() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [inited, setInited] = useState(false);

  // Pan / zoom
  const [tx, setTx] = useState(40);
  const [ty, setTy] = useState(30);
  const [scale, setScale] = useState(0.85);
  const dragRef = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // Hover tooltip
  const [tip, setTip] = useState<{ e: Entity; mx: number; my: number } | null>(null);

  useEffect(() => {
    api.entities().then(list => {
      setEntities(list);
      setLoading(false);
    });
  }, []);

  // Build the forest (tree structure)
  const forest = useMemo(() => buildForest(entities), [entities]);

  // IDs of all entities that are someone's parent (needed for "Collapse all")
  const allParentIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of entities) if (e.parent_entity_id) s.add(e.parent_entity_id);
    return s;
  }, [entities]);

  // Initialize collapsed state: collapse every node at depth ≥ 1 that has children
  // (i.e. show roots + one level of their direct children, rest collapsed)
  useEffect(() => {
    if (inited || forest.length === 0) return;
    const ids = new Set<string>();
    function walk(n: TNode, depth: number) {
      if (depth >= 1 && n.children.length > 0) {
        ids.add(n.e.entity_id);
        return; // don't recurse into subtree we're collapsing
      }
      for (const c of n.children) walk(c, depth + 1);
    }
    for (const root of forest) walk(root, 0);
    setCollapsed(ids);
    setInited(true);
  }, [forest, inited]);

  // Run layout; return new array ref so dependent memos re-run on collapse change
  const laidOut = useMemo(() => {
    let left = H_GAP;
    for (const root of forest) {
      layoutNode(root, 0, left, collapsed);
      left += root.sw + H_GAP;
    }
    return [...forest];
  }, [forest, collapsed]);

  const nodes = useMemo(() => laidOut.flatMap(r => visibleNodes(r, collapsed)), [laidOut, collapsed]);
  const edges = useMemo(() => laidOut.flatMap(r => visibleEdges(r, collapsed)), [laidOut, collapsed]);

  // Canvas dimensions for the mini-hint text
  const canvasW = laidOut.reduce((s, r) => s + r.sw, 0) + 2 * H_GAP;
  const maxVisDepth = useMemo(() => {
    function d(n: TNode): number {
      if (collapsed.has(n.e.entity_id) || n.children.length === 0) return 0;
      return 1 + Math.max(0, ...n.children.map(d));
    }
    return Math.max(0, ...laidOut.map(d));
  }, [laidOut, collapsed]);
  const canvasH = (maxVisDepth + 1) * (NH + V_GAP) + V_GAP;

  function toggle(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Pan ────────────────────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if ((e.target as Element).closest("[data-node]")) return;
    dragRef.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }
  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    setTx(t => t + e.clientX - lastPos.current.x);
    setTy(t => t + e.clientY - lastPos.current.y);
    lastPos.current = { x: e.clientX, y: e.clientY };
  }
  function stopDrag() { dragRef.current = false; }

  // ── Zoom ───────────────────────────────────────────────────────────────
  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    setScale(s => Math.max(0.12, Math.min(3, s * (e.deltaY > 0 ? 0.9 : 1.1))));
  }

  // ── Reset view ─────────────────────────────────────────────────────────
  function resetView() { setScale(0.85); setTx(40); setTy(30); }

  if (loading) return <Spinner label="Loading entity hierarchy…" />;
  if (entities.length === 0) return <p className="text-center text-slate-400 py-12">No entities loaded.</p>;

  return (
    <div className="space-y-3">

      {/* ── Controls ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setCollapsed(new Set())}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
        >
          Expand all
        </button>
        <button
          onClick={() => setCollapsed(new Set(allParentIds))}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
        >
          Collapse all
        </button>
        <span className="text-xs text-slate-400">
          {nodes.length} / {entities.length} entities · scroll = zoom · drag = pan · click node = expand
        </span>

        {/* Legend */}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {(Object.entries(PALETTE) as [string, Swatch][]).map(([cls, c]) => (
            <span key={cls} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: c.title }}>
              <span className="inline-block h-3 w-3 shrink-0 rounded-sm"
                style={{ background: c.fill, border: `1.5px solid ${c.stroke}` }} />
              {cls}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <span className="inline-block h-3 w-3 shrink-0 rounded-sm bg-slate-100 border border-slate-300" />
            Other
          </span>
        </div>
      </div>

      {/* ── SVG canvas ────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50" style={{ height: 600 }}>
        <svg
          width="100%" height="100%"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          onWheel={onWheel}
          style={{ cursor: "grab", userSelect: "none" }}
        >
          <g transform={`translate(${tx},${ty}) scale(${scale})`}>

            {/* ── Edges ─────────────────────────────────────────────── */}
            {edges.map(([p, c], i) => (
              <path
                key={i}
                d={bezier(p, c)}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            ))}

            {/* ── Nodes ─────────────────────────────────────────────── */}
            {nodes.map(n => {
              const s = sw(n.e.asset_class);
              const hasKids = n.children.length > 0;
              const isCol = collapsed.has(n.e.entity_id);
              const desc = countDesc(n);

              return (
                <g
                  key={n.e.entity_id}
                  data-node="1"
                  transform={`translate(${n.x - NW / 2},${n.y})`}
                  onClick={() => hasKids && toggle(n.e.entity_id)}
                  onMouseEnter={ev => setTip({ e: n.e, mx: ev.clientX, my: ev.clientY })}
                  onMouseMove={ev => setTip(t => t ? { ...t, mx: ev.clientX, my: ev.clientY } : null)}
                  onMouseLeave={() => setTip(null)}
                  style={{ cursor: hasKids ? "pointer" : "default" }}
                >
                  {/* Drop shadow */}
                  <rect x={2} y={3} width={NW} height={NH} rx={9} fill="rgba(0,0,0,0.07)" />
                  {/* Card */}
                  <rect width={NW} height={NH} rx={9}
                    fill={s.fill} stroke={s.stroke} strokeWidth={1.5} />

                  {/* Entity name */}
                  <text x={NW / 2} y={20} textAnchor="middle"
                    fontSize={11} fontWeight="700" fill={s.title}
                    fontFamily="ui-sans-serif,system-ui,sans-serif">
                    {clip(n.e.entity_name, 20)}
                  </text>
                  {/* Entity ID */}
                  <text x={NW / 2} y={34} textAnchor="middle"
                    fontSize={9} fill={s.sub}
                    fontFamily="ui-monospace,SFMono-Regular,monospace">
                    {n.e.entity_id}
                  </text>
                  {/* Jurisdiction */}
                  <text x={NW / 2} y={47} textAnchor="middle"
                    fontSize={9} fill={s.sub} opacity={0.75}
                    fontFamily="ui-sans-serif,system-ui,sans-serif">
                    {clip(n.e.jurisdiction, 24)}
                  </text>

                  {/* Expand / collapse badge (top-right corner) */}
                  {hasKids && (
                    <g transform={`translate(${NW - 22},4)`}>
                      <rect width={18} height={14} rx={4} fill={s.stroke} opacity={0.18} />
                      <text x={9} y={11} textAnchor="middle"
                        fontSize={8.5} fontWeight="700" fill={s.stroke}
                        fontFamily="ui-sans-serif,system-ui,sans-serif">
                        {isCol ? `+${desc}` : "−"}
                      </text>
                    </g>
                  )}

                  {/* Ownership % badge (bottom-left, only if set) */}
                  {n.e.ownership_pct != null && (
                    <text x={6} y={NH - 5} textAnchor="start"
                      fontSize={8} fill={s.sub} opacity={0.7}
                      fontFamily="ui-monospace,SFMono-Regular,monospace">
                      {n.e.ownership_pct}%
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* ── Zoom buttons ──────────────────────────────────────────── */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1">
          {([
            { label: "+", action: () => setScale(s => Math.min(3, s * 1.25)) },
            { label: "−", action: () => setScale(s => Math.max(0.12, s * 0.8)) },
            { label: "⊡", action: resetView },
          ] as const).map(({ label, action }) => (
            <button
              key={label}
              onClick={action}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition"
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Canvas size hint ──────────────────────────────────────── */}
        <div className="absolute bottom-3 left-3 text-[10px] text-slate-400 select-none">
          {Math.round(canvasW)} × {Math.round(canvasH)} pt
          &nbsp;·&nbsp; {Math.round(scale * 100)}%
        </div>
      </div>

      {/* ── Hover tooltip (fixed, outside SVG) ───────────────────────── */}
      {tip && <NodeTooltip entity={tip.e} mx={tip.mx} my={tip.my} />}
    </div>
  );
}

// ── Tooltip ────────────────────────────────────────────────────────────────

function NodeTooltip({ entity: e, mx, my }: { entity: Entity; mx: number; my: number }) {
  const s = sw(e.asset_class);
  // Flip left if near right edge
  const flipX = mx > window.innerWidth - 280;
  const style: React.CSSProperties = {
    position: "fixed",
    top: Math.min(my - 8, window.innerHeight - 260),
    ...(flipX ? { right: window.innerWidth - mx + 12 } : { left: mx + 14 }),
    zIndex: 50,
    maxWidth: 256,
    pointerEvents: "none",
  };

  const rows: [string, string | null | undefined][] = [
    ["Type",        e.entity_type],
    ["Asset class", e.asset_class],
    ["Status",      e.status],
    ["Parent",      e.parent_entity_id],
    ["Ownership",   e.ownership_pct != null ? `${e.ownership_pct}%` : null],
    ["Filing",      e.annual_filing_status],
    ["Filing due",  e.annual_filing_due],
    ["Mandate exp", e.board_mandate_expiry],
    ["Agent",       e.registered_agent],
    ["Board",       e.board_members.length > 0
      ? e.board_members.slice(0, 3).join(", ") + (e.board_members.length > 3 ? ` +${e.board_members.length - 3}` : "")
      : null],
  ];

  return (
    <div style={style}
      className="rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden text-xs">
      {/* Header strip coloured by asset class */}
      <div className="px-3 py-2" style={{ background: s.fill, borderBottom: `1px solid ${s.stroke}` }}>
        <div className="font-semibold" style={{ color: s.title }}>{e.entity_name ?? "—"}</div>
        <div className="font-mono text-[10px] mt-0.5" style={{ color: s.sub }}>{e.entity_id}</div>
        {e.jurisdiction && (
          <div className="text-[10px] mt-0.5" style={{ color: s.sub }}>{e.jurisdiction}</div>
        )}
      </div>
      {/* Detail rows */}
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 px-3 py-2">
        {rows
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-400 whitespace-nowrap py-0.5">{k}</dt>
              <dd className="text-slate-700 truncate py-0.5">{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
