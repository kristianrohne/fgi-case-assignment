import { useEffect, useState } from "react";
import { api } from "../api";
import type { Letter } from "../types";
import { Card, Spinner } from "./ui";

export function LettersView() {
  const [letters, setLetters] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api.letters().then((l) => {
      setLetters(l);
      setLoading(false);
    });
  }, []);

  if (loading) return <Spinner label="Loading letters…" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Free-text letters from external agents. Each "FGI …" mention is extracted and matched
        back to the register; mismatches and unmatched names drive the reconciliation findings
        on the dashboard.
      </p>

      {letters.map((letter) => (
        <Card key={letter.filename} className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <div className="font-semibold text-slate-800">{letter.provider}</div>
              <div className="font-mono text-xs text-slate-400">{letter.filename}</div>
            </div>
            <button
              onClick={() => setOpen(open === letter.filename ? null : letter.filename)}
              className="ml-auto text-sm text-blue-700 hover:underline"
            >
              {open === letter.filename ? "Hide original text" : "Show original text"}
            </button>
          </div>

          {open === letter.filename && (
            <pre className="whitespace-pre-wrap border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              {letter.text}
            </pre>
          )}

          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Entity (as written)</th>
                <th className="px-4 py-2 font-semibold">Topic</th>
                <th className="px-4 py-2 font-semibold">Asserted</th>
                <th className="px-4 py-2 font-semibold">Register match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {letter.claims.map((c, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-800">{c.entity_name_raw}</td>
                  <td className="px-4 py-2 text-slate-500 capitalize">{c.topic}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {[...c.claimed_status_terms, ...c.claimed_dates].join(", ") || "—"}
                  </td>
                  <td className="px-4 py-2">
                    {c.matched ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        {c.matched_entity_id}
                        {c.match_score != null && (
                          <span className="text-emerald-600/70">({Math.round(c.match_score)})</span>
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        unmatched ({Math.round(c.match_score ?? 0)})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}
