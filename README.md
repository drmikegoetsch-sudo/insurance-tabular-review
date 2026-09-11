# Insurance Tabular Review

A working tabular review product for insurance documents. Upload policies,
quotes, binders, certificates, treaties, claims files, or contracts; pick a
review template; run it; get a grid of rows × columns where every cell is an
extracted or assessed value with a traffic-light flag and a verbatim citation
that has been verified against the source page.

Built clean-room from the [spec](spec/) in this repo. MIT licensed.

## Run it

```bash
git clone https://github.com/drmikegoetsch-sudo/insurance-tabular-review.git
cd insurance-tabular-review
npm install
npm run seed -w apps/api    # three fictional reviews so there is something to look at
npm run dev                 # API on :3001, web on :5173
```

Open http://localhost:5173. No database and no model key are needed: the
API uses a JSON file store and a stub extraction provider that pulls real
passages out of the uploaded documents. To extract with Claude instead:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

For Postgres, apply `apps/api/src/store/schema.sql` and set `DATABASE_URL`.
All settings are in [`apps/api/.env.example`](apps/api/.env.example).

## What is here

| Path | What it is |
| --- | --- |
| [`apps/api/`](apps/api/) | Express API. Documents (PDF, text, pre-extracted JSON), reviews, rows, cells, streaming generation with a lease, citation validation, reviewer state, staleness, sharing, chat over the grid, Excel export. File store for local runs, Postgres store for real deployments. |
| [`web/`](web/) | React front end in the team's design language: sidebar, grid, drag-in documents, live extraction, All / Differences / Needs attention views, source panel with the cited page, reviewer actions, add column, chat. |
| [`packages/review-templates/`](packages/review-templates/) | The template catalog as a dependency-free TypeScript package: 20 templates, 11 extensions, 559 columns, column builder, prompt assembly, cell parser, React template picker. |
| [`spec/`](spec/) | Data model, API, extraction contract, review lifecycle. The API implements it. |
| [`templates/source/`](templates/source/) | The authored workbook and JSON the catalog is generated from (`npm run build:catalog`). |

## How extraction plugs in

The API talks to a model through one interface, `ExtractionProvider` in
[`apps/api/src/extraction/types.ts`](apps/api/src/extraction/types.ts):

```ts
extractRow(input): AsyncIterable<CellResult>   // one cell per column, any order
chat?(input): Promise<string>                  // optional, answers over the grid
```

Two providers ship: `stub` (no model, deterministic passages from the
documents) and `anthropic` (Claude, streamed, one request per row). To use
your own extraction loop, implement `extractRow` against the prompts the
package builds, or map your existing output into `CellResult` objects. The
runner handles persistence, streaming, citation validation, the generation
lease, and review state either way.

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

**Extensions** add line-specific columns: Property and Business Income,
General Liability, Commercial Auto, Workers Compensation, Cyber, D&O and
Employment Practices, Umbrella and Excess, Dental and Vision, Life and
Disability, Stop-loss, PBM Pricing and Guarantees.

Column kinds: `extract` (read a value), `analysis` (compare or assess, citing
both sides), `calculate` (a specification the application computes; the model
gathers inputs only).

## Verify

```bash
npm test          # package tests + API tests (end to end against the stub provider)
npm run typecheck
npm run build
```

## What is not done

- Deterministic engine for the 36 `calculate` columns (they return gathered inputs today)
- Row proposal is rule-based (one row per document or per folder, roles from filenames); the template `row_setup_prompt` is returned for a model-backed version
- Pivot views; filters exist (Differences, Needs attention)
- Real authentication: the API trusts an `x-user-id` header, which the host app should set from its own session
- Prompt tuning per template against real documents
- Per-review cost controls and run metrics
