# 1. Data model

Everything a tabular review needs to store. Names are suggestions; the shapes
and the invariants are the point.

## Review

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `title` | text | |
| `template_id` | text, nullable | Catalog template the review started from (`CI04`). Null for a blank review. |
| `extension_ids` | text[] | Extensions appended at creation. |
| `columns` | json `ReviewColumn[]` | From `buildColumns()`. Editable afterwards; keep `index` contiguous. |
| `document_grouping` | `document` \| `folder` | Whether each row is one document or one folder of documents. Most templates want folder rows (a placement bundle, a quote option with its attachments). |
| `model` | text | Model pinned to the review so regeneration is repeatable. |
| `project_id`, `owner_id`, sharing | | Follow the host product's conventions. |
| `active_generation_id` | uuid, nullable | Lease for the single in-flight run. See section 4. |
| `generation_lease_expires_at` | timestamp | |

## Row

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Stable key. Never use row position as identity. |
| `review_id` | uuid | |
| `label` | text | Shown in the sticky first column ("Option A · Northwind Mutual"). |
| `row_type` | `document` \| `folder` | |
| `document_ids` | uuid[] | Every document in the bundle. |
| `document_roles` | json `{document_id: role}` | `quote`, `binder`, `policy`, `endorsement`, `contract`, `baseline`, `comparison`, and so on. Templates that compare stages or pairs depend on this. |
| `comparison_group_id` | text, nullable | Groups comparable rows; prevents cross-account or cross-period comparison. |
| `user_context` | json | Template-required facts the user supplied (option id, comparison effective date, baseline option). |
| `sort_index` | int | |

## Cell

| Field | Type | Notes |
| --- | --- | --- |
| `row_id`, `column_index` | | Primary key. |
| `status` | `pending` \| `running` \| `done` \| `error` | Generation state. |
| `summary` | text | Rendered value. Markdown allowed. |
| `flag` | `green` \| `yellow` \| `red` \| `grey` | |
| `evidence_status` | enum | `found`, `not_stated`, `not_applicable`, `conflicting_evidence`, `unreadable`, `insufficient_inputs`, `not_comparable`. Distinct from reviewer status. |
| `reasoning` | text | Evidence explanation. |
| `citations` | json `CellCitation[]` | Validated before display (section 3). |
| `assumptions`, `missing_inputs` | text[] | Mostly for calculate columns. |
| `generation_id` | uuid | Run that produced the value. Writes from a superseded run are dropped. |
| `source_version_ids` | uuid[] | Document versions the value was read from. Used to mark cells stale. |

### Review-state fields (human, never model-set)

| Field | Set by | Notes |
| --- | --- | --- |
| `review_status` | reviewer | `unreviewed` \| `reviewed` \| `needs_correction`. |
| `reviewer_id`, `reviewed_at` | system, from the human event | |
| `locked` | reviewer or system | A locked cell is never overwritten by a run; changed evidence queues it for re-review instead. |
| `override_value`, `override_reason` | reviewer | The model value is preserved alongside. |
| `stale` | system | True when a source version or the column prompt changed after generation. |
| `owner`, `due_date`, `action_status` | reviewer or task import | Only from explicit assignment. Never inferred from model text. |

Invariants:

- Model output never sets `review_status`, `locked`, `owner`, or `action_status`.
- A new document version marks every unlocked cell that read it `stale` and marks reviewed cells stale without clearing them.
- Editing a column prompt marks that column's cells stale.

## Column (`ReviewColumn`)

Produced by the package. `key` is the catalog column id and stays stable when
columns are reordered; `index` is the grid position and is what cells key on.
When a user adds a custom column, generate a `key` (`custom_<slug>`), set
`kind` to `extract` or `analysis`, and leave `source` as `{kind: "custom"}`.
