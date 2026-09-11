// Postgres implementation of the Store contract. Schema in ./schema.sql.
// Every method is a small parameterized query; there is no ORM to learn.

import pg from "pg";
import type { Cell, CellKey, Review, Row, Share, Store, StoredDocument } from "./types.js";

type Queryable = { query: (text: string, params?: unknown[]) => Promise<pg.QueryResult> };

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | null));

function rowToDocument(r: Record<string, unknown>): StoredDocument {
  return {
    id: r.id as string,
    owner_id: r.owner_id as string,
    filename: r.filename as string,
    folder: (r.folder as string | null) ?? null,
    mime: r.mime as string,
    version_id: r.version_id as string,
    pages: r.pages as StoredDocument["pages"],
    created_at: iso(r.created_at) as string,
  };
}

function rowToReview(r: Record<string, unknown>): Review {
  return {
    id: r.id as string,
    owner_id: r.owner_id as string,
    title: r.title as string,
    template_id: (r.template_id as string | null) ?? null,
    extension_ids: r.extension_ids as string[],
    columns: r.columns as Review["columns"],
    model: r.model as string,
    document_grouping: r.document_grouping as Review["document_grouping"],
    active_generation_id: (r.active_generation_id as string | null) ?? null,
    generation_lease_expires_at: iso(r.generation_lease_expires_at),
    created_at: iso(r.created_at) as string,
    updated_at: iso(r.updated_at) as string,
  };
}

function rowToRow(r: Record<string, unknown>): Row {
  return {
    id: r.id as string,
    review_id: r.review_id as string,
    label: r.label as string,
    document_ids: r.document_ids as string[],
    document_roles: r.document_roles as Record<string, string>,
    comparison_group_id: (r.comparison_group_id as string | null) ?? null,
    user_context: r.user_context as Record<string, string>,
    sort_index: r.sort_index as number,
  };
}

function rowToCell(r: Record<string, unknown>): Cell {
  return {
    row_id: r.row_id as string,
    column_index: r.column_index as number,
    status: r.status as Cell["status"],
    summary: r.summary as string,
    flag: r.flag as Cell["flag"],
    evidence_status: r.evidence_status as Cell["evidence_status"],
    reasoning: r.reasoning as string,
    citations: r.citations as Cell["citations"],
    assumptions: r.assumptions as string[],
    missing_inputs: r.missing_inputs as string[],
    error: (r.error as string | null) ?? null,
    generation_id: (r.generation_id as string | null) ?? null,
    source_version_ids: r.source_version_ids as string[],
    review_status: r.review_status as Cell["review_status"],
    reviewer_id: (r.reviewer_id as string | null) ?? null,
    reviewed_at: iso(r.reviewed_at),
    locked: r.locked as boolean,
    override_value: (r.override_value as string | null) ?? null,
    override_reason: (r.override_reason as string | null) ?? null,
    stale: r.stale as boolean,
    updated_at: iso(r.updated_at) as string,
  };
}

