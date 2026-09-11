// End-to-end: upload text documents, create a review from a catalog template,
// run extraction with the stub provider, watch the SSE stream, check cells and
// verified citations, set reviewer state, regenerate, export.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Server } from "node:http";
import { createApp } from "../app.js";
import { StubProvider } from "../extraction/stub.js";
import { FileStore } from "../store/fileStore.js";

const POLICY = `[Declarations]
Named Insured: Harborline Logistics LLC
Issued by Northwind Mutual Insurance Company
Policy Period: 10/01/2026 to 10/01/2027 12:01 A.M.
Total Policy Premium $84,250
\f
Each Occurrence Limit $1,000,000
General Aggregate Limit $2,000,000
Damage To Premises Rented To You $100,000 Any One Premises
Deductible: $10,000 Per Occurrence, Bodily Injury and Property Damage Liability Combined
Forms and Endorsements: CG 00 01 04 13, CG 20 10 04 13, CG 20 37 04 13, CG 24 04 05 09`;

const BINDER = `Binder B-22-0917
Named Insured: Harborline Logistics LLC
Insurer: Northwind Mutual Insurance Company
Bound premium $84,250 subject to signed TRIA form
Damage to Premises Rented to You: $300,000
Endorsements to be issued: CG 25 03 05 09 Designated Construction Project(s) General Aggregate Limit`;

