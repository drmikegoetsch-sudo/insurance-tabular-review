// Deterministic provider for local runs and tests. It reads the row's real
// document text, finds the passage that best matches each column, and returns
// a cell with a verbatim citation, so the whole pipeline (streaming, citation
// validation, grid) can be exercised without a model or an API key.

import type { CellFlag, CellResult, EvidenceStatus } from "@insurance-tabular-review/templates";
import type { ChatInput, ExtractionProvider, ExtractRowInput } from "./types.js";

const STOP = new Set(["and", "or", "the", "of", "to", "a", "an", "in", "on", "for", "by", "with", "per", "each", "any", "all", "its", "this", "that", "match", "requirement"]);

function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .split(/[\s/-]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

interface Hit { document_id: string; page: number; sentence: string; score: number }

function bestPassage(documents: ExtractRowInput["documents"], terms: string[]): Hit | null {
  let best: Hit | null = null;
  for (const doc of documents) {
    const pages = doc.text.split(/\[Page (\d+)\]/);
    // split yields ["", "1", "text", "2", "text", …]
    for (let i = 1; i < pages.length; i += 2) {
      const page = Number(pages[i]);
      const body = pages[i + 1] ?? "";
      for (const raw of body.split(/(?<=[.;:\n])\s+/)) {
        const sentence = raw.replace(/\s+/g, " ").trim();
        if (sentence.length < 12) continue;
        const lower = sentence.toLowerCase();
        const score = terms.reduce((n, t) => n + (lower.includes(t) ? 1 : 0), 0);
        if (score > 0 && (!best || score > best.score || (score === best.score && sentence.length < best.sentence.length))) {
          best = { document_id: doc.document_id, page, sentence, score };
        }
      }
    }
  }
  return best;
}

function clip(text: string, words = 25) {
  const parts = text.split(" ");
  return parts.length <= words ? text : parts.slice(0, words).join(" ");
}

function flagFor(kind: string, sentence: string): CellFlag {
  const s = sentence.toLowerCase();
  if (/exclu|not covered|shall not|does not|discrepanc|mismatch|shortfall/.test(s)) return "red";
  if (/subject to|provided that|unless|except|sublimit|conditional|indication/.test(s)) return "yellow";
  return kind === "analysis" ? "yellow" : "green";
}

export class StubProvider implements ExtractionProvider {
  readonly name = "stub";

  constructor(private readonly delayMs = 0) {}

  async *extractRow(input: ExtractRowInput): AsyncIterable<CellResult> {
    for (const column of input.columns) {
      if (input.signal?.aborted) return;
      if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
      const terms = keywords(`${column.name} ${column.task}`);
      const hit = bestPassage(input.documents, terms);

      if (column.kind === "calculate") {
        yield {
          column_index: column.index,
          summary: hit ? `Inputs: ${clip(hit.sentence, 18)}` : "Inputs not found in the supplied documents.",
          flag: "grey",
          evidence_status: hit ? "found" : "insufficient_inputs",
          reasoning: "Calculation columns gather inputs only; the application computes the result.",
          citations: hit ? [{ document_id: hit.document_id, page: hit.page, quote: clip(hit.sentence) }] : [],
          assumptions: [],
          missing_inputs: hit ? [] : [column.name],
        };
        continue;
      }

      if (!hit) {
        const evidence_status: EvidenceStatus = "not_stated";
        yield {
          column_index: column.index,
          summary: "Not stated in the supplied documents.",
          flag: "grey",
          evidence_status,
          reasoning: `No passage in the row's documents matches "${column.name}".`,
          citations: [],
        };
        continue;
      }

      yield {
        column_index: column.index,
        summary: clip(hit.sentence, 30),
        flag: flagFor(column.kind, hit.sentence),
        evidence_status: "found",
        reasoning: `Best matching passage for "${column.name}" on page ${hit.page}. Stub provider: replace with a model-backed provider for real extraction.`,
        citations: [{ document_id: hit.document_id, page: hit.page, quote: clip(hit.sentence) }],
      };
    }
  }

  async chat(input: ChatInput): Promise<string> {
    const last = input.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    const flagged = input.tableText.split("\n").filter((l) => /\b(red|yellow)\b/.test(l)).slice(0, 6);
    return [
      `Stub answer for "${last}". A model-backed provider would answer from the cells below.`,
      flagged.length ? "Cells needing attention:" : "No red or yellow cells in this review.",
      ...flagged.map((l) => `- ${l}`),
    ].join("\n");
  }
}
