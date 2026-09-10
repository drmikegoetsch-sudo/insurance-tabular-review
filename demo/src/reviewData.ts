// Demo data for the review page. Columns come from the template catalog
// (@insurance-tabular-review/templates) so the demo shows real template
// columns; rows and cell values are fictional accounts.

import {
  buildColumns,
  getExtension,
  getTemplate,
  listTemplates,
  type CatalogColumnKind,
  type CatalogTemplate,
} from "@insurance-tabular-review/templates";

export type CellStatus = "verified" | "attention" | "flagged" | "missing";

export type Citation = { doc: string; page: number; quote: string };

export type Cell = {
  status: CellStatus;
  primary: string;
  secondary?: string;
  /** A pill-highlighted value (e.g. a premium figure). */
  highlight?: string;
  /** Verbatim evidence. The badge shows the count; the source panel shows the quotes. */
  citations?: Citation[];
  /** Evidence status from the extraction contract, shown in the source panel. */
  evidence?: "found" | "not_stated" | "not_applicable" | "conflicting_evidence" | "insufficient_inputs" | "not_comparable";
};

export type ColumnKind = "EXTRACT" | "ANALYSIS" | "CALCULATE";

export type Column = {
  key: string;
  label: string;
  kind: ColumnKind;
  /** The catalog task line, shown as a tooltip on the header. */
  task?: string;
};

export type Row = {
  id: string;
  option: string;
  optionMeta?: string;
  /** Source document filename that produces this row. */
  doc: string;
  cells: Record<string, Cell>;
};

export type ReviewTemplate = {
  id: string;
  /** Catalog template id (CI01, CI04, CI11, …). */
  catalogId: string;
  extensionIds: string[];
  tab: string;
  title: string;
  badge: string;
  meta: string;
  /** Label for the row (document) axis. */
  rowHeader: string;
  /** Singular noun for a dropped document, e.g. "quote". */
  docNoun: string;
  columns: Column[];
  rows: Row[];
};

const KIND_LABEL: Record<CatalogColumnKind, ColumnKind> = {
  extract: "EXTRACT",
  analysis: "ANALYSIS",
  calculate: "CALCULATE",
};

/** Picks named columns from a catalog template (and its extensions) in the order given. */
function columnsFor(templateId: string, keys: string[], extensionIds: string[] = []): Column[] {
  const template = getTemplate(templateId);
  if (!template) throw new Error(`Unknown template ${templateId}`);
  const pool = [
    ...template.columns,
    ...extensionIds.flatMap((id) => getExtension(id)?.columns ?? []),
  ];
  return keys.map((key) => {
    const column = pool.find((c) => c.id === key);
    if (!column) throw new Error(`Column ${key} not in ${templateId}`);
    return { key, label: column.label, kind: KIND_LABEL[column.kind], task: column.task };
  });
}

/** Every default-view column of a catalog template, for reviews started from "All templates". */
export function defaultColumnsFor(templateId: string, extensionIds: string[] = []): Column[] {
  return buildColumns({ templateId, extensionIds }).map((c) => ({
    key: c.key,
    label: c.name,
    kind: KIND_LABEL[c.kind],
    task: c.task,
  }));
}

export function badgeFor(templateId: string, extensionIds: string[] = []): string {
  const template = getTemplate(templateId);
  const ext = extensionIds.map((id) => getExtension(id)?.name).filter(Boolean);
  return `${templateId} · ${template?.name ?? templateId}${ext.length ? ` + ${ext.join(", ")} extension` : ""}`;
}

export const catalogTemplates: CatalogTemplate[] = listTemplates();

const c = (
  status: CellStatus,
  primary: string,
  extra: Partial<Omit<Cell, "status" | "primary">> = {},
): Cell => ({ status, primary, ...extra });
const q = (doc: string, page: number, quote: string): Citation => ({ doc, page, quote });

/* ── Showcase reviews ────────────────────────────────────────────── */

