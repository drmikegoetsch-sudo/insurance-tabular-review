// Review state: loads a review, applies live cell events from the SSE stream,
// and exposes the actions the page needs. Optimistic updates are avoided; the
// server's cell object is always the source of truth.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Cell, ReviewDetail, ReviewEvent } from "./types";

export const cellKey = (row_id: string, column_index: number) => `${row_id}:${column_index}`;

export function useReview(reviewId: string | null) {
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [cells, setCells] = useState<Map<string, Cell>>(new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reviewRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!reviewId) {
      setReview(null);
      setCells(new Map());
      return;
    }
    try {
      const detail = await api.review(reviewId);
      setReview(detail);
      setCells(new Map(detail.cells.map((c) => [cellKey(c.row_id, c.column_index), c])));
      setRunning(!!detail.active_generation_id);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load review");
    }
  }, [reviewId]);

  useEffect(() => {
    reviewRef.current = reviewId;
    setProgress(null);
    void load();
  }, [reviewId, load]);

  useEffect(() => {
    if (!reviewId) return;
    const onEvent = (e: ReviewEvent) => {
      if (reviewRef.current !== reviewId) return;
      if (e.type === "cell") {
        setCells((prev) => {
          const next = new Map(prev);
          const key = cellKey(e.row_id, e.column_index);
          const current = next.get(key);
          if (e.status === "done" && e.cell) next.set(key, e.cell);
          else if (current) next.set(key, { ...current, status: e.status, error: e.message ?? null });
          return next;
        });
      } else if (e.type === "progress") {
        setProgress({ done: e.done, total: e.total });
        setRunning(e.done < e.total);
      } else if (e.type === "complete" || e.type === "cancelled") {
        setRunning(false);
        void load();
      }
    };
    return api.subscribe(reviewId, onEvent);
  }, [reviewId, load]);

  const run = useCallback(
    async (scope: unknown = {}) => {
      if (!reviewId) return;
      setRunning(true);
      try {
        await api.generate(reviewId, scope);
      } catch (e) {
        setRunning(false);
        setError(e instanceof Error ? e.message : "Could not start the review");
      }
    },
    [reviewId],
  );

  const updateCell = useCallback((cell: Cell) => {
    setCells((prev) => new Map(prev).set(cellKey(cell.row_id, cell.column_index), cell));
  }, []);

  return { review, cells, progress, running, error, reload: load, run, updateCell, setError };
}
