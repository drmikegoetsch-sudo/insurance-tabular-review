import { useEffect, useMemo, useRef, useState } from "react";
import {
  PlusSquare, FolderKanban, Network, FileText, CheckSquare, Database, AlertTriangle, Table2, Sparkles, ChevronDown, ChevronRight,
  Bell, Plus, Download, MessageSquare, Copy, Upload, Loader2, Trash2, Square, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, USER_ID } from "./api";
import { Markdown } from "./markdown";
import { NewReviewDialog } from "./NewReviewDialog";
import { SourcePanel, flagDot } from "./SourcePanel";
import { cellKey, useReview } from "./useReview";
import type { Cell, Review, ReviewColumn, Row } from "./types";

function CitationBadge({ count, verified }: { count: number; verified: boolean }) {
  return (
    <span className={`inline-flex items-center justify-center align-middle ml-1 w-5 h-5 rounded text-[11px] font-semibold border ${verified ? "bg-blue-50 text-blue-600 border-blue-100" : "bg-amber-50 text-amber-700 border-amber-100"}`} title={verified ? "All quotes verified in the source" : "One or more quotes could not be verified"}>
      {count}
    </span>
  );
}

function TableCell({ cell }: { cell: Cell }) {
  const verified = cell.citations.every((c) => c.verified);
  const marks = [cell.stale && "stale", cell.locked && "locked", cell.review_status === "reviewed" && "reviewed", cell.review_status === "needs_correction" && "needs correction"].filter(Boolean);
  return (
    <div className="flex gap-2.5">
      <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${flagDot[cell.flag]}`} />
      <div className="min-w-0 text-sm leading-relaxed text-gray-700">
        {cell.override_value ? (
          <>
            <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium border border-blue-100 text-xs">override</span>
            <span>{cell.override_value}</span>
          </>
        ) : cell.status === "error" ? (
          <span className="text-red-600">{cell.error ?? "Extraction failed"}</span>
        ) : (
          <Markdown text={cell.summary} className="line-clamp-4 space-y-0.5" />
        )}
        {cell.citations.length ? <CitationBadge count={cell.citations.length} verified={verified} /> : null}
        {marks.length > 0 && <p className="text-[11px] text-gray-400 mt-1">{marks.join(" · ")}</p>}
      </div>
    </div>
  );
}

function ExtractingCell({ running }: { running: boolean }) {
  const pulse = running ? "animate-pulse" : "";
  return (
    <div className="flex gap-2.5" aria-label={running ? "Extracting" : "Pending"}>
      <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 bg-gray-300 ${pulse}`} />
      <div className="flex-1 space-y-1.5 pt-0.5">
        <div className={`h-3 rounded bg-gray-200 w-4/5 ${pulse}`} />
        <div className={`h-3 rounded bg-gray-100 w-2/5 ${pulse}`} />
      </div>
    </div>
  );
}

/** Template columns not yet on the review, offered in the Add column menu. */
function TemplateColumnItems({ review, onPick }: { review: { template_id: string | null; extension_ids: string[]; columns: ReviewColumn[] }; onPick: (c: Partial<ReviewColumn>) => void }) {
  const [items, setItems] = useState<ReviewColumn[]>([]);
  useEffect(() => {
    if (!review.template_id) return;
    api.buildColumns(review.template_id, review.extension_ids, true)
      .then(({ columns }) => setItems(columns.filter((c) => !review.columns.some((r) => r.key === c.key))))
      .catch(() => setItems([]));
  }, [review.template_id, review.extension_ids, review.columns]);
  if (!items.length) return null;
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs text-gray-500">From the template</DropdownMenuLabel>
      {items.map((c) => (
        <DropdownMenuItem key={c.key} onClick={() => onPick({ name: c.name, prompt: c.prompt, kind: c.kind, type: c.type, task: c.task, key: c.key, format: c.format })} className="cursor-pointer flex-col items-start gap-0">
          <span>{c.name}</span>
          <span className="text-[11px] text-gray-400 line-clamp-1">{c.task}</span>
        </DropdownMenuItem>
      ))}
    </>
  );
}

