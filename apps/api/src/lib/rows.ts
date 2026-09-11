// Row proposal: turns a set of documents into review rows at the template's
// grain. Without a model this is rule-based: one row per document, or one row
// per folder when the review groups by folder, with roles guessed from
// filenames. The template's row_setup_prompt is returned so a model-backed
// host can refine the proposal.

import { getTemplate } from "@insurance-tabular-review/templates";
import type { Review, Row, StoredDocument } from "../store/types.js";
import { guessRole } from "./documents.js";
import { newId } from "./ids.js";

export interface ProposedRow extends Omit<Row, "review_id" | "sort_index"> {
  needs_user_context: string[];
}

export function proposeRows(review: Review, documents: StoredDocument[]): { rows: ProposedRow[]; row_setup_prompt: string | null } {
  const template = review.template_id ? getTemplate(review.template_id) : undefined;
  const needs = template?.required_user_context ?? [];
  const rows: ProposedRow[] = [];

  if (review.document_grouping === "folder") {
    const groups = new Map<string, StoredDocument[]>();
    for (const doc of documents) {
      const key = doc.folder ?? doc.filename;
      groups.set(key, [...(groups.get(key) ?? []), doc]);
    }
    for (const [label, docs] of groups) {
      rows.push({
        id: newId(),
        label,
        document_ids: docs.map((d) => d.id),
        document_roles: Object.fromEntries(docs.map((d) => [d.id, guessRole(d.filename)])),
        comparison_group_id: review.id,
        user_context: {},
        needs_user_context: needs,
      });
    }
  } else {
    for (const doc of documents) {
      rows.push({
        id: newId(),
        label: doc.filename.replace(/\.[^.]+$/, ""),
        document_ids: [doc.id],
        document_roles: { [doc.id]: guessRole(doc.filename) },
        comparison_group_id: review.id,
        user_context: {},
        needs_user_context: needs,
      });
    }
  }
  return { rows, row_setup_prompt: template?.row_setup_prompt ?? null };
}
