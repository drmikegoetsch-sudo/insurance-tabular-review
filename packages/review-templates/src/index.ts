import catalogJson from "./catalog.json" with { type: "json" };
import type {
  Catalog,
  CatalogColumn,
  CatalogColumnType,
  CatalogExtension,
  CatalogTemplate,
  CellFlag,
  ColumnFormat,
  EvidenceStatus,
  ReviewColumn,
} from "./types.js";

export * from "./types.js";

const CATALOG = catalogJson as unknown as Catalog;

// ---------------------------------------------------------------------------
// Catalog access
// ---------------------------------------------------------------------------

/** The bundled catalog: 20 templates and 11 extensions. */
export function getCatalog(): Catalog {
  return CATALOG;
}

export function listTemplates(domain?: string): CatalogTemplate[] {
  return domain
    ? CATALOG.templates.filter((t) => t.domain === domain)
    : CATALOG.templates;
}

export function getTemplate(id: string): CatalogTemplate | undefined {
  return CATALOG.templates.find((t) => t.id === id);
}

export function listExtensions(): CatalogExtension[] {
  return CATALOG.extensions;
}

export function getExtension(id: string): CatalogExtension | undefined {
  return CATALOG.extensions.find((e) => e.id === id);
}

/** Extensions a template allows, in catalog order. */
export function applicableExtensions(templateId: string): CatalogExtension[] {
  return CATALOG.extensions.filter((e) => e.applies_to.includes(templateId));
}

