import type { Digest } from "../types";
import { Card } from "./ui";

const TILES = [
  { key: "Critical", label: "Critical", accent: "text-red-600",   border: "border-l-red-500"   },
  { key: "Warning",  label: "Warning",  accent: "text-amber-600", border: "border-l-amber-400"  },
  { key: "Info",     label: "Info",     accent: "text-slate-500", border: "border-l-slate-300"  },
] as const;

/** Labels applied to each paragraph in order (wraps gracefully if there are more). */
const PARA_LABELS = ["Posture", "Priority items", "Actions"];

export function SummaryBar({ digest }: { digest: Digest }) {
  // Split on blank lines so both \n\n and \r\n\r\n work.
  const paragraphs = digest.summary
    ? digest.summary
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <div className="text-2xl font-bold tabular-nums text-slate-900">{digest.counts.total}</div>
          <div className="mt-0.5 text-xs font-medium text-slate-400 uppercase tracking-wide">Total findings</div>
        </Card>
        {TILES.map((t) => (
          <Card key={t.key} className={`p-3 border-l-4 ${t.border}`}>
            <div className={`text-2xl font-bold tabular-nums ${t.accent}`}>{digest.counts[t.key]}</div>
            <div className="mt-0.5 text-xs font-medium text-slate-400 uppercase tracking-wide">{t.label}</div>
          </Card>
        ))}
      </div>

      {paragraphs.length > 0 && (
        <Card className="overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
            <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              AI digest summary
            </span>
            <span className="ml-auto text-[10px] text-slate-300 font-mono">
              {digest.generated_at
                ? new Date(digest.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : ""}
            </span>
          </div>

          {/* Paragraphs */}
          <div className="divide-y divide-slate-50">
            {paragraphs.map((para, i) => (
              <div key={i} className="flex gap-4 px-5 py-4">
                {/* Left label */}
                <div className="w-24 shrink-0 pt-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                    {PARA_LABELS[i] ?? `Part ${i + 1}`}
                  </span>
                </div>
                {/* Paragraph text */}
                <p className="flex-1 text-sm text-slate-700 leading-relaxed">{para}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
