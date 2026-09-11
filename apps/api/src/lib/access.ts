// Access control. The host supplies the user id; locally it comes from the
// x-user-id header and defaults to "local-user". Reviews are visible to their
// owner and to shared users; editing requires owner or editor.

import type { Request } from "express";
import type { Review, Store } from "../store/types.js";

export type Role = "owner" | "editor" | "viewer";

export function userIdFrom(req: Request): string {
  // EventSource cannot set headers, so the SSE route also accepts ?user=.
  const header = req.header("x-user-id") ?? (typeof req.query.user === "string" ? req.query.user : undefined);
  return header && header.trim() ? header.trim() : "local-user";
}

export async function roleFor(store: Store, review: Review, user_id: string): Promise<Role | null> {
  if (review.owner_id === user_id) return "owner";
  const share = (await store.listShares(review.id)).find((s) => s.user_id === user_id);
  return share ? share.role : null;
}

export const canEdit = (role: Role | null) => role === "owner" || role === "editor";
export const canView = (role: Role | null) => role !== null;
