-- ============================================================================
-- 0002_inbox_bindings.sql — XE-MAILBOX's own host bindings.
-- ============================================================================
-- The ONE file this host writes. Section 1 is REQUIRED — until it runs,
-- inbox_is_staff() answers false and the module has no human admin (mail still
-- stores; the module fails closed).
--
-- This file ships XE-MAILBOX's own staff table and binds inbox_is_staff() to it.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. The staff table — XE-MAILBOX's own identity for platform admins.
--    In multi-tenant mode (Phase 3) this gains a tenant_id; for now, one tenant.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.staff (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid not null unique references auth.users(id) on delete cascade,
  email           text,
  display_name    text,
  role            text not null default 'admin'
                    check (role in ('owner','admin','viewer')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.staff enable row level security;

-- Staff can read their own row; full access via service role.
create policy staff_self_read on public.staff
  for select to authenticated using (auth_user_id = auth.uid());

revoke all on public.staff from anon;
grant select on public.staff to authenticated;
grant all on public.staff to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. REQUIRED — bind the admin predicate to XE-MAILBOX's staff table.
--    Replaces the deny-by-default stub from inbox_core.sql.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.inbox_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff
     where auth_user_id = auth.uid()
       and role in ('owner','admin')
  )
$$;

grant execute on function public.inbox_is_staff() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Realtime on inbox_threads — RLS still gates who receives which rows.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'inbox_threads') then
    alter publication supabase_realtime add table public.inbox_threads;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. OPTIONAL — pg_cron wake-up for snoozed threads (backstop; the UI also
--    wakes them lazily on inbox load).
-- ─────────────────────────────────────────────────────────────────────────────
-- Uncomment when pg_cron is available:
-- select cron.schedule('inbox-wake-snoozed', '*/10 * * * *',
--   $$select public.inbox_wake_snoozed()$$);