export class PostgresStore implements Store {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }

  private get db(): Queryable {
    return this.pool;
  }

  async close() {
    await this.pool.end();
  }

  // Documents
  async createDocument(doc: StoredDocument) {
    await this.db.query(
      `insert into documents (id, owner_id, filename, folder, mime, version_id, pages, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [doc.id, doc.owner_id, doc.filename, doc.folder, doc.mime, doc.version_id, JSON.stringify(doc.pages), doc.created_at],
    );
    return doc;
  }
  async getDocument(id: string) {
    const { rows } = await this.db.query(`select * from documents where id = $1`, [id]);
    return rows[0] ? rowToDocument(rows[0]) : null;
  }
  async listDocuments(owner_id: string) {
    const { rows } = await this.db.query(`select * from documents where owner_id = $1 order by created_at desc`, [owner_id]);
    return rows.map(rowToDocument);
  }
  async deleteDocument(id: string) {
    await this.db.query(`delete from documents where id = $1`, [id]);
  }

  // Reviews
  async createReview(review: Review) {
    await this.db.query(
      `insert into reviews (id, owner_id, title, template_id, extension_ids, columns, model, document_grouping, active_generation_id, generation_lease_expires_at, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        review.id, review.owner_id, review.title, review.template_id, JSON.stringify(review.extension_ids), JSON.stringify(review.columns),
        review.model, review.document_grouping, review.active_generation_id, review.generation_lease_expires_at, review.created_at, review.updated_at,
      ],
    );
    return review;
  }
  async getReview(id: string) {
    const { rows } = await this.db.query(`select * from reviews where id = $1`, [id]);
    return rows[0] ? rowToReview(rows[0]) : null;
  }
  async listReviews(user_id: string) {
    const { rows } = await this.db.query(
      `select r.* from reviews r
       where r.owner_id = $1 or exists (select 1 from review_shares s where s.review_id = r.id and s.user_id = $1)
       order by r.updated_at desc`,
      [user_id],
    );
    return rows.map(rowToReview);
  }
  async updateReview(id: string, patch: Partial<Review>) {
    const current = await this.getReview(id);
    if (!current) throw new Error(`Review ${id} not found`);
    const next: Review = { ...current, ...patch, updated_at: new Date().toISOString() };
    await this.db.query(
      `update reviews set title = $2, template_id = $3, extension_ids = $4, columns = $5, model = $6, document_grouping = $7,
         active_generation_id = $8, generation_lease_expires_at = $9, updated_at = $10 where id = $1`,
      [
        id, next.title, next.template_id, JSON.stringify(next.extension_ids), JSON.stringify(next.columns), next.model, next.document_grouping,
        next.active_generation_id, next.generation_lease_expires_at, next.updated_at,
      ],
    );
    return next;
  }
  async deleteReview(id: string) {
    await this.db.query(`delete from reviews where id = $1`, [id]);
  }

  // Rows
  async replaceRows(review_id: string, rows: Row[]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const keep = rows.map((r) => r.id);
      await client.query(`delete from review_rows where review_id = $1 and not (id = any($2::text[]))`, [review_id, keep]);
      const sorted = rows.map((r, i) => ({ ...r, review_id, sort_index: i }));
      for (const row of sorted) {
        await client.query(
          `insert into review_rows (id, review_id, label, document_ids, document_roles, comparison_group_id, user_context, sort_index)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (id) do update set label = excluded.label, document_ids = excluded.document_ids, document_roles = excluded.document_roles,
             comparison_group_id = excluded.comparison_group_id, user_context = excluded.user_context, sort_index = excluded.sort_index`,
          [row.id, review_id, row.label, JSON.stringify(row.document_ids), JSON.stringify(row.document_roles), row.comparison_group_id, JSON.stringify(row.user_context), row.sort_index],
        );
      }
      await client.query("commit");
      return sorted;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async listRows(review_id: string) {
    const { rows } = await this.db.query(`select * from review_rows where review_id = $1 order by sort_index`, [review_id]);
    return rows.map(rowToRow);
  }

  // Cells
  async listCells(review_id: string) {
    const { rows } = await this.db.query(
      `select c.* from review_cells c join review_rows r on r.id = c.row_id where r.review_id = $1`,
      [review_id],
    );
    return rows.map(rowToCell);
  }
  async getCell(key: CellKey) {
    const { rows } = await this.db.query(`select * from review_cells where row_id = $1 and column_index = $2`, [key.row_id, key.column_index]);
    return rows[0] ? rowToCell(rows[0]) : null;
  }
  async upsertCell(cell: Cell) {
    const next = { ...cell, updated_at: new Date().toISOString() };
    await this.db.query(
      `insert into review_cells (row_id, column_index, status, summary, flag, evidence_status, reasoning, citations, assumptions, missing_inputs, error,
         generation_id, source_version_ids, review_status, reviewer_id, reviewed_at, locked, override_value, override_reason, stale, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
       on conflict (row_id, column_index) do update set status = excluded.status, summary = excluded.summary, flag = excluded.flag,
         evidence_status = excluded.evidence_status, reasoning = excluded.reasoning, citations = excluded.citations, assumptions = excluded.assumptions,
         missing_inputs = excluded.missing_inputs, error = excluded.error, generation_id = excluded.generation_id, source_version_ids = excluded.source_version_ids,
         review_status = excluded.review_status, reviewer_id = excluded.reviewer_id, reviewed_at = excluded.reviewed_at, locked = excluded.locked,
         override_value = excluded.override_value, override_reason = excluded.override_reason, stale = excluded.stale, updated_at = excluded.updated_at`,
      [
        next.row_id, next.column_index, next.status, next.summary, next.flag, next.evidence_status, next.reasoning, JSON.stringify(next.citations),
        JSON.stringify(next.assumptions), JSON.stringify(next.missing_inputs), next.error, next.generation_id, JSON.stringify(next.source_version_ids),
        next.review_status, next.reviewer_id, next.reviewed_at, next.locked, next.override_value, next.override_reason, next.stale, next.updated_at,
      ],
    );
    return next;
  }
  async resetCells(review_id: string, scope: { row_ids?: string[]; column_indexes?: number[] }, generation_id: string) {
    const { rows } = await this.db.query(
      `update review_cells c set status = 'pending', error = null, generation_id = $2, stale = false, updated_at = now()
       from review_rows r where r.id = c.row_id and r.review_id = $1 and c.locked = false
         and ($3::text[] is null or c.row_id = any($3::text[]))
         and ($4::int[] is null or c.column_index = any($4::int[]))
       returning c.row_id, c.column_index`,
      [review_id, generation_id, scope.row_ids ?? null, scope.column_indexes ?? null],
    );
    return rows.map((r) => ({ row_id: r.row_id as string, column_index: r.column_index as number }));
  }
  async deleteCellsForColumns(review_id: string, column_indexes: number[]) {
    await this.db.query(
      `delete from review_cells c using review_rows r where r.id = c.row_id and r.review_id = $1 and c.column_index = any($2::int[])`,
      [review_id, column_indexes],
    );
  }
  async deleteCellsForRows(row_ids: string[]) {
    await this.db.query(`delete from review_cells where row_id = any($1::text[])`, [row_ids]);
  }
  async markStale(version_ids: string[]) {
    const { rowCount } = await this.db.query(
      `update review_cells set stale = true where locked = false and stale = false and source_version_ids ?| $1::text[]`,
      [version_ids],
    );
    return rowCount ?? 0;
  }

  // Lease
  async claimLease(review_id: string, generation_id: string, ttlMs: number) {
    const { rowCount } = await this.db.query(
      `update reviews set active_generation_id = $2, generation_lease_expires_at = now() + ($3 || ' milliseconds')::interval, updated_at = now()
       where id = $1 and (active_generation_id is null or generation_lease_expires_at is null or generation_lease_expires_at < now())`,
      [review_id, generation_id, String(ttlMs)],
    );
    return (rowCount ?? 0) > 0;
  }
  async renewLease(review_id: string, generation_id: string, ttlMs: number) {
    const { rowCount } = await this.db.query(
      `update reviews set generation_lease_expires_at = now() + ($3 || ' milliseconds')::interval where id = $1 and active_generation_id = $2`,
      [review_id, generation_id, String(ttlMs)],
    );
    return (rowCount ?? 0) > 0;
  }
  async releaseLease(review_id: string, generation_id: string) {
    await this.db.query(
      `update reviews set active_generation_id = null, generation_lease_expires_at = null where id = $1 and active_generation_id = $2`,
      [review_id, generation_id],
    );
  }

  // Sharing
  async listShares(review_id: string) {
    const { rows } = await this.db.query(`select * from review_shares where review_id = $1`, [review_id]);
    return rows.map((r) => ({ review_id: r.review_id as string, user_id: r.user_id as string, role: r.role as Share["role"] }));
  }
  async setShare(share: Share) {
    await this.db.query(
      `insert into review_shares (review_id, user_id, role) values ($1, $2, $3) on conflict (review_id, user_id) do update set role = excluded.role`,
      [share.review_id, share.user_id, share.role],
    );
  }
  async removeShare(review_id: string, user_id: string) {
    await this.db.query(`delete from review_shares where review_id = $1 and user_id = $2`, [review_id, user_id]);
  }
}