type View = "all" | "differences" | "attention";

const NAV: [string, typeof FolderKanban][] = [["Projects", FolderKanban], ["Workflows", Network]];
const NAV_AFTER: [string, typeof FolderKanban][] = [["Records", FileText], ["Actions", CheckSquare], ["Data Sources", Database], ["Risk Intelligence", AlertTriangle]];

export default function ReviewPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewId, setReviewId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("review"));
  const { review, cells, progress, running, error, reload, run, updateCell, setError } = useReview(reviewId);
  const [view, setView] = useState<View>("all");
  const [selected, setSelected] = useState<{ rowId: string; columnIndex: number } | null>(null);
  const [panel, setPanel] = useState<"cell" | "chat" | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshReviews = () => api.reviews().then(setReviews).catch(() => undefined);
  useEffect(() => {
    void refreshReviews();
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (reviewId) url.searchParams.set("review", reviewId);
    else url.searchParams.delete("review");
    window.history.replaceState(null, "", url);
    setSelected(null);
    setPanel(null);
    setChat([]);
    setView("all");
  }, [reviewId]);
  useEffect(() => {
    if (!reviews.length || reviewId) return;
    setReviewId(reviews[0].id);
  }, [reviews, reviewId]);
  useEffect(() => {
    if (!running) void refreshReviews();
  }, [running]);

  function toast(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }
  useEffect(() => {
    if (error) {
      toast(error);
      setError(null);
    }
  }, [error, setError]);

  const canEdit = !!review && (review.owner_id === USER_ID || review.shares.some((s) => s.user_id === USER_ID && s.role === "editor"));
  const columns = review?.columns ?? [];
  const rows = review?.rows ?? [];
  const cellAt = (row: Row, col: ReviewColumn) => cells.get(cellKey(row.id, col.index));

  const diffColumns = useMemo(
    () => columns.filter((col) => new Set(rows.map((r) => cells.get(cellKey(r.id, col.index))).filter((c) => c?.status === "done").map((c) => c!.override_value ?? c!.summary)).size > 1),
    [columns, rows, cells],
  );
  const attentionRows = useMemo(
    () => rows.filter((r) => columns.some((col) => { const c = cells.get(cellKey(r.id, col.index)); return c && (c.flag === "red" || c.flag === "yellow"); })),
    [columns, rows, cells],
  );
  const displayColumns = view === "differences" ? diffColumns : columns;
  const displayRows = view === "attention" ? attentionRows : rows;
  const allCells = [...cells.values()];
  const doneCount = allCells.filter((c) => c.status === "done").length;
  const errorCount = allCells.filter((c) => c.status === "error").length;
  const attentionCount = allCells.filter((c) => c.flag === "red" || c.flag === "yellow").length;
  const totalCells = rows.length * columns.length;

  const selectedRow = selected ? rows.find((r) => r.id === selected.rowId) : undefined;
  const selectedColumn = selected ? columns.find((c) => c.index === selected.columnIndex) : undefined;
  const selectedCell = selectedRow && selectedColumn ? cellAt(selectedRow, selectedColumn) : undefined;

  async function addDocuments(files: File[]) {
    if (!review || !files.length) return;
    setUploading(true);
    try {
      const folder = review.document_grouping === "folder" ? window.prompt("Bundle (folder) name for these documents:", "") ?? undefined : undefined;
      const result = await api.upload(files, folder || undefined);
      if (result.failed.length) toast(result.failed.map((f) => `${f.filename}: ${f.detail}`).join("; "));
      const ids = result.documents.map((d) => d.id);
      if (!ids.length) return;
      const proposal = await api.proposeRows(review.id, ids);
      const merged = review.rows.map((r) => ({ ...r, document_ids: [...r.document_ids], document_roles: { ...r.document_roles } }));
      for (const p of proposal.rows) {
        const existing = review.document_grouping === "folder" ? merged.find((r) => r.label === p.label) : undefined;
        if (existing) {
          existing.document_ids = [...new Set([...existing.document_ids, ...p.document_ids])];
          existing.document_roles = { ...existing.document_roles, ...p.document_roles };
        } else {
          merged.push({ ...p, review_id: review.id, sort_index: merged.length });
        }
      }
      await api.putRows(review.id, merged);
      await reload();
      void refreshReviews();
      toast(`${result.documents.length} document${result.documents.length === 1 ? "" : "s"} added. Run the review to fill the new cells.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addColumn(preset?: Partial<ReviewColumn>) {
    if (!review) return;
    let column = preset;
    if (!column) {
      const name = window.prompt("Column name:");
      if (!name) return;
      const prompt = window.prompt("What should be extracted or assessed for this column?");
      if (!prompt) return;
      column = { name, prompt };
    }
    try {
      await api.patchReview(review.id, { columns: [...review.columns, column] });
      await reload();
      toast("Column added. Run the review to fill it.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not add the column");
    }
  }

  async function removeColumn(col: ReviewColumn) {
    if (!review || !window.confirm(`Remove the "${col.name}" column and its cells?`)) return;
    await api.patchReview(review.id, { columns: review.columns.filter((c) => c.key !== col.key) });
    setSelected(null);
    setPanel(null);
    await reload();
  }

  async function sendChat() {
    if (!review || !chatInput.trim() || chatBusy) return;
    const next = [...chat, { role: "user" as const, content: chatInput.trim() }];
    setChat(next);
    setChatInput("");
    setChatBusy(true);
    try {
      const { answer } = await api.chat(review.id, next);
      setChat([...next, { role: "assistant", content: answer }]);
    } catch (e) {
      setChat([...next, { role: "assistant", content: e instanceof Error ? e.message : "Chat failed" }]);
    } finally {
      setChatBusy(false);
    }
  }

  function openCell(row: Row, col: ReviewColumn) {
    setSelected({ rowId: row.id, columnIndex: col.index });
    setPanel("cell");
  }

  const gridCols = `260px repeat(${displayColumns.length || 1}, minmax(240px, 1fr))${canEdit ? " 56px" : ""}`;
  const tableMinWidth = 260 + (displayColumns.length || 1) * 240 + (canEdit ? 56 : 0);
  const title = review?.title ?? "Tabular Review";
  const runLabel = doneCount === 0 ? "Run review" : doneCount < totalCells ? "Run pending" : "Run again";

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-gray-100 border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white text-xs font-bold">S</div>
            <div>
              <div className="flex items-center gap-1"><span className="text-sm font-semibold text-gray-900">SoterProduct Team</span><ChevronDown className="w-3.5 h-3.5 text-gray-500" /></div>
              <p className="text-[10px] text-gray-500">Powered by <span className="font-semibold text-blue-600">SOTER</span></p>
            </div>
          </div>
          <button type="button" className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors" aria-label="Notifications"><Bell className="w-4 h-4 text-gray-600" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pt-4 pb-3">
            <button type="button" onClick={() => setDialogOpen(true)} className="w-full flex items-center gap-3 px-4 py-2.5 text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              <PlusSquare className="w-5 h-5" /><span className="font-medium">New Review</span>
            </button>
          </div>
          <div className="px-4 pb-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Workspace</h3>
            <nav className="space-y-1">
              {NAV.map(([label, Icon]) => (
                <a key={label} href="#" className="flex items-center gap-3 px-3 py-2 text-gray-900 hover:bg-gray-200 rounded-md"><Icon className="w-5 h-5" /><span className="text-sm">{label}</span></a>
              ))}
              <span className="flex items-center gap-3 px-3 py-2 bg-gray-200 text-gray-900 rounded-md" aria-current="page"><Table2 className="w-5 h-5" /><span className="text-sm font-medium">Review</span></span>
              {NAV_AFTER.map(([label, Icon]) => (
                <a key={label} href="#" className="flex items-center gap-3 px-3 py-2 text-gray-900 hover:bg-gray-200 rounded-md"><Icon className="w-5 h-5" /><span className="text-sm">{label}</span></a>
              ))}
            </nav>
          </div>
          <div className="px-4 pb-4">
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Reviews</h3>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
            <div className="space-y-0.5">
              {reviews.length === 0 && <p className="px-3 text-xs text-gray-400">No reviews yet.</p>}
              {reviews.map((r) => (
                <button key={r.id} type="button" onClick={() => setReviewId(r.id)} className={`w-full text-left px-3 py-2 rounded-md text-sm truncate transition-colors ${r.id === reviewId ? "bg-gray-200 text-gray-900 font-medium" : "text-gray-700 hover:bg-gray-200"}`} title={r.title}>
                  {r.title}
                  {r.active_generation_id && <Loader2 className="inline w-3 h-3 ml-1 animate-spin text-blue-600" />}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">{USER_ID.slice(0, 2).toUpperCase()}</div>
            <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900 truncate">{USER_ID}</p><p className="text-xs text-gray-500 truncate">local session</p></div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4">
          <nav className="flex items-center gap-2 text-sm text-gray-500 min-w-0">
            <span>Reviews</span>
            <ChevronRight className="w-4 h-4 text-gray-300" />
            <span className="text-gray-900 font-medium truncate">{title}</span>
          </nav>
          <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0" onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4" /> New Review</Button>
        </div>

        <div className="flex-1 flex min-w-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {!review ? (
              <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
                <p className="text-base font-semibold text-gray-900">{reviewId ? "Loading…" : "No review open"}</p>
                <p className="text-sm text-gray-500 mt-1">Create a review from a template, drop in documents, and run it.</p>
                <Button size="sm" className="mt-4 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4" /> New Review</Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4 mb-2">
                  <h1 className="text-2xl font-bold text-gray-900 text-balance">{review.title}</h1>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a href={api.exportUrl(review.id)} className="inline-flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50"><Download className="w-4 h-4" /> Export</a>
                    {canEdit && rows.length > 0 && (
                      <Button variant="outline" size="sm" className="gap-1.5" disabled={uploading} onClick={() => fileRef.current?.click()}>
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Add documents
                      </Button>
                    )}
                    {running ? (
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void api.cancel(review.id).then(() => toast("Cancelling…"))}><Square className="w-4 h-4" /> Stop</Button>
                    ) : (
                      <Button size="sm" onClick={() => void run(doneCount && doneCount < totalCells ? "pending" : "all")} disabled={!canEdit || rows.length === 0 || columns.length === 0} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
                        <Sparkles className="w-4 h-4" /> {runLabel}
                      </Button>
                    )}
                    {canEdit && (
                      <button type="button" onClick={() => { if (window.confirm("Delete this review?")) void api.deleteReview(review.id).then(() => { setReviewId(null); void refreshReviews(); }); }} className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label="Delete review"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mb-5 text-xs text-gray-500">
                  {review.template_id && <span className="inline-flex items-center rounded bg-gray-100 border border-gray-200 px-2 py-0.5 text-gray-700">{review.template_id}{review.extension_ids.length ? ` + ${review.extension_ids.join(", ")}` : ""}</span>}
                  <span>{rows.length} row{rows.length === 1 ? "" : "s"} · {columns.length} column{columns.length === 1 ? "" : "s"} · {doneCount} of {totalCells} cells extracted{errorCount ? ` · ${errorCount} failed` : ""}</span>
                  {running && progress && (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-28 h-1.5 rounded bg-gray-200 overflow-hidden"><span className="block h-full bg-blue-600 transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} /></span>
                      Extracting {progress.done} of {progress.total}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1" role="tablist" aria-label="Table view">
                    {([["all", "All", 0], ["differences", "Differences", diffColumns.length], ["attention", "Needs attention", attentionCount]] as const).map(([key, label, count]) => (
                      <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)} className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${view === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>
                        {label}
                        {count ? <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded bg-amber-100 text-amber-700 text-[11px] font-semibold">{count}</span> : null}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Confirmed</span>
                    <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Needs review</span>
                    <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Gap</span>
                    <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300" /> Not stated</span>
                    <Button variant="outline" size="sm" className="gap-1.5 ml-2" onClick={() => setPanel(panel === "chat" ? null : "chat")}><MessageSquare className="w-3.5 h-3.5" /> Ask</Button>
                  </div>
                </div>

                {rows.length === 0 ? (
                  <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void addDocuments(Array.from(e.dataTransfer.files)); }} onClick={() => fileRef.current?.click()} className="rounded-xl border-2 border-dashed border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50 cursor-pointer flex flex-col items-center justify-center text-center px-6 py-16">
                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-4">{uploading ? <Loader2 className="w-6 h-6 text-blue-600 animate-spin" /> : <Upload className="w-6 h-6 text-blue-600" />}</div>
                    <p className="text-base font-semibold text-gray-900">Drag documents here to add them as rows</p>
                    <p className="text-sm text-gray-500 mt-1 max-w-md">Each document{review.document_grouping === "folder" ? " bundle" : ""} becomes a row and the {columns.length} template column{columns.length === 1 ? "" : "s"} fill in when you run the review.</p>
                  </div>
                ) : view === "differences" && diffColumns.length === 0 ? (
                  <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
                    <p className="text-sm font-medium text-gray-900">No differences found</p>
                    <p className="text-sm text-gray-500 mt-1">{rows.length < 2 ? "Add another document to compare values across rows." : doneCount ? "Every row agrees across the extracted columns." : "Run the review first."}</p>
                  </div>
                ) : view === "attention" && attentionRows.length === 0 ? (
                  <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
                    <p className="text-sm font-medium text-gray-900">Nothing needs attention</p>
                    <p className="text-sm text-gray-500 mt-1">{doneCount ? "No red or yellow cells in this review." : "Run the review first."}</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
                    <div style={{ minWidth: tableMinWidth }}>
                      <div className="grid" style={{ gridTemplateColumns: gridCols }}>
                        <div className="sticky left-0 z-20 px-4 py-3 border-b border-r border-gray-200 bg-gray-50"><span className="text-sm font-semibold text-gray-900">{review.document_grouping === "folder" ? "Bundle" : "Document"}</span></div>
                        {displayColumns.map((col) => (
                          <div key={col.key} title={col.task} className="group px-4 py-3 border-b border-l border-gray-200 bg-gray-50/60 flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900 truncate">{col.name}</span>
                            <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">{col.kind}</span>
                            {canEdit && <button type="button" onClick={() => void removeColumn(col)} className="ml-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 rounded hover:bg-gray-200" aria-label={`Remove ${col.name}`}><Trash2 className="w-3.5 h-3.5 text-gray-400" /></button>}
                          </div>
                        ))}
                        {canEdit && (
                          <div className="border-b border-l border-gray-200 bg-gray-50/60 flex items-center justify-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button type="button" className="w-9 h-9 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-colors" aria-label="Add column"><Plus className="w-4 h-4" /></button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-72">
                                <DropdownMenuLabel className="text-xs text-gray-500">Add a column</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => void addColumn()} className="cursor-pointer">Custom column…</DropdownMenuItem>
                                <TemplateColumnItems review={review} onPick={(c) => void addColumn(c)} />
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>
                      {displayRows.map((row, i) => (
                        <div key={row.id} className="grid" style={{ gridTemplateColumns: gridCols }}>
                          <div className={`sticky left-0 z-10 bg-white px-4 py-4 border-r ${i > 0 ? "border-t" : ""} border-gray-200`}>
                            <div className="flex gap-2.5">
                              <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{row.label}</p>
                                <p className="text-xs text-gray-500 mt-0.5 truncate" title={row.document_ids.map((id) => review.documents.find((x) => x.id === id)?.filename ?? id).join(", ")}>
                                  {row.document_ids.map((id) => { const d = review.documents.find((x) => x.id === id); return d ? `${row.document_roles[id] ?? "document"}: ${d.filename}` : id; }).join(" · ")}
                                </p>
                              </div>
                            </div>
                          </div>
                          {displayColumns.map((col) => {
                            const cell = cellAt(row, col);
                            const ready = !!cell && (cell.status === "done" || cell.status === "error");
                            const isSelected = selected?.rowId === row.id && selected?.columnIndex === col.index;
                            return (
                              <div
                                key={col.key}
                                role={ready ? "button" : undefined}
                                tabIndex={ready ? 0 : undefined}
                                onClick={ready ? () => openCell(row, col) : undefined}
                                onKeyDown={ready ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCell(row, col); } } : undefined}
                                className={`px-4 py-4 border-l ${i > 0 ? "border-t" : ""} border-gray-200 group relative transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${ready ? "cursor-pointer hover:bg-blue-50/40" : ""} ${isSelected ? "bg-blue-50 ring-1 ring-inset ring-blue-300" : ""}`}
                              >
                                {ready && cell ? (
                                  <>
                                    <TableCell cell={cell} />
                                    <button type="button" onClick={(e) => { e.stopPropagation(); void navigator.clipboard?.writeText(cell.override_value ?? cell.summary); toast("Copied."); }} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1 rounded hover:bg-gray-100" aria-label="Copy cell"><Copy className="w-3.5 h-3.5 text-gray-400" /></button>
                                  </>
                                ) : (
                                  <ExtractingCell running={cell?.status === "running" || (running && cell?.status === "pending")} />
                                )}
                              </div>
                            );
                          })}
                          {canEdit && <div className={`border-l ${i > 0 ? "border-t" : ""} border-gray-200`} />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {canEdit && rows.length > 0 && (
                  <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void addDocuments(Array.from(e.dataTransfer.files)); }} onClick={() => fileRef.current?.click()} className="mt-4 rounded-xl border-2 border-dashed border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50 cursor-pointer flex items-center justify-center gap-2 px-6 py-5">
                    <Upload className="w-4 h-4 text-gray-400" /><span className="text-sm text-gray-500">Drag more documents here to add rows</span>
                  </div>
                )}
                <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void addDocuments(Array.from(e.target.files ?? []))} />
              </>
            )}
          </div>

          {panel === "chat" && review && (
            <aside className="w-[460px] flex-shrink-0 border-l border-gray-200 bg-white flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">Ask about this review</p>
                <button type="button" onClick={() => setPanel(null)} className="p-1 rounded hover:bg-gray-100" aria-label="Close"><ChevronRight className="w-4 h-4 text-gray-500" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chat.length === 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {["Which rows have red flags?", "Summarize what needs correction", "Compare the rows on limits"].map((q) => (
                      <button key={q} type="button" onClick={() => setChatInput(q)} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200">{q}</button>
                    ))}
                  </div>
                )}
                {chat.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "ml-8 rounded-2xl rounded-br-sm bg-gray-100 px-3 py-2 text-sm" : "mr-4 text-sm text-gray-800"}>
                    <Markdown text={m.content} className="space-y-1.5" />
                  </div>
                ))}
                {chatBusy && <p className="text-xs text-gray-400">Thinking…</p>}
              </div>
              <form className="p-3 border-t border-gray-200 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void sendChat(); }}>
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask about the cells…" className="flex-1 border border-gray-200 rounded-full px-3 py-1.5 text-sm outline-none focus:border-blue-400" aria-label="Question" />
                <button type="submit" className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center disabled:opacity-40" disabled={chatBusy || !chatInput.trim()} aria-label="Send"><Send className="w-3.5 h-3.5" /></button>
              </form>
            </aside>
          )}
          {panel === "cell" && review && selectedRow && selectedColumn && selectedCell && (
            <SourcePanel review={review} row={selectedRow} column={selectedColumn} cell={selectedCell} canEdit={canEdit} onClose={() => { setSelected(null); setPanel(null); }} onCellChange={updateCell} onNotice={toast} />
          )}
        </div>
      </div>

      <NewReviewDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreated={(created) => { void refreshReviews(); setReviewId(created.id); toast(created.rows.length ? "Review created. Run it to extract the cells." : "Review created. Add documents to create rows."); }} />

      {notice && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-full shadow-lg z-50" role="status">{notice}</div>}
    </div>
  );
}
