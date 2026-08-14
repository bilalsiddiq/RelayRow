-- ============================================================================
-- 0004_relayrow_tenants_branding.sql — Dynamic Branding & Multi-Tenant Capacities
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. App Branding & Design System Table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.app_branding (
  id              uuid primary key default gen_random_uuid(),
  app_name        text not null default 'RelayRow',
  app_url         text not null default 'https://RelayRow.com',
  logo_url        text default '',
  logo_svg        text default '',
  accent_color    text not null default '#6366f1',
  surface_color   text not null default '#0f172a',
  bg_color        text not null default '#020617',
  text_color      text not null default '#f8fafc',
  font_family     text not null default 'Inter, sans-serif',
  theme_preset    text not null default 'relayrow-indigo',
  custom_css      text default '',
  updated_at      timestamptz not null default now()
);

alter table public.app_branding enable row level security;
create policy app_branding_read on public.app_branding for select to public using (true);
create policy app_branding_write on public.app_branding for all to authenticated using (public.inbox_is_staff());

grant select on public.app_branding to anon, authenticated;
grant all on public.app_branding to service_role;

-- Initial default branding row
insert into public.app_branding (
  app_name, app_url, accent_color, surface_color, bg_color, text_color, theme_preset
) values (
  'RelayRow', 'https://RelayRow.com', '#6366f1', '#0f172a', '#020617', '#f8fafc', 'relayrow-indigo'
) on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tenants & Capacity Quotas Table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.tenants (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  status          text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.tenants enable row level security;
create policy tenants_read on public.tenants for select to authenticated using (true);
create policy tenants_write on public.tenants for all to authenticated using (public.inbox_is_staff());

grant select on public.tenants to authenticated;
grant all on public.tenants to service_role;

create table if not exists public.tenant_capacities (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade unique,
  max_domains     int not null default 5,
  max_inboxes     int not null default 50,
  max_storage_gb  int not null default 10,
  max_seats       int not null default 20,
  updated_at      timestamptz not null default now()
);

alter table public.tenant_capacities enable row level security;
create policy tenant_capacities_read on public.tenant_capacities for select to authenticated using (true);
create policy tenant_capacities_write on public.tenant_capacities for all to authenticated using (public.inbox_is_staff());

grant select on public.tenant_capacities to authenticated;
grant all on public.tenant_capacities to service_role;

-- Seed initial default tenant "Default Organization"
do $$
declare
  v_tenant_id uuid;
begin
  select id into v_tenant_id from public.tenants where slug = 'default-org';
  if v_tenant_id is null then
    insert into public.tenants (name, slug, status)
    values ('Default Organization', 'default-org', 'active')
    returning id into v_tenant_id;

    insert into public.tenant_capacities (tenant_id, max_domains, max_inboxes, max_storage_gb, max_seats)
    values (v_tenant_id, 10, 100, 25, 50);
  end if;
end $$;
