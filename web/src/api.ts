import type { Catalog, DocumentDetail, DocumentSummary, Review, ReviewColumn, ReviewDetail, ReviewEvent, Cell } from "./types";

export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";
export const USER_ID = (import.meta.env.VITE_USER_ID as string | undefined) ?? "local-user";

export class ApiError extends Error {
  constructor(readonly status: number, readonly detail: string, readonly code?: string) {
    super(detail);
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-user-id", USER_ID);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = res.statusText;
    let code: string | undefined;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
      code = body.code;
    } catch {
      /* no body */
    }
    throw new ApiError(res.status, detail, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  templates: () => req<Catalog>("/templates"),
  buildColumns: (template_id: string, extension_ids: string[], include_optional: boolean) =>
    req<{ columns: ReviewColumn[] }>("/templates/columns", { method: "POST", body: JSON.stringify({ template_id, extension_ids, include_optional }) }),

  documents: () => req<DocumentSummary[]>("/documents"),
  document: (id: string) => req<DocumentDetail>(`/documents/${id}`),
  upload: (files: File[], folder?: string) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    if (folder) form.append("folder", folder);
    return req<{ documents: DocumentSummary[]; failed: { filename: string; detail: string }[] }>("/documents", { method: "POST", body: form });
  },

  reviews: () => req<Review[]>("/reviews"),
  review: (id: string) => req<ReviewDetail>(`/reviews/${id}`),
  createReview: (body: {
    title: string;
    template_id?: string | null;
    extension_ids?: string[];
    columns: Partial<ReviewColumn>[];
    document_ids?: string[];
    document_grouping?: "document" | "folder";
    model?: string;
  }) => req<ReviewDetail>("/reviews", { method: "POST", body: JSON.stringify(body) }),
  patchReview: (id: string, body: { title?: string; columns?: Partial<ReviewColumn>[] }) =>
    req<ReviewDetail>(`/reviews/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteReview: (id: string) => req<void>(`/reviews/${id}`, { method: "DELETE" }),
  putRows: (id: string, rows: unknown[]) => req<ReviewDetail>(`/reviews/${id}/rows`, { method: "PUT", body: JSON.stringify({ rows }) }),
  proposeRows: (id: string, document_ids: string[]) =>
    req<{ rows: { id: string; label: string; document_ids: string[]; document_roles: Record<string, string>; comparison_group_id: string | null; user_context: Record<string, string> }[] }>(
      `/reviews/${id}/rows/propose`,
      { method: "POST", body: JSON.stringify({ document_ids }) },
    ),

  generate: (id: string, scope: unknown = {}) => req<{ generation_id: string; targets: unknown[] }>(`/reviews/${id}/generate`, { method: "POST", body: JSON.stringify({ scope }) }),
  cancel: (id: string) => req<void>(`/reviews/${id}/generate/cancel`, { method: "POST" }),
  regenerate: (id: string, row_id: string, column_index: number) =>
    req<unknown>(`/reviews/${id}/cells/regenerate`, { method: "POST", body: JSON.stringify({ row_id, column_index }) }),
  patchCell: (id: string, row_id: string, column_index: number, body: Partial<Pick<Cell, "review_status" | "locked" | "override_value" | "override_reason">>) =>
    req<Cell>(`/reviews/${id}/cells/${row_id}/${column_index}`, { method: "PATCH", body: JSON.stringify(body) }),
  chat: (id: string, messages: { role: "user" | "assistant"; content: string }[]) =>
    req<{ answer: string }>(`/reviews/${id}/chat`, { method: "POST", body: JSON.stringify({ messages }) }),
  exportUrl: (id: string) => `${API_BASE}/reviews/${id}/export.xlsx?user=${encodeURIComponent(USER_ID)}`,

  /** Live cell updates. EventSource reconnects on its own and resends Last-Event-ID. */
  subscribe(id: string, onEvent: (e: ReviewEvent) => void): () => void {
    const source = new EventSource(`${API_BASE}/reviews/${id}/events?user=${encodeURIComponent(USER_ID)}`);
    source.addEventListener("review", (e) => {
      try {
        onEvent(JSON.parse((e as MessageEvent).data) as ReviewEvent);
      } catch {
        /* ignore malformed */
      }
    });
    return () => source.close();
  },
};
