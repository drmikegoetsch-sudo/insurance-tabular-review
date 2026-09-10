# 4. Review lifecycle and UI

What the user does, in order, and what the screen shows. `demo/index.html`
is the visual reference for every state below.

## Create

1. **Details.** Name, model, template. Choosing a template shows its row
   grain ("Each row is: one carrier quote option × coverage line × proposed
   term"), the documents it needs, the applicable extensions as checkboxes,
   and an "include all N columns" toggle. The planned column count updates
   live.
2. **Access.** Who can view or edit. Skippable.
3. **Documents.** Upload or pick from a project. If the template needs
   bundles (stages, pairs, options), the row-proposal step runs here: the
   model proposes rows and document roles from the template's
   `row_setup_prompt`; the user confirms, merges, or splits them, and fills
   any `required_user_context` (baseline option, comparison date).

The review is created with `pending` cells and opens on the grid.

## Grid

- Sticky first column with the row label and a one-line sub-label (the
  bundle's document ids or roles).
- One column per `ReviewColumn`, header shows the name and a small kind tag
  (`extract`, `analysis`, `calculate`).
- A cell shows its flag dot and the summary, clamped to four lines. Lists
  render as bullets. Money, dates, and tags render as chips.
- `pending` cells shimmer during a run; the toolbar shows "Extracting… N of
  M cells" with a progress bar. Reloading re-attaches to the run.
- Views come from the template's `views` list: the default column set, then
  filters such as "Discrepancies only" or "Unmet requirements", and pivots
  such as "coverage item as rows, options as columns". A filter hides rows
  whose cells have no red or yellow flags; a pivot transposes the grid.
- "Add column" opens the column editor with the insurance presets; the new
  column's cells start `pending` and can be generated alone.

## Cell panel

Clicking a cell opens a side panel:

- Row and column, the full summary, the evidence status with its flag.
- The explanation (`reasoning`).
- Citations as cards: document name, page (or sheet and cell), the verbatim
  quote. Clicking one opens the source at that page.
- Review actions: Mark reviewed, Override value (keeps the model value and
  records a reason), Lock, Regenerate cell. Assign owner and due date if the
  host product has tasks.

## Chat panel

The same side panel has a Chat tab. Questions are answered from the cells
(not the documents), with `[N]` markers that link to the cited cells.
Suggested prompts: "Which rows have red flags?", "Draft the client email",
"Compare row 1 and row 3".

## Staleness and re-review

- Uploading a new version of a document marks every cell that read it
  `stale`; the grid shows a stale badge and a "Regenerate stale" action.
- Locked cells are never overwritten. A stale locked cell shows both the
  locked value and a "new evidence" indicator.
- Reviewed cells that go stale keep `review_status` but display it as
  needing re-review.

## Export

Excel with one sheet for the grid (summary, flag, evidence status, reviewer
status, owner) and one for citations (row, column, document, page, quote),
plus a manifest of document version ids. The "Carrier correction list",
"Evidence requests", and "Client explanation" columns are what most users
export.
