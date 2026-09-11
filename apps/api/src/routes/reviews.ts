import { Router, type Request, type Response } from "express";
import type { ReviewColumn } from "@insurance-tabular-review/templates";
import type { ExtractionProvider } from "../extraction/types.js";
import type { Cell, Review, Row, Store, StoredDocument } from "../store/types.js";
import { canEdit, canView, roleFor, userIdFrom } from "../lib/access.js";
import { reviewEvents } from "../lib/events.js";
import { exportReviewXlsx } from "../lib/export.js";
import { GenerationConflict, cancelGeneration, ensureCells, startGeneration } from "../lib/generation.js";
import { newId, now } from "../lib/ids.js";
import { proposeRows } from "../lib/rows.js";
import { newCell } from "../store/types.js";

const VALID_FORMATS = new Set(["text", "bulleted_list", "number", "percentage", "monetary_amount", "date"]);

function normalizeColumns(input: unknown): ReviewColumn[] | null {
  if (!Array.isArray(input)) return null;
  const columns: ReviewColumn[] = [];
  for (const [i, raw] of input.entries()) {
    if (!raw || typeof raw !== "object") return null;
    const c = raw as Record<string, unknown>;
    if (typeof c.name !== "string" || !c.name.trim() || typeof c.prompt !== "string" || !c.prompt.trim()) return null;
    columns.push({
      index: i,
      key: typeof c.key === "string" && c.key ? c.key : `custom_${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}_${i}`,
      name: c.name.trim(),
      kind: c.kind === "analysis" || c.kind === "calculate" ? c.kind : "extract",
      type: typeof c.type === "string" ? (c.type as ReviewColumn["type"]) : "text",
      format: typeof c.format === "string" && VALID_FORMATS.has(c.format) ? (c.format as ReviewColumn["format"]) : "text",
      prompt: c.prompt.trim(),
      task: typeof c.task === "string" ? c.task : c.prompt.trim().slice(0, 160),
      required_for_review: c.required_for_review === true,
      depends_on: Array.isArray(c.depends_on) ? c.depends_on.filter((d): d is string => typeof d === "string") : [],
      source: c.source && typeof c.source === "object" ? (c.source as ReviewColumn["source"]) : { id: "custom", name: "Custom", kind: "custom" as never },
      ...(typeof c.calculation === "string" ? { calculation: c.calculation } : {}),
    });
  }
  return columns;
}

