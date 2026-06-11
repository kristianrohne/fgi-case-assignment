// Thin fetch wrapper. URLs are relative — the Vite dev proxy (and any prod
// reverse proxy) forwards /api to the FastAPI backend.

import type { BoardUpdate, Digest, Entity, Finding, Letter, Meta } from "./types";

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${url}`);
  return res.json() as Promise<T>;
}

async function postJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${url}`);
  return res.json() as Promise<T>;
}

export const api = {
  meta: () => getJSON<Meta>("/api/meta"),
  entities: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return getJSON<Entity[]>(`/api/entities${qs ? `?${qs}` : ""}`);
  },
  findings: () => getJSON<Finding[]>("/api/findings"),
  letters: () => getJSON<Letter[]>("/api/letters"),
  boardUpdates: (unmatchedOnly = false) =>
    getJSON<BoardUpdate[]>(
      `/api/board-updates${unmatchedOnly ? "?unmatched_only=true" : ""}`,
    ),
  // The headline action: full pipeline + LLM summary & recommendations.
  digest: () => postJSON<Digest>("/api/digest"),
};
