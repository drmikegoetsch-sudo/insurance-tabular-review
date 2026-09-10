/** Value types used by the authored templates. */
export type CatalogColumnType =
  | "text"
  | "date"
  | "number"
  | "integer"
  | "percentage"
  | "money"
  | "list";

/**
 * How a column is produced.
 * - extract: read a value from the row's documents.
 * - analysis: compare or assess, citing the evidence on both sides.
 * - calculate: a deterministic specification. The model only gathers inputs;
 *   application code performs the arithmetic.
 */
export type CatalogColumnKind = "extract" | "analysis" | "calculate";

export interface CatalogColumn {
  id: string;
  label: string;
  type: CatalogColumnType;
  kind: CatalogColumnKind;
  order: number;
  /** Part of the template's default view (the authored first 20 columns). */
  default_visible: boolean;
  /** Must be populated before a reviewer can mark the row complete. */
  required_for_review: boolean;
  /** Column ids this column reads from (calculations and some analyses). */
  depends_on: string[];
  /** One-line description of what the column extracts or assesses. */
  task: string;
  /** Column-specific prompt tail (TEMPLATE / ROW GRAIN / COLUMN / VALUE TYPE / TASK). */
  prompt: string;
  /** Present for calculate columns: the specification application code implements. */
  calculation?: string;
}

export interface CatalogTemplate {
  id: string;
  name: string;
  domain: "Commercial Insurance" | "EH&B" | (string & {});
  version: string | null;
  /** What one review row represents. Drives row setup before extraction. */
  row_grain: string;
  required_documents: string[];
  optional_documents: string[];
  /** Facts the user must supply that documents cannot (option ids, baseline, dates). */
  required_user_context: string[];
  /** Authored views: the default column set plus pivots and filters. */
  views: string[];
  notes: string;
  /** Prompt for proposing rows at the template's grain from a document set. */
  row_setup_prompt: string;
  /** Extensions that may be appended to this template. */
  extension_ids: string[];
  columns: CatalogColumn[];
}

export interface CatalogExtension {
  id: string;
  name: string;
  applies_to: string[];
  application_rule: string;
  columns: CatalogColumn[];
}

export interface Catalog {
  schema_version: string;
  name: string;
  source_created: string;
  status: string;
  /** Shared review rules from the template guide, minus its OUTPUT clause. */
  rules: string;
  type_guides: Record<CatalogColumnType, string>;
  templates: CatalogTemplate[];
  extensions: CatalogExtension[];
}

/** Display formats a review grid renders. Mirrors the demo and the spec. */
export type ColumnFormat =
  | "text"
  | "bulleted_list"
  | "number"
  | "percentage"
  | "monetary_amount"
  | "date";

/**
 * A column as stored on a review. `prompt` is the column-specific tail only;
 * combine it with `buildSystemPrompt()` at extraction time.
 */
export interface ReviewColumn {
  /** Position in the review, 0-based and contiguous. */
  index: number;
  /** Stable catalog id. Extension columns are already prefixed (e.g. cx02_…). */
  key: string;
  name: string;
  kind: CatalogColumnKind;
  type: CatalogColumnType;
  format: ColumnFormat;
  prompt: string;
  task: string;
  required_for_review: boolean;
  depends_on: string[];
  /** Which template or extension the column came from. */
  source: { id: string; name: string; kind: "template" | "extension" };
  calculation?: string;
}

/** Evidence status a cell reports, from the template guide's MISSING DATA rule. */
export type EvidenceStatus =
  | "found"
  | "not_stated"
  | "not_applicable"
  | "conflicting_evidence"
  | "unreadable"
  | "insufficient_inputs"
  | "not_comparable";

/** Traffic-light flag rendered on a cell. */
export type CellFlag = "green" | "yellow" | "red" | "grey";

export interface CellCitation {
  document_id: string;
  version_id?: string;
  /** PDF page (1-based). */
  page?: number;
  /** Spreadsheet locator, used instead of page. */
  sheet?: string;
  cell?: string;
  /** Section or paragraph locator for unpaginated documents. */
  section?: string;
  /** Short verbatim excerpt, 25 words or fewer. */
  quote: string;
}

/** The object the model returns for one cell. See spec/03-extraction-contract.md. */
export interface CellResult {
  column_index: number;
  /** Concise rendered value. May contain markdown. */
  summary: string;
  flag: CellFlag;
  evidence_status: EvidenceStatus;
  /** Brief explanation of the evidence, not hidden reasoning. */
  reasoning: string;
  citations: CellCitation[];
  assumptions?: string[];
  missing_inputs?: string[];
}