export function reviewsRouter(store: Store, provider: ExtractionProvider) {
  const router = Router();

  async function load(req: Request, res: Response, need: "view" | "edit"): Promise<{ review: Review; user: string } | null> {
    const user = userIdFrom(req);
    const review = await store.getReview(String(req.params.id));
    const role = review ? await roleFor(store, review, user) : null;
    if (!review || !canView(role) || (need === "edit" && !canEdit(role))) {
      res.status(404).json({ detail: "Review not found" });
      return null;
    }
    return { review, user };
  }

  router.get("/", async (req, res) => {
    const reviews = await store.listReviews(userIdFrom(req));
    const withCounts = await Promise.all(
      reviews.map(async (r) => {
        const rows = await store.listRows(r.id);
        return { ...r, row_count: rows.length, column_count: r.columns.length };
      }),
    );
    res.json(withCounts);
  });

  router.post("/", async (req, res) => {
    const body = req.body as {
      title?: unknown; model?: unknown; template_id?: unknown; extension_ids?: unknown; columns?: unknown;
      document_ids?: unknown; document_grouping?: unknown;
    };
    const columns = normalizeColumns(body.columns);
    if (typeof body.title !== "string" || !body.title.trim()) return void res.status(400).json({ detail: "title is required" });
    if (!columns) return void res.status(400).json({ detail: "columns must be a list of {name, prompt}" });
    const user = userIdFrom(req);
    const review = await store.createReview({
      id: newId(),
      owner_id: user,
      title: body.title.trim(),
      template_id: typeof body.template_id === "string" ? body.template_id : null,
      extension_ids: Array.isArray(body.extension_ids) ? body.extension_ids.filter((x): x is string => typeof x === "string") : [],
      columns,
      model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : "default",
      document_grouping: body.document_grouping === "folder" ? "folder" : "document",
      active_generation_id: null,
      generation_lease_expires_at: null,
      created_at: now(),
      updated_at: now(),
    });
    // Optional initial rows from documents.
    const ids = Array.isArray(body.document_ids) ? body.document_ids.filter((x): x is string => typeof x === "string") : [];
    if (ids.length) {
      const docs = (await Promise.all(ids.map((id) => store.getDocument(id)))).filter((d): d is StoredDocument => !!d && d.owner_id === user);
      const { rows } = proposeRows(review, docs);
      await store.replaceRows(review.id, rows.map(({ needs_user_context: _n, ...row }) => ({ ...row, review_id: review.id, sort_index: 0 })));
      await ensureCells(store, review, await store.listRows(review.id));
    }
    res.status(201).json(await detail(review));
  });

  async function detail(review: Review) {
    const rows = await store.listRows(review.id);
    const cells = await store.listCells(review.id);
    const docIds = new Set(rows.flatMap((r) => r.document_ids));
    const documents = (await Promise.all([...docIds].map((id) => store.getDocument(id)))).filter((d): d is StoredDocument => !!d);
    return {
      ...review,
      rows,
      cells,
      documents: documents.map((d) => ({ id: d.id, filename: d.filename, folder: d.folder, version_id: d.version_id, page_count: d.pages.length })),
      shares: await store.listShares(review.id),
    };
  }

  router.get("/:id", async (req, res) => {
    const ctx = await load(req, res, "view");
    if (!ctx) return;
    res.json(await detail(ctx.review));
  });

  router.patch("/:id", async (req, res) => {
    const ctx = await load(req, res, "edit");
    if (!ctx) return;
    const body = req.body as { title?: unknown; model?: unknown; columns?: unknown };
    const patch: Partial<Review> = {};
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
    if (typeof body.model === "string" && body.model.trim()) patch.model = body.model.trim();
    if (body.columns !== undefined) {
      const columns = normalizeColumns(body.columns);
      if (!columns) return void res.status(400).json({ detail: "columns must be a list of {name, prompt}" });
      // Cells for removed or re-prompted columns are dropped; new columns get pending cells.
      const previous = ctx.review.columns;
      const removed = previous.filter((p) => !columns.some((c) => c.key === p.key)).map((p) => p.index);
      const changed = columns.filter((c) => previous.some((p) => p.key === c.key && p.prompt !== c.prompt)).map((c) => previous.find((p) => p.key === c.key)!.index);
      await store.deleteCellsForColumns(ctx.review.id, [...removed, ...changed]);
      // Re-index surviving cells to the new positions.
      const cells = await store.listCells(ctx.review.id);
      await store.deleteCellsForColumns(ctx.review.id, cells.map((c) => c.column_index));
      for (const cell of cells) {
        const key = previous.find((p) => p.index === cell.column_index)?.key;
        const next = columns.find((c) => c.key === key);
        if (next) await store.upsertCell({ ...cell, column_index: next.index });
      }
      patch.columns = columns;
    }
    const updated = await store.updateReview(ctx.review.id, patch);
    if (patch.columns) await ensureCells(store, updated, await store.listRows(updated.id));
    res.json(await detail(updated));
  });

  router.delete("/:id", async (req, res) => {
    const ctx = await load(req, res, "edit");
    if (!ctx) return;
    if (ctx.review.owner_id !== ctx.user) return void res.status(403).json({ detail: "Only the owner can delete a review" });
    cancelGeneration(ctx.review.id);
    await store.deleteReview(ctx.review.id);
    res.status(204).end();
  });

  // Rows
  router.post("/:id/rows/propose", async (req, res) => {
    const ctx = await load(req, res, "edit");
    if (!ctx) return;
    const ids = Array.isArray((req.body as { document_ids?: unknown }).document_ids) ? ((req.body as { document_ids: unknown[] }).document_ids.filter((x): x is string => typeof x === "string")) : [];
    const docs = (await Promise.all(ids.map((id) => store.getDocument(id)))).filter((d): d is StoredDocument => !!d && d.owner_id === ctx.user);
    res.json(proposeRows(ctx.review, docs));
  });

  router.put("/:id/rows", async (req, res) => {
    const ctx = await load(req, res, "edit");
    if (!ctx) return;
    const input = (req.body as { rows?: unknown }).rows;
    if (!Array.isArray(input)) return void res.status(400).json({ detail: "rows must be a list" });
    const rows: Row[] = [];
    for (const [i, raw] of input.entries()) {
      const r = raw as Record<string, unknown>;
      if (!Array.isArray(r.document_ids) || !r.document_ids.length) return void res.status(400).json({ detail: `Row ${i} needs document_ids` });
      rows.push({
        id: typeof r.id === "string" && r.id ? r.id : newId(),
        review_id: ctx.review.id,
        label: typeof r.label === "string" && r.label.trim() ? r.label.trim() : `Row ${i + 1}`,
        document_ids: r.document_ids.filter((x): x is string => typeof x === "string"),
        document_roles: r.document_roles && typeof r.document_roles === "object" ? (r.document_roles as Record<string, string>) : {},
        comparison_group_id: typeof r.comparison_group_id === "string" ? r.comparison_group_id : null,
        user_context: r.user_context && typeof r.user_context === "object" ? (r.user_context as Record<string, string>) : {},
        sort_index: i,
      });
    }
    const saved = await store.replaceRows(ctx.review.id, rows);
    await ensureCells(store, ctx.review, saved);
    res.json(await detail(ctx.review));
  });

  // Generation
  router.post("/:id/generate", async (req, res) => {
    const ctx = await load(req, res, "edit");
    if (!ctx) return;
    const body = req.body as { scope?: unknown };
    const scope = body.scope && typeof body.scope === "object" ? (body.scope as { row_ids?: string[]; column_indexes?: number[] }) : {};
    try {
      const result = await startGeneration({ store, provider, review: ctx.review, scope });
      res.status(202).json(result);
    } catch (error) {
      if (error instanceof GenerationConflict) return void res.status(409).json({ code: "generation_running", detail: error.message });
      throw error;
    }
  });

  router.post("/:id/generate/cancel", async (req, res) => {
    const ctx = await load(req, res, "edit");
    if (!ctx) return;
    cancelGeneration(ctx.review.id);
    res.status(202).json({ ok: true });
  });

  /** Server-sent events. Pass Last-Event-ID (header or ?after=) to replay missed events. */
  router.get("/:id/events", async (req, res) => {
    const ctx = await load(req, res, "view");
    if (!ctx) return;
    const after = Number(req.header("last-event-id") ?? req.query.after ?? 0) || 0;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (e: { id: number; event: unknown }) => {
      res.write(`id: ${e.id}\nevent: review\ndata: ${JSON.stringify(e.event)}\n\n`);
    };
    for (const e of reviewEvents.replay(ctx.review.id, after)) send(e);
    const unsubscribe = reviewEvents.subscribe(ctx.review.id, send);
    const ping = setInterval(() => res.write(": ping\n\n"), 15000);
    req.on("close", () => {
      clearInterval(ping);
      unsubscribe();
    });
  });

  // Cells
  router.post("/:id/cells/regenerate", async (req, res) => {
    const ctx = await load(req, res, "edit");
    if (!ctx) return;
    const { row_id, column_index } = req.body as { row_id?: unknown; column_index?: unknown };
    if (typeof row_id !== "string" || !Number.isInteger(column_index)) return void res.status(400).json({ detail: "row_id and column_index are required" });
    const cell = await store.getCell({ row_id, column_index: column_index as number });
    if (cell?.locked) return void res.status(409).json({ code: "cell_locked", detail: "Unlock the cell before regenerating it" });
    try {
      const result = await startGeneration({ store, provider, review: ctx.review, scope: { row_ids: [row_id], column_indexes: [column_index as number] } });
      res.status(202).json(result);
    } catch (error) {
      if (error instanceof GenerationConflict) return void res.status(409).json({ code: "generation_running", detail: error.message });
      throw error;
    }
  });

  router.post("/:id/cells/clear", async (req, res) => {
    const ctx = await load(req, res, "edit");
    if (!ctx) return;
    const { row_ids, column_indexes } = req.body as { row_ids?: string[]; column_indexes?: number[] };
    const cells = await store.listCells(ctx.review.id);
    for (const cell of cells) {
      if (row_ids && !row_ids.includes(cell.row_id)) continue;
      if (column_indexes && !column_indexes.includes(cell.column_index)) continue;
      if (cell.locked) continue;
      await store.upsertCell({ ...newCell(cell.row_id, cell.column_index, null), review_status: cell.review_status, reviewer_id: cell.reviewer_id, reviewed_at: cell.reviewed_at });
    }
    res.json(await detail(ctx.review));
  });

  /** Reviewer state. The only cell fields a client may write. */
  router.patch("/:id/cells/:row_id/:column_index", async (req, res) => {
    const ctx = await load(req, res, "edit");
    if (!ctx) return;
    const key = { row_id: String(req.params.row_id), column_index: Number(req.params.column_index) };
    const cell = await store.getCell(key);
    if (!cell) return void res.status(404).json({ detail: "Cell not found" });
    const body = req.body as Partial<Pick<Cell, "review_status" | "locked" | "override_value" | "override_reason">>;
    const patch: Partial<Cell> = {};
    if (body.review_status !== undefined) {
      if (!["unreviewed", "reviewed", "needs_correction"].includes(body.review_status)) return void res.status(400).json({ detail: "Invalid review_status" });
      patch.review_status = body.review_status;
      patch.reviewer_id = ctx.user;
      patch.reviewed_at = now();
      if (body.review_status === "reviewed") patch.stale = false;
    }
    if (body.locked !== undefined) patch.locked = body.locked === true;
    if (body.override_value !== undefined) {
      patch.override_value = body.override_value === null ? null : String(body.override_value);
      patch.override_reason = body.override_reason === undefined || body.override_reason === null ? null : String(body.override_reason);
      patch.reviewer_id = ctx.user;
      patch.reviewed_at = now();
    }
    res.json(await store.upsertCell({ ...cell, ...patch }));
  });

  // Sharing
  router.put("/:id/shares/:user_id", async (req, res) => {
    const ctx = await load(req, res, "edit");
    if (!ctx) return;
    if (ctx.review.owner_id !== ctx.user) return void res.status(403).json({ detail: "Only the owner can share a review" });
    const role = (req.body as { role?: unknown }).role;
    if (role !== "viewer" && role !== "editor") return void res.status(400).json({ detail: "role must be viewer or editor" });
    await store.setShare({ review_id: ctx.review.id, user_id: String(req.params.user_id), role });
    res.json(await store.listShares(ctx.review.id));
  });

  router.delete("/:id/shares/:user_id", async (req, res) => {
    const ctx = await load(req, res, "edit");
    if (!ctx) return;
    if (ctx.review.owner_id !== ctx.user) return void res.status(403).json({ detail: "Only the owner can share a review" });
    await store.removeShare(ctx.review.id, String(req.params.user_id));
    res.status(204).end();
  });

  // Chat over the grid
  router.post("/:id/chat", async (req, res) => {
    const ctx = await load(req, res, "view");
    if (!ctx) return;
    const messages = (req.body as { messages?: unknown }).messages;
    if (!Array.isArray(messages) || !messages.length) return void res.status(400).json({ detail: "messages are required" });
    const rows = await store.listRows(ctx.review.id);
    const cells = await store.listCells(ctx.review.id);
    const byKey = new Map(cells.map((c) => [`${c.row_id}:${c.column_index}`, c]));
    const tableText = rows
      .map((row, ri) =>
        [`ROW ${ri}: ${row.label}`, ...ctx.review.columns.map((col) => {
          const cell = byKey.get(`${row.id}:${col.index}`);
          return `  COL ${col.index} ${col.name} [${cell?.flag ?? "pending"}]: ${cell?.override_value ?? cell?.summary ?? ""}`;
        })].join("\n"),
      )
      .join("\n");
    const clean = messages
      .filter((m): m is { role: "user" | "assistant"; content: string } => !!m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-20);
    const answer = provider.chat
      ? await provider.chat({ review_title: ctx.review.title, columns: ctx.review.columns, tableText, messages: clean, model: ctx.review.model })
      : "This provider does not support chat.";
    res.json({ answer });
  });

  // Export
  router.get("/:id/export.xlsx", async (req, res) => {
    const ctx = await load(req, res, "view");
    if (!ctx) return;
    const rows = await store.listRows(ctx.review.id);
    const cells = await store.listCells(ctx.review.id);
    const docIds = [...new Set(rows.flatMap((r) => r.document_ids))];
    const documents = (await Promise.all(docIds.map((id) => store.getDocument(id)))).filter((d): d is StoredDocument => !!d);
    const buffer = await exportReviewXlsx({ review: ctx.review, rows, cells, documents });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${ctx.review.title.replace(/[^a-z0-9-_ ]/gi, "_")}.xlsx"`);
    res.send(buffer);
  });

  return router;
}
