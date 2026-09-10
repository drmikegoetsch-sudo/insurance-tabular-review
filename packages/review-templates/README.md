# @insurance-tabular-review/templates

The insurance review template catalog as a dependency-free TypeScript package:
20 templates, 11 coverage and benefit extensions, 559 columns, plus the column
builder and prompt assembly a product needs to run a review.

```bash
npm install ./packages/review-templates   # or publish it to your registry
```

```ts
import {
  listTemplates,
  applicableExtensions,
  buildColumns,
  buildSystemPrompt,
  buildRowPrompt,
  parseCellLine,
} from "@insurance-tabular-review/templates";

// 1. Let the user pick a template and any extensions.
const templates = listTemplates("Commercial Insurance");
const extensions = applicableExtensions("CI04"); // Policy Delivery Check

// 2. Turn the choice into the review's columns.
const columns = buildColumns({
  templateId: "CI04",
  extensionIds: ["CX02"],   // General Liability
  includeOptional: false,   // default view = the authored first 20 columns
});

// 3. For each row, send one request and parse one JSON line per column.
const system = buildSystemPrompt();
const user = buildRowPrompt({
  documents: [{ document_id: "doc-0", filename: "Issued policy.pdf", role: "policy", text }],
  userContext: { "Comparison effective date": "2026-10-01" },
  columns,
});
for (const line of streamedLines) {
  const cell = parseCellLine(line);
  if (cell) store(rowId, cell.column_index, cell);
}
```

## What is in the catalog

| Field | Meaning |
| --- | --- |
| `rules` | The shared review rules from the template guide (scope, document roles, evidence precedence, missing data, units, citations, analysis, calculations, comparisons, review state, privacy). Stored once. |
| `type_guides` | What each value type must return. |
| `templates[].row_grain` | What one review row is. Drives row setup before extraction. |
| `templates[].columns[].prompt` | The column-specific prompt tail. `buildSystemPrompt()` supplies the rules; the two are never duplicated. |
| `templates[].columns[].kind` | `extract`, `analysis`, or `calculate`. Calculate columns are specifications for application code; the model only gathers inputs. |
| `extensions[].applies_to` | Which templates an extension may be appended to. |

`src/catalog.json` is generated. Edit the workbook or JSON in
`templates/source/` and run `node templates/scripts/build-catalog.mjs`.

## Scripts

```bash
npm test          # vitest
npm run typecheck
npm run build     # emits dist/
```
