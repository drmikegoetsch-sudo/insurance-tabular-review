// Excel export: a Grid sheet (rows × columns with flag and review status), a
// Citations sheet, and a Manifest of the document versions the values came from.

import ExcelJS from "exceljs";
import type { Cell, Review, Row, StoredDocument } from "../store/types.js";

export async function exportReviewXlsx(args: {
  review: Review;
  rows: Row[];
  cells: Cell[];
  documents: StoredDocument[];
}): Promise<Buffer> {
  const { review, rows, cells, documents } = args;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Insurance Tabular Review";
  const byKey = new Map(cells.map((c) => [`${c.row_id}:${c.column_index}`, c]));
  const docName = new Map(documents.map((d) => [d.id, d.filename]));

  const grid = wb.addWorksheet("Grid");
  grid.columns = [
    { header: "Row", key: "row", width: 36 },
    ...review.columns.flatMap((c) => [
      { header: c.name, key: `c${c.index}`, width: 48 },
      { header: `${c.name} · flag`, key: `f${c.index}`, width: 10 },
      { header: `${c.name} · review`, key: `r${c.index}`, width: 14 },
    ]),
  ];
  for (const row of rows) {
    const record: Record<string, string> = { row: row.label };
    for (const column of review.columns) {
      const cell = byKey.get(`${row.id}:${column.index}`);
      record[`c${column.index}`] = cell ? (cell.override_value ?? cell.summary) : "";
      record[`f${column.index}`] = cell?.flag ?? "";
      record[`r${column.index}`] = cell ? `${cell.review_status}${cell.locked ? " (locked)" : ""}${cell.stale ? " (stale)" : ""}` : "";
    }
    grid.addRow(record);
  }
  grid.getRow(1).font = { bold: true };

  const cites = wb.addWorksheet("Citations");
  cites.columns = [
    { header: "Row", key: "row", width: 36 },
    { header: "Column", key: "column", width: 32 },
    { header: "Document", key: "document", width: 40 },
    { header: "Page", key: "page", width: 8 },
    { header: "Quote", key: "quote", width: 80 },
    { header: "Verified", key: "verified", width: 10 },
  ];
  for (const row of rows) {
    for (const column of review.columns) {
      const cell = byKey.get(`${row.id}:${column.index}`);
      for (const citation of cell?.citations ?? []) {
        cites.addRow({
          row: row.label,
          column: column.name,
          document: docName.get(citation.document_id) ?? citation.document_id,
          page: citation.page ?? citation.cell ?? "",
          quote: citation.quote,
          verified: citation.verified ? "yes" : "no",
        });
      }
    }
  }
  cites.getRow(1).font = { bold: true };

  const manifest = wb.addWorksheet("Manifest");
  manifest.columns = [
    { header: "Document", key: "document", width: 40 },
    { header: "Document id", key: "id", width: 40 },
    { header: "Version id", key: "version", width: 40 },
    { header: "Pages", key: "pages", width: 8 },
  ];
  for (const d of documents) manifest.addRow({ document: d.filename, id: d.id, version: d.version_id, pages: d.pages.length });
  manifest.addRow({});
  manifest.addRow({ document: "Review", id: review.id, version: review.template_id ?? "custom", pages: rows.length });
  manifest.getRow(1).font = { bold: true };

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
