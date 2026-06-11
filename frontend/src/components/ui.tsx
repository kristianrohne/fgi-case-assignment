// Small shared presentational helpers. Tailwind utility classes inline.
import type { ReactNode } from "react";
import type { Severity } from "../types";

const SEVERITY_STYLES: Record<Severity, string> = {
  Critical: "bg-red-100 text-red-800 ring-red-600/20",
  Warning: "bg-amber-100 text-amber-800 ring-amber-600/20",
  Info: "bg-slate-100 text-slate-700 ring-slate-500/20",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${SEVERITY_STYLES[severity]}`}
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

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
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