/** Distinct domains in the catalog, in first-seen order. */
export function listDomains(): string[] {
  return Array.from(new Set(CATALOG.templates.map((t) => t.domain)));
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/** Maps authored value types onto grid display formats. */
export const TYPE_TO_FORMAT: Record<CatalogColumnType, ColumnFormat> = {
  text: "text",
  date: "date",
  number: "number",
  integer: "number",
  percentage: "percentage",
  money: "monetary_amount",
  list: "bulleted_list",
};

export class TemplateError extends Error {
  constructor(
    message: string,
    readonly code: "template_not_found" | "extension_not_found" | "extension_not_applicable",
  ) {
    super(message);
    this.name = "TemplateError";
  }
}

export interface BuildColumnsOptions {
  templateId: string;
  /** Extensions to append, in the order given. Each must apply to the template. */
  extensionIds?: string[];
  /** Include columns outside the template's default view. Default false. */
  includeOptional?: boolean;
}

/**
 * Builds the column list for a new review: template columns (default view
 * unless `includeOptional`), then each extension's columns. Indexes are
 * 0-based and contiguous, which is what a grid and a cell store expect.
 */
export function buildColumns(options: BuildColumnsOptions): ReviewColumn[] {
  const template = getTemplate(options.templateId);
  if (!template) {
    throw new TemplateError(`Unknown template: ${options.templateId}`, "template_not_found");
  }
  const extensions = (options.extensionIds ?? []).map((id) => {
    const extension = getExtension(id);
    if (!extension) {
      throw new TemplateError(`Unknown extension: ${id}`, "extension_not_found");
    }
    if (!extension.applies_to.includes(template.id)) {
      throw new TemplateError(
        `Extension ${id} does not apply to template ${template.id}`,
        "extension_not_applicable",
      );
    }
    return extension;
  });

  const picked: { column: CatalogColumn; source: ReviewColumn["source"] }[] = [
    ...template.columns
      .filter((c) => options.includeOptional || c.default_visible)
      .map((column) => ({
        column,
        source: { id: template.id, name: template.name, kind: "template" as const },
      })),
    ...extensions.flatMap((extension) =>
      extension.columns.map((column) => ({
        column,
        source: { id: extension.id, name: extension.name, kind: "extension" as const },
      })),
    ),
  ];

  return picked.map(({ column, source }, index) => ({
    index,
    key: column.id,
    name: column.label,
    kind: column.kind,
    type: column.type,
    format: TYPE_TO_FORMAT[column.type],
    prompt: column.prompt,
    task: column.task,
    required_for_review: column.required_for_review,
    depends_on: column.depends_on,
    source,
    ...(column.calculation ? { calculation: column.calculation } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

/**
 * The cell contract the model must return. Kept next to the rules so the
 * output clause the guide describes is replaced by one the application parses.
 */
export const CELL_OUTPUT_CONTRACT = `OUTPUT: For each column, return exactly one minified JSON object on its own line, in column order, with this shape:
{"column_index": <number>, "summary": <string>, "flag": "green"|"yellow"|"red"|"grey", "evidence_status": "found"|"not_stated"|"not_applicable"|"conflicting_evidence"|"unreadable"|"insufficient_inputs"|"not_comparable", "reasoning": <string>, "citations": [{"document_id": <string>, "page": <number>, "quote": <string>}], "assumptions": [<string>], "missing_inputs": [<string>]}
- "summary" is the concise value to display. It may use markdown (bullets, bold). Put every substantive assertion's evidence in "citations", not in the summary text.
- "flag": green = confirmed and favorable to the insured or meets the requirement; yellow = conditional, sublimited, ambiguous, conflicting, or needs review; red = excluded, a gap, an express mismatch, or an adverse term; grey = not stated, not applicable, unreadable, or insufficient inputs.
- Each citation needs the exact document_id shown before the document text, a page (or sheet and cell for spreadsheets), and a verbatim quote of 25 words or fewer. Never fabricate a page or quote.
- For calculate columns do not compute the result; list the cited inputs and assumptions and name any missing inputs.
- Output only the JSON lines. No code fences, no preamble, no trailing summary.`;

/**
 * System prompt for an extraction run: analyst persona, the shared rules from
 * the template guide, the value-type guides, and the cell contract.
 */
export function buildSystemPrompt(): string {
  const typeGuide = (Object.entries(CATALOG.type_guides) as [CatalogColumnType, string][])
    .map(([type, guide]) => `- ${type}: ${guide}`)
    .join("\n");
  return [
    "You are an insurance policy and contract analyst reviewing insurance documents (policies, endorsements, binders, quotes, certificates of insurance, plan documents, reinsurance treaties, claims files, and contracts with insurance requirements). Extract or assess the value for each column listed in the user message.",
    "",
    CATALOG.rules,
    "",
    "VALUE TYPES:",
    typeGuide,
    "",
    CELL_OUTPUT_CONTRACT,
  ].join("\n");
}

/**
 * The per-column instruction block for the user message. Column prompts
 * already carry the template name, row grain, value type, and task.
 */
export function buildColumnsPrompt(columns: ReviewColumn[]): string {
  return columns
    .map((column) => `Column ${column.index} — "${column.name}"\n${column.prompt}`)
    .join("\n\n");
}

export interface RowPromptInput {
  /** Documents in this row, with the ids the model must cite. */
  documents: { document_id: string; filename: string; role?: string; text: string }[];
  /** User-supplied context the template requires (option ids, baseline, dates). */
  userContext?: Record<string, string>;
  columns: ReviewColumn[];
}

/** The user message for one row: documents, user context, then the columns. */
export function buildRowPrompt(input: RowPromptInput): string {
  const docs = input.documents
    .map(
      (d) =>
        `<document id="${d.document_id}" filename="${d.filename}"${d.role ? ` role="${d.role}"` : ""}>\n${d.text}\n</document>`,
    )
    .join("\n\n");
  const context = input.userContext && Object.keys(input.userContext).length
    ? "USER CONTEXT:\n" +
      Object.entries(input.userContext)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n") +
      "\n\n"
    : "";
  return `${docs}\n\n---\n${context}Columns to extract:\n${buildColumnsPrompt(input.columns)}`;
}

/** Row-setup prompt for proposing rows at a template's grain before extraction. */
export function buildRowSetupPrompt(templateId: string): string {
  const template = getTemplate(templateId);
  if (!template) {
    throw new TemplateError(`Unknown template: ${templateId}`, "template_not_found");
  }
  return template.row_setup_prompt;
}

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

/** Default flag for an evidence status when the model omits one. */
export function flagForEvidenceStatus(status: EvidenceStatus): CellFlag {
  switch (status) {
    case "found":
      return "green";
    case "conflicting_evidence":
    case "not_comparable":
      return "yellow";
    default:
      return "grey";
  }
}

const EVIDENCE_STATUSES: EvidenceStatus[] = [
  "found",
  "not_stated",
  "not_applicable",
  "conflicting_evidence",
  "unreadable",
  "insufficient_inputs",
  "not_comparable",
];
const FLAGS: CellFlag[] = ["green", "yellow", "red", "grey"];

export function isEvidenceStatus(value: unknown): value is EvidenceStatus {
  return typeof value === "string" && (EVIDENCE_STATUSES as string[]).includes(value);
}

export function isCellFlag(value: unknown): value is CellFlag {
  return typeof value === "string" && (FLAGS as string[]).includes(value);
}

/**
 * Parses one streamed line into a cell result, tolerating stray code fences
 * and missing optional fields. Returns null for blank or unparseable lines.
 */
export function parseCellLine(line: string): import("./types.js").CellResult | null {
  const trimmed = line.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  if (!trimmed.startsWith("{")) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
  const columnIndex = Number(raw.column_index);
  if (!Number.isInteger(columnIndex) || columnIndex < 0) return null;
  const evidence_status = isEvidenceStatus(raw.evidence_status) ? raw.evidence_status : "found";
  const flag = isCellFlag(raw.flag) ? raw.flag : flagForEvidenceStatus(evidence_status);
  const citations = Array.isArray(raw.citations)
    ? raw.citations
        .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
        .filter((c) => typeof c.document_id === "string" && typeof c.quote === "string")
        .map((c) => ({
          document_id: c.document_id as string,
          quote: c.quote as string,
          ...(typeof c.version_id === "string" ? { version_id: c.version_id } : {}),
          ...(Number.isFinite(Number(c.page)) && c.page !== undefined ? { page: Number(c.page) } : {}),
          ...(typeof c.sheet === "string" ? { sheet: c.sheet } : {}),
          ...(typeof c.cell === "string" ? { cell: c.cell } : {}),
          ...(typeof c.section === "string" ? { section: c.section } : {}),
        }))
    : [];
  const strings = (value: unknown): string[] | undefined =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : undefined;
  return {
    column_index: columnIndex,
    summary: String(raw.summary ?? "").trim() || "Not addressed",
    flag,
    evidence_status,
    reasoning: String(raw.reasoning ?? ""),
    citations,
    ...(strings(raw.assumptions) ? { assumptions: strings(raw.assumptions) } : {}),
    ...(strings(raw.missing_inputs) ? { missing_inputs: strings(raw.missing_inputs) } : {}),
  };
}
