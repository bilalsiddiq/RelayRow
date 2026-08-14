-- ============================================================================
-- inbox_host_bindings.template.sql — the ONE file each host app writes.
-- ============================================================================
-- Copy this next to inbox_core.sql in your migrations dir (numbered AFTER it),
-- keep the sections you need, delete the rest. No begin;/commit; — your
-- migration runner wraps the file.
--
-- Section 1 is REQUIRED. Until it runs, inbox_is_staff() answers false and the
-- module has no human admin (mail still stores; the module fails closed).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. REQUIRED — bind the admin predicate to YOUR app.
--    Pick one body, or write your own. Keep it cheap: it runs inside RLS.
-- ─────────────────────────────────────────────────────────────────────────────

-- Zexpo (JWT app_metadata claim via its own helper):
create or replace function public.inbox_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_super_admin(), false)
$$;

-- Loop-with-AI:
-- create or replace function public.inbox_is_staff()
-- returns boolean language sql stable security definer set search_path = public as $$
--   select coalesce(public.se_is_platform_admin(), false)
-- $$;

-- CircleRev (no SQL admin predicate exists yet — this bindings file ships the
-- first one; confirm the role column/values against the live `members` table):
-- create or replace function public.inbox_is_staff()
-- returns boolean language sql stable security definer set search_path = public as $$
--   select exists (select 1 from public.members
--                   where auth_user_id = auth.uid() and role in ('owner','operator'))
-- $$;

grant execute on function public.inbox_is_staff() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. OPTIONAL — attach your app's entities to the host entity links.
--    inbox_addresses.event_id / org_id and inbox_threads.event_id / org_id are
--    plain uuids in the core. Bind them if your app has matching tables; leave
--    them unbound (always-null) otherwise.
-- ─────────────────────────────────────────────────────────────────────────────

-- Zexpo binds events + organizations (already live there from its 0024):
-- alter table public.inbox_addresses
--   add constraint inbox_addresses_event_id_fkey
--   foreign key (event_id) references public.events(id) on delete set null;
-- alter table public.inbox_addresses
--   add constraint inbox_addresses_org_id_fkey
--   foreign key (org_id) references public.organizations(id) on delete set null;
-- alter table public.inbox_threads
--   add constraint inbox_threads_event_id_fkey
--   foreign key (event_id) references public.events(id) on delete set null;
-- alter table public.inbox_threads
--   add constraint inbox_threads_org_id_fkey
--   foreign key (org_id) references public.organizations(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. OPTIONAL — realtime thread-list updates for the /inbox client.
--    RLS still gates who receives which rows.
-- ─────────────────────────────────────────────────────────────────────────────

-- do $$
-- begin
--   if not exists (
--     select 1 from pg_publication_tables
--      where pubname = 'supabase_realtime' and tablename = 'inbox_threads') then
--     alter publication supabase_realtime add table public.inbox_threads;
--   end if;
-- end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. OPTIONAL — pg_cron wake-up for snoozed threads (the UI also wakes them
--    lazily on inbox load, so this is a backstop, not a requirement).
-- ─────────────────────────────────────────────────────────────────────────────

-- select cron.schedule('inbox-wake-snoozed', '*/10 * * * *',
--   $$select public.inbox_wake_snoozed()$$);