export const reviewTemplates: ReviewTemplate[] = [
  {
    id: "quote-comparison",
    catalogId: "CI01",
    extensionIds: ["CX02"],
    tab: "Quote Comparison",
    title: "GL quote comparison — Cedar Ridge 2026-27",
    badge: badgeFor("CI01", ["CX02"]),
    meta: "3 options · 13 of 27 columns shown · run 08 Sep 2026",
    rowHeader: "Quote option",
    docNoun: "quote",
    columns: columnsFor(
      "CI01",
      [
        "carrier",
        "policy_or_quote_number",
        "premium",
        "limits",
        "deductibles_and_retentions",
        "exclusions",
        "quote_status",
        "quote_expiration",
        "subjectivities",
        "cx02_primary_and_waiver_endorsements",
        "requested_coverage_match",
        "material_trade_offs",
        "price_comparability",
        "follow_up_questions",
      ],
      ["CX02"],
    ),
    rows: [
      {
        id: "opt-a",
        option: "Option A · Northwind Mutual",
        optionMeta: "Quote NWM-Q-91002 · baseline (expiring carrier)",
        doc: "Northwind Mutual — Quote NWM-Q-91002.pdf",
        cells: {
          carrier: c("verified", "Northwind Mutual Insurance Company.", {
            secondary: "Coastline Program Managers is the MGA, not the insurer.",
            citations: [q("Northwind Mutual — Quote NWM-Q-91002.pdf", 1, "Insurer: Northwind Mutual Insurance Company")],
          }),
          policy_or_quote_number: c("verified", "NWM-Q-91002 (firm quote, v2, 04 Sep 2026)"),
          premium: c("verified", "USD · annual · excludes $1,928 terrorism and $482 state surcharge.", {
            highlight: "$96,400",
            citations: [q("Northwind Mutual — Quote NWM-Q-91002.pdf", 2, "Annual Premium $96,400 (excluding TRIA and surcharges)")],
          }),
          limits: c("verified", "$1,000,000 each occurrence · $2,000,000 general aggregate · $2,000,000 products/completed ops.", {
            citations: [q("Northwind Mutual — Quote NWM-Q-91002.pdf", 2, "Each Occurrence $1,000,000 · General Aggregate $2,000,000")],
          }),
          deductibles_and_retentions: c("attention", "$25,000 per occurrence, BI/PD combined. Defense costs erode the deductible.", {
            citations: [q("Northwind Mutual — Quote NWM-Q-91002.pdf", 3, "Deductible applies to damages and supplementary payments")],
          }),
          exclusions: c("attention", "CG 21 47 employment practices · CG 21 96 silica · manuscript products recall expense exclusion.", {
            secondary: "The recall exclusion is non-standard and touches the food-contact packaging line.",
            citations: [q("Northwind Mutual — Quote NWM-Q-91002.pdf", 4, "Products Recall Expense Exclusion (manuscript)")],
          }),
          quote_status: c("verified", "Firm quote."),
          quote_expiration: c("verified", "30 Sep 2026, anchored to the quote date.", {
            citations: [q("Northwind Mutual — Quote NWM-Q-91002.pdf", 1, "valid for 30 days from 04 Sep 2026")],
          }),
          subjectivities: c("verified", "Signed TRIA form · 2025 audited sales · currently valued loss runs."),
          cx02_primary_and_waiver_endorsements: c("verified", "CG 20 01 primary and non-contributory · CG 24 04 blanket waiver where required by written contract.", {
            citations: [q("Northwind Mutual — Quote NWM-Q-91002.pdf", 4, "CG 20 01 04 13, CG 24 04 05 09")],
          }),
          requested_coverage_match: c("flagged", "3 of 5 requirements met.", {
            secondary: "Not offered: no recall exclusion; defense outside the deductible.",
          }),
          material_trade_offs: c("attention", "Baseline. Incumbent carrier; the recall exclusion is new this term versus the expiring policy.", {
            citations: [q("Expiring policy CGL-3310221.pdf", 3, "Forms: CG 00 01, CG 20 10, CG 20 37, CG 25 03, CG 21 47")],
          }),
          price_comparability: c("verified", "Comparable. Same term, exposure basis ($42.5M sales), currency, and tax/fee exclusion as B and C."),
          follow_up_questions: c("missing", "Will Northwind remove the recall exclusion or offer a sublimit? Can defense move outside the deductible?", {
            evidence: "not_stated",
          }),
        },
      },
      {
        id: "opt-b",
        option: "Option B · Atlas Specialty",
        optionMeta: "Indication ASP-26-44817",
        doc: "Atlas Specialty — Indication ASP-26-44817.pdf",
        cells: {
          carrier: c("attention", "Atlas Specialty Insurance Company (non-admitted).", {
            secondary: "Surplus lines placement; taxes and stamping fees apply.",
            citations: [q("Atlas Specialty — Indication ASP-26-44817.pdf", 1, "a surplus lines insurer")],
          }),
          policy_or_quote_number: c("attention", "ASP-26-44817 (indication, 02 Sep 2026)"),
          premium: c("verified", "USD · annual · plus 4.85% surplus lines tax and $150 stamping fee.", {
            highlight: "$88,750",
            citations: [q("Atlas Specialty — Indication ASP-26-44817.pdf", 2, "Premium $88,750 · SL Tax 4.85% · Stamping Fee $150")],
          }),
          limits: c("verified", "$1,000,000 each occurrence · $2,000,000 general aggregate · $2,000,000 products/completed ops.", {
            citations: [q("Atlas Specialty — Indication ASP-26-44817.pdf", 2, "Limits of Insurance: $1,000,000 / $2,000,000 / $2,000,000")],
          }),
          deductibles_and_retentions: c("verified", "$25,000 self-insured retention per occurrence; defense outside the SIR.", {
            citations: [q("Atlas Specialty — Indication ASP-26-44817.pdf", 3, "Defense expenses are in addition to the retention")],
          }),
          exclusions: c("flagged", "Employment practices · silica · absolute pollution (no hostile fire exception) · cross suits.", {
            secondary: "The absolute pollution exclusion narrows the ISO base form materially.",
            citations: [q("Atlas Specialty — Indication ASP-26-44817.pdf", 5, "Total Pollution Exclusion — hostile fire exception deleted")],
          }),
          quote_status: c("attention", "Indication, subject to underwriter review of a completed supplemental application."),
          quote_expiration: c("missing", "Not stated on the indication.", { evidence: "not_stated" }),
          subjectivities: c("attention", "Supplemental products application · signed SL disclosure · five years loss runs · inspection within 60 days of binding."),
          cx02_primary_and_waiver_endorsements: c("verified", "Primary and non-contributory and blanket waiver available by endorsement.", {
            citations: [q("Atlas Specialty — Indication ASP-26-44817.pdf", 4, "Blanket Additional Insured, Primary/Non-Contributory, Waiver of Subrogation")],
          }),
          requested_coverage_match: c("attention", "4 of 5 met; per-project aggregate not stated.", { evidence: "not_stated" }),
          material_trade_offs: c("attention", "Lowest premium before tax; no recall exclusion; defense outside retention. Adverse: pollution exclusion, non-admitted, indication only."),
          price_comparability: c("attention", "Comparable after tax: add $4,454 for a like-for-like $93,204 versus $96,400.", { evidence: "not_comparable" }),
          follow_up_questions: c("missing", "Confirm a firm quote and validity date. Can the pollution exclusion be amended? Is a per-project aggregate available?", {
            evidence: "not_stated",
          }),
        },
      },
      {
        id: "opt-c",
        option: "Option C · Meridian Insurance Co.",
        optionMeta: "Quote MER-GL-770215",
        doc: "Meridian — Quote MER-GL-770215.pdf",
        cells: {
          carrier: c("verified", "Meridian Insurance Company (admitted).", {
            citations: [q("Meridian — Quote MER-GL-770215.pdf", 1, "Meridian Insurance Company (admitted, NAIC 24118)")],
          }),
          policy_or_quote_number: c("verified", "MER-GL-770215 (firm quote, 05 Sep 2026)"),
          premium: c("attention", "USD · annual · excludes $2,078 terrorism. Highest of the three.", {
            highlight: "$103,900",
            citations: [q("Meridian — Quote MER-GL-770215.pdf", 2, "Total Annual Premium $103,900")],
          }),
          limits: c("verified", "$1,000,000 each occurrence · $2,000,000 general aggregate · $2,000,000 products/completed ops.", {
            citations: [q("Meridian — Quote MER-GL-770215.pdf", 2, "Each Occurrence $1,000,000 · General Aggregate $2,000,000")],
          }),
          deductibles_and_retentions: c("verified", "$10,000 per occurrence deductible; defense outside the deductible.", {
            citations: [q("Meridian — Quote MER-GL-770215.pdf", 3, "Deductible $10,000 each occurrence, damages only")],
          }),
          exclusions: c("verified", "Standard ISO exclusions only (CG 21 47, CG 21 96, CG 21 06). Recall expense is a $250,000 sublimit, not an exclusion.", {
            citations: [q("Meridian — Quote MER-GL-770215.pdf", 4, "Product Recall Expense Limit $250,000")],
          }),
          quote_status: c("verified", "Firm quote."),
          quote_expiration: c("verified", "05 Oct 2026."),
          subjectivities: c("verified", "Signed TRIA form · current loss runs."),
          cx02_primary_and_waiver_endorsements: c("verified", "CG 20 01 and CG 24 04 included at no additional premium.", {
            citations: [q("Meridian — Quote MER-GL-770215.pdf", 4, "CG 20 01 04 13, CG 24 04 05 09 — included")],
          }),
          requested_coverage_match: c("verified", "5 of 5 requirements met."),
          material_trade_offs: c("verified", "All requirements met; $250,000 recall sublimit; lower deductible. Adverse: $7,500 above baseline."),
          price_comparability: c("verified", "Comparable. Same term, exposure basis, currency, and tax/fee exclusion as baseline."),
          follow_up_questions: c("missing", "Is the recall sublimit available at $500,000, and at what premium?", { evidence: "not_stated" }),
        },
      },
    ],
  },
  {
    id: "policy-checking",
    catalogId: "CI04",
    extensionIds: [],
    tab: "Policy Checking",
    title: "Policy delivery check — Harborline 2026",
    badge: badgeFor("CI04"),
    meta: "3 placements · 12 of 20 columns shown · run 09 Sep 2026",
    rowHeader: "Placement",
    docNoun: "placement",
    columns: columnsFor("CI04", [
      "insured_entity_match",
      "carrier_match",
      "term_match",
      "premium_match",
      "limits_match",
      "retentions_match",
      "endorsements_match",
      "additional_insured_match",
      "unapproved_changes",
      "delivery_check_result",
      "correction_request_draft",
      "outstanding_evidence",
    ]),
    rows: [
      {
        id: "gl",
        option: "General Liability",
        optionMeta: "Accepted quote · Binder · Issued policy CGL-4471902",
        doc: "Issued policy CGL-4471902.pdf",
        cells: {
          insured_entity_match: c("verified", "Harborline Logistics LLC on all three stages.", {
            citations: [q("Issued policy CGL-4471902.pdf", 1, "Named Insured: Harborline Logistics LLC"), q("Binder B-22-0917.pdf", 1, "Named Insured: Harborline Logistics LLC")],
          }),
          carrier_match: c("verified", "Northwind Mutual Insurance Company at each stage. Coastline Program Managers appears only as producer.", {
            citations: [q("Issued policy CGL-4471902.pdf", 1, "Issued by Northwind Mutual Insurance Company")],
          }),
          term_match: c("verified", "01 Oct 2026 12:01 a.m. to 01 Oct 2027 12:01 a.m. on all stages.", {
            citations: [q("Issued policy CGL-4471902.pdf", 1, "Policy Period: 10/01/2026 to 10/01/2027 12:01 A.M.")],
          }),
          premium_match: c("verified", "Accepted $84,250; issued $84,250 (USD, annual, excluding taxes and fees).", {
            highlight: "$84,250",
            citations: [q("Issued policy CGL-4471902.pdf", 2, "Total Policy Premium $84,250")],
          }),
          limits_match: c("flagged", "Damage to rented premises issued at $100,000 against an accepted $300,000. Other limits match.", {
            highlight: "$100,000",
            citations: [q("Issued policy CGL-4471902.pdf", 2, "Damage To Premises Rented To You $100,000 Any One Premises"), q("Accepted quote NWM-Q-88213.pdf", 3, "Damage to Premises Rented to You: $300,000")],
          }),
          retentions_match: c("verified", "$10,000 per occurrence deductible, BI and PD combined, on both.", {
            citations: [q("Issued policy CGL-4471902.pdf", 9, "Deductible: $10,000 Per Occurrence, Bodily Injury and Property Damage Liability Combined")],
          }),
          endorsements_match: c("flagged", "CG 20 10, CG 20 37, CG 24 04 issued. CG 25 03 per-project aggregate promised but not issued.", {
            citations: [q("Issued policy CGL-4471902.pdf", 3, "Forms and Endorsements: CG 00 01 04 13, CG 20 10 04 13, CG 20 37 04 13, CG 24 04 05 09, CG 03 00 01 96"), q("Accepted quote NWM-Q-88213.pdf", 4, "CG 25 03 05 09 Designated Construction Project(s) General Aggregate Limit")],
          }),
          additional_insured_match: c("verified", "Blanket AI where required by written contract, ongoing and completed operations; primary and non-contributory via CG 20 01.", {
            citations: [q("Issued policy CGL-4471902.pdf", 12, "This insurance is primary to and will not seek contribution from any other insurance available to an additional insured")],
          }),
          unapproved_changes: c("flagged", "Rented premises limit reduced $300,000 → $100,000; CG 25 03 omitted. No client approval or carrier clarification in file."),
          delivery_check_result: c("flagged", "Discrepancies found.", {
            secondary: "A clean result requires every requested comparison to match with documented approvals.",
          }),
          correction_request_draft: c("attention", "Reissue declarations at $300,000 rented premises per quote NWM-Q-88213 p.3; add CG 25 03 05 09 as listed on p.4.", {
            secondary: "Draft only. Do not send, bind, or modify coverage.",
          }),
          outstanding_evidence: c("verified", "None. All three stage documents present and readable; acceptance email dated 22 Sep 2026 on file.", {
            citations: [q("Acceptance email 22 Sep 2026.pdf", 1, "Please bind per quote NWM-Q-88213 effective 10/1")],
          }),
        },
      },
      {
        id: "auto",
        option: "Commercial Auto",
        optionMeta: "Accepted quote · Binder · Issued policy CA-9930014",
        doc: "Issued policy CA-9930014.pdf",
        cells: {
          insured_entity_match: c("verified", "Harborline Logistics LLC on all three stages.", {
            citations: [q("Issued policy CA-9930014.pdf", 1, "Named Insured: Harborline Logistics LLC")],
          }),
          carrier_match: c("verified", "Northwind Mutual Insurance Company at each stage."),
          term_match: c("verified", "01 Oct 2026 to 01 Oct 2027 on all stages."),
          premium_match: c("attention", "Accepted $61,900; issued $63,410. Binder notes a schedule revision adding a 2025 Freightliner M2 on 25 Sep; no client instruction in file.", {
            highlight: "$63,410",
            evidence: "conflicting_evidence",
            citations: [q("Issued policy CA-9930014.pdf", 2, "Total Premium $63,410"), q("Binder B-22-0918.pdf", 2, "Revised schedule: added VIN 1FVACWFC…")],
          }),
          limits_match: c("verified", "Liability $1,000,000 CSL; UM/UIM $1,000,000; medical payments $5,000. All match."),
          retentions_match: c("verified", "Comprehensive $1,000 / collision $2,500 per vehicle. Matches."),
          endorsements_match: c("verified", "CA 20 48 designated insured, CA 04 44 waiver, CA 99 16 hired auto all issued at the promised edition."),
          additional_insured_match: c("verified", "Designated insured endorsement lists contract counterparties as agreed."),
          unapproved_changes: c("attention", "Premium +$1,510 tied to a schedule change without a client instruction in file."),
          delivery_check_result: c("attention", "Incomplete evidence.", {
            secondary: "Confirm the vehicle addition with the client before treating this as a discrepancy.",
          }),
          correction_request_draft: c("attention", "Confirm with Harborline whether the 2025 Freightliner M2 was added on instruction; if not, request removal and premium adjustment."),
          outstanding_evidence: c("attention", "Client instruction adding VIN 1FVACWFC…", { evidence: "insufficient_inputs" }),
        },
      },
      {
        id: "property",
        option: "Commercial Property",
        optionMeta: "Accepted quote · Binder · Issued policy CPP-2201177",
        doc: "Issued policy CPP-2201177.pdf",
        cells: {
          insured_entity_match: c("verified", "Harborline Logistics LLC on all three stages."),
          carrier_match: c("verified", "Northwind Mutual Insurance Company at each stage."),
          term_match: c("verified", "01 Oct 2026 to 01 Oct 2027 on all stages."),
          premium_match: c("verified", "Accepted $128,700; issued $128,700 (USD, annual).", { highlight: "$128,700" }),
          limits_match: c("verified", "Blanket building and contents $18,450,000; business income $3,200,000 (ALS 12 months). Match.", {
            citations: [q("Issued policy CPP-2201177.pdf", 2, "Blanket Limit of Insurance $18,450,000")],
          }),
          retentions_match: c("attention", "$25,000 AOP matches. The 2% wind/hail deductible at Location 3 is not stated on the issued declarations.", {
            evidence: "not_stated",
            citations: [q("Accepted quote NWM-Q-88214.pdf", 2, "Windstorm or Hail Deductible: 2% of the value at Location 3")],
          }),
          endorsements_match: c("attention", "CP 04 05 and CP 15 45 issued. CP 03 21 windstorm/hail percentage deductible not in the schedule of forms.", { evidence: "not_stated" }),
          additional_insured_match: c("verified", "Loss payee and mortgagee schedule matches the accepted instructions."),
          unapproved_changes: c("attention", "Wind/hail percentage deductible endorsement absent from issued forms."),
          delivery_check_result: c("attention", "Incomplete evidence.", {
            secondary: "Cannot confirm the wind/hail deductible as issued.",
          }),
          correction_request_draft: c("attention", "Request issuance of CP 03 21 reflecting the 2% wind/hail deductible at Location 3 per quote NWM-Q-88214 p.2."),
          outstanding_evidence: c("attention", "Issued CP 03 21 endorsement or carrier confirmation of the wind/hail deductible.", { evidence: "insufficient_inputs" }),
        },
      },
    ],
  },
  {
    id: "contract-review",
    catalogId: "CI11",
    extensionIds: ["CX02"],
    tab: "Contract Review",
    title: "Contract insurance requirements — Pinecrest MSA",
    badge: badgeFor("CI11", ["CX02"]),
    meta: "6 requirements · 13 of 27 columns shown · run 09 Sep 2026",
    rowHeader: "Requirement",
    docNoun: "clause",
    columns: columnsFor(
      "CI11",
      [
        "clause_reference",
        "coverage_required",
        "required_limit",
        "additional_insured_requirement",
        "primary_requirement",
        "waiver_requirement",
        "notice_requirement",
        "relevant_policy",
        "actual_policy_term",
        "requirement_assessment",
        "difference",
        "required_evidence_or_correction",
        "client_explanation",
      ],
      ["CX02"],
    ),
    rows: [
      {
        id: "cgl",
        option: "§12.1 Commercial General Liability",
        optionMeta: "Obligated: Cedar Ridge Manufacturing Inc.",
        doc: "Pinecrest MSA v4.pdf",
        cells: {
          clause_reference: c("verified", "§12.1, Exhibit D (Insurance Requirements).", {
            citations: [q("Pinecrest MSA v4.pdf", 14, "12.1 Commercial General Liability")],
          }),
          coverage_required: c("verified", "Occurrence-form CGL on ISO CG 00 01 or equivalent, including products/completed operations and contractual liability."),
          required_limit: c("verified", "$2,000,000 each occurrence · $4,000,000 general aggregate · umbrella may satisfy.", {
            highlight: "$2M / $4M",
            citations: [q("Pinecrest MSA v4.pdf", 14, "limits of not less than $2,000,000 per occurrence and $4,000,000 in the aggregate, which may be satisfied through a combination of primary and umbrella")],
          }),
          additional_insured_requirement: c("verified", "Pinecrest Health System, affiliates, officers, and employees; ongoing and completed operations; CG 20 10 and CG 20 37 or equivalent."),
          primary_requirement: c("verified", "Primary and non-contributory as to Pinecrest."),
          waiver_requirement: c("verified", "Waiver of subrogation in favor of Pinecrest and affiliates."),
          notice_requirement: c("verified", "30 days written notice of cancellation to Pinecrest; 10 days for non-payment."),
          relevant_policy: c("verified", "CGL-3310221 (Northwind Mutual, 01 Oct 2025 to 01 Oct 2026) · UMB-5510087 ($5M)."),
          actual_policy_term: c("verified", "$1M/$2M primary plus $5M umbrella follows form. Blanket AI, CG 20 01, CG 24 04 all present.", {
            citations: [q("Policy CGL-3310221.pdf", 2, "Each Occurrence Limit $1,000,000 · General Aggregate Limit $2,000,000")],
          }),
          requirement_assessment: c("attention", "Partially supported.", {
            secondary: "Limits met only by stacking the umbrella; notice of cancellation to Pinecrest not evidenced by endorsement.",
          }),
          difference: c("attention", "No endorsement extends 30-day notice to Pinecrest. A certificate's notice wording does not amend the policy."),
          required_evidence_or_correction: c("attention", "Request CG 02 05 (or carrier equivalent) naming Pinecrest, or negotiate the MSA to 'in accordance with policy provisions'."),
          client_explanation: c("attention", "Your GL program meets $2M/$4M with the umbrella counted, and AI, primary, and waiver terms are on the policy. The gap is the 30-day cancellation notice."),
        },
      },
      {
        id: "auto",
        option: "§12.2 Commercial Automobile",
        optionMeta: "Obligated: Cedar Ridge Manufacturing Inc.",
        doc: "Pinecrest MSA v4.pdf",
        cells: {
          clause_reference: c("verified", "§12.2, Exhibit D."),
          coverage_required: c("verified", "Auto liability covering owned, hired, and non-owned autos (symbol 1 or equivalent)."),
          required_limit: c("verified", "$1,000,000 combined single limit.", { highlight: "$1M CSL" }),
          additional_insured_requirement: c("verified", "Pinecrest as additional insured."),
          primary_requirement: c("missing", "Not stated.", { evidence: "not_stated" }),
          waiver_requirement: c("verified", "Waiver of subrogation in favor of Pinecrest."),
          notice_requirement: c("verified", "30 days written notice."),
          relevant_policy: c("verified", "CA-9930014 (Northwind Mutual, 01 Oct 2025 to 01 Oct 2026)."),
          actual_policy_term: c("verified", "Symbol 1 any auto; $1,000,000 CSL; CA 20 48 designated insured (blanket); CA 04 44 waiver (blanket).", {
            citations: [q("Policy CA-9930014.pdf", 2, "Covered Autos: 1 · Liability $1,000,000 Combined Single Limit")],
          }),
          requirement_assessment: c("verified", "Supported.", { secondary: "Except cancellation notice (see §12.1)." }),
          difference: c("attention", "Cancellation notice to Pinecrest not evidenced."),
          required_evidence_or_correction: c("attention", "Same notice-of-cancellation endorsement request as §12.1."),
          client_explanation: c("verified", "Auto is in good shape. Limits, additional insured, and waiver are all on the policy."),
        },
      },
      {
        id: "umbrella",
        option: "§12.4 Umbrella / Excess Liability",
        optionMeta: "Obligated: Cedar Ridge Manufacturing Inc.",
        doc: "Pinecrest MSA v4.pdf",
        cells: {
          clause_reference: c("verified", "§12.4, Exhibit D."),
          coverage_required: c("verified", "Umbrella or excess liability following form over GL, auto, and employer's liability."),
          required_limit: c("verified", "$10,000,000 each occurrence and aggregate.", {
            highlight: "$10M",
            citations: [q("Pinecrest MSA v4.pdf", 15, "Umbrella or Excess Liability with limits of not less than $10,000,000")],
          }),
          additional_insured_requirement: c("verified", "Same additional insureds as underlying."),
          primary_requirement: c("verified", "Primary and non-contributory as to Pinecrest."),
          waiver_requirement: c("verified", "Waiver of subrogation."),
          notice_requirement: c("verified", "30 days written notice."),
          relevant_policy: c("verified", "UMB-5510087 (Northwind Mutual, 01 Oct 2025 to 01 Oct 2026)."),
          actual_policy_term: c("flagged", "$5,000,000 each occurrence / $5,000,000 aggregate; follows form over scheduled underlying.", {
            highlight: "$5M",
            citations: [q("Policy UMB-5510087.pdf", 1, "Limits of Insurance: $5,000,000 Each Occurrence · $5,000,000 Aggregate")],
          }),
          requirement_assessment: c("flagged", "Express mismatch.", {
            secondary: "Required $10M; in force $5M. The same umbrella is relied on to top up GL under §12.1.",
          }),
          difference: c("flagged", "$5,000,000 shortfall in umbrella limit."),
          required_evidence_or_correction: c("flagged", "Obtain a $5M excess layer over UMB-5510087, or negotiate §12.4 to $5,000,000."),
          client_explanation: c("flagged", "The contract asks for a $10M umbrella and you carry $5M. Buy an additional $5M layer or ask Pinecrest to accept $5M; we can price the layer before you decide."),
        },
      },
      {
        id: "cyber",
        option: "§12.5 Cyber / Network Security",
        optionMeta: "Obligated: Cedar Ridge Manufacturing Inc.",
        doc: "Pinecrest MSA v4.pdf",
        cells: {
          clause_reference: c("verified", "§12.5, Exhibit D."),
          coverage_required: c("verified", "Network security and privacy liability, including breach response costs and regulatory defense."),
          required_limit: c("verified", "$3,000,000 per claim and aggregate.", { highlight: "$3M" }),
          additional_insured_requirement: c("missing", "Not stated.", { evidence: "not_stated" }),
          primary_requirement: c("missing", "Not stated.", { evidence: "not_stated" }),
          waiver_requirement: c("missing", "Not stated.", { evidence: "not_stated" }),
          notice_requirement: c("verified", "30 days written notice."),
          relevant_policy: c("missing", "No cyber policy, binder, or certificate in the document set.", { evidence: "insufficient_inputs" }),
          actual_policy_term: c("missing", "Not evidenced.", { evidence: "insufficient_inputs" }),
          requirement_assessment: c("missing", "Not evidenced.", { evidence: "insufficient_inputs" }),
          difference: c("missing", "Requirement exists; coverage evidence absent.", { evidence: "insufficient_inputs" }),
          required_evidence_or_correction: c("attention", "Request the current cyber policy and declarations from the client, or confirm none is carried."),
          client_explanation: c("attention", "Pinecrest requires $3M of cyber coverage. We have no cyber policy on file for you. If you carry one, send it over; if not, it needs placing before signature."),
        },
      },
    ],
  },
];

