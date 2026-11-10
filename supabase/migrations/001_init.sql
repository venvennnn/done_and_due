-- Done & Due workspace schema. Demo data never lives here.
-- Authenticated clients may read their own rows. Mutations go through the server.

create extension if not exists pgcrypto;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  adapter text not null default 'paypal_sandbox' check (adapter = 'paypal_sandbox'),
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id text primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  email text not null default '',
  created_at timestamptz not null default now()
);

create table public.jobs (
  id text primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_id text,
  title text not null,
  updated_at timestamptz not null default now()
);

create table public.transcript_revisions (
  id text primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  job_id text not null,
  body text not null,
  source text not null,
  created_at timestamptz not null default now()
);

create table public.evidence_attachments (
  id text primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  job_id text not null,
  kind text not null check (kind in ('photo', 'audio')),
  storage_path text not null,
  mime_type text not null,
  byte_size integer not null check (byte_size >= 0 and byte_size <= 8388608),
  width integer,
  height integer,
  version integer not null default 1,
  created_at timestamptz not null default now()
);

create table public.catalog_items (
  id text primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  unit text not null,
  rate_minor integer not null check (rate_minor >= 0),
  active boolean not null default true,
  document jsonb not null
);

create table public.catalog_aliases (
  id text primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  catalog_item_id text not null,
  alias text not null,
  normalized_alias text not null,
  unique (workspace_id, normalized_alias)
);

create table public.invoices (
  id text primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  job_id text not null,
  number text not null,
  approval_state text not null,
  delivery_state text not null,
  settlement_state text not null,
  currency text not null,
  total_minor integer not null,
  paypal_invoice_id text,
  paypal_env text,
  recipient_email text not null default '',
  observation_version integer not null default 1,
  document jsonb not null,
  updated_at timestamptz not null default now(),
  unique (workspace_id, number)
);

create unique index invoices_paypal_uidx
  on public.invoices (paypal_env, paypal_invoice_id)
  where paypal_invoice_id is not null;

create table public.invoice_lines (
  id text primary key,
  invoice_id text not null references public.invoices (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  sort_order integer not null,
  description text not null,
  quantity_decimal text,
  unit text,
  rate_minor integer,
  excluded boolean not null default false,
  document jsonb not null
);

create table public.invoice_snapshots (
  id text primary key,
  invoice_id text not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  revision integer not null,
  total_minor integer not null,
  recipient_email text not null,
  currency text not null,
  document jsonb not null,
  approved_at timestamptz not null
);

create table public.timeline_events (
  id text primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  invoice_id text not null,
  kind text not null,
  message text not null,
  actor text not null,
  simulated boolean not null default false,
  created_at timestamptz not null
);

create table public.payments (
  id text primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  invoice_id text not null,
  amount_minor integer not null,
  simulated boolean not null default false,
  created_at timestamptz not null
);

create table public.paypal_operations (
  id text primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  invoice_id text not null,
  snapshot_id text not null,
  operation_type text not null,
  status text not null,
  idempotency_key text not null,
  paypal_invoice_id text,
  document jsonb not null,
  unique (snapshot_id, operation_type)
);

create table public.webhook_receipts (
  event_id text primary key,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  environment text not null check (environment = 'sandbox'),
  process_status text not null,
  document jsonb not null
);

create table public.ai_runs (
  id text primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  job_id text not null,
  stage text not null,
  status text not null,
  attempt integer not null default 1,
  document jsonb not null
);

alter table public.workspaces enable row level security;
alter table public.customers enable row level security;
alter table public.jobs enable row level security;
alter table public.transcript_revisions enable row level security;
alter table public.evidence_attachments enable row level security;
alter table public.catalog_items enable row level security;
alter table public.catalog_aliases enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_snapshots enable row level security;
alter table public.timeline_events enable row level security;
alter table public.payments enable row level security;
alter table public.paypal_operations enable row level security;
alter table public.webhook_receipts enable row level security;
alter table public.ai_runs enable row level security;

create policy workspaces_owner_select on public.workspaces for select to authenticated using (owner_id = auth.uid());
create policy customers_owner_select on public.customers for select to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create policy jobs_owner_select on public.jobs for select to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create policy transcripts_owner_select on public.transcript_revisions for select to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create policy evidence_owner_select on public.evidence_attachments for select to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create policy catalog_owner_select on public.catalog_items for select to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create policy aliases_owner_select on public.catalog_aliases for select to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create policy invoices_owner_select on public.invoices for select to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create policy lines_owner_select on public.invoice_lines for select to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create policy snapshots_owner_select on public.invoice_snapshots for select to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create policy timeline_owner_select on public.timeline_events for select to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create policy payments_owner_select on public.payments for select to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create policy operations_owner_select on public.paypal_operations for select to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create policy webhooks_owner_select on public.webhook_receipts for select to authenticated using (workspace_id is not null and exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
create policy ai_owner_select on public.ai_runs for select to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

-- No direct client writes. Uploads use signed URLs minted by the server.
create policy evidence_owner_read on storage.objects for select to authenticated
using (
  bucket_id = 'evidence'
  and (storage.foldername(name))[1] = 'workspaces'
  and exists (
    select 1 from public.workspaces w
    where w.id::text = (storage.foldername(name))[2]
      and w.owner_id = auth.uid()
  )
);
