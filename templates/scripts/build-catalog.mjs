#!/usr/bin/env node
// Regenerates packages/review-templates/src/catalog.json from the authored
// template export in templates/source/insurance-review-templates.json.
//
// The source file embeds the same ~4KB rulebook at the top of every column
// prompt. The catalog stores that rulebook once (`rules`) and keeps each
// column's own TEMPLATE / ROW GRAIN / COLUMN / VALUE TYPE / TASK tail in
// `prompt`, so the package is small and the rules can be edited in one place.
//
// Usage: node templates/scripts/build-catalog.mjs

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(here, "..", "source", "insurance-review-templates.json");
const OUT = path.join(here, "..", "..", "packages", "review-templates", "src", "catalog.json");

const source = JSON.parse(readFileSync(SOURCE, "utf8"));
const global = source.global_prompt;

// The guide's OUTPUT clause describes a cell.schema.json object. The package
// documents its own cell contract (see spec/03-extraction-contract.md), so the
// clause is dropped here and re-added by buildSystemPrompt().
const rules = global
  .split("\n")
  .filter((line) => !line.startsWith("OUTPUT:"))
  .join("\n")
  .trim();

function column(raw, ownerId) {
  const full = raw.prompt || raw.calculation_input_prompt;
  if (!full || !full.startsWith(global)) {
    throw new Error(`Column ${ownerId}/${raw.id} does not carry the global prompt prefix`);
  }
  const prompt = full.slice(global.length).replace(/^\n+/, "").trim();
  const out = {
    id: raw.id,
    label: raw.label,
    type: raw.type,
    kind: raw.kind,
    order: raw.order,
    default_visible: raw.default_visible !== false,
    required_for_review: raw.required_for_review === true,
    depends_on: raw.depends_on ?? [],
    task: raw.task,
    prompt,
  };
  if (raw.execution?.engine === "deterministic") {
    out.calculation = raw.execution.specification || raw.task;
  }
  return out;
}

const byOrder = (a, b) => a.order - b.order;

const catalog = {
  schema_version: source.schema_version,
  name: source.name,
  source_created: source.created,
  status: source.status,
  rules,
  type_guides: source.type_guides,
  templates: source.templates.map((t) => ({
    id: t.id,
    name: t.name,
    domain: t.domain,
    version: t.version ?? null,
    row_grain: t.row_grain,
    required_documents: t.required_documents,
    optional_documents: t.optional_documents,
    required_user_context: t.required_user_context,
    views: t.views,
    notes: t.notes,
    row_setup_prompt: t.row_setup_prompt,
    extension_ids: t.extension_ids,
    columns: [...t.columns].sort(byOrder).map((c) => column(c, t.id)),
  })),
  extensions: source.extensions.map((e) => ({
    id: e.id,
    name: e.name,
    applies_to: e.applies_to,
    application_rule: e.application_rule,
    columns: [...e.columns].sort(byOrder).map((c) => column(c, e.id)),
  })),
};

writeFileSync(OUT, JSON.stringify(catalog, null, 2) + "\n");
const columns =
  catalog.templates.reduce((n, t) => n + t.columns.length, 0) +
  catalog.extensions.reduce((n, e) => n + e.columns.length, 0);
console.log(
  `wrote ${path.relative(process.cwd(), OUT)}: ${catalog.templates.length} templates, ` +
    `${catalog.extensions.length} extensions, ${columns} columns, ${Math.round(statSync(OUT).size / 1024)} KB`,
);
