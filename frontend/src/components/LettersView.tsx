import { useEffect, useState } from "react";
import { api } from "../api";
import type { Letter } from "../types";
import { Card, MatchBadge, Spinner, Th } from "./ui";

export function LettersView({ onEntityClick }: { onEntityClick?: (id: string) => void }) {
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
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 [&_th]:overflow-visible">
              <tr>
                <Th tip="The entity name as extracted from the free-text PDF letter. This is the agent's wording — it may be abbreviated, misspelled, or use a trading name rather than the legal registered name." tipAlign="left">Entity (as written)</Th>
                <Th tip="What the letter is about. Mandate = board mandate renewal or expiry. Filing = annual accounts status. Status = operational or legal status of the entity (e.g. dissolved, active).">Topic</Th>
                <Th tip="What the agent claims is true — a status term (e.g. 'overdue', 'on track', 'dissolved') and/or a specific date. This is the agent's version and may conflict with what the register shows, which is flagged as a finding.">Asserted</Th>
                <Th tip="Whether the system could confidently link this claim to a registered entity. The number is the fuzzy-match confidence score (0–100). Green ≥ 80 = matched. Red = score too low to match automatically — e.g. 'unmatched (69)' means the closest candidate scored 69, just below the threshold. Could be a name variant, abbreviation, or an entity not in the register." tipAlign="right" tipWidth={340}>Register match</Th>
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
                    <MatchBadge
                      matched={c.matched}
                      matchedId={c.matched_entity_id}
                      score={c.match_score}
                      candidates={c.match_candidates ?? []}
                      onEntityClick={onEntityClick}
                    />
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
