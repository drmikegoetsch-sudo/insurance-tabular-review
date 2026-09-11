import path from "node:path";
import { createApp } from "./app.js";
import { AnthropicProvider } from "./extraction/anthropic.js";
import { StubProvider } from "./extraction/stub.js";
import type { ExtractionProvider } from "./extraction/types.js";
import { FileStore } from "./store/fileStore.js";
import { PostgresStore } from "./store/postgresStore.js";
import type { Store } from "./store/types.js";

const port = Number(process.env.PORT ?? 3001);

function chooseStore(): Store {
  if (process.env.DATABASE_URL) {
    console.log("[api] store: postgres");
    return new PostgresStore(process.env.DATABASE_URL);
  }
  const file = process.env.DATA_FILE ?? path.resolve(process.cwd(), "data", "reviews.json");
  console.log(`[api] store: file (${file})`);
  return new FileStore(file);
}

function chooseProvider(): ExtractionProvider {
  const name = process.env.EXTRACTION_PROVIDER ?? (process.env.ANTHROPIC_API_KEY ? "anthropic" : "stub");
  if (name === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required for the anthropic provider");
    console.log("[api] provider: anthropic");
    return new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY, defaultModel: process.env.ANTHROPIC_MODEL });
  }
  console.log("[api] provider: stub (set ANTHROPIC_API_KEY for real extraction)");
  return new StubProvider(Number(process.env.STUB_DELAY_MS ?? 250));
}

const app = createApp({ store: chooseStore(), provider: chooseProvider() });
app.listen(port, () => console.log(`[api] listening on http://localhost:${port}`));
