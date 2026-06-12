// Mirrors backend/app/models.py. Kept hand-written and small — the API surface
// is stable enough that a codegen step would be overkill for this project.

export type Severity = "Critical" | "Warning" | "Info";

export interface Entity {
  entity_id: string;
  entity_name: string | null;
  entity_type: string | null;
  jurisdiction: string | null;
  incorporation_date: string | null;
  incorporation_date_raw: string | null;
  parent_entity_id: string | null;
  ownership_pct: number | null;
  registered_address: string | null;
  board_members: string[];
  board_mandate_expiry: string | null;
  annual_filing_due: string | null;
  annual_filing_status: string | null;
  registered_agent: string | null;
  status: string | null;
  asset_class: string | null;
  asset_description: string | null;
}

export interface MatchCandidate {
  entity_id: string;
  entity_name: string;
  score: number;
}

export interface BoardUpdate {
  date_raw: string | null;
  date_parsed: string | null;
  entity_name: string | null;
  change_type: string | null;
  details: string | null;
  source: string | null;
  matched_entity_id: string | null;
  match_score: number | null;
  matched: boolean;
  match_candidates: MatchCandidate[];
}

export interface LetterClaim {
  letter_filename: string;
  provider: string | null;
  topic: string | null;
  entity_name_raw: string;
  context: string;
  claimed_dates: string[];
  claimed_status_terms: string[];
  matched_entity_id: string | null;
  match_score: number | null;
  matched: boolean;
  match_candidates: MatchCandidate[];
}

export interface Letter {
  filename: string;
  provider: string | null;
  text: string;
  claims: LetterClaim[];
}

export type FindingStatus = "open" | "acknowledged" | "assigned" | "resolved";

export interface Finding {
  id: string;
  category: string;
  severity: Severity;
  title: string;
  detail: string;
  entity_ids: string[];
  evidence: Record<string, unknown>;
  recommendation: string | null;
  status: FindingStatus;
  assignee: string | null;
  note: string | null;
}

export interface ReviewNote {
  title: string;
  detail: string;
  entity_ids: string[];
  confidence: string | null;
}

export interface EntitySnapshot {
  total: number;
  by_jurisdiction: Record<string, number>;
  by_status: Record<string, number>;
  by_asset_class: Record<string, number>;
}

export interface DigestRun {
  id: number;
  created_at: string;
  as_of: string;
  total: number;
  critical: number;
  warning: number;
  info: number;
  summary: string | null;
  entity_snapshot: EntitySnapshot | null;
}

export interface DigestCounts {
  total: number;
  Critical: number;
  Warning: number;
  Info: number;
  by_category: Record<string, number>;
}

export interface Digest {
  as_of: string;
  generated_at: string;
  summary: string | null;
  counts: DigestCounts;
  findings: Finding[];
}

export interface Meta {
  as_of: string;
  llm_provider: string;
  entity_count: number;
}
