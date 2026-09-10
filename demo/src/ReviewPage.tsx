import React, { useEffect, useRef, useState } from "react";
import {
  PlusSquare,
  FolderKanban,
  Network,
  FileText,
  CheckSquare,
  Database,
  AlertTriangle,
  Table2,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Bell,
  Plus,
  Download,
  Copy,
  Upload,
  GripVertical,
  FilePlus2,
  Loader2,
  X,
  LayoutTemplate,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  reviewTemplates,
  columnPresets,
  blankSampleDocs,
  catalogTemplates,
  defaultColumnsFor,
  badgeFor,
  type Cell,
  type CellStatus,
  type Column,
  type Row,
  type ReviewTemplate,
} from "./reviewData";

type PlacedRow = Row & { sourceId: string };

const statusDot: Record<CellStatus, string> = {
  verified: "bg-green-500",
  attention: "bg-amber-500",
  flagged: "bg-red-500",
  missing: "bg-gray-300",
};

const statusLabel: Record<CellStatus, string> = {
  verified: "Confirmed",
  attention: "Needs review",
  flagged: "Gap or mismatch",
  missing: "Not stated",
};

const evidenceLabel: Record<NonNullable<Cell["evidence"]>, string> = {
  found: "found",
  not_stated: "not stated",
  not_applicable: "not applicable",
  conflicting_evidence: "conflicting evidence",
  insufficient_inputs: "insufficient inputs",
  not_comparable: "not comparable",
};

function CitationBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center justify-center align-middle ml-1 w-5 h-5 rounded bg-blue-50 text-blue-600 text-[11px] font-semibold border border-blue-100">
      {count}
    </span>
  );
}

