import { Router } from "express";
import multer from "multer";
import type { Store, StoredDocument } from "../store/types.js";
import { userIdFrom } from "../lib/access.js";
import { extractPages } from "../lib/documents.js";
import { newId, now } from "../lib/ids.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const summary = (d: StoredDocument) => ({
  id: d.id,
  filename: d.filename,
  folder: d.folder,
  mime: d.mime,
  version_id: d.version_id,
  page_count: d.pages.length,
  created_at: d.created_at,
});

export function documentsRouter(store: Store) {
  const router = Router();

  router.get("/", async (req, res) => {
    const docs = await store.listDocuments(userIdFrom(req));
    res.json(docs.map(summary));
  });

  /** Multipart upload: one or more `files`, optional `folder` field. */
  router.post("/", upload.array("files", 50), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) {
      res.status(400).json({ detail: "No files uploaded" });
      return;
    }
    const folder = typeof req.body?.folder === "string" && req.body.folder.trim() ? req.body.folder.trim() : null;
    const owner = userIdFrom(req);
    const created: StoredDocument[] = [];
    const failed: { filename: string; detail: string }[] = [];
    for (const file of files) {
      try {
        const pages = await extractPages(file.buffer, file.mimetype, file.originalname);
        const versionId = newId();
        // Re-uploading a filename marks cells that read the old version stale.
        const previous = (await store.listDocuments(owner)).find((d) => d.filename === file.originalname && d.folder === folder);
        if (previous) await store.markStale([previous.version_id]);
        created.push(
          await store.createDocument({
            id: previous?.id ?? newId(),
            owner_id: owner,
            filename: file.originalname,
            folder,
            mime: file.mimetype,
            version_id: versionId,
            pages,
            created_at: now(),
          }),
        );
      } catch (error) {
        failed.push({ filename: file.originalname, detail: error instanceof Error ? error.message : "Could not read file" });
      }
    }
    res.status(201).json({ documents: created.map(summary), failed });
  });

  /** JSON registration for hosts that already extracted text: {filename, folder?, pages|text}. */
  router.post("/text", async (req, res) => {
    const { filename, folder, pages, text } = req.body as { filename?: unknown; folder?: unknown; pages?: unknown; text?: unknown };
    if (typeof filename !== "string" || !filename.trim()) {
      res.status(400).json({ detail: "filename is required" });
      return;
    }
    const buffer = Buffer.from(JSON.stringify({ pages, text }));
    const extracted = await extractPages(buffer, "application/json", `${filename}.json`);
    const doc = await store.createDocument({
      id: newId(),
      owner_id: userIdFrom(req),
      filename: filename.trim(),
      folder: typeof folder === "string" && folder.trim() ? folder.trim() : null,
      mime: "text/plain",
      version_id: newId(),
      pages: extracted,
      created_at: now(),
    });
    res.status(201).json(summary(doc));
  });

  router.get("/:id", async (req, res) => {
    const doc = await store.getDocument(String(req.params.id));
    if (!doc || doc.owner_id !== userIdFrom(req)) {
      res.status(404).json({ detail: "Document not found" });
      return;
    }
    res.json({ ...summary(doc), pages: doc.pages });
  });

  router.delete("/:id", async (req, res) => {
    const doc = await store.getDocument(String(req.params.id));
    if (!doc || doc.owner_id !== userIdFrom(req)) {
      res.status(404).json({ detail: "Document not found" });
      return;
    }
    await store.deleteDocument(doc.id);
    res.status(204).end();
  });

  return router;
}
