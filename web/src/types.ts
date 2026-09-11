// Client-side mirrors of the API types. Keep in sync with apps/api/src/store/types.ts.

export type CellFlag = "green" | "yellow" | "red" | "grey";
export type EvidenceStatus =
  | "found"
  | "not_stated"
  | "not_applicable"
  | "conflicting_evidence"
  | "unreadable"
  | "insufficient_inputs"
  | "not_comparable";

export interface ReviewColumn {
  index: number;
  key: string;
  name: string;
  kind: "extract" | "analysis" | "calculate";
  type: string;
  format: string;
  prompt: string;
  task: string;
  required_for_review: boolean;
  depends_on: string[];
  source: { id: string; name: string; kind: string };
}

export interface Citation {
  document_id: string;
  version_id?: string;
  page?: number;
  sheet?: string;
  cell?: string;
  quote: string;
  verified: boolean;
}

export interface Cell {
  row_id: string;
  column_index: number;
  status: "pending" | "running" | "done" | "error";
  summary: string;
  flag: CellFlag;
  evidence_status: EvidenceStatus;
  reasoning: string;
  citations: Citation[];
  assumptions: string[];
  missing_inputs: string[];
  error: string | null;
  review_status: "unreviewed" | "reviewed" | "needs_correction";
  reviewer_id: string | null;
  reviewed_at: string | null;
  locked: boolean;
  override_value: string | null;
  override_reason: string | null;
  stale: boolean;
}

export interface Row {
  id: string;
  review_id: string;
  label: string;
  document_ids: string[];
  document_roles: Record<string, string>;
  comparison_group_id: string | null;
  user_context: Record<string, string>;
  sort_index: number;
}

export interface DocumentSummary {
  id: string;
  filename: string;
  folder: string | null;
  version_id: string;
  page_count: number;
}

export interface DocumentDetail extends DocumentSummary {
  pages: { number: number; text: string }[];
}

export interface Review {
  id: string;
  owner_id: string;
  title: string;
  template_id: string | null;
  extension_ids: string[];
  columns: ReviewColumn[];
  model: string;
  document_grouping: "document" | "folder";
  active_generation_id: string | null;
  created_at: string;
  updated_at: string;
  row_count?: number;
  column_count?: number;
}

export interface ReviewDetail extends Review {
  rows: Row[];
  cells: Cell[];
  documents: DocumentSummary[];
  shares: { user_id: string; role: string }[];
}

export interface CatalogColumn {
  id: string;
  label: string;
  type: string;
  kind: "extract" | "analysis" | "calculate";
  default_visible: boolean;
  task: string;
}

export interface CatalogTemplate {
  id: string;
  name: string;
  domain: string;
  row_grain: string;
  required_documents: string[];
  required_user_context: string[];
  views: string[];
  extension_ids: string[];
  columns: CatalogColumn[];
}

export interface CatalogExtension {
  id: string;
  name: string;
  applies_to: string[];
  columns: CatalogColumn[];
}

export interface Catalog {
  templates: CatalogTemplate[];
  extensions: CatalogExtension[];
}

export type ReviewEvent =
  | { type: "cell"; row_id: string; column_index: number; status: "running" | "done" | "error"; cell?: Cell; message?: string }
  | { type: "progress"; done: number; total: number }
  | { type: "complete"; generation_id: string }
  | { type: "cancelled"; generation_id: string };
