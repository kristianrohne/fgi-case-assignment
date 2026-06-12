/**
 * Header-level global search.
 *
 * Lazily fetches entities, findings and inbox updates on the first keystroke
 * (cached for the session), then shows a grouped dropdown. Clicking any
 * result navigates to the owning tab via the `onNavigate` callback.
 */

import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { BoardUpdate, Entity, Finding } from "../types";

type Tab = "dashboard" | "entities" | "map" | "inbox" | "letters" | "history" | "ai-review";

type Hit =
  | { kind: "entity";  tab: "entities";  id: string; label: string; sub: string }
  | { kind: "finding"; tab: "dashboard"; id: string; label: string; sub: string }
  | { kind: "inbox";   tab: "inbox";     id: string; label: string; sub: string };

const KIND_ICON: Record<Hit["kind"], string> = {
  entity:  "🏢",
  finding: "⚠️",
  inbox:   "📥",
};
const KIND_LABEL: Record<Hit["kind"], string> = {
  entity:  "Entity",
  finding: "Finding",
  inbox:   "Inbox",
};

function search(
  q: string,
  entities: Entity[],
  findings: Finding[],
  inbox: BoardUpdate[],
): Hit[] {
  const hits: Hit[] = [];

  for (const e of entities) {
    if (
      (e.entity_name ?? "").toLowerCase().includes(q) ||
      e.entity_id.toLowerCase().includes(q) ||
      (e.jurisdiction ?? "").toLowerCase().includes(q)
    ) {
      hits.push({
        kind: "entity",
        tab: "entities",
        id: e.entity_id,
        label: e.entity_name ?? e.entity_id,
        sub: `${e.entity_id} · ${e.jurisdiction ?? ""}`,
      });
      if (hits.filter((h) => h.kind === "entity").length >= 5) break;
    }
  }

  for (const f of findings) {
    if (
      f.title.toLowerCase().includes(q) ||
      f.detail.toLowerCase().includes(q) ||
      f.entity_ids.some((id) => id.toLowerCase().includes(q))
    ) {
      hits.push({
        kind: "finding",
        tab: "dashboard",
        id: f.id,
        label: f.title,
        sub: `${f.severity} · ${f.category}`,
      });
      if (hits.filter((h) => h.kind === "finding").length >= 5) break;
    }
  }

  for (let i = 0; i < inbox.length; i++) {
    const u = inbox[i];
    if (
      (u.entity_name ?? "").toLowerCase().includes(q) ||
      (u.change_type ?? "").toLowerCase().includes(q) ||
      (u.matched_entity_id ?? "").toLowerCase().includes(q) ||
      (u.source ?? "").toLowerCase().includes(q)
    ) {
      hits.push({
        kind: "inbox",
        tab: "inbox",
        id: `inbox-${i}`,
        label: u.entity_name,
        sub: `${u.change_type} · ${u.date_parsed ?? u.date_raw ?? ""}`,
      });
      if (hits.filter((h) => h.kind === "inbox").length >= 4) break;
    }
  }

  return hits;
}

export function GlobalSearch({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [inbox, setInbox] = useState<BoardUpdate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + K focuses the search field
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);

  async function ensureLoaded() {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const [ents, finds, bups] = await Promise.all([
        api.entities(),
        api.findings(),
        api.boardUpdates(),
      ]);
      setEntities(ents);
      setFindings(finds);
      setInbox(bups);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  const trimmed = q.trim().toLowerCase();
  const hits = trimmed.length >= 2 ? search(trimmed, entities, findings, inbox) : [];

  function pick(hit: Hit) {
    onNavigate(hit.tab);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={ref} className="relative">
      {/* Input */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { ensureLoaded(); setOpen(true); }}
          placeholder="Search everything…"
          className="w-52 rounded border border-slate-600 bg-white/10 pl-9 pr-8 py-1.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        />
        {/* Clear / keyboard hint */}
        {q ? (
          <button
            onClick={() => { setQ(""); inputRef.current?.focus(); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs leading-none"
          >
            ✕
          </button>
        ) : (
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-slate-700 px-1 py-0.5 text-[10px] font-mono text-slate-400 pointer-events-none select-none">
            ⌘K
          </kbd>
        )}
      </div>

      {/* Dropdown */}
      {open && trimmed.length >= 2 && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-80 rounded border border-slate-200 bg-white shadow-md overflow-hidden">
          {loading && (
            <p className="px-4 py-3 text-sm text-slate-400">Loading index…</p>
          )}
          {!loading && hits.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-400">
              No results for <span className="font-medium text-slate-600">"{q}"</span>
            </p>
          )}
          {!loading && hits.length > 0 && (
            <ul className="country-scroll max-h-96 overflow-y-scroll divide-y divide-slate-50">
              {hits.map((hit) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <button
                    onClick={() => pick(hit)}
                    className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-indigo-50 transition-colors"
                  >
                    <span className="mt-0.5 text-sm shrink-0">{KIND_ICON[hit.kind]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">
                        {hit.label}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                        <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold text-slate-500">
                          {KIND_LABEL[hit.kind]}
                        </span>
                        <span className="truncate">{hit.sub}</span>
                      </div>
                    </div>
                    <svg className="h-3.5 w-3.5 shrink-0 text-slate-300 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* Footer hint */}
          {!loading && hits.length > 0 && (
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-1.5 text-[10px] text-slate-400">
              Click a result to jump to its tab · Esc to close
            </div>
          )}
        </div>
      )}
    </div>
  );
}
