// Seeds the local file store with fictional documents and three reviews so
// the product has something to show on first run. Runs against the same
// store the API uses: `npm run seed -w apps/api` (then start the API).

import path from "node:path";
import { buildColumns } from "@insurance-tabular-review/templates";
import { StubProvider } from "./extraction/stub.js";
import { extractPages } from "./lib/documents.js";
import { ensureCells, startGeneration } from "./lib/generation.js";
import { newId, now } from "./lib/ids.js";
import { proposeRows } from "./lib/rows.js";
import { reviewEvents } from "./lib/events.js";
import { FileStore } from "./store/fileStore.js";
import type { Review, StoredDocument } from "./store/types.js";

const OWNER = process.env.SEED_USER ?? "local-user";

const docs: { filename: string; folder: string | null; text: string }[] = [
  {
    filename: "Accepted quote NWM-Q-88213.pdf",
    folder: "General Liability",
    text: `NORTHWIND MUTUAL INSURANCE COMPANY — COMMERCIAL GENERAL LIABILITY QUOTE
Quote NWM-Q-88213 · Prepared 12 Sep 2026 · Firm quote valid 30 days
Named Insured: Harborline Logistics LLC
Proposed Policy Period: 10/01/2026 to 10/01/2027
Annual Premium $84,250 (excluding terrorism and surcharges)
\f
LIMITS OF INSURANCE
Each Occurrence Limit $1,000,000
General Aggregate Limit $2,000,000
Products/Completed Operations Aggregate Limit $2,000,000
Damage to Premises Rented to You: $300,000 Any One Premises
Medical Expense Limit $10,000
Deductible: $10,000 per occurrence, bodily injury and property damage combined
\f
FORMS AND ENDORSEMENTS TO BE ISSUED
CG 00 01 04 13 Commercial General Liability Coverage Form
CG 20 10 04 13 Additional Insured — Owners, Lessees or Contractors
CG 20 37 04 13 Additional Insured — Completed Operations
CG 20 01 04 13 Primary and Noncontributory — Other Insurance Condition
CG 24 04 05 09 Waiver of Transfer of Rights of Recovery
CG 25 03 05 09 Designated Construction Project(s) General Aggregate Limit
Subjectivities: signed TRIA form, currently valued loss runs`,
  },
  {
    filename: "Binder B-22-0917.pdf",
    folder: "General Liability",
    text: `BINDER OF INSURANCE B-22-0917
Named Insured: Harborline Logistics LLC
Insurer: Northwind Mutual Insurance Company
Coverage: Commercial General Liability per quote NWM-Q-88213
Effective 10/01/2026 12:01 A.M. to 10/01/2027 12:01 A.M.
Bound premium $84,250 subject to signed TRIA form
Limits as quoted: $1,000,000 each occurrence / $2,000,000 general aggregate
Damage to Premises Rented to You: $300,000
Endorsements to be issued as listed on the accepted quote, including CG 25 03 05 09`,
  },
  {
    filename: "Issued policy CGL-4471902.pdf",
    folder: "General Liability",
    text: `NORTHWIND MUTUAL INSURANCE COMPANY
COMMERCIAL GENERAL LIABILITY DECLARATIONS — Policy CGL-4471902
Named Insured: Harborline Logistics LLC
Issued by Northwind Mutual Insurance Company
Policy Period: 10/01/2026 to 10/01/2027 12:01 A.M. Standard Time
Total Policy Premium $84,250
\f
LIMITS OF INSURANCE
Each Occurrence Limit $1,000,000
General Aggregate Limit $2,000,000
Products/Completed Operations Aggregate Limit $2,000,000
Damage To Premises Rented To You $100,000 Any One Premises
Medical Expense Limit $10,000 Any One Person
\f
FORMS AND ENDORSEMENTS
CG 00 01 04 13, CG 20 10 04 13, CG 20 37 04 13, CG 20 01 04 13, CG 24 04 05 09, CG 03 00 01 96
Deductible: $10,000 Per Occurrence, Bodily Injury and Property Damage Liability Combined
This insurance is primary to and will not seek contribution from any other insurance available to an additional insured where required by written contract.`,
  },
  {
    filename: "Northwind Mutual — Quote NWM-Q-91002.pdf",
    folder: "Option A",
    text: `NORTHWIND MUTUAL INSURANCE COMPANY — GENERAL LIABILITY QUOTE NWM-Q-91002 (v2, 04 Sep 2026)
Insurer: Northwind Mutual Insurance Company. Program administrator: Coastline Program Managers (MGA).
Named Insured: Cedar Ridge Manufacturing Inc.
Policy period 10/01/2026 to 10/01/2027. Firm quote. This quote is valid for 30 days from 04 Sep 2026.
Annual Premium $96,400 (excluding TRIA and surcharges). Terrorism $1,928. State surcharge $482.
\f
Each Occurrence $1,000,000 · General Aggregate $2,000,000 · Products/Completed Operations Aggregate $2,000,000
Damage to Premises Rented to You $300,000 · Medical Expense $10,000
Deductible $25,000 per occurrence. Deductible applies to damages and supplementary payments.
Exclusions: CG 21 47 Employment-Related Practices; CG 21 96 Silica; Products Recall Expense Exclusion (manuscript); CG 21 06 Access or Disclosure.
Endorsements: CG 20 10 04 13, CG 20 37 04 13, CG 20 01 04 13, CG 24 04 05 09, CG 25 03 05 09.
Subjectivities: signed TRIA form; 2025 audited sales figures; currently valued loss runs.`,
  },
  {
    filename: "Atlas Specialty — Indication ASP-26-44817.pdf",
    folder: "Option B",
    text: `ATLAS SPECIALTY INSURANCE COMPANY, a surplus lines insurer — INDICATION ASP-26-44817 (02 Sep 2026)
Named Insured: Cedar Ridge Manufacturing Inc.
This is an indication, subject to underwriter review of a completed supplemental products application.
Premium $88,750 · SL Tax 4.85% · Stamping Fee $150. Policy period 10/01/2026 to 10/01/2027.
\f
Limits of Insurance: $1,000,000 each occurrence / $2,000,000 general aggregate / $2,000,000 products-completed operations
Damage to Premises Rented to You $100,000 · Medical Expense $5,000
Self-Insured Retention $25,000 each occurrence. Defense expenses are in addition to the retention.
Exclusions: Employment-Related Practices; Silica; Total Pollution Exclusion — hostile fire exception deleted; Cross Suits.
Blanket Additional Insured, Primary/Non-Contributory, Waiver of Subrogation available by endorsement.
Subjectivities: completed supplemental products application; signed surplus lines disclosure; five years currently valued loss runs; inspection within 60 days of binding.`,
  },
  {
    filename: "Meridian — Quote MER-GL-770215.pdf",
    folder: "Option C",
    text: `MERIDIAN INSURANCE COMPANY (admitted, NAIC 24118) — GENERAL LIABILITY QUOTE MER-GL-770215 (05 Sep 2026)
Named Insured: Cedar Ridge Manufacturing Inc. Firm quote valid until 05 Oct 2026.
Total Annual Premium $103,900 (excluding terrorism $2,078). Policy period 10/01/2026 to 10/01/2027.
\f
Each Occurrence $1,000,000 · General Aggregate $2,000,000 · Products/Completed Operations Aggregate $2,000,000
Damage to Premises Rented to You $300,000 · Medical Expense $10,000 · Product Recall Expense Limit $250,000
Deductible $10,000 each occurrence, damages only. Defense costs are outside the deductible.
Exclusions: CG 21 47 Employment-Related Practices; CG 21 96 Silica; CG 21 06 Access or Disclosure. Standard ISO exclusions only.
Endorsements included at no additional premium: CG 20 10 04 13, CG 20 37 04 13, CG 20 01 04 13, CG 24 04 05 09, CG 25 03 05 09.
Subjectivities: signed TRIA form; current loss runs.`,
  },
  {
    filename: "Pinecrest MSA v4.pdf",
    folder: null,
    text: `MASTER SERVICES AGREEMENT (Draft v4, 03 Sep 2026)
between Pinecrest Health System ("Pinecrest") and Cedar Ridge Manufacturing Inc. ("Supplier")
Term: 01 Nov 2026 to 31 Oct 2029. Insurance obligations survive for three years after expiration.
\f
12. INSURANCE (Exhibit D)
12.1 Commercial General Liability. Supplier shall maintain occurrence-form commercial general liability insurance on ISO form CG 00 01 or equivalent, including products/completed operations and contractual liability, with limits of not less than $2,000,000 per occurrence and $4,000,000 in the aggregate, which may be satisfied through a combination of primary and umbrella policies. Pinecrest, its affiliates, officers and employees shall be additional insureds for ongoing and completed operations on CG 20 10 and CG 20 37 or equivalent. Coverage shall be primary and non-contributory and shall include a waiver of subrogation in favor of Pinecrest.
12.2 Commercial Automobile. Supplier shall maintain automobile liability insurance covering owned, hired and non-owned autos with a combined single limit of not less than $1,000,000, naming Pinecrest as an additional insured, with a waiver of subrogation.
12.3 Workers' Compensation and Employer's Liability. Statutory workers' compensation and employer's liability of not less than $1,000,000 each accident, disease policy limit and disease each employee, with a waiver of subrogation where permitted by law.
\f
12.4 Umbrella or Excess Liability. Umbrella or Excess Liability with limits of not less than $10,000,000 per occurrence and in the aggregate, following form over the general liability, automobile and employer's liability policies, primary and non-contributory as to Pinecrest.
12.5 Cyber Liability. Network security and privacy liability insurance, including breach response costs and regulatory defense, with limits of not less than $3,000,000 per claim and in the aggregate.
12.6 Professional Liability. Professional liability insurance covering errors and omissions in the Services with limits of not less than $2,000,000 per claim and in the aggregate; claims-made coverage is acceptable provided a three-year extended reporting period is purchased upon expiration or cancellation.
12.7 Insurers shall be rated A- VII or better by A.M. Best. Supplier shall provide thirty (30) days' written notice of cancellation to Pinecrest (ten days for non-payment) and shall deliver certificates and endorsements before commencement of the Services.`,
  },
  {
    filename: "Policy UMB-5510087.pdf",
    folder: null,
    text: `NORTHWIND MUTUAL INSURANCE COMPANY — COMMERCIAL UMBRELLA LIABILITY DECLARATIONS
Policy UMB-5510087 · Named Insured: Cedar Ridge Manufacturing Inc. · Policy Period 10/01/2025 to 10/01/2026
Limits of Insurance: $5,000,000 Each Occurrence · $5,000,000 Aggregate
Follows form over scheduled underlying: CGL-3310221, CA-9930014, WC-1120993 (employer's liability part)
Additional insureds and waiver of subrogation follow the underlying where required by written contract.`,
  },
];

