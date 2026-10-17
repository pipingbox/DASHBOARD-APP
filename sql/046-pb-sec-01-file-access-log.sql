-- PB-SEC-01 / PB-MARKETPLACE-V3-RECRUITMENT-001 TRACK B
-- Append-only audit log for secure-file-access decisions.
--
-- Every grant and every denial of the file broker is recorded: who asked,
-- for whose file, what type, which delivery mechanism and why. This is the
-- forensic evidence base for company document access (and later for
-- attribution in the success-fee circuit, Documento H).
--
-- Immutability model: RLS enabled with NO policies, so no API role can read,
-- update or delete rows. Only service_role (which bypasses RLS) inserts,
-- from the secure-file-access Edge Function. There is intentionally no
-- UPDATE/DELETE path and no GRANT for anon/authenticated.

create table if not exists public.app_14da0f1941_file_access_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid not null,
  actor_role text not null,
  owner_user_id uuid not null,
  file_type text not null check (file_type in ('cv', 'document', 'certification')),
  record_id text,
  bucket text,
  object_path text,
  decision text not null check (decision in ('granted', 'denied')),
  reason text not null,
  delivery text check (delivery in ('signed_url', 'proxy')),
  correlation_id text
);

alter table public.app_14da0f1941_file_access_log enable row level security;

revoke all on public.app_14da0f1941_file_access_log from anon, authenticated;
grant insert on public.app_14da0f1941_file_access_log to service_role;

create index if not exists app_14da0f1941_file_access_log_actor_idx
  on public.app_14da0f1941_file_access_log (actor_user_id, created_at desc);

create index if not exists app_14da0f1941_file_access_log_owner_idx
  on public.app_14da0f1941_file_access_log (owner_user_id, created_at desc);

create index if not exists app_14da0f1941_file_access_log_decision_idx
  on public.app_14da0f1941_file_access_log (decision, created_at desc);

comment on table public.app_14da0f1941_file_access_log is
  'PB-SEC-01: append-only audit of secure-file-access grant/deny decisions. RLS closed (no policies); inserts only from the broker via service_role.';
