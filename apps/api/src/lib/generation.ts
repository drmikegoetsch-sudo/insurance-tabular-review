// Runs extraction for a review: claims the lease, resets the targeted cells,
// processes rows with bounded concurrency, validates citations, writes cells
// as they arrive, and publishes events for the SSE stream. Writes carry the
// generation id and are dropped if the review has moved on to another run.

import { buildRowPrompt, buildSystemPrompt, type CellResult } from "@insurance-tabular-review/templates";
import type { ExtractionProvider, RowDocument } from "../extraction/types.js";
import type { Cell, CellKey, Review, Row, Store, StoredDocument } from "../store/types.js";
import { newCell } from "../store/types.js";
import { validateCitations } from "./citations.js";
import { pagesToText } from "./documents.js";
import { reviewEvents } from "./events.js";
import { newId } from "./ids.js";

export const LEASE_TTL_MS = 60_000;
const ROW_CONCURRENCY = 2;

export interface GenerateScope {
  row_ids?: string[];
  column_indexes?: number[];
}

export class GenerationConflict extends Error {
  constructor() {
    super("Another generation is already running for this review");
    this.name = "GenerationConflict";
  }
}

const running = new Map<string, AbortController>();

export function cancelGeneration(review_id: string) {
  running.get(review_id)?.abort();
}

export async function startGeneration(args: {
  store: Store;
  provider: ExtractionProvider;
  review: Review;
  scope: GenerateScope;
}): Promise<{ generation_id: string; targets: CellKey[] }> {
  const { store, provider, review, scope } = args;
  const generation_id = newId();
  const claimed = await store.claimLease(review.id, generation_id, LEASE_TTL_MS);
  if (!claimed) throw new GenerationConflict();

  const rows = await store.listRows(review.id);
  await ensureCells(store, review, rows);
  const targets = await store.resetCells(review.id, scope, generation_id);
  if (targets.length === 0) {
    await store.releaseLease(review.id, generation_id);
    reviewEvents.publish(review.id, generation_id, { type: "complete", generation_id });
    return { generation_id, targets };
  }

  const controller = new AbortController();
  running.set(review.id, controller);
  void run({ store, provider, review, rows, targets, generation_id, signal: controller.signal }).finally(() => {
    running.delete(review.id);
  });
  return { generation_id, targets };
}

/** Every row × column pair has a cell row, so the grid can render pending state. */
export async function ensureCells(store: Store, review: Review, rows: Row[]) {
  const existing = new Set((await store.listCells(review.id)).map((c) => `${c.row_id}:${c.column_index}`));
  for (const row of rows) {
    for (const column of review.columns) {
      if (!existing.has(`${row.id}:${column.index}`)) await store.upsertCell(newCell(row.id, column.index, null));
    }
  }
}

async function run(args: {
  store: Store;
  provider: ExtractionProvider;
  review: Review;
  rows: Row[];
  targets: CellKey[];
  generation_id: string;
  signal: AbortSignal;
}) {
  const { store, provider, review, rows, targets, generation_id, signal } = args;
  const total = targets.length;
  let done = 0;
  const targetRows = rows.filter((r) => targets.some((t) => t.row_id === r.id));
  const renew = setInterval(() => void store.renewLease(review.id, generation_id, LEASE_TTL_MS), LEASE_TTL_MS / 3);

  const publishProgress = () => reviewEvents.publish(review.id, generation_id, { type: "progress", done, total });

  const processRow = async (row: Row) => {
    const columnIndexes = new Set(targets.filter((t) => t.row_id === row.id).map((t) => t.column_index));
    const columns = review.columns.filter((c) => columnIndexes.has(c.index));
    const docs = (await Promise.all(row.document_ids.map((id) => store.getDocument(id)))).filter((d): d is StoredDocument => !!d);
    const documentsById = new Map(docs.map((d) => [d.id, d]));
    const rowDocuments: RowDocument[] = docs.map((d) => ({
      document_id: d.id,
      version_id: d.version_id,
      filename: d.filename,
      role: row.document_roles[d.id],
      text: pagesToText(d.pages),
    }));
    const sourceVersions = docs.map((d) => d.version_id);

    for (const c of columns) {
      reviewEvents.publish(review.id, generation_id, { type: "cell", row_id: row.id, column_index: c.index, status: "running" });
    }

    const write = async (result: CellResult) => {
      if (!columnIndexes.has(result.column_index)) return;
      const current = await store.getCell({ row_id: row.id, column_index: result.column_index });
      if (!current || current.generation_id !== generation_id) return; // superseded run
      const cell: Cell = {
        ...current,
        status: "done",
        summary: result.summary,
        flag: result.flag,
        evidence_status: result.evidence_status,
        reasoning: result.reasoning,
        citations: validateCitations(result.citations, documentsById),
        assumptions: result.assumptions ?? [],
        missing_inputs: result.missing_inputs ?? [],
        error: null,
        source_version_ids: sourceVersions,
        stale: false,
      };
      const saved = await store.upsertCell(cell);
      columnIndexes.delete(result.column_index);
      done++;
      reviewEvents.publish(review.id, generation_id, { type: "cell", row_id: row.id, column_index: result.column_index, status: "done", cell: saved });
      publishProgress();
    };

    try {
      const stream = provider.extractRow({
        review_id: review.id,
        row_id: row.id,
        system: buildSystemPrompt(),
        user: buildRowPrompt({
          documents: rowDocuments.map((d) => ({ document_id: d.document_id, filename: d.filename, role: d.role, text: d.text })),
          userContext: row.user_context,
          columns,
        }),
        columns,
        documents: rowDocuments,
        userContext: row.user_context,
        model: review.model,
        signal,
      });
      for await (const result of stream) {
        if (signal.aborted) break;
        await write(result);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Extraction failed";
      for (const index of columnIndexes) await fail(row.id, index, message);
      return;
    }
    for (const index of [...columnIndexes]) await fail(row.id, index, signal.aborted ? "Cancelled" : "No result returned for this column");
  };

  const fail = async (row_id: string, column_index: number, message: string) => {
    const current = await store.getCell({ row_id, column_index });
    if (!current || current.generation_id !== generation_id) return;
    await store.upsertCell({ ...current, status: "error", error: message });
    done++;
    reviewEvents.publish(review.id, generation_id, { type: "cell", row_id, column_index, status: "error", message });
    publishProgress();
  };

  try {
    publishProgress();
    const queue = [...targetRows];
    const workers = Array.from({ length: Math.min(ROW_CONCURRENCY, queue.length) }, async () => {
      while (queue.length && !signal.aborted) {
        const row = queue.shift()!;
        await processRow(row);
      }
    });
    await Promise.all(workers);
  } finally {
    clearInterval(renew);
    await store.releaseLease(review.id, generation_id);
    reviewEvents.publish(review.id, generation_id, signal.aborted ? { type: "cancelled", generation_id } : { type: "complete", generation_id });
  }
}