async function main() {
  const file = process.env.DATA_FILE ?? path.resolve(process.cwd(), "data", "reviews.json");
  const store = new FileStore(file);
  const provider = new StubProvider(0);

  const created = new Map<string, StoredDocument>();
  for (const d of docs) {
    const pages = await extractPages(Buffer.from(d.text), "text/plain", d.filename.replace(/\.pdf$/, ".txt"));
    const doc = await store.createDocument({ id: newId(), owner_id: OWNER, filename: d.filename, folder: d.folder, mime: "text/plain", version_id: newId(), pages, created_at: now() });
    created.set(d.filename, doc);
  }

  const reviews: { title: string; template: string; extensions: string[]; grouping: "document" | "folder"; files: string[]; columnKeys?: string[] }[] = [
    { title: "Policy delivery check — Harborline 2026", template: "CI04", extensions: [], grouping: "folder", files: ["Accepted quote NWM-Q-88213.pdf", "Binder B-22-0917.pdf", "Issued policy CGL-4471902.pdf"] },
    { title: "GL quote comparison — Cedar Ridge 2026-27", template: "CI01", extensions: ["CX02"], grouping: "folder", files: ["Northwind Mutual — Quote NWM-Q-91002.pdf", "Atlas Specialty — Indication ASP-26-44817.pdf", "Meridian — Quote MER-GL-770215.pdf"] },
    { title: "Contract insurance requirements — Pinecrest MSA", template: "CI11", extensions: [], grouping: "document", files: ["Pinecrest MSA v4.pdf", "Policy UMB-5510087.pdf"] },
  ];

  for (const spec of reviews) {
    const columns = buildColumns({ templateId: spec.template, extensionIds: spec.extensions });
    const review: Review = {
      id: newId(), owner_id: OWNER, title: spec.title, template_id: spec.template, extension_ids: spec.extensions, columns,
      model: "default", document_grouping: spec.grouping, active_generation_id: null, generation_lease_expires_at: null, created_at: now(), updated_at: now(),
    };
    await store.createReview(review);
    const rowDocs = spec.files.map((f) => created.get(f)!);
    const { rows } = proposeRows(review, rowDocs);
    await store.replaceRows(review.id, rows.map(({ needs_user_context: _n, ...r }) => ({ ...r, review_id: review.id, sort_index: 0 })));
    await ensureCells(store, review, await store.listRows(review.id));
    await new Promise<void>((resolve) => {
      const unsubscribe = reviewEvents.subscribe(review.id, (e) => {
        if (e.event.type === "complete" || e.event.type === "cancelled") {
          unsubscribe();
          resolve();
        }
      });
      void startGeneration({ store, provider, review, scope: {} });
    });
    console.log(`seeded: ${spec.title} (${rows.length} rows × ${columns.length} columns)`);
  }
  store.flush();
  console.log(`wrote ${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
