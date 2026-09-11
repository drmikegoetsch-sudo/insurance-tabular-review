import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import type { ExtractionProvider } from "./extraction/types.js";
import type { Store } from "./store/types.js";
import { documentsRouter } from "./routes/documents.js";
import { reviewsRouter } from "./routes/reviews.js";
import { templatesRouter } from "./routes/templates.js";

export interface AppOptions {
  store: Store;
  provider: ExtractionProvider;
}

export function createApp({ store, provider }: AppOptions) {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "25mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true, provider: provider.name }));
  app.use("/templates", templatesRouter);
  app.use("/documents", documentsRouter(store));
  app.use("/reviews", reviewsRouter(store, provider));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // Never leak internals to clients; log the real error server-side.
    console.error("[api]", err instanceof Error ? err.stack ?? err.message : err);
    if (res.headersSent) return;
    res.status(500).json({ detail: "Something went wrong" });
  });

  return app;
}
