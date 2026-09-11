import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "./api";
import type { Catalog, CatalogTemplate, DocumentSummary, ReviewDetail } from "./types";

type Step = "details" | "documents";

export function NewReviewDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (review: ReviewDetail) => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [step, setStep] = useState<Step>("details");
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState<string | null>("CI04");
  const [extensionIds, setExtensionIds] = useState<string[]>([]);
  const [includeAll, setIncludeAll] = useState(false);
  const [grouping, setGrouping] = useState<"document" | "folder">("document");
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [folder, setFolder] = useState("");
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep("details");
    setTitle("");
    setExtensionIds([]);
    setIncludeAll(false);
    setSelected(new Set());
    setError(null);
    api.templates().then(setCatalog).catch(() => setError("Could not load templates"));
    api.documents().then(setDocuments).catch(() => undefined);
  }, [open]);

  const template: CatalogTemplate | null = useMemo(() => catalog?.templates.find((t) => t.id === templateId) ?? null, [catalog, templateId]);
  const extensions = useMemo(() => (catalog && template ? catalog.extensions.filter((e) => e.applies_to.includes(template.id)) : []), [catalog, template]);
  const defaultCount = template ? template.columns.filter((c) => c.default_visible).length : 1;
  const plannedCount = (template ? (includeAll ? template.columns.length : defaultCount) : 1) + extensions.filter((e) => extensionIds.includes(e.id)).reduce((n, e) => n + e.columns.length, 0);
  const domains = useMemo(() => Array.from(new Set(catalog?.templates.map((t) => t.domain) ?? [])), [catalog]);

  useEffect(() => {
    if (template && template.row_grain.toLowerCase().includes("bundle")) setGrouping("folder");
  }, [template]);

  if (!open) return null;

  async function upload(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    setError(null);
    try {
      const result = await api.upload(files, folder.trim() || undefined);
      setDocuments((prev) => [...result.documents, ...prev.filter((d) => !result.documents.some((n) => n.id === d.id))]);
      setSelected((prev) => new Set([...prev, ...result.documents.map((d) => d.id)]));
      if (result.failed.length) setError(result.failed.map((f) => `${f.filename}: ${f.detail}`).join("; "));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const columns = template
        ? (await api.buildColumns(template.id, extensionIds, includeAll)).columns
        : [{ name: "Summary", prompt: "Summarize what this document is, who it is between, and the key dates and amounts." }];
      const review = await api.createReview({
        title: title.trim() || (template ? `New ${template.name}` : "Untitled review"),
        template_id: template?.id ?? null,
        extension_ids: extensionIds,
        columns,
        document_ids: [...selected],
        document_grouping: grouping,
      });
      onCreated(review);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the review");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="New review">
      <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-xl shadow-xl flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            <span className="font-medium text-gray-900">New Review</span> · {step === "details" ? "Details" : "Documents"}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Close">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === "details" ? (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-5">
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Review name</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={template ? `New ${template.name}` : "Untitled review"} className="mt-1 w-full border-b border-gray-300 focus:border-blue-500 outline-none py-1.5 text-sm" autoFocus />
                </label>
                <div>
                  <span className="text-xs font-semibold text-gray-600">Template</span>
                  <div className="mt-1 border border-gray-200 rounded-lg max-h-72 overflow-y-auto" role="listbox" aria-label="Template">
                    <button type="button" role="option" aria-selected={templateId === null} onClick={() => setTemplateId(null)} className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${templateId === null ? "bg-blue-50" : ""}`}>
                      Blank review <span className="text-xs text-gray-400">· one Summary column, add more later</span>
                    </button>
                    {domains.map((domain) => (
                      <div key={domain}>
                        <div className="sticky top-0 bg-white px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{domain}</div>
                        {catalog!.templates
                          .filter((t) => t.domain === domain)
                          .map((t) => (
                            <button key={t.id} type="button" role="option" aria-selected={templateId === t.id} onClick={() => { setTemplateId(t.id); setExtensionIds([]); setIncludeAll(false); }} className={`w-full flex justify-between gap-2 text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${templateId === t.id ? "bg-blue-50" : ""}`}>
                              <span>{t.name}</span>
                              <span className="text-xs text-gray-400 flex-shrink-0">{t.id} · {t.columns.length} cols</span>
                            </button>
                          ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-4 text-sm text-gray-600">
                {template ? (
                  <>
                    <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                    <p className="rounded-lg bg-gray-50 px-3 py-2"><b className="text-gray-800">Each row is:</b> {template.row_grain}</p>
                    <p><b className="text-gray-800">Documents needed:</b> {template.required_documents.join("; ")}</p>
                    {extensions.length > 0 && (
                      <fieldset>
                        <legend className="font-semibold text-gray-800 mb-1.5">Add coverage columns</legend>
                        <div className="flex flex-wrap gap-1.5">
                          {extensions.map((e) => (
                            <label key={e.id} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs cursor-pointer">
                              <input type="checkbox" checked={extensionIds.includes(e.id)} onChange={() => setExtensionIds((p) => (p.includes(e.id) ? p.filter((x) => x !== e.id) : [...p, e.id]))} className="accent-blue-600" />
                              {e.name} <span className="text-gray-400">({e.columns.length})</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    )}
                    {template.columns.length > defaultCount && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={includeAll} onChange={(e) => setIncludeAll(e.target.checked)} className="accent-blue-600" />
                        Include all {template.columns.length} template columns (default view has {defaultCount})
                      </label>
                    )}
                  </>
                ) : (
                  <p>Start with one Summary column and add columns from the grid. Good for ad-hoc questions across a few documents.</p>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={grouping === "folder"} onChange={(e) => setGrouping(e.target.checked ? "folder" : "document")} className="accent-blue-600" />
                  Treat documents in the same folder as one row (bundles: quote + binder + policy)
                </label>
                <p className="text-gray-400">{plannedCount} column{plannedCount === 1 ? "" : "s"} will be created. You can edit them after the review exists.</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); void upload(Array.from(e.dataTransfer.files)); }}
                  onClick={() => fileRef.current?.click()}
                  className="rounded-xl border-2 border-dashed border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50 cursor-pointer flex flex-col items-center justify-center text-center px-6 py-12"
                >
                  <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                    {uploading ? <Loader2 className="w-6 h-6 text-blue-600 animate-spin" /> : <Upload className="w-6 h-6 text-blue-600" />}
                  </div>
                  <p className="text-base font-semibold text-gray-900">Drop documents here</p>
                  <p className="text-sm text-gray-500 mt-1">PDF, text, or pre-extracted JSON. Each document (or folder) becomes a row.</p>
                  <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void upload(Array.from(e.target.files ?? []))} />
                </div>
                <label className="mt-3 block">
                  <span className="text-xs font-semibold text-gray-600">Folder for these uploads (optional)</span>
                  <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="e.g. General Liability, Option A, Company B" className="mt-1 w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm" />
                </label>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Your documents · {selected.size} selected</h4>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {documents.length === 0 && <p className="text-sm text-gray-400">Nothing uploaded yet.</p>}
                  {documents.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer text-sm">
                      <input type="checkbox" checked={selected.has(d.id)} onChange={() => setSelected((p) => { const n = new Set(p); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n; })} className="accent-blue-600" />
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="truncate flex-1">{d.filename}</span>
                      {d.folder && <span className="text-[11px] text-gray-400 flex-shrink-0">{d.folder}</span>}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex items-center gap-2">
          <span className="text-xs text-gray-400">{step === "details" ? "Step 1 of 2" : "Step 2 of 2"}</span>
          <span className="flex-1" />
          {step === "documents" && <Button variant="outline" size="sm" onClick={() => setStep("details")}>Back</Button>}
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          {step === "details" ? (
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setStep("documents")} disabled={!catalog}>Next</Button>
          ) : (
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => void create()} disabled={creating || uploading}>
              {creating ? "Creating…" : selected.size ? `Create with ${selected.size} document${selected.size === 1 ? "" : "s"}` : "Create empty review"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
