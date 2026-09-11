-- Tabular review schema for Postgres. Mirrors apps/api/src/store/types.ts.
-- Apply with: psql "$DATABASE_URL" -f apps/api/src/store/schema.sql

create table if not exists documents (
  id text primary key,
  owner_id text not null,
  filename text not null,
  folder text,
  mime text not null,
  version_id text not null,
  pages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists documents_owner_idx on documents (owner_id, created_at desc);

create table if not exists reviews (
  id text primary key,
  owner_id text not null,
  title text not null,
  template_id text,
  extension_ids jsonb not null default '[]'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  model text not null,
  document_grouping text not null default 'document' check (document_grouping in ('document', 'folder')),
  active_generation_id text,
  generation_lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reviews_owner_idx on reviews (owner_id, updated_at desc);

create table if not exists review_shares (
  review_id text not null references reviews (id) on delete cascade,
  user_id text not null,
  role text not null check (role in ('viewer', 'editor')),
  primary key (review_id, user_id)
);

create table if not exists review_rows (
  id text primary key,
  review_id text not null references reviews (id) on delete cascade,
  label text not null,
  document_ids jsonb not null default '[]'::jsonb,
  document_roles jsonb not null default '{}'::jsonb,
  comparison_group_id text,
  user_context jsonb not null default '{}'::jsonb,
  sort_index integer not null default 0
);
create index if not exists review_rows_review_idx on review_rows (review_id, sort_index);

create table if not exists review_cells (
  row_id text not null references review_rows (id) on delete cascade,
  column_index integer not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  summary text not null default '',
  flag text not null default 'grey' check (flag in ('green', 'yellow', 'red', 'grey')),
  evidence_status text not null default 'not_stated',
  reasoning text not null default '',
  citations jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  missing_inputs jsonb not null default '[]'::jsonb,
  error text,
  generation_id text,
  source_version_ids jsonb not null default '[]'::jsonb,
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed', 'reviewed', 'needs_correction')),
  reviewer_id text,
  reviewed_at timestamptz,
  locked boolean not null default false,
  override_value text,
  override_reason text,
  stale boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (row_id, column_index)
);
