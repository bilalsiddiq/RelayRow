-- ============================================================================
-- 0006_membership_aura_rbac.sql — 3-Tier Multi-Tenant Architecture, AURA AI Module & Sub-Member RBAC
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Membership Plans Table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.membership_plans (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null unique,
  price_monthly       numeric(10,2) not null default 0.00,
  price_yearly        numeric(10,2) not null default 0.00,
  max_domains         int not null default 5,
  max_inboxes         int not null default 50,
  max_seats           int not null default 10,
  max_storage_gb      int not null default 10,
  monthly_ai_credits  int not null default 1000,
  features            jsonb default '[]'::jsonb,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.membership_plans enable row level security;

create policy membership_plans_read on public.membership_plans
  for select to authenticated using (true);

create policy membership_plans_write on public.membership_plans
  for all to authenticated using (public.inbox_is_staff());

grant select on public.membership_plans to anon, authenticated;
grant all on public.membership_plans to service_role;

-- Seed default plans
insert into public.membership_plans (name, slug, price_monthly, price_yearly, max_domains, max_inboxes, max_seats, max_storage_gb, monthly_ai_credits, features)
values 
  ('Starter Plan', 'starter', 29.00, 290.00, 3, 20, 5, 10, 2000, '["3 Domains", "20 Inboxes", "2,000 AI Credits", "5 Team Seats"]'::jsonb),
  ('Pro Business', 'pro', 79.00, 790.00, 10, 100, 25, 50, 10000, '["10 Domains", "100 Inboxes", "10,000 AI Credits", "25 Team Seats", "Priority AURA Cascade"]'::jsonb),
  ('Enterprise', 'enterprise', 249.00, 2490.00, 50, 500, 100, 250, 50000, '["50 Domains", "500 Inboxes", "50,000 AI Credits", "100 Team Seats", "Dedicated Support"]'::jsonb)
on conflict (slug) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tenant Subscriptions & AI Credit Balances
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.tenant_subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade unique,
  plan_id             uuid references public.membership_plans(id) on delete set null,
  status              text not null default 'active' check (status in ('active', 'past_due', 'canceled', 'trialing')),
  ai_credits_balance  int not null default 1000,
  renews_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.tenant_subscriptions enable row level security;

create policy tenant_subscriptions_read on public.tenant_subscriptions
  for select to authenticated using (true);

create policy tenant_subscriptions_write on public.tenant_subscriptions
  for all to authenticated using (public.inbox_is_staff());

grant select on public.tenant_subscriptions to authenticated;
grant all on public.tenant_subscriptions to service_role;

-- Seed default tenant subscription for Default Organization
do $$
declare
  v_tenant_id uuid;
  v_plan_id uuid;
begin
  select id into v_tenant_id from public.tenants where slug = 'default-org';
  select id into v_plan_id from public.membership_plans where slug = 'pro';

  if v_tenant_id is not null and not exists (select 1 from public.tenant_subscriptions where tenant_id = v_tenant_id) then
    insert into public.tenant_subscriptions (tenant_id, plan_id, status, ai_credits_balance, renews_at)
    values (v_tenant_id, v_plan_id, 'active', 10000, now() + interval '30 days');
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. AURA Platform AI Engine Configuration
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.aura_ai_config (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null default 'openai', -- 'openai', 'anthropic', 'openrouter', 'groq'
  model               text not null default 'gpt-4o-mini',
  api_key_tail        text default '',
  secret_id           uuid, -- Supabase Vault reference
  credit_rate_triage  int not null default 1,
  credit_rate_reply   int not null default 2,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.aura_ai_config enable row level security;

create policy aura_ai_config_read on public.aura_ai_config
  for select to authenticated using (true);

create policy aura_ai_config_write on public.aura_ai_config
  for all to authenticated using (public.inbox_is_staff());

grant select on public.aura_ai_config to authenticated;
grant all on public.aura_ai_config to service_role;

insert into public.aura_ai_config (provider, model, credit_rate_triage, credit_rate_reply, is_active)
values ('openai', 'gpt-4o-mini', 1, 2, true)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tenant AI Usage Logs
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.tenant_ai_usage (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  user_id             uuid references auth.users(id) on delete set null,
  action_type         text not null default 'triage', -- 'triage', 'reply_draft', 'summarize'
  credits_deducted    int not null default 1,
  tokens_used         int not null default 0,
  details             text default '',
  created_at          timestamptz not null default now()
);

alter table public.tenant_ai_usage enable row level security;

create policy tenant_ai_usage_read on public.tenant_ai_usage
  for select to authenticated using (true);

create policy tenant_ai_usage_write on public.tenant_ai_usage
  for all to authenticated using (true);

grant select, insert on public.tenant_ai_usage to authenticated;
grant all on public.tenant_ai_usage to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Tenant Sub-Members & Granular RBAC
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.tenant_members (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  email               text not null,
  display_name        text default '',
  role                text not null default 'operator' check (role in ('owner', 'admin', 'domain_admin', 'operator')),
  inbox_access        jsonb default '[]'::jsonb, -- Array of address_ids or domain_ids accessible
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(tenant_id, user_id)
);

alter table public.tenant_members enable row level security;

create policy tenant_members_read on public.tenant_members
  for select to authenticated using (true);

create policy tenant_members_write on public.tenant_members
  for all to authenticated using (true);

grant select, insert, update, delete on public.tenant_members to authenticated;
grant all on public.tenant_members to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Inbox Knowledge Base (RAG Rules for AI Assist)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.inbox_knowledge_base (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid references public.tenants(id) on delete cascade,
  domain_id           uuid references public.inbox_domains(id) on delete cascade,
  address_id          uuid references public.inbox_addresses(id) on delete cascade,
  title               text not null,
  content             text not null,
  category            text default 'general',
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.inbox_knowledge_base enable row level security;

create policy inbox_knowledge_base_read on public.inbox_knowledge_base
  for select to authenticated using (true);

create policy inbox_knowledge_base_write on public.inbox_knowledge_base
  for all to authenticated using (true);

grant select, insert, update, delete on public.inbox_knowledge_base to authenticated;
grant all on public.inbox_knowledge_base to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. SQL Helper Functions for RBAC & AI Credits
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.user_has_inbox_access(p_address_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_is_staff boolean;
  v_member_role text;
  v_access jsonb;
begin
  -- Super admin has access to everything
  select public.inbox_is_staff() into v_is_staff;
  if v_is_staff then
    return true;
  end if;

  -- Check tenant membership
  select role, inbox_access into v_member_role, v_access
    from public.tenant_members
   where user_id = v_user_id;

  if v_member_role is null then
    -- Fallback: if not explicitly bound, default to true for single tenant simplicity
    return true;
  end if;

  if v_member_role in ('owner', 'admin') then
    return true;
  end if;

  -- If inbox_access is empty or contains '*' then full access
  if v_access is null or jsonb_array_length(v_access) = 0 or v_access ? '*' or v_access ? p_address_id::text then
    return true;
  end if;

  return false;
end $$;

grant execute on function public.user_has_inbox_access(uuid) to authenticated;
