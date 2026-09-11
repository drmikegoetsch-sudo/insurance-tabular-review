// The extraction provider is the seam between this product and whatever
// model loop the host already runs. Implement `extractRow` and the rest of the
// product (persistence, streaming, citation validation, review state) comes
// for free. See spec/03-extraction-contract.md.

import type { CellResult, ReviewColumn } from "@insurance-tabular-review/templates";

export interface RowDocument {
  document_id: string;
  version_id: string;
  filename: string;
  role?: string;
  /** Full text with [Page N] markers, as produced by lib/documents.ts. */
  text: string;
}

export interface ExtractRowInput {
  review_id: string;
  row_id: string;
  /** System prompt from buildSystemPrompt(). */
  system: string;
  /** User message from buildRowPrompt(). */
  user: string;
  columns: ReviewColumn[];
  documents: RowDocument[];
  userContext: Record<string, string>;
  model: string;
  signal?: AbortSignal;
}

export interface ChatInput {
  review_title: string;
  columns: ReviewColumn[];
  /** Row label and cell summaries, already rendered as text. */
  tableText: string;
  messages: { role: "user" | "assistant"; content: string }[];
  model: string;
}

export interface ExtractionProvider {
  readonly name: string;
  /** Yields one CellResult per column, in any order. Missing columns are marked as errors by the runner. */
  extractRow(input: ExtractRowInput): AsyncIterable<CellResult>;
  /** Answers a question about the grid. Optional; the runner falls back to a canned answer. */
  chat?(input: ChatInput): Promise<string>;
}
