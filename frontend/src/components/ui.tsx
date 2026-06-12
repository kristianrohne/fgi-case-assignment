// Small shared presentational helpers. Tailwind utility classes inline.
import { useRef, useState, type ReactNode } from "react";
import type { MatchCandidate, Severity } from "../types";

const SEVERITY_STYLES: Record<Severity, string> = {
  Critical: "bg-red-100 text-red-800 ring-red-600/20",
  Warning: "bg-amber-100 text-amber-800 ring-amber-600/20",
  Info: "bg-slate-100 text-slate-700 ring-slate-500/20",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${SEVERITY_STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-800",
  "In liquidation": "bg-amber-100 text-amber-800",
  Dissolved: "bg-red-100 text-red-800",
  Dormant: "bg-slate-200 text-slate-700",
};

export function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-400">—</span>;
  const cls = STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

const STATUS_STYLES_MAP: Record<string, string> = {
  open: "bg-slate-100 text-slate-600",
  acknowledged: "bg-blue-100 text-blue-700",
  assigned: "bg-violet-100 text-violet-700",
  resolved: "bg-emerald-100 text-emerald-700",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES_MAP[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded border border-slate-200 bg-white ${className}`}>
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      {label}
    </div>
  );
}

// ── Unified match badge with candidate popover ───────────────────────────────
// Used in both Inbox and Letters for matched and unmatched entries.

const MATCH_THRESHOLD = 85;
const UNCERTAINTY_GAP = 8; // if #1 and #2 are within this many points, flag it

export function MatchBadge({
  matched,
  matchedId,
  score,
  candidates,
  onEntityClick,
}: {
  matched: boolean;
  matchedId: string | null;
  score: number | null;
  candidates: MatchCandidate[];
  onEntityClick?: (entityId: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null);

  // Uncertainty: top two candidates are very close
  const uncertain =
    matched &&
    candidates.length >= 2 &&
    candidates[0].score - candidates[1].score <= UNCERTAINTY_GAP;

  function toggle() {
    if (open) { setOpen(false); return; }
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const popWidth = 300;
    const popHeight = 280; // conservative estimate for 5 candidates

    // Horizontal: anchor to right edge of button when near right viewport edge
    const spaceRight = window.innerWidth - r.left;
    const left = spaceRight >= popWidth + 12
      ? r.left + window.scrollX
      : r.right + window.scrollX - popWidth;

    // Vertical: open above button when not enough room below
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow >= popHeight + 8
      ? r.bottom + window.scrollY + 6
      : r.top + window.scrollY - popHeight - 6;

    setPopPos({ top: Math.max(8, top), left: Math.max(8, left) });
    setOpen(true);
  }

  return (
    <>
      <button
        ref={ref}
        onClick={toggle}
        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition ${
          matched
            ? open
              ? "bg-emerald-200 text-emerald-900"
              : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
            : open
              ? "bg-red-200 text-red-900"
              : "bg-red-100 text-red-800 hover:bg-red-200"
        }`}
      >
        {matched ? matchedId : "unmatched"}
        {score != null && (
          <span className="opacity-60">({Math.round(score)})</span>
        )}
        {uncertain && (
          <span title="Two candidates scored very similarly — match may be ambiguous">
            <svg className="h-3 w-3 text-amber-500" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm7-3.5a1 1 0 112 0v4a1 1 0 11-2 0v-4zm1 7a1 1 0 100 2 1 1 0 000-2z"/>
            </svg>
          </span>
        )}
        <svg className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M4 6l4 4 4-4"/>
        </svg>
      </button>

      {open && popPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 rounded border border-slate-200 bg-white shadow-lg overflow-hidden"
            style={{ top: popPos.top, left: popPos.left, width: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {matched ? "Match candidates" : "No match found — top candidates"}
              </span>
              <span className="text-[10px] text-slate-400">threshold: {MATCH_THRESHOLD}</span>
            </div>

            {uncertain && (
              <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <svg className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm7-3.5a1 1 0 112 0v4a1 1 0 11-2 0v-4zm1 7a1 1 0 100 2 1 1 0 000-2z"/>
                </svg>
                Top two candidates are within {Math.round(candidates[0].score - candidates[1].score)} points — verify manually.
              </div>
            )}

            {candidates.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-400">No candidates found.</p>
            ) : (
              <ul className="divide-y divide-slate-50 [&>li:last-child]:rounded-b">
                {candidates.map((c, i) => {
                  const isWinner = matched && i === 0;
                  const pct = Math.round(c.score);
                  const clickable = !!onEntityClick;
                  return (
                    <li key={c.entity_id} className={`${isWinner ? "bg-emerald-50/60" : ""}`}>
                      <div
                        role={clickable ? "button" : undefined}
                        tabIndex={clickable ? 0 : undefined}
                        onClick={clickable ? () => { setOpen(false); onEntityClick(c.entity_id); } : undefined}
                        onKeyDown={clickable ? (e) => { if (e.key === "Enter") { setOpen(false); onEntityClick(c.entity_id); } } : undefined}
                        className={`px-3 py-2.5 ${clickable ? "cursor-pointer hover:bg-blue-50 transition-colors" : ""}`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="font-mono text-xs text-slate-400 shrink-0 w-14">{c.entity_id}</span>
                          <span className={`flex-1 truncate text-xs font-medium ${isWinner ? "text-emerald-800" : "text-slate-700"}`}>
                            {c.entity_name}
                          </span>
                          {clickable && (
                            <span className="shrink-0 text-slate-300 group-hover:text-blue-400">
                              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 8h10M9 4l4 4-4 4"/>
                              </svg>
                            </span>
                          )}
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                            c.score >= MATCH_THRESHOLD ? "bg-emerald-100 text-emerald-700"
                            : c.score >= 75 ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-500"
                          }`}>
                            {pct}
                          </span>
                        </div>
                        {/* Score bar */}
                        <div className="h-1 w-full rounded-full bg-slate-100">
                          <div
                            className={`h-1 rounded-full transition-all ${
                              c.score >= MATCH_THRESHOLD ? "bg-emerald-400"
                              : c.score >= 75 ? "bg-amber-400"
                              : "bg-slate-300"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {onEntityClick && candidates.length > 0 && (
              <div className="border-t border-slate-100 bg-slate-50 px-3 py-1.5">
                <span className="text-[10px] text-slate-400">Click a row to view entity details</span>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ── Shared table header with optional tooltip ─────────────────────────────────

export function Th({
  children,
  tip,
  tipAlign = "center",
  tipWidth,
}: {
  children?: ReactNode;
  tip?: string;
  tipAlign?: "left" | "center" | "right";
  tipWidth?: number;
}) {
  return (
    <th className="px-3 py-2 font-semibold">
      <span className="inline-flex items-center gap-1">
        {children}
        {tip && <InfoTip text={tip} align={tipAlign} width={tipWidth} />}
      </span>
    </th>
  );
}

export function InfoTip({
  text,
  align = "center",
  width = 256,
}: {
  text: string;
  align?: "left" | "center" | "right";
  width?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function show() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const tipTop = r.bottom + window.scrollY + 8;
    let tipLeft: number;
    if (align === "left")       tipLeft = r.left + window.scrollX;
    else if (align === "right") tipLeft = r.right + window.scrollX - width;
    else                        tipLeft = r.left + window.scrollX - width / 2 + r.width / 2;
    // Clamp so tooltip never goes off-screen
    tipLeft = Math.max(8, Math.min(tipLeft, window.innerWidth - width - 8));
    setPos({ top: tipTop, left: tipLeft });
  }

  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
    >
      <svg
        className={`h-3.5 w-3.5 cursor-default transition ${pos ? "text-slate-500" : "text-slate-300 hover:text-slate-500"}`}
        viewBox="0 0 16 16" fill="currentColor"
      >
        <path fillRule="evenodd" clipRule="evenodd"
          d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm8-2.5a.75.75 0 000 1.5h.007a.75.75 0 000-1.5H8zm-.75 3a.75.75 0 01.75-.75h.007a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0V8.5H7.25a.75.75 0 01-.75-.75z"
        />
      </svg>
      {pos && (
        <span
          className="pointer-events-none fixed z-50 rounded border border-slate-200 bg-white px-2.5 py-2 text-xs font-normal normal-case leading-snug text-slate-600 shadow-lg"
          style={{ top: pos.top, left: pos.left, width }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
