# 2. API

A minimal HTTP surface. Adapt paths and auth to the host product; keep the
verbs and the streaming shape.

## Templates

`GET /reviews/templates`
Returns the catalog summaries: templates and extensions without column
prompts. The package's `getCatalog()` is the source; strip `prompt` and
`calculation` before returning so prompts never reach the browser.

`POST /reviews/templates/columns`
Body `{ template_id, extension_ids?: string[], include_optional?: boolean }`.
Returns `{ columns: ReviewColumn[] }` from `buildColumns()`. 404 for an unknown
template, 400 for an extension that does not apply.

## Reviews

`POST /reviews`
Body `{ title, model, template_id?, extension_ids?, columns, document_ids,
document_grouping, project_id? }`. Creates the review, its rows, and one
`pending` cell per row × column. Returns the review.

`GET /reviews/:id` returns the review, columns, rows, and cells.

`PATCH /reviews/:id` renames, changes the model, or replaces `columns`.
Replacing columns deletes cells for removed indexes and inserts `pending`
cells for new ones; existing cells keep their values.

`DELETE /reviews/:id`

## Rows

`POST /reviews/:id/rows/propose`
Body `{ document_ids }`. Runs the template's `row_setup_prompt` over the
document list and returns proposed rows: `{ label, document_ids,
document_roles, comparison_group_id, user_context_needed[] }`. The user
confirms or edits before rows are created. Do not begin extraction while
document grouping is ambiguous.

`PUT /reviews/:id/rows` replaces the row set (labels, bundles, roles, user
context). Cells for removed rows are deleted; new rows get `pending` cells.

## Generation

`POST /reviews/:id/generate`
Body `{ scope: "all" | "pending" | { row_ids?, column_indexes? } }`.
Claims the review's generation lease (409 if another run holds it), marks the
targeted cells `pending`, and streams progress as server-sent events:

```
event: cell
data: {"row_id": "…", "column_index": 3, "status": "done", "cell": { …CellResult }}

event: cell
data: {"row_id": "…", "column_index": 4, "status": "error", "message": "…"}

event: progress
data: {"done": 17, "total": 60}

event: complete
data: {"generation_id": "…"}
```

`GET /reviews/:id/generate/stream` re-attaches to an in-flight run after a
reload and replays events since the last id.

`POST /reviews/:id/cells/regenerate` body `{ row_id, column_index }` reruns
one cell against the same source versions. Locked cells return 409.

`POST /reviews/:id/cells/clear` body `{ row_ids?, column_indexes? }`.

## Review state

`PATCH /reviews/:id/cells/:row_id/:column_index`
Body may set `review_status`, `locked`, `override_value`, `override_reason`,
`owner`, `due_date`, `action_status`. These are the only fields a client may
write; the server stamps `reviewer_id` and `reviewed_at`.

## Chat over the grid

`POST /reviews/:id/chat` body `{ messages }`, streamed. The assistant is given
the row labels and column names, and a `read_table_cells` tool that returns
cell summaries for requested rows and columns. Answers cite cells by
`{row_index, col_index, quote}` so the UI can link back into the grid. The
assistant never sees document text directly; it reads cells.

## Export

`GET /reviews/:id/export.xlsx` writes rows × columns with the summary text,
flag, evidence status, reviewer status, and a citations sheet. Include a
manifest with document version ids so an export can be tied to its evidence.
