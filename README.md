# Insurance Tabular Review

A standalone kit for building tabular review into an insurance product:
upload policies, quotes, binders, certificates, treaties, claims files, or
contracts; pick a review template; get a grid of rows × columns where every
cell is an extracted or assessed value with a traffic-light flag and verbatim
citations back to the source page.

This repo is the handoff. It contains what a team needs to implement the
feature natively in its own stack, and nothing else.

| Path | What it is |
| --- | --- |
| [`demo/index.html`](demo/index.html) | Clickable mock of the product on fictional accounts: Policy Checking, Quote Comparison, Contract Review. Open it in a browser. |
| [`packages/review-templates/`](packages/review-templates/) | The template catalog as a dependency-free TypeScript package: 20 templates, 11 extensions, 559 columns, column builder, prompt assembly, cell parser, and a React template picker. |
| [`spec/`](spec/) | Implementation spec: data model, API, extraction contract, review lifecycle and UI. |
| [`templates/source/`](templates/source/) | The authored workbook and JSON export the catalog is generated from. |
| [`design/`](design/) | Design files, when ready. |

## The templates

Twenty templates in two domains, each defining what one row is, which
documents it needs, its columns, and the prompt for every column.

**Commercial Insurance:** Commercial Quote Comparison, Commercial Renewal
Changes, Prospect Account Review, Policy Delivery Check, Submission
Readiness, Account Handoff, Multi-location Account Review, Coverage Review,
Total Cost of Risk, Deductible and Retention Scenarios, Contract Insurance
Requirements, M&A Insurance Alignment, Commercial Proposal Comparison.

**Employee Health & Benefits:** Benefits Quote and Proposal Comparison,
Benefits Renewal Changes, Employer Contribution Scenarios, Employee Impact
Analysis, Benefits Budget Planning, Benefits Vendor Contract Review, Benefits
Harmonization.

**Extensions** add line-specific columns to a template: Property and Business
Income, General Liability, Commercial Auto, Workers Compensation, Cyber, D&O
and Employment Practices, Umbrella and Excess, Dental and Vision, Life and
Disability, Stop-loss, PBM Pricing and Guarantees.

Every column is one of three kinds: `extract` (read a value), `analysis`
(compare or assess, citing both sides), or `calculate` (a specification the
application computes; the model only gathers inputs).

## Quick start

```bash
npm install
npm test            # catalog integrity, column builder, prompts, cell parser
npm run typecheck
npm run demo        # opens demo/index.html
```

```ts
import { buildColumns, buildSystemPrompt, buildRowPrompt, parseCellLine }
  from "@insurance-tabular-review/templates";

const columns = buildColumns({ templateId: "CI04", extensionIds: ["CX02"] });
// system: buildSystemPrompt()   user: buildRowPrompt({ documents, userContext, columns })
// then parseCellLine() on each streamed line
```

See [`packages/review-templates/README.md`](packages/review-templates/README.md)
for the full API and [`spec/`](spec/) for how the pieces fit.

## Suggested build order

1. Data model and the templates endpoints (spec 1, 2). Half a day with the package.
2. Create-review flow with the template picker (spec 4, demo "New review").
3. Extraction: document text cache, one request per row, streamed cell writes, citation validation (spec 3).
4. Grid, cell panel, views.
5. Review state: reviewed, locked, override, stale.
6. Chat over the grid, export.

## Regenerating the catalog

Edit `templates/source/insurance-review-templates.json` (or export it again
from the workbook) and run `npm run build:catalog`. Tests will fail if a
template loses its row grain, a column loses its prompt, or an extension
points at a template that does not list it.

## License

Not yet chosen. Treat as internal until a license file is added.
