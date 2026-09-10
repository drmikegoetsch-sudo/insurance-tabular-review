import { describe, expect, it } from "vitest";
import {
  TYPE_TO_FORMAT,
  TemplateError,
  applicableExtensions,
  buildColumns,
  buildRowPrompt,
  buildRowSetupPrompt,
  buildSystemPrompt,
  flagForEvidenceStatus,
  getCatalog,
  getExtension,
  getTemplate,
  listDomains,
  listTemplates,
  parseCellLine,
} from "./index.js";

describe("catalog", () => {
  it("ships 20 templates and 11 extensions across two domains", () => {
    expect(listTemplates()).toHaveLength(20);
    expect(getCatalog().extensions).toHaveLength(11);
    expect(listDomains()).toEqual(["Commercial Insurance", "EH&B"]);
    expect(listTemplates("EH&B").map((t) => t.id)).toEqual([
      "EB01", "EB02", "EB03", "EB04", "EB05", "EB06", "EB07",
    ]);
  });

  it("every column has a prompt tail and a valid type and kind", () => {
    const all = [...getCatalog().templates, ...getCatalog().extensions];
    for (const owner of all) {
      const ids = new Set<string>();
      for (const column of owner.columns) {
        expect(ids.has(column.id), `${owner.id}/${column.id} duplicated`).toBe(false);
        ids.add(column.id);
        expect(column.prompt).toContain(`COLUMN: ${column.label}`);
        expect(column.prompt).not.toContain("SCOPE:");
        expect(Object.keys(TYPE_TO_FORMAT)).toContain(column.type);
        expect(["extract", "analysis", "calculate"]).toContain(column.kind);
        if (column.kind === "calculate") expect(column.calculation).toBeTruthy();
      }
    }
  });

  it("extension applicability is consistent in both directions", () => {
    for (const extension of getCatalog().extensions) {
      for (const templateId of extension.applies_to) {
        expect(getTemplate(templateId)?.extension_ids).toContain(extension.id);
      }
    }
    expect(applicableExtensions("CI11").map((e) => e.id)).toEqual(["CX02"]);
    expect(applicableExtensions("EB03")).toHaveLength(0);
  });
});

describe("buildColumns", () => {
  it("returns the default view with contiguous indexes and grid formats", () => {
    const columns = buildColumns({ templateId: "CI01" });
    const visible = getTemplate("CI01")!.columns.filter((c) => c.default_visible);
    expect(columns).toHaveLength(visible.length);
    columns.forEach((column, i) => {
      expect(column.index).toBe(i);
      expect(column.key).toBe(visible[i].id);
      expect(column.format).toBe(TYPE_TO_FORMAT[visible[i].type]);
      expect(column.source).toEqual({ id: "CI01", name: "Commercial Quote Comparison", kind: "template" });
    });
  });

  it("appends extension columns after the template's, in the requested order", () => {
    const base = buildColumns({ templateId: "CI04" });
    const withExt = buildColumns({ templateId: "CI04", extensionIds: ["CX02", "CX01"] });
    const cx02 = getExtension("CX02")!;
    const cx01 = getExtension("CX01")!;
    expect(withExt).toHaveLength(base.length + cx02.columns.length + cx01.columns.length);
    expect(withExt[base.length].key).toBe(cx02.columns[0].id);
    expect(withExt[base.length].source.kind).toBe("extension");
    expect(withExt[base.length + cx02.columns.length].key).toBe(cx01.columns[0].id);
    withExt.forEach((column, i) => expect(column.index).toBe(i));
  });

  it("includes optional columns on request", () => {
    const template = getTemplate("EB01")!;
    expect(buildColumns({ templateId: "EB01", includeOptional: true })).toHaveLength(template.columns.length);
  });

  it("rejects unknown templates and non-applicable extensions", () => {
    expect(() => buildColumns({ templateId: "ZZ99" })).toThrow(TemplateError);
    expect(() => buildColumns({ templateId: "CI01", extensionIds: ["BX01"] })).toThrow(/does not apply/);
    expect(() => buildColumns({ templateId: "CI01", extensionIds: ["NOPE"] })).toThrow(/Unknown extension/);
  });
});

describe("prompts", () => {
  it("system prompt carries the rules, value types, and the cell contract", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("SCOPE:");
    expect(prompt).toContain("EVIDENCE PRECEDENCE:");
    expect(prompt).toContain("VALUE TYPES:");
    expect(prompt).toContain('"column_index"');
    expect(prompt).not.toContain("cell.schema.json");
  });

  it("row prompt lists documents with ids and the columns in order", () => {
    const columns = buildColumns({ templateId: "CI11" }).slice(0, 2);
    const prompt = buildRowPrompt({
      documents: [{ document_id: "doc-0", filename: "MSA.pdf", role: "contract", text: "12.1 ..." }],
      userContext: { "Obligated entity": "Cedar Ridge Manufacturing Inc." },
      columns,
    });
    expect(prompt).toContain('<document id="doc-0" filename="MSA.pdf" role="contract">');
    expect(prompt).toContain("- Obligated entity: Cedar Ridge Manufacturing Inc.");
    expect(prompt).toContain('Column 0 — "Contract ID"');
    expect(prompt).toContain('Column 1 — "Parties"');
    expect(prompt.indexOf("Column 0")).toBeLessThan(prompt.indexOf("Column 1"));
  });

  it("row setup prompt comes from the template", () => {
    expect(buildRowSetupPrompt("CI04")).toContain("Create review rows at this grain");
  });
});

describe("cells", () => {
  it("parses a streamed line and fills defaults", () => {
    const cell = parseCellLine(
      '{"column_index": 3, "summary": "$1,000,000 each occurrence", "evidence_status": "found", "citations": [{"document_id": "doc-1", "page": 2, "quote": "Each Occurrence Limit $1,000,000"}]}',
    );
    expect(cell).toMatchObject({
      column_index: 3,
      summary: "$1,000,000 each occurrence",
      flag: "green",
      evidence_status: "found",
      citations: [{ document_id: "doc-1", page: 2, quote: "Each Occurrence Limit $1,000,000" }],
    });
  });

  it("derives grey and yellow flags from evidence status", () => {
    expect(flagForEvidenceStatus("not_stated")).toBe("grey");
    expect(flagForEvidenceStatus("conflicting_evidence")).toBe("yellow");
    expect(parseCellLine('{"column_index": 0, "summary": "", "evidence_status": "unreadable"}')).toMatchObject({
      summary: "Not addressed",
      flag: "grey",
    });
  });

  it("ignores prose, fences, and malformed lines", () => {
    expect(parseCellLine("Here are the results:")).toBeNull();
    expect(parseCellLine("```json")).toBeNull();
    expect(parseCellLine('{"summary": "no index"}')).toBeNull();
    expect(parseCellLine('```{"column_index": 1, "summary": "x"}```')).toMatchObject({ column_index: 1 });
  });
});
