// Per-review event bus with a replay buffer, so a client that reloads mid-run
// can re-attach to the stream with Last-Event-ID and miss nothing.

import { EventEmitter } from "node:events";

export type ReviewEvent =
  | { type: "cell"; row_id: string; column_index: number; status: "running" | "done" | "error"; cell?: unknown; message?: string }
  | { type: "progress"; done: number; total: number }
  | { type: "complete"; generation_id: string }
  | { type: "cancelled"; generation_id: string };

export interface StampedEvent { id: number; generation_id: string; event: ReviewEvent }

const BUFFER = 2000;

class ReviewEvents {
  private emitters = new Map<string, EventEmitter>();
  private buffers = new Map<string, StampedEvent[]>();
  private counters = new Map<string, number>();

  private emitter(review_id: string) {
    let e = this.emitters.get(review_id);
    if (!e) {
      e = new EventEmitter();
      e.setMaxListeners(100);
      this.emitters.set(review_id, e);
    }
    return e;
  }

  publish(review_id: string, generation_id: string, event: ReviewEvent): StampedEvent {
    const id = (this.counters.get(review_id) ?? 0) + 1;
    this.counters.set(review_id, id);
    const stamped: StampedEvent = { id, generation_id, event };
    const buf = this.buffers.get(review_id) ?? [];
    buf.push(stamped);
    if (buf.length > BUFFER) buf.splice(0, buf.length - BUFFER);
    this.buffers.set(review_id, buf);
    this.emitter(review_id).emit("event", stamped);
    return stamped;
  }

  /** Events after `afterId` (0 for all buffered). */
  replay(review_id: string, afterId: number): StampedEvent[] {
    return (this.buffers.get(review_id) ?? []).filter((e) => e.id > afterId);
  }

  subscribe(review_id: string, listener: (e: StampedEvent) => void): () => void {
    const e = this.emitter(review_id);
    e.on("event", listener);
    return () => e.off("event", listener);
  }
}

export const reviewEvents = new ReviewEvents();
