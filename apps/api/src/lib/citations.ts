// Citation validation: a citation counts as verified only when its quote is
// found in the cited document version. Pages are corrected when the quote is
// found on a different page. Failed citations are kept and marked unverified.

import type { CellCitation } from "@insurance-tabular-review/templates";
import type { StoredCitation, StoredDocument } from "../store/types.js";

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Finds the page containing the quote, trying exact then a looser word-run match. */
export function findQuotePage(doc: StoredDocument, quote: string): number | null {
  const needle = normalizeForMatch(quote);
  if (!needle) return null;
  for (const page of doc.pages) {
    if (normalizeForMatch(page.text).includes(needle)) return page.number;
  }
  // Loose match: strip punctuation and require the first 8 words in order.
  const words = needle.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 8);
  if (words.length < 3) return null;
  const pattern = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\W+"));
  for (const page of doc.pages) {
    if (pattern.test(normalizeForMatch(page.text).replace(/[^a-z0-9 ]/g, " "))) return page.number;
  }
  return null;
}

export function validateCitations(
  citations: CellCitation[],
  documentsById: Map<string, StoredDocument>,
): StoredCitation[] {
  return citations.map((citation) => {
    const doc = documentsById.get(citation.document_id);
    if (!doc) return { ...citation, verified: false };
    if (citation.sheet || citation.cell) {
      // Spreadsheet locators are checked by cell text only.
      const found = doc.pages.some((p) => normalizeForMatch(p.text).includes(normalizeForMatch(citation.quote)));
      return { ...citation, version_id: doc.version_id, verified: found };
    }
    const page = findQuotePage(doc, citation.quote);
    if (page === null) return { ...citation, version_id: doc.version_id, verified: false };
    return { ...citation, version_id: doc.version_id, page, verified: true };
  });
}
