import type { Digest } from "../types";
import { Card } from "./ui";

const TILES = [
  { key: "Critical", label: "Critical", accent: "text-red-600", ring: "ring-red-200" },
  { key: "Warning", label: "Warning", accent: "text-amber-600", ring: "ring-amber-200" },
  { key: "Info", label: "Info", accent: "text-slate-600", ring: "ring-slate-200" },
] as const;

export function SummaryBar({ digest }: { digest: Digest }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-3xl font-bold text-slate-900">{digest.counts.total}</div>
          <div className="text-sm text-slate-500">Total findings</div>
        </Card>
        {TILES.map((t) => (
          <Card key={t.key} className={`p-4 ring-1 ${t.ring}`}>
            <div className={`text-3xl font-bold ${t.accent}`}>{digest.counts[t.key]}</div>
            <div className="text-sm text-slate-500">{t.label}</div>
          </Card>
        ))}
      </div>

      {digest.summary && (
        <Card className="p-5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            AI digest summary
          </div>
          <p className="text-slate-700 leading-relaxed">{digest.summary}</p>
        </Card>
      )}
    </div>
  );
}
