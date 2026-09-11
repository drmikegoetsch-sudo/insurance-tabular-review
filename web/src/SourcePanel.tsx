import { useEffect, useMemo, useState } from "react";
import { FileText, Lock, LockOpen, RefreshCw, X, Check, AlertTriangle, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "./api";
import { Markdown } from "./markdown";
import type { Cell, DocumentDetail, ReviewColumn, ReviewDetail, Row } from "./types";

export const flagDot: Record<Cell["flag"], string> = {
  green: "bg-green-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  grey: "bg-gray-300",
};

export const flagLabel: Record<Cell["flag"], string> = {
  green: "Confirmed",
  yellow: "Needs review",
  red: "Gap or mismatch",
  grey: "Not stated",
};

const fauxLineWidths = ["92%", "76%", "84%", "61%"];

function highlight(text: string, quote: string) {
  if (!quote) return [text];
  const idx = text.toLowerCase().indexOf(quote.toLowerCase());
  if (idx < 0) return [text];
  return [text.slice(0, idx), <mark key="m" className="bg-yellow-200 rounded px-0.5">{text.slice(idx, idx + quote.length)}</mark>, text.slice(idx + quote.length)];
}

export function SourcePanel({
  review,
  row,
  column,
  cell,
  canEdit,
  onClose,
  onCellChange,
  onNotice,
}: {
  review: ReviewDetail;
  row: Row;
  column: ReviewColumn;
  cell: Cell;
  canEdit: boolean;
  onClose: () => void;
  onCellChange: (cell: Cell) => void;
  onNotice: (message: string) => void;
}) {
  const [active, setActive] = useState(0);
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const citations = cell.citations;
  const citation = citations[active] ?? null;
  const docSummary = useMemo(
    () => review.documents.find((d) => d.id === (citation?.document_id ?? row.document_ids[0])),
    [review.documents, citation, row.document_ids],
  );

  useEffect(() => {
    setActive(0);
  }, [cell.row_id, cell.column_index]);

  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    if (!docSummary) return;
    api.document(docSummary.id).then((d) => !cancelled && setDoc(d)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [docSummary?.id]);

  const page = citation?.page ?? 1;
  const pageText = doc?.pages.find((p) => p.number === page)?.text;

  async function patch(body: Parameters<typeof api.patchCell>[3], notice: string) {
    setBusy(true);
    try {
      onCellChange(await api.patchCell(review.id, cell.row_id, cell.column_index, body));
      onNotice(notice);
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Could not update the cell");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      await api.regenerate(review.id, cell.row_id, cell.column_index);
      onNotice("Regenerating this cell against the same source versions.");
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Could not regenerate");
    } finally {
      setBusy(false);
    }
  }

  function override() {
    const value = window.prompt("Override value (leave empty to clear the override):", cell.override_value ?? cell.summary);
    if (value === null) return;
    const reason = value ? window.prompt("Reason for the override:", cell.override_reason ?? "") ?? "" : null;
    void patch({ override_value: value || null, override_reason: reason }, value ? "Override saved. The model value is kept alongside it." : "Override cleared.");
  }

  return (
    <aside className="w-[460px] flex-shrink-0 border-l border-gray-200 bg-white flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{docSummary?.filename ?? row.label}</p>
            <p className="text-xs text-gray-500 truncate">
              {row.label} · {column.name}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 flex-shrink-0" aria-label="Close source preview">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/60 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`w-2 h-2 rounded-full ${flagDot[cell.flag]}`} />
          <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">{column.kind}</span>
          <span className="text-[11px] text-gray-500">· {flagLabel[cell.flag]}</span>
          <span className="text-[11px] text-gray-400">· evidence {cell.evidence_status.replace(/_/g, " ")}</span>
          {cell.stale && <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5">stale</span>}
          {cell.locked && <span className="text-[11px] text-gray-700 bg-gray-100 rounded px-1.5 inline-flex items-center gap-1"><Lock className="w-3 h-3" /> locked</span>}
        </div>
        {cell.override_value ? (
          <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
            <p className="text-[11px] font-semibold text-blue-700 mb-0.5 inline-flex items-center gap-1"><PencilLine className="w-3 h-3" /> Reviewer override</p>
            <p className="text-sm text-gray-800">{cell.override_value}</p>
            {cell.override_reason && <p className="text-xs text-gray-500 mt-0.5">{cell.override_reason}</p>}
            <p className="text-[11px] text-gray-400 mt-1">Model value: {cell.summary}</p>
          </div>
        ) : (
          <Markdown text={cell.status === "error" ? cell.error ?? "Extraction failed" : cell.summary} className="text-sm text-gray-700 leading-relaxed space-y-1" />
        )}
        {cell.reasoning && <p className="text-xs text-gray-500">{cell.reasoning}</p>}
        {cell.missing_inputs.length > 0 && <p className="text-xs text-amber-700">Missing inputs: {cell.missing_inputs.join(", ")}</p>}
        <p className="text-[11px] text-gray-400">Column task: {column.task}</p>
        {cell.review_status !== "unreviewed" && (
          <p className="text-[11px] text-gray-500">
            {cell.review_status === "reviewed" ? "Reviewed" : "Needs correction"} by {cell.reviewer_id} · {cell.reviewed_at ? new Date(cell.reviewed_at).toLocaleString() : ""}
          </p>
        )}
      </div>

      {citations.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-1.5 overflow-x-auto">
          {citations.map((ct, i) => {
            const d = review.documents.find((x) => x.id === ct.document_id);
            return (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border transition-colors ${
                  i === active ? "bg-blue-50 border-blue-200 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
                title={ct.verified ? "Quote found in the source" : "Quote not found in the source"}
              >
                <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-white text-[10px] font-semibold border border-current/20">{i + 1}</span>
                <span className="truncate max-w-[160px]">{d?.filename ?? ct.document_id}</span>
                <span className="text-gray-400">{ct.page ? `p.${ct.page}` : ct.cell ?? ""}</span>
                {ct.verified ? <Check className="w-3 h-3 text-green-600" /> : <AlertTriangle className="w-3 h-3 text-amber-500" />}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto bg-gray-100 p-4">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[11px] font-medium text-gray-500">Source document</span>
          <span className="text-[11px] font-medium text-gray-500 inline-flex items-center gap-1 rounded bg-white border border-gray-200 px-1.5 py-0.5">
            Page {page} of {doc?.pages.length ?? docSummary?.page_count ?? "?"}
          </span>
        </div>
        <div className="mx-auto bg-white rounded-md shadow-sm border border-gray-200 p-6 min-h-[420px]">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-gray-400 mb-5">{(docSummary?.filename ?? "").replace(/\.[^.]+$/, "").toUpperCase()}</p>
          {pageText ? (
            <pre className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-gray-800">{highlight(pageText, citation?.quote ?? "")}</pre>
          ) : citation ? (
            <div className="space-y-3">
              {fauxLineWidths.map((w, i) => (
                <div key={`t-${i}`} className="h-2.5 rounded bg-gray-100" style={{ width: w }} />
              ))}
              <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2.5">
                <p className="text-sm text-gray-800 leading-relaxed"><mark className="bg-yellow-200 rounded px-0.5">{citation.quote}</mark></p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No verbatim citation for this cell.</p>
          )}
        </div>
      </div>

      <div className="px-4 py-3 border-t border-gray-200 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" disabled={!canEdit || busy} onClick={() => void patch({ review_status: cell.review_status === "reviewed" ? "unreviewed" : "reviewed" }, cell.review_status === "reviewed" ? "Marked unreviewed." : "Marked reviewed. Model value and reviewer status stay separate.")}>
          <Check className="w-3.5 h-3.5" /> {cell.review_status === "reviewed" ? "Unreview" : "Mark reviewed"}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={!canEdit || busy} onClick={() => void patch({ review_status: "needs_correction" }, "Flagged for correction.")}>
          <AlertTriangle className="w-3.5 h-3.5" /> Needs correction
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={!canEdit || busy} onClick={override}>
          <PencilLine className="w-3.5 h-3.5" /> Override
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={!canEdit || busy} onClick={() => void patch({ locked: !cell.locked }, cell.locked ? "Unlocked. Runs may overwrite this cell again." : "Locked. Runs will not overwrite this cell.")}>
          {cell.locked ? <LockOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />} {cell.locked ? "Unlock" : "Lock"}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={!canEdit || busy || cell.locked} onClick={() => void regenerate()}>
          <RefreshCw className="w-3.5 h-3.5" /> Regenerate
        </Button>
      </div>
    </aside>
  );
}