/* ── Blank review (build from scratch) ───────────────────────────── */

// Presets a user can add when building a blank review. Labels and tasks come
// from the catalog; each carries a sample value used to simulate extraction.
export type ColumnPreset = Column & { sample: Omit<Cell, "status"> & { status?: CellStatus } };

const presetSamples: Record<string, ColumnPreset["sample"]> = {
  insured_entity: { primary: "Named insured as shown on the declarations." },
  carrier: { primary: "Risk-bearing insurer, MGA identified separately." },
  policy_or_quote_number: { primary: "Policy / quote reference and version." },
  effective_date: { primary: "2026-10-01" },
  expiration_date: { primary: "2027-10-01" },
  premium: { highlight: "$—", primary: "Annual premium, currency and basis stated." },
  limits: { primary: "Each limit with per-occurrence or aggregate basis." },
  deductibles_and_retentions: { primary: "Deductible or SIR with basis and minimum." },
  exclusions: { primary: "Express exclusions, including endorsements and carvebacks." },
  quote_status: { primary: "Indication, firm quote, revised quote, or bound." },
};

export const columnPresets: ColumnPreset[] = columnsFor("CI01", Object.keys(presetSamples)).map((column) => ({
  ...column,
  sample: presetSamples[column.key],
}));

// Sample documents a user can drag into a blank review.
export const blankSampleDocs: { id: string; name: string }[] = [
  { id: "blank-1", name: "Acme Corp — Certificate of Insurance.pdf" },
  { id: "blank-2", name: "Beacon Mutual — Bound Policy.pdf" },
  { id: "blank-3", name: "Delta Underwriters — Quote.pdf" },
  { id: "blank-4", name: "Summit Casualty — Renewal Offer.pdf" },
];