describe("tabular review API", () => {
  const store = new FileStore(null);
  const app = createApp({ store, provider: new StubProvider(0) });
  let server: Server;
  let base: string;
  const user = { "x-user-id": "mike" };

  beforeAll(async () => {
    server = app.listen(0);
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });
  afterAll(() => server.close());

  let reviewId = "";
  let policyId = "";
  let binderId = "";
  let rowId = "";

  it("lists templates without prompts", async () => {
    const res = await request(app).get("/templates").set(user);
    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(20);
    expect(res.body.templates[0].columns[0]).not.toHaveProperty("prompt");
  });

  it("registers pre-extracted documents", async () => {
    const policy = await request(app).post("/documents/text").set(user).send({ filename: "Issued policy CGL-4471902.pdf", folder: "GL", text: POLICY });
    const binder = await request(app).post("/documents/text").set(user).send({ filename: "Binder B-22-0917.pdf", folder: "GL", text: BINDER });
    expect(policy.status).toBe(201);
    expect(policy.body.page_count).toBe(2);
    policyId = policy.body.id;
    binderId = binder.body.id;
    const list = await request(app).get("/documents").set(user);
    expect(list.body).toHaveLength(2);
    const other = await request(app).get("/documents").set({ "x-user-id": "someone-else" });
    expect(other.body).toHaveLength(0);
  });

  it("creates a review from a template with folder rows", async () => {
    const cols = await request(app).post("/templates/columns").set(user).send({ template_id: "CI04" });
    expect(cols.status).toBe(200);
    const res = await request(app).post("/reviews").set(user).send({
      title: "Harborline delivery check",
      template_id: "CI04",
      columns: cols.body.columns.slice(0, 6),
      document_ids: [policyId, binderId],
      document_grouping: "folder",
    });
    expect(res.status).toBe(201);
    reviewId = res.body.id;
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].label).toBe("GL");
    expect(res.body.rows[0].document_roles[policyId]).toBe("policy");
    expect(res.body.rows[0].document_roles[binderId]).toBe("binder");
    expect(res.body.cells).toHaveLength(6);
    expect(res.body.cells.every((c: { status: string }) => c.status === "pending")).toBe(true);
    rowId = res.body.rows[0].id;
  });

  it("hides the review from other users and lists it for the owner", async () => {
    expect((await request(app).get(`/reviews/${reviewId}`).set({ "x-user-id": "intruder" })).status).toBe(404);
    const mine = await request(app).get("/reviews").set(user);
    expect(mine.body.map((r: { id: string }) => r.id)).toContain(reviewId);
    expect(mine.body[0].row_count).toBe(1);
  });

  it("runs extraction and streams cell events", async () => {
    const controller = new AbortController();
    const streamed: string[] = [];
    const streamDone = (async () => {
      const res = await fetch(`${base}/reviews/${reviewId}/events`, { headers: user, signal: controller.signal });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        streamed.push(...text.split("\n\n").filter((chunk) => chunk.includes("event: review")));
        if (text.includes('"type":"complete"')) break;
      }
    })().catch(() => undefined);

    const started = await request(app).post(`/reviews/${reviewId}/generate`).set(user).send({ scope: "all" });
    expect(started.status).toBe(202);
    expect(started.body.targets).toHaveLength(6);

    const conflict = await request(app).post(`/reviews/${reviewId}/generate`).set(user).send({});
    expect([202, 409]).toContain(conflict.status); // the stub is fast; the lease may already be released

    await Promise.race([streamDone, new Promise((r) => setTimeout(r, 5000))]);
    controller.abort();
    expect(streamed.some((s) => s.includes('"status":"done"'))).toBe(true);
    expect(streamed.some((s) => s.includes('"type":"complete"'))).toBe(true);
  });

  it("wrote cells with verified citations and a released lease", async () => {
    const res = await request(app).get(`/reviews/${reviewId}`).set(user);
    expect(res.body.active_generation_id).toBeNull();
    const cells = res.body.cells as { status: string; summary: string; citations: { verified: boolean; page?: number }[] }[];
    expect(cells).toHaveLength(6);
    expect(cells.every((c) => c.status === "done")).toBe(true);
    const cited = cells.filter((c) => c.citations.length);
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.every((c) => c.citations.every((ct) => ct.verified && ct.page))).toBe(true);
  });

  it("records reviewer state and respects locks", async () => {
    const patched = await request(app).patch(`/reviews/${reviewId}/cells/${rowId}/0`).set(user).send({ review_status: "reviewed", locked: true, override_value: "Harborline Logistics LLC", override_reason: "Confirmed against binder" });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ review_status: "reviewed", reviewer_id: "mike", locked: true, override_value: "Harborline Logistics LLC" });
    const regen = await request(app).post(`/reviews/${reviewId}/cells/regenerate`).set(user).send({ row_id: rowId, column_index: 0 });
    expect(regen.status).toBe(409);
    const regen2 = await request(app).post(`/reviews/${reviewId}/cells/regenerate`).set(user).send({ row_id: rowId, column_index: 1 });
    expect(regen2.status).toBe(202);
    expect(regen2.body.targets).toEqual([{ row_id: rowId, column_index: 1 }]);
    await new Promise((r) => setTimeout(r, 200));
  });

  it("marks cells stale when a document is re-registered as a new version", async () => {
    await request(app).post("/documents").set(user).field("folder", "GL").attach("files", Buffer.from(POLICY + "\nAmended"), { filename: "Issued policy CGL-4471902.pdf", contentType: "text/plain" });
    const res = await request(app).get(`/reviews/${reviewId}`).set(user);
    const cells = res.body.cells as { locked: boolean; stale: boolean }[];
    expect(cells.filter((c) => !c.locked).every((c) => c.stale)).toBe(true);
    expect(cells.filter((c) => c.locked).every((c) => !c.stale)).toBe(true);
  });

  it("edits columns without losing surviving cells", async () => {
    const current = await request(app).get(`/reviews/${reviewId}`).set(user);
    const columns = [...current.body.columns.slice(1), { name: "Broker notes", prompt: "Extract any broker notes about the placement." }];
    const res = await request(app).patch(`/reviews/${reviewId}`).set(user).send({ columns });
    expect(res.status).toBe(200);
    expect(res.body.columns).toHaveLength(6);
    expect(res.body.columns.at(-1).key).toMatch(/^custom_broker_notes/);
    const cells = res.body.cells as { column_index: number; status: string }[];
    expect(cells.find((c) => c.column_index === 5)?.status).toBe("pending");
    expect(cells.filter((c) => c.status === "done").length).toBeGreaterThan(0);
  });

  it("shares with an editor and answers chat", async () => {
    const share = await request(app).put(`/reviews/${reviewId}/shares/dana`).set(user).send({ role: "editor" });
    expect(share.status).toBe(200);
    const asDana = await request(app).get(`/reviews/${reviewId}`).set({ "x-user-id": "dana" });
    expect(asDana.status).toBe(200);
    const chat = await request(app).post(`/reviews/${reviewId}/chat`).set({ "x-user-id": "dana" }).send({ messages: [{ role: "user", content: "What needs attention?" }] });
    expect(chat.status).toBe(200);
    expect(chat.body.answer).toContain("What needs attention?");
  });

  it("exports an xlsx workbook", async () => {
    const res = await request(app).get(`/reviews/${reviewId}/export.xlsx`).set(user).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect((res.body as Buffer).length).toBeGreaterThan(2000);
  });

  it("deletes the review", async () => {
    expect((await request(app).delete(`/reviews/${reviewId}`).set({ "x-user-id": "dana" })).status).toBe(403);
    expect((await request(app).delete(`/reviews/${reviewId}`).set(user)).status).toBe(204);
    expect((await request(app).get(`/reviews/${reviewId}`).set(user)).status).toBe(404);
  });
});
