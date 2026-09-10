# 3. Extraction contract

How a row becomes cells. The package builds both prompts; this describes what
the application does around them.

## One request per row

For each row, send one chat completion:

- **System:** `buildSystemPrompt()`. Analyst persona, the template guide's
  shared rules, the value-type guides, and the cell output contract.
- **User:** `buildRowPrompt({ documents, userContext, columns })`. Each
  document is wrapped in `<document id="…" filename="…" role="…">` with the
  id the model must cite. Then the user context. Then every column as
  `Column N — "Name"` followed by its prompt tail.

Stream the response. The model emits one minified JSON object per line, in
column order. Parse each line with `parseCellLine()` as it arrives and write
the cell immediately, so the grid fills in progressively. Lines that do not
parse are skipped; a column with no line at the end is marked `error`.

Document text is extracted once per document version and cached. PDFs by
page with `[Page N]` markers so page citations line up; spreadsheets as
markdown tables with a `Row` column and column-letter headers so cell
citations can name `B7`; Word files converted to PDF first if page fidelity
matters.

## Cell object

```json
{
  "column_index": 4,
  "summary": "$1,000,000 each occurrence; $2,000,000 general aggregate",
  "flag": "green",
  "evidence_status": "found",
  "reasoning": "Declarations page 2. No endorsement changes the limits.",
  "citations": [
    { "document_id": "doc-2", "page": 2, "quote": "Each Occurrence Limit $1,000,000" }
  ],
  "assumptions": [],
  "missing_inputs": []
}
```

Flag semantics, in the words the UI shows:

| Flag | Meaning |
| --- | --- |
| green | Confirmed and favorable to the insured, or meets the requirement |
| yellow | Conditional, sublimited, ambiguous, conflicting, or needs review |
| red | Excluded, a gap, an express mismatch, or an adverse term |
| grey | Not stated, not applicable, unreadable, or insufficient inputs |

`flagForEvidenceStatus()` supplies a default when the model omits the flag.

## Column kinds

- **extract** and **analysis** run as above. Analysis columns are told to
  state the evidence and the conditional assessment separately.
- **calculate** columns are specifications, not model arithmetic. The model
  returns the cited inputs and assumptions and lists `missing_inputs`; the
  application computes the result from `column.calculation` and the
  `depends_on` cells. Until that engine exists, render the inputs cell as-is
  and label the column "inputs only".

## Citation validation

Before a citation is shown as verified:

1. `document_id` must be one of the row's documents.
2. The quote must appear in that document version's text (normalize
   whitespace and quotes; allow a small edit distance for OCR noise).
3. If a page is given, prefer the page where the quote was found and correct
   the page silently when the text is found elsewhere.

Citations that fail are kept but rendered as unverified. Never drop the
cell.

## Prompt injection

Document text is data. The rules already say so; also strip or neutralize
anything in the extracted text that looks like `<document>` tags, and never
let filenames or user-supplied labels reach the system prompt unfenced.

## Concurrency

One generation per review at a time, enforced with a lease
(`active_generation_id` + expiry, renewed while the run is alive). Cell
writes carry the `generation_id` and are dropped if the review's active id
has moved on. Rows are processed with a small concurrency limit per review
and a global limit per model provider.
