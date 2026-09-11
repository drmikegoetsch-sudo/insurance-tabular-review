// In-memory store with optional JSON persistence. Zero dependencies, so the
// product runs locally without a database. Not for production: every write
// rewrites the file. Use PostgresStore there.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { Cell, CellKey, Review, Row, Share, Store, StoredDocument } from "./types.js";

interface Snapshot {
  documents: StoredDocument[];
  reviews: Review[];
  rows: Row[];
  cells: Cell[];
  shares: Share[];
}

const cellId = (k: CellKey) => `${k.row_id}:${k.column_index}`;

export class FileStore implements Store {
  private documents = new Map<string, StoredDocument>();
  private reviews = new Map<string, Review>();
  private rows = new Map<string, Row[]>();
  private cells = new Map<string, Cell>();
  private shares = new Map<string, Share[]>();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private readonly filePath: string | null = null) {
    if (filePath && existsSync(filePath)) {
      const snap = JSON.parse(readFileSync(filePath, "utf8")) as Snapshot;
      snap.documents.forEach((d) => this.documents.set(d.id, d));
      snap.reviews.forEach((r) => this.reviews.set(r.id, r));
      snap.rows.forEach((r) => this.rows.set(r.review_id, [...(this.rows.get(r.review_id) ?? []), r]));
      snap.cells.forEach((c) => this.cells.set(cellId(c), c));
      snap.shares.forEach((s) => this.shares.set(s.review_id, [...(this.shares.get(s.review_id) ?? []), s]));
    }
  }

  /** Debounced write so a burst of cell updates costs one file write. */
  private persist() {
    if (!this.filePath) return;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 150);
  }

  flush() {
    if (!this.filePath) return;
    const snap: Snapshot = {
      documents: [...this.documents.values()],
      reviews: [...this.reviews.values()],
      rows: [...this.rows.values()].flat(),
      cells: [...this.cells.values()],
      shares: [...this.shares.values()].flat(),
    };
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(snap));
  }

  // Documents
  async createDocument(doc: StoredDocument) {
    this.documents.set(doc.id, doc);
    this.persist();
    return doc;
  }
  async getDocument(id: string) {
    return this.documents.get(id) ?? null;
  }
  async listDocuments(owner_id: string) {
    return [...this.documents.values()].filter((d) => d.owner_id === owner_id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async deleteDocument(id: string) {
    this.documents.delete(id);
    this.persist();
  }

  // Reviews
  async createReview(review: Review) {
    this.reviews.set(review.id, review);
    this.persist();
    return review;
  }
  async getReview(id: string) {
    return this.reviews.get(id) ?? null;
  }
  async listReviews(user_id: string) {
    return [...this.reviews.values()]
      .filter((r) => r.owner_id === user_id || (this.shares.get(r.id) ?? []).some((s) => s.user_id === user_id))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  async updateReview(id: string, patch: Partial<Review>) {
    const current = this.reviews.get(id);
    if (!current) throw new Error(`Review ${id} not found`);
    const next = { ...current, ...patch, updated_at: new Date().toISOString() };
    this.reviews.set(id, next);
    this.persist();
    return next;
  }
  async deleteReview(id: string) {
    this.reviews.delete(id);
    const rows = this.rows.get(id) ?? [];
    for (const row of rows) for (const key of [...this.cells.keys()]) if (key.startsWith(`${row.id}:`)) this.cells.delete(key);
    this.rows.delete(id);
    this.shares.delete(id);
    this.persist();
  }

  // Rows
  async replaceRows(review_id: string, rows: Row[]) {
    const previous = this.rows.get(review_id) ?? [];
    const keep = new Set(rows.map((r) => r.id));
    await this.deleteCellsForRows(previous.filter((r) => !keep.has(r.id)).map((r) => r.id));
    const sorted = rows.map((r, i) => ({ ...r, review_id, sort_index: i }));
    this.rows.set(review_id, sorted);
    this.persist();
    return sorted;
  }
  async listRows(review_id: string) {
    return [...(this.rows.get(review_id) ?? [])].sort((a, b) => a.sort_index - b.sort_index);
  }

  // Cells
  async listCells(review_id: string) {
    const rowIds = new Set((this.rows.get(review_id) ?? []).map((r) => r.id));
    return [...this.cells.values()].filter((c) => rowIds.has(c.row_id));
  }
  async getCell(key: CellKey) {
    return this.cells.get(cellId(key)) ?? null;
  }
  async upsertCell(cell: Cell) {
    const next = { ...cell, updated_at: new Date().toISOString() };
    this.cells.set(cellId(cell), next);
    this.persist();
    return next;
  }
  async resetCells(review_id: string, scope: { row_ids?: string[]; column_indexes?: number[] }, generation_id: string) {
    const reset: CellKey[] = [];
    for (const cell of await this.listCells(review_id)) {
      if (scope.row_ids && !scope.row_ids.includes(cell.row_id)) continue;
      if (scope.column_indexes && !scope.column_indexes.includes(cell.column_index)) continue;
      if (cell.locked) continue;
      this.cells.set(cellId(cell), { ...cell, status: "pending", error: null, generation_id, stale: false, updated_at: new Date().toISOString() });
      reset.push({ row_id: cell.row_id, column_index: cell.column_index });
    }
    this.persist();
    return reset;
  }
  async deleteCellsForColumns(review_id: string, column_indexes: number[]) {
    for (const cell of await this.listCells(review_id)) {
      if (column_indexes.includes(cell.column_index)) this.cells.delete(cellId(cell));
    }
    this.persist();
  }
  async deleteCellsForRows(row_ids: string[]) {
    for (const key of [...this.cells.keys()]) {
      if (row_ids.some((id) => key.startsWith(`${id}:`))) this.cells.delete(key);
    }
    this.persist();
  }
  async markStale(version_ids: string[]) {
    let n = 0;
    for (const [key, cell] of this.cells) {
      if (cell.locked || cell.stale) continue;
      if (cell.source_version_ids.some((v) => version_ids.includes(v))) {
        this.cells.set(key, { ...cell, stale: true });
        n++;
      }
    }
    if (n) this.persist();
    return n;
  }

  // Lease
  async claimLease(review_id: string, generation_id: string, ttlMs: number) {
    const review = this.reviews.get(review_id);
    if (!review) return false;
    const now = Date.now();
    const held = review.active_generation_id && review.generation_lease_expires_at && Date.parse(review.generation_lease_expires_at) > now;
    if (held) return false;
    await this.updateReview(review_id, { active_generation_id: generation_id, generation_lease_expires_at: new Date(now + ttlMs).toISOString() });
    return true;
  }
  async renewLease(review_id: string, generation_id: string, ttlMs: number) {
    const review = this.reviews.get(review_id);
    if (!review || review.active_generation_id !== generation_id) return false;
    await this.updateReview(review_id, { generation_lease_expires_at: new Date(Date.now() + ttlMs).toISOString() });
    return true;
  }
  async releaseLease(review_id: string, generation_id: string) {
    const review = this.reviews.get(review_id);
    if (!review || review.active_generation_id !== generation_id) return;
    await this.updateReview(review_id, { active_generation_id: null, generation_lease_expires_at: null });
  }

  // Sharing
  async listShares(review_id: string) {
    return [...(this.shares.get(review_id) ?? [])];
  }
  async setShare(share: Share) {
    const list = (this.shares.get(share.review_id) ?? []).filter((s) => s.user_id !== share.user_id);
    this.shares.set(share.review_id, [...list, share]);
    this.persist();
  }
  async removeShare(review_id: string, user_id: string) {
    this.shares.set(review_id, (this.shares.get(review_id) ?? []).filter((s) => s.user_id !== user_id));
    this.persist();
  }
}
