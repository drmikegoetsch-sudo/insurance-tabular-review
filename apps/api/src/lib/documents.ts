// Document text extraction. Produces pages so citations can name a page.
// PDF via unpdf (pure JS); text, markdown, and CSV as a single page split on
// form feeds or every ~3,000 characters so long files still cite a location.

import { extractText, getDocumentProxy } from "unpdf";
import type { DocumentPage } from "../store/types.js";

const PAGE_CHARS = 3000;

export async function extractPages(buffer: Buffer, mime: string, filename: string): Promise<DocumentPage[]> {
  const lower = filename.toLowerCase();
  const looksBinary = !mime || mime === "application/octet-stream";
  if (mime === "application/pdf" || (lower.endsWith(".pdf") && looksBinary)) {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: false });
    return (text as string[]).map((t, i) => ({ number: i + 1, text: normalize(t) }));
  }
  if (lower.endsWith(".json")) {
    // Pre-extracted text: {"pages": [{"number": 1, "text": "..."}]} or {"text": "..."}
    const parsed = JSON.parse(buffer.toString("utf8")) as { pages?: DocumentPage[]; text?: string };
    if (Array.isArray(parsed.pages)) return parsed.pages.map((p, i) => ({ number: p.number ?? i + 1, text: normalize(p.text ?? "") }));
    return paginate(parsed.text ?? "");
  }
  return paginate(buffer.toString("utf8"));
}

function normalize(text: string) {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function paginate(text: string): DocumentPage[] {
  const clean = normalize(text);
  const byFormFeed = clean.split("\f").map((t) => t.trim()).filter(Boolean);
  const chunks = byFormFeed.length > 1 ? byFormFeed : chunk(clean, PAGE_CHARS);
  return chunks.map((t, i) => ({ number: i + 1, text: t }));
}

function chunk(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n\n", size);
    if (cut < size / 2) cut = rest.lastIndexOf("\n", size);
    if (cut < size / 2) cut = size;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Renders pages with the [Page N] markers the prompts and citation validator rely on. */
export function pagesToText(pages: DocumentPage[]): string {
  return pages.map((p) => `[Page ${p.number}]\n${p.text}`).join("\n\n");
}

/** Guesses a document role from its filename for row proposal. */
export function guessRole(filename: string): string {
  const f = filename.toLowerCase();
  if (/binder/.test(f)) return "binder";
  if (/endorse/.test(f)) return "endorsement";
  if (/certificate|coi\b|acord/.test(f)) return "certificate";
  if (/indication/.test(f)) return "indication";
  if (/quote|proposal/.test(f)) return "quote";
  if (/policy|declarations|dec page/.test(f)) return "policy";
  if (/contract|agreement|msa|lease/.test(f)) return "contract";
  if (/schedule|sov|statement of values|exposure|payroll/.test(f)) return "schedule";
  if (/loss run|claim/.test(f)) return "loss_run";
  if (/plan summary|sbc|benefit/.test(f)) return "plan_summary";
  if (/rate/.test(f)) return "rate_sheet";
  return "document";
}