function TableCell({ cell }: { cell: Cell }) {
  return (
    <div className="flex gap-2.5">
      <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${statusDot[cell.status]}`} />
      <div className="min-w-0 text-sm leading-relaxed text-gray-700">
        {cell.highlight && (
          <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-semibold border border-green-100">
            {cell.highlight}
          </span>
        )}
        <span>{cell.primary}</span>
        {cell.citations?.length ? <CitationBadge count={cell.citations.length} /> : null}
        {cell.secondary && <p className="text-gray-500 mt-1">{cell.secondary}</p>}
      </div>
    </div>
  );
}

function ExtractingCell() {
  return (
    <div className="flex gap-2.5" aria-label="Extracting">
      <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0 bg-gray-300 animate-pulse" />
      <div className="flex-1 space-y-1.5 pt-0.5">
        <div className="h-3 rounded bg-gray-200 animate-pulse w-4/5" />
        <div className="h-3 rounded bg-gray-100 animate-pulse w-2/5" />
      </div>
    </div>
  );
}

function DocChip({
  name,
  onPlace,
  onDragStart,
}: {
  name: string;
  onPlace: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onPlace}
      className="group flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50/40 cursor-grab active:cursor-grabbing text-left transition-colors"
      title="Drag into the review, or click to add"
    >
      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <span className="text-sm text-gray-700 truncate flex-1">{name}</span>
      <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
    </button>
  );
}

type Inspect = {
  rowId: string;
  colKey: string;
  doc: string;
  option: string;
  columnLabel: string;
  kind?: string;
  task?: string;
  cell: Cell;
};

function hashNum(s: string, min: number, max: number) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return min + (h % (max - min + 1));
}

const fauxLineWidths = ["92%", "76%", "84%", "61%"];

function SourcePanel({ data, onClose }: { data: Inspect; onClose: () => void }) {
  const citations = data.cell.citations ?? [];
  const [active, setActive] = useState(0);
  const citation = citations[active] ?? null;
  const doc = citation?.doc ?? data.doc;
  const page = citation?.page ?? hashNum(data.doc + data.colKey, 2, 12);
  const totalPages = page + hashNum(doc, 2, 8);
  const value = citation?.quote ?? data.cell.highlight ?? data.cell.primary;
  const evidence = data.cell.evidence ?? (citations.length ? "found" : undefined);

  return (
    <aside className="w-[440px] flex-shrink-0 border-l border-gray-200 bg-white flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{doc}</p>
            <p className="text-xs text-gray-500 truncate">
              {data.option} · {data.columnLabel}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 flex-shrink-0"
          aria-label="Close source preview"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/60">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`w-2 h-2 rounded-full ${statusDot[data.cell.status]}`} />
          <span className="text-[10px] font-semibold tracking-wide text-gray-400">{data.kind ?? "EXTRACT"}</span>
          <span className="text-[11px] text-gray-500">· {statusLabel[data.cell.status]}</span>
          {evidence && <span className="text-[11px] text-gray-400">· evidence {evidenceLabel[evidence]}</span>}
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">
          {data.cell.highlight && (
            <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-semibold border border-green-100">
              {data.cell.highlight}
            </span>
          )}
          {data.cell.primary}
        </p>
        {data.cell.secondary && <p className="text-xs text-gray-500 mt-1">{data.cell.secondary}</p>}
        {data.task && <p className="text-[11px] text-gray-400 mt-2">Column task: {data.task}</p>}
      </div>

      {citations.length > 1 && (
        <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-1.5 overflow-x-auto">
          {citations.map((ct, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border transition-colors ${
                i === active ? "bg-blue-50 border-blue-200 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-white text-[10px] font-semibold border border-current/20">
                {i + 1}
              </span>
              <span className="truncate max-w-[180px]">{ct.doc}</span>
              <span className="text-gray-400">p.{ct.page}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto bg-gray-100 p-4">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[11px] font-medium text-gray-500">Source document</span>
          <span className="text-[11px] font-medium text-gray-500 inline-flex items-center gap-1 rounded bg-white border border-gray-200 px-1.5 py-0.5">
            Page {page} of {totalPages}
          </span>
        </div>
        <div className="mx-auto bg-white rounded-md shadow-sm border border-gray-200 p-6 min-h-[520px]">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-gray-400 mb-5">
            {doc.replace(/\.[^.]+$/, "").toUpperCase()}
          </p>
          <div className="space-y-3">
            {fauxLineWidths.map((w, i) => (
              <div key={`t-${i}`} className="h-2.5 rounded bg-gray-100" style={{ width: w }} />
            ))}
            <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2.5 my-1">
              <p className="text-[11px] font-semibold text-gray-500 mb-1">{data.columnLabel}</p>
              <p className="text-sm text-gray-800 leading-relaxed">
                <mark className="bg-yellow-200 rounded px-0.5">{value}</mark>
                {citation ? <CitationBadge count={active + 1} /> : null}
              </p>
            </div>
            {fauxLineWidths.map((w, i) => (
              <div key={`b-${i}`} className="h-2.5 rounded bg-gray-100" style={{ width: w }} />
            ))}
            <div className="h-2.5 rounded bg-gray-100 w-1/2" />
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500 truncate">
          {citation ? `Verbatim from page ${page}` : "No verbatim citation for this cell"}
        </span>
        <Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0">
          <FileText className="w-3.5 h-3.5" /> Open document
        </Button>
      </div>
    </aside>
  );
}

const genericDocs: { id: string; name: string }[] = [
  { id: "gen-1", name: "Expiring policy and endorsements.pdf" },
  { id: "gen-2", name: "Renewal quote — Option 1.pdf" },
  { id: "gen-3", name: "Renewal quote — Option 2.pdf" },
  { id: "gen-4", name: "Exposure schedule.xlsx" },
];

export default function ReviewPage() {
  const [mode, setMode] = useState<"history" | "build">("history");
  const [historyId, setHistoryId] = useState(reviewTemplates[0].id);
  const [tableView, setTableView] = useState<"all" | "differences">("all");
  const [inspect, setInspect] = useState<Inspect | null>(null);

  // Build (new review) state
  const [buildTemplate, setBuildTemplate] = useState<ReviewTemplate | null>(null); // null = blank or catalog-only
  const [buildCatalog, setBuildCatalog] = useState<{ id: string; name: string; extensionIds: string[]; rowHeader: string } | null>(null);
  const [buildColumns, setBuildColumns] = useState<Column[]>([]);
  const [placedRows, setPlacedRows] = useState<PlacedRow[]>([]);
  const [filled, setFilled] = useState<Record<string, string[]>>({});
  const [isOver, setIsOver] = useState(false);
  const idRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const nextId = () => ++idRef.current;

  const schedule = (fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  const historyTemplate = reviewTemplates.find((t) => t.id === historyId)!;

  // ── New review starters ───────────────────────────────────────
  function resetBuild() {
    clearTimers();
    setMode("build");
    setPlacedRows([]);
    setFilled({});
    setTableView("all");
    setInspect(null);
  }

  function startBuild(t: ReviewTemplate | null) {
    resetBuild();
    setBuildTemplate(t);
    setBuildCatalog(null);
    setBuildColumns(t ? t.columns.map((c) => ({ ...c })) : [{ ...columnPresets[0] }]);
  }

  /** Start from any of the 20 catalog templates with its default view. */
  function startCatalog(templateId: string, extensionIds: string[] = []) {
    const template = catalogTemplates.find((t) => t.id === templateId);
    if (!template) return;
    resetBuild();
    setBuildTemplate(null);
    setBuildCatalog({
      id: template.id,
      name: template.name,
      extensionIds,
      rowHeader: template.row_grain.split(/[×x]/)[0].replace(/^One\s+/i, "").trim() || "Row",
    });
    setBuildColumns(defaultColumnsFor(template.id, extensionIds));
  }

  function openHistory(id: string) {
    clearTimers();
    setMode("history");
    setHistoryId(id);
    setTableView("all");
    setInspect(null);
  }

  function openSource(row: Row | PlacedRow, col: Column) {
    const cell = row.cells[col.key];
    if (!cell) return;
    setInspect({
      rowId: row.id,
      colKey: col.key,
      doc: row.doc,
      option: row.option,
      columnLabel: col.label,
      kind: col.kind,
      task: col.task,
      cell,
    });
  }

  // ── Placing documents ─────────────────────────────────────────
  function beginExtraction(rowId: string, cols: Column[]) {
    setFilled((prev) => ({ ...prev, [rowId]: [] }));
    cols.forEach((c, i) => {
      schedule(
        () =>
          setFilled((prev) => ({
            ...prev,
            [rowId]: Array.from(new Set([...(prev[rowId] ?? []), c.key])),
          })),
        520 * (i + 1),
      );
    });
  }

  function synthCell(col: Column, docName: string): Cell {
    const preset = columnPresets.find((p) => p.key === col.key);
    if (preset) return { status: preset.sample.status ?? "verified", ...preset.sample };
    if (col.kind === "CALCULATE") {
      return { status: "missing", primary: "Inputs gathered; the application computes this column.", evidence: "insufficient_inputs" };
    }
    return {
      status: "verified",
      primary: col.task ?? `Extracted from ${docName}.`,
      citations: [{ doc: docName, page: hashNum(docName + col.key, 1, 9), quote: col.label }],
    };
  }

  function addRow(row: PlacedRow, cols: Column[]) {
    setPlacedRows((prev) => [...prev, row]);
    beginExtraction(row.id, cols);
  }

  function placeById(id: string) {
    if (buildTemplate) {
      const src = buildTemplate.rows.find((r) => r.id === id);
      if (!src) return;
      addRow({ ...src, sourceId: src.id, id: `p-${src.id}-${nextId()}` }, buildColumns);
    } else {
      const src = (buildCatalog ? genericDocs : blankSampleDocs).find((d) => d.id === id);
      if (!src) return;
      const cells: Record<string, Cell> = {};
      buildColumns.forEach((c) => (cells[c.key] = synthCell(c, src.name)));
      addRow(
        { id: `p-${src.id}-${nextId()}`, sourceId: src.id, option: src.name, optionMeta: "Uploaded document", doc: src.name, cells },
        buildColumns,
      );
    }
  }

  function placeFile(fileName: string) {
    const cells: Record<string, Cell> = {};
    buildColumns.forEach((c) => (cells[c.key] = synthCell(c, fileName)));
    const sid = `file-${nextId()}`;
    addRow(
      { id: `p-${sid}`, sourceId: sid, option: fileName, optionMeta: "Uploaded document", doc: fileName, cells },
      buildColumns,
    );
  }

  function addColumn(presetKey: string) {
    const preset = columnPresets.find((p) => p.key === presetKey);
    if (!preset || buildColumns.some((c) => c.key === preset.key)) return;
    const col: Column = { key: preset.key, label: preset.label, kind: preset.kind, task: preset.task };
    setBuildColumns((prev) => [...prev, col]);
    setPlacedRows((prev) =>
      prev.map((r) => (r.cells[col.key] ? r : { ...r, cells: { ...r.cells, [col.key]: synthCell(col, r.doc) } })),
    );
    placedRows.forEach((r, i) => {
      schedule(
        () =>
          setFilled((prev) => ({
            ...prev,
            [r.id]: Array.from(new Set([...(prev[r.id] ?? []), col.key])),
          })),
        420 * (i + 1),
      );
    });
  }

  function runReview() {
    placedRows.forEach((r) => beginExtraction(r.id, buildColumns));
  }

  // ── Drag & drop handlers ──────────────────────────────────────
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsOver(false);
    const raw = e.dataTransfer.getData("application/x-review-doc");
    if (raw) {
      try {
        const { id } = JSON.parse(raw);
        placeById(id);
        return;
      } catch {
        /* fall through to files */
      }
    }
    if (e.dataTransfer.files?.length) {
      Array.from(e.dataTransfer.files).forEach((f) => placeFile(f.name));
    }
  }

  function dragData(id: string) {
    return (e: React.DragEvent) => e.dataTransfer.setData("application/x-review-doc", JSON.stringify({ id }));
  }

  // ── Derived display config (shared by both modes) ─────────────
  const isBuild = mode === "build";
  const columns = isBuild ? buildColumns : historyTemplate.columns;
  const rows: (Row | PlacedRow)[] = isBuild ? placedRows : historyTemplate.rows;
  const rowHeader = isBuild ? buildTemplate?.rowHeader ?? buildCatalog?.rowHeader ?? "Item" : historyTemplate.rowHeader;
  const noun = isBuild ? buildTemplate?.docNoun ?? "document" : historyTemplate.docNoun;
  const title = isBuild
    ? buildTemplate
      ? `New ${buildTemplate.tab} review`
      : buildCatalog
        ? `New ${buildCatalog.name}`
        : "Untitled review"
    : historyTemplate.title;
  const badge = isBuild
    ? buildTemplate?.badge ?? (buildCatalog ? badgeFor(buildCatalog.id, buildCatalog.extensionIds) : "Custom · build from scratch")
    : historyTemplate.badge;

  const isFilled = (rowId: string, key: string) => (isBuild ? filled[rowId]?.includes(key) ?? false : true);

  const totalCells = placedRows.length * buildColumns.length;
  const filledCount = placedRows.reduce((n, r) => n + Math.min(filled[r.id]?.length ?? 0, buildColumns.length), 0);
  const complete = isBuild ? placedRows.length > 0 && totalCells > 0 && filledCount >= totalCells : true;

  const remainingDocs = buildTemplate
    ? buildTemplate.rows.filter((r) => !placedRows.some((p) => p.sourceId === r.id)).map((r) => ({ id: r.id, name: r.doc }))
    : (buildCatalog ? genericDocs : blankSampleDocs).filter((d) => !placedRows.some((p) => p.sourceId === d.id));

  const availablePresets = columnPresets.filter((p) => !buildColumns.some((c) => c.key === p.key));

  const buildMeta = isBuild
    ? placedRows.length === 0
      ? "Draft · drop documents to begin"
      : `${placedRows.length} ${noun}${placedRows.length === 1 ? "" : "s"} · ${complete ? "extraction complete" : "extracting…"}`
    : historyTemplate.meta;

  // Columns where the documents disagree (drives the Differences view)
  const cellKey = (c?: Cell) => (c ? `${c.highlight ?? ""}|${c.primary}` : null);
  const diffColumns = columns.filter((col) => {
    const vals = rows
      .map((r) => (isFilled(r.id, col.key) ? cellKey(r.cells[col.key]) : null))
      .filter((v): v is string => v !== null);
    return new Set(vals).size > 1;
  });
  const displayColumns = tableView === "differences" ? diffColumns : columns;
  const noDiffs = tableView === "differences" && diffColumns.length === 0;

  const showAddCol = isBuild && tableView === "all";
  const gridCols = `260px repeat(${displayColumns.length || 1}, minmax(240px, 1fr))${showAddCol ? " 56px" : ""}`;
  const tableMinWidth = 260 + (displayColumns.length || 1) * 240 + (showAddCol ? 56 : 0);

  const domains = Array.from(new Set(catalogTemplates.map((t) => t.domain)));

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* ── Left Sidebar ──────────────────────────────────────── */}
      <div className="w-64 bg-gray-100 border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white text-xs font-bold">
              S
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-semibold text-gray-900">SoterProduct Team</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              </div>
              <p className="text-[10px] text-gray-500">
                Powered by <span className="font-semibold text-blue-600">SOTER</span>
              </p>
            </div>
          </div>
          <button type="button" className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors relative" aria-label="Notifications">
            <Bell className="w-4 h-4 text-gray-600" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pt-4 pb-3">
            <button type="button" className="w-full flex items-center gap-3 px-4 py-2.5 text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              <PlusSquare className="w-5 h-5" />
              <span className="font-medium">New Chat</span>
            </button>
          </div>

          <div className="px-4 pb-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Workspace</h3>
            <nav className="space-y-1">
              <a href="#" className="flex items-center gap-3 px-3 py-2 text-gray-900 hover:bg-gray-200 rounded-md">
                <FolderKanban className="w-5 h-5" />
                <span className="text-sm">Projects</span>
              </a>
              <a href="#" className="flex items-center gap-3 px-3 py-2 text-gray-900 hover:bg-gray-200 rounded-md">
                <Network className="w-5 h-5" />
                <span className="text-sm">Workflows</span>
              </a>
              <span className="flex items-center gap-3 px-3 py-2 bg-gray-200 text-gray-900 rounded-md" aria-current="page">
                <Table2 className="w-5 h-5" />
                <span className="text-sm font-medium">Review</span>
              </span>
              <a href="#" className="flex items-center gap-3 px-3 py-2 text-gray-900 hover:bg-gray-200 rounded-md">
                <FileText className="w-5 h-5" />
                <span className="text-sm">Records</span>
              </a>
              <a href="#" className="flex items-center gap-3 px-3 py-2 text-gray-900 hover:bg-gray-200 rounded-md">
                <CheckSquare className="w-5 h-5" />
                <span className="text-sm">Actions</span>
              </a>
              <a href="#" className="flex items-center gap-3 px-3 py-2 text-gray-900 hover:bg-gray-200 rounded-md">
                <Database className="w-5 h-5" />
                <span className="text-sm">Data Sources</span>
              </a>
              <a href="#" className="flex items-center gap-3 px-3 py-2 text-gray-900 hover:bg-gray-200 rounded-md">
                <AlertTriangle className="w-5 h-5" />
                <span className="text-sm">Risk Intelligence</span>
              </a>
            </nav>
          </div>

          <div className="px-4 pb-4">
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Review History</h3>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
            <div className="space-y-0.5">
              {isBuild && (
                <div className="w-full text-left px-3 py-2 rounded-md text-sm truncate bg-blue-50 text-blue-700 font-medium border border-blue-100 flex items-center gap-2">
                  <FilePlus2 className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{title}</span>
                </div>
              )}
              {reviewTemplates.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => openHistory(t.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm truncate transition-colors ${
                    !isBuild && t.id === historyId
                      ? "bg-gray-200 text-gray-900 font-medium"
                      : "text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 px-2 py-2 hover:bg-gray-200 rounded-lg cursor-pointer transition-colors">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
              DW
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">Dana Whitfield</p>
              <p className="text-xs text-gray-500 truncate">Account Executive · Northgate Risk</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </div>
        </div>
      </div>

      {/* ── Main Content ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4">
          <nav className="flex items-center gap-2 text-sm text-gray-500 min-w-0">
            <a href="#" className="hover:text-gray-800">Projects</a>
            <ChevronRight className="w-4 h-4 text-gray-300" />
            <span className="hover:text-gray-800 truncate">Cedar Ridge Manufacturing Inc. — GL placement</span>
            <ChevronRight className="w-4 h-4 text-gray-300" />
            <span className="text-gray-900 font-medium truncate">{title}</span>
          </nav>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0">
                <Plus className="w-4 h-4" /> New Review
                <ChevronDown className="w-4 h-4 opacity-80" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuItem onClick={() => startBuild(null)} className="gap-2 py-2 cursor-pointer">
                <FilePlus2 className="w-4 h-4 text-gray-500" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-900">Blank review</span>
                  <span className="text-xs text-gray-500">Build your own from scratch</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-gray-500">Start from a sample review</DropdownMenuLabel>
              {reviewTemplates.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => startBuild(t)}
                  className="flex flex-col items-start gap-0.5 py-2 cursor-pointer"
                >
                  <span className="text-sm font-medium text-gray-900">{t.tab}</span>
                  <span className="text-xs text-gray-500">{t.badge}</span>
                </DropdownMenuItem>
              ))}
              {domains.map((domain) => (
                <React.Fragment key={domain}>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-gray-500 flex items-center gap-1.5">
                    <LayoutTemplate className="w-3.5 h-3.5" /> {domain} templates
                  </DropdownMenuLabel>
                  {catalogTemplates
                    .filter((t) => t.domain === domain)
                    .map((t) => (
                      <DropdownMenuItem
                        key={t.id}
                        onClick={() => startCatalog(t.id)}
                        className="flex items-center justify-between gap-3 py-1.5 cursor-pointer"
                      >
                        <span className="text-sm text-gray-900 truncate">{t.name}</span>
                        <span className="text-[11px] text-gray-400 flex-shrink-0">
                          {t.id} · {t.columns.filter((c) => c.default_visible).length} cols
                        </span>
                      </DropdownMenuItem>
                    ))}
                </React.Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Body: content + optional source panel */}
        <div className="flex-1 flex min-w-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* Title + actions bar */}
            <div className="flex items-center justify-between gap-4 mb-2">
              <h1 className="text-2xl font-bold text-gray-900 text-balance">{title}</h1>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Download className="w-4 h-4" /> Export
                </Button>
                <Button
                  size="sm"
                  onClick={isBuild ? runReview : undefined}
                  disabled={isBuild && placedRows.length === 0}
                  className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" /> Run review
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-6 text-xs text-gray-500">
              <span className="inline-flex items-center rounded bg-gray-100 border border-gray-200 px-2 py-0.5 text-gray-700">{badge}</span>
              <span>{buildMeta}</span>
            </div>

            {/* Toolbar row */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1" role="tablist" aria-label="Table view">
                  {(
                    [
                      { key: "all", label: "All" },
                      { key: "differences", label: "Differences" },
                    ] as const
                  ).map((v) => (
                    <button
                      type="button"
                      key={v.key}
                      role="tab"
                      aria-selected={tableView === v.key}
                      onClick={() => setTableView(v.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        tableView === v.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      {v.label}
                      {v.key === "differences" && diffColumns.length > 0 && (
                        <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded bg-amber-100 text-amber-700 text-[11px] font-semibold">
                          {diffColumns.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {isBuild && (
                  <span className="text-sm text-gray-500">
                    {placedRows.length} {noun}
                    {placedRows.length === 1 ? "" : "s"} · {buildColumns.length} column
                    {buildColumns.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Confirmed</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Needs review</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Gap</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300" /> Not stated</span>
              </div>
            </div>

            {/* Empty state: big drop zone + tray */}
            {isBuild && placedRows.length === 0 ? (
              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsOver(true);
                  }}
                  onDragLeave={() => setIsOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center px-6 py-16 cursor-pointer transition-colors ${
                    isOver ? "border-blue-500 bg-blue-50/60" : "border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50"
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                    <Upload className="w-6 h-6 text-blue-600" />
                  </div>
                  <p className="text-base font-semibold text-gray-900">Drag documents here to add them as rows</p>
                  <p className="text-sm text-gray-500 mt-1 max-w-md text-pretty">
                    Each document becomes its own row and auto-populates the {buildColumns.length} template column
                    {buildColumns.length === 1 ? "" : "s"}.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) Array.from(e.target.files).forEach((f) => placeFile(f.name));
                      e.target.value = "";
                    }}
                  />
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Sample documents — drag to add</h4>
                  <div className="space-y-2">
                    {remainingDocs.map((d) => (
                      <DocChip key={d.id} name={d.name} onPlace={() => placeById(d.id)} onDragStart={dragData(d.id)} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Table */}
                {noDiffs ? (
                  <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
                    <p className="text-sm font-medium text-gray-900">No differences found</p>
                    <p className="text-sm text-gray-500 mt-1 text-pretty">
                      {rows.length < 2
                        ? "Add another document to compare values across rows."
                        : "Every document agrees across the analyzed columns."}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
                    <div style={{ minWidth: tableMinWidth }}>
                      <div className="grid" style={{ gridTemplateColumns: gridCols }}>
                        <div key="__rowheader" className="sticky left-0 z-20 px-4 py-3 border-b border-r border-gray-200 bg-gray-50">
                          <span className="text-sm font-semibold text-gray-900">{rowHeader}</span>
                        </div>
                        {displayColumns.map((col) => (
                          <div
                            key={col.key}
                            title={col.task}
                            className="px-4 py-3 border-b border-l border-gray-200 bg-gray-50/60 flex items-center gap-2"
                          >
                            <span className="text-sm font-semibold text-gray-900">{col.label}</span>
                            <span className="text-[10px] font-semibold tracking-wide text-gray-400">{col.kind}</span>
                          </div>
                        ))}
                        {showAddCol && (
                          <div className="border-b border-l border-gray-200 bg-gray-50/60 flex items-center justify-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  disabled={availablePresets.length === 0}
                                  className="w-9 h-9 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                                  aria-label="Add column"
                                  title={availablePresets.length === 0 ? "All columns added" : "Add column"}
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-64">
                                <DropdownMenuLabel className="text-xs text-gray-500">Add a column</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {availablePresets.length > 0 ? (
                                  availablePresets.map((p) => (
                                    <DropdownMenuItem key={p.key} onClick={() => addColumn(p.key)} className="cursor-pointer flex-col items-start gap-0">
                                      <span>{p.label}</span>
                                      {p.task && <span className="text-[11px] text-gray-400 line-clamp-1">{p.task}</span>}
                                    </DropdownMenuItem>
                                  ))
                                ) : (
                                  <div className="px-2 py-1.5 text-sm text-gray-400">All columns added</div>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>

                      {rows.map((row, i) => (
                        <div key={row.id} className="grid" style={{ gridTemplateColumns: gridCols }}>
                          <div key="__rowcell" className={`sticky left-0 z-10 bg-white px-4 py-4 border-r ${i > 0 ? "border-t" : ""} border-gray-200`}>
                            <div className="flex gap-2.5">
                              <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900">{row.option}</p>
                                {row.optionMeta && <p className="text-xs text-gray-500 mt-0.5">{row.optionMeta}</p>}
                              </div>
                            </div>
                          </div>
                          {displayColumns.map((col) => {
                            const filledCell = isFilled(row.id, col.key) ? row.cells[col.key] : undefined;
                            const selected = inspect?.rowId === row.id && inspect?.colKey === col.key;
                            return (
                              <div
                                key={col.key}
                                role={filledCell ? "button" : undefined}
                                tabIndex={filledCell ? 0 : undefined}
                                onClick={filledCell ? () => openSource(row, col) : undefined}
                                onKeyDown={
                                  filledCell
                                    ? (e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          openSource(row, col);
                                        }
                                      }
                                    : undefined
                                }
                                className={`px-4 py-4 border-l ${i > 0 ? "border-t" : ""} border-gray-200 group relative transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${
                                  filledCell ? "cursor-pointer hover:bg-blue-50/40" : ""
                                } ${selected ? "bg-blue-50 ring-1 ring-inset ring-blue-300" : ""}`}
                              >
                                {filledCell ? (
                                  <>
                                    <TableCell cell={filledCell} />
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void navigator.clipboard?.writeText(filledCell.primary);
                                      }}
                                      className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1 rounded hover:bg-gray-100"
                                      aria-label="Copy cell"
                                    >
                                      <Copy className="w-3.5 h-3.5 text-gray-400" />
                                    </button>
                                  </>
                                ) : (
                                  <ExtractingCell />
                                )}
                              </div>
                            );
                          })}
                          {showAddCol && <div className={`border-l ${i > 0 ? "border-t" : ""} border-gray-200`} />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Build mode: slim drop zone + remaining tray */}
                {isBuild && (
                  <div className="grid gap-4 lg:grid-cols-[1fr_320px] mt-4">
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsOver(true);
                      }}
                      onDragLeave={() => setIsOver(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`rounded-xl border-2 border-dashed flex items-center justify-center gap-2 px-6 py-6 cursor-pointer transition-colors ${
                        isOver ? "border-blue-500 bg-blue-50/60" : "border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50"
                      }`}
                    >
                      <Upload className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-500">Drag more documents here to stack additional rows</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) Array.from(e.target.files).forEach((f) => placeFile(f.name));
                          e.target.value = "";
                        }}
                      />
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Sample documents</h4>
                      {remainingDocs.length > 0 ? (
                        <div className="space-y-2">
                          {remainingDocs.map((d) => (
                            <DocChip key={d.id} name={d.name} onPlace={() => placeById(d.id)} onDragStart={dragData(d.id)} />
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 flex items-center gap-2">
                          <Loader2 className="w-4 h-4" /> All sample documents added.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          {inspect && <SourcePanel key={`${inspect.rowId}:${inspect.colKey}`} data={inspect} onClose={() => setInspect(null)} />}
        </div>
      </div>
    </div>
  );
}
