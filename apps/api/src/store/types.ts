// Domain model for tabular reviews. See spec/01-data-model.md.

import type { CellFlag, EvidenceStatus, ReviewColumn } from "@insurance-tabular-review/templates";

export interface DocumentPage {
  number: number;
  text: string;
}

export interface StoredDocument {
  id: string;
  owner_id: string;
  filename: string;
  /** Optional folder the document was uploaded into; folder rows group by it. */
  folder: string | null;
  mime: string;
  /** Current version id. Re-uploading the same filename creates a new version. */
  version_id: string;
  pages: DocumentPage[];
  created_at: string;
}

export type DocumentGrouping = "document" | "folder";

export interface Review {
  id: string;
  owner_id: string;
  title: string;
  template_id: string | null;
  extension_ids: string[];
  columns: ReviewColumn[];
  model: string;
  document_grouping: DocumentGrouping;
  active_generation_id: string | null;
  generation_lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
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

export type CellStatus = "pending" | "running" | "done" | "error";
export type ReviewStatus = "unreviewed" | "reviewed" | "needs_correction";

export interface StoredCitation {
  document_id: string;
  version_id?: string;
  page?: number;
  sheet?: string;
  cell?: string;
  section?: string;
  quote: string;
  /** Set by citation validation: the quote was found in the cited document version. */
  verified: boolean;
}

export interface Cell {
  row_id: string;
  column_index: number;
  status: CellStatus;
  summary: string;
  flag: CellFlag;
  evidence_status: EvidenceStatus;
  reasoning: string;
  citations: StoredCitation[];
  assumptions: string[];
  missing_inputs: string[];
  error: string | null;
  generation_id: string | null;
  source_version_ids: string[];
  // Review state. Never set by the model.
  review_status: ReviewStatus;
  reviewer_id: string | null;
  reviewed_at: string | null;
  locked: boolean;
  override_value: string | null;
  override_reason: string | null;
  stale: boolean;
  updated_at: string;
}

export type ShareRole = "viewer" | "editor";

export interface Share {
  review_id: string;
  user_id: string;
  role: ShareRole;
}

export type CellKey = { row_id: string; column_index: number };

/** Storage contract. Implemented by the file store (local) and Postgres. */
export interface Store {
  // Documents
  createDocument(doc: StoredDocument): Promise<StoredDocument>;
  getDocument(id: string): Promise<StoredDocument | null>;
  listDocuments(owner_id: string): Promise<StoredDocument[]>;
  deleteDocument(id: string): Promise<void>;

  // Reviews
  createReview(review: Review): Promise<Review>;
  getReview(id: string): Promise<Review | null>;
  listReviews(user_id: string): Promise<Review[]>;
  updateReview(id: string, patch: Partial<Review>): Promise<Review>;
  deleteReview(id: string): Promise<void>;

  // Rows
  replaceRows(review_id: string, rows: Row[]): Promise<Row[]>;
  listRows(review_id: string): Promise<Row[]>;

  // Cells
  listCells(review_id: string): Promise<Cell[]>;
  getCell(key: CellKey): Promise<Cell | null>;
  upsertCell(cell: Cell): Promise<Cell>;
  /** Marks cells pending for a new generation. Locked cells are skipped. Returns the keys it reset. */
  resetCells(review_id: string, scope: { row_ids?: string[]; column_indexes?: number[] }, generation_id: string): Promise<CellKey[]>;
  deleteCellsForColumns(review_id: string, column_indexes: number[]): Promise<void>;
  deleteCellsForRows(row_ids: string[]): Promise<void>;
  /** Marks unlocked cells that read any of these versions as stale. */
  markStale(version_ids: string[]): Promise<number>;

  // Generation lease
  claimLease(review_id: string, generation_id: string, ttlMs: number): Promise<boolean>;
  renewLease(review_id: string, generation_id: string, ttlMs: number): Promise<boolean>;
  releaseLease(review_id: string, generation_id: string): Promise<void>;

  // Sharing
  listShares(review_id: string): Promise<Share[]>;
  setShare(share: Share): Promise<void>;
  removeShare(review_id: string, user_id: string): Promise<void>;
}

export function newCell(row_id: string, column_index: number, generation_id: string | null): Cell {
  return {
    row_id,
    column_index,
    status: "pending",
    summary: "",
    flag: "grey",
    evidence_status: "not_stated",
    reasoning: "",
    citations: [],
    assumptions: [],
    missing_inputs: [],
    error: null,
    generation_id,
    source_version_ids: [],
    review_status: "unreviewed",
    reviewer_id: null,
    reviewed_at: null,
    locked: false,
    override_value: null,
    override_reason: null,
    stale: false,
    updated_at: new Date().toISOString(),
  };
}
