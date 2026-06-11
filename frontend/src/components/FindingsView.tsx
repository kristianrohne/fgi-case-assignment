import { useMemo, useState } from "react";
import type { Finding, Severity } from "../types";
import { Card, SeverityBadge } from "./ui";

const SEVERITIES: Severity[] = ["Critical", "Warning", "Info"];

export function FindingsView({ findings }: { findings: Finding[] }) {
  const [severity, setSeverity] = useState<Severity | "All">("All");
  const [category, setCategory] = useState<string>("All");

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(findings.map((f) => f.category))).sort()],
    [findings],
  );

  const filtered = findings.filter(
    (f) =>
      (severity === "All" || f.severity === severity) &&
      (category === "All" || f.category === category),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={severity}
          options={["All", ...SEVERITIES]}
          onChange={(v) => setSeverity(v as Severity | "All")}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <span className="ml-auto text-sm text-slate-500">{filtered.length} shown</span>
      </div>

      <div className="space-y-3">
        {filtered.map((f) => (
          <Card key={f.id} className="p-4">
            <div className="flex items-start gap-3">
              <SeverityBadge severity={f.severity} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{f.title}</h3>
                  <span className="shrink-0 text-xs text-slate-400">{f.category}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{f.detail}</p>

                {f.entity_ids.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {f.entity_ids.map((id) => (
                      <span
                        key={id}
                        className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600"
                      >
                        {id}
                      </span>
                    ))}
                  </div>
                )}

                {f.recommendation && (
                  <div className="mt-3 rounded-lg bg-indigo-50 p-3 text-sm">
                    <span className="font-semibold text-indigo-700">Recommended action: </span>
                    <span className="text-indigo-900">{f.recommendation}</span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-slate-400">No findings match these filters.</p>
        )}
      </div>
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition ${
            value === opt ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
