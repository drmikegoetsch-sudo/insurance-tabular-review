import { describe, expect, it } from "vitest";
import { findQuotePage, validateCitations } from "../lib/citations.js";
import { extractPages, guessRole, pagesToText } from "../lib/documents.js";
import type { StoredDocument } from "../store/types.js";

const doc: StoredDocument = {
  id: "doc-1",
  owner_id: "u",
  filename: "policy.pdf",
  folder: null,
  mime: "application/pdf",
  version_id: "v1",
  pages: [
    { number: 1, text: "COMMERCIAL GENERAL LIABILITY\nNamed Insured: Harborline Logistics LLC\nPolicy Period: 10/01/2026 to 10/01/2027" },
    { number: 2, text: "Each Occurrence Limit   $1,000,000\nGeneral Aggregate Limit $2,000,000\nDamage To Premises Rented To You $100,000 Any One Premises" },
  ],
  created_at: new Date().toISOString(),
};

describe("citation validation", () => {
  it("finds an exact quote and reports its page", () => {
    expect(findQuotePage(doc, "Each Occurrence Limit $1,000,000")).toBe(2);
  });

  it("tolerates curly quotes, dashes, and whitespace differences", () => {
    expect(findQuotePage(doc, "Named  Insured:  Harborline Logistics LLC")).toBe(1);
  });

  it("falls back to a word-run match for OCR noise", () => {
    expect(findQuotePage(doc, "Damage To Premises Rented To You, $100,000 Any One Premises (per loc.)")).toBe(2);
  });

  it("marks citations verified and corrects the page", () => {
    const out = validateCitations(
      [
        { document_id: "doc-1", page: 1, quote: "General Aggregate Limit $2,000,000" },
        { document_id: "doc-1", page: 2, quote: "This text is not in the document" },
        { document_id: "doc-9", page: 1, quote: "Named Insured" },
      ],
      new Map([[doc.id, doc]]),
    );
    expect(out[0]).toMatchObject({ verified: true, page: 2, version_id: "v1" });
    expect(out[1]).toMatchObject({ verified: false, page: 2 });
    expect(out[2]).toMatchObject({ verified: false });
  });
});

describe("document text", () => {
  it("paginates plain text on form feeds and renders page markers", async () => {
    const pages = await extractPages(Buffer.from("first page\ftext on page two"), "text/plain", "notes.txt");
    expect(pages.map((p) => p.number)).toEqual([1, 2]);
    expect(pagesToText(pages)).toContain("[Page 2]\ntext on page two");
  });

  it("accepts pre-extracted JSON pages", async () => {
    const pages = await extractPages(Buffer.from(JSON.stringify({ pages: [{ number: 4, text: "hello" }] })), "application/json", "x.json");
    expect(pages).toEqual([{ number: 4, text: "hello" }]);
  });

  it("guesses document roles from filenames", () => {
    expect(guessRole("Northwind — Binder B-22.pdf")).toBe("binder");
    expect(guessRole("Issued policy CGL-4471902.pdf")).toBe("policy");
    expect(guessRole("Pinecrest MSA v4.pdf")).toBe("contract");
    expect(guessRole("random.pdf")).toBe("document");
  });
});
