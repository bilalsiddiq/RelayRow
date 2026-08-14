# RelayRow Database Schema & RLS Guidelines

This document details the PostgreSQL database structure, migrations (`0001` through `0006`), Row-Level Security (RLS) policies, and RPC functions.

---

## 1. Database Migrations Breakdown

| Migration File | Primary Focus | Key Tables / Functions Created |
| :--- | :--- | :--- |
| `0001_inbox_core.sql` | Portable Inbox Engine Core | `inbox_domains`, `inbox_addresses`, `inbox_threads`, `inbox_messages`, `inbox_forwarders`, `inbox_log` |
| `0002_inbox_bindings.sql` | Platform Identity Bindings | `public.staff` table, `public.inbox_is_staff()` function, Realtime publication |
| `0003_seed_superadmin.sql` | Initial Platform Seed | Super admin staff record initial binding setup |
| `0004_relayrow_tenants_branding.sql` | Multi-Tenant & White-Labeling | `tenants`, `tenant_capacities`, `app_branding` |
| `0005_fix_auth_users.sql` | Auth Compatibility Fixes | Ensures clean references to `auth.users(id)` |
| `0006_membership_aura_rbac.sql` | Tenant RBAC & AURA Engine | `tenant_memberships`, `membership_plans`, `aura_config`, `aura_usage_log`, `aura_knowledge_bases` |

---

## 2. Core Tables Overview

### Identity & Access Control
- `public.staff`: Identifies super admins/platform owners (`auth_user_id`, `email`, `role = 'owner'|'admin'|'viewer'`).
- `public.tenants`: Organization accounts (`id`, `name`, `slug`, `plan_id`, `status`).
- `public.tenant_memberships`: Org seat assignments (`tenant_id`, `user_id`, `role = 'owner'|'admin'|'member'`, `inbox_access`).
- `public.membership_plans`: Plan tiers (`id`, `name`, `max_domains`, `max_inboxes`, `max_seats`, `aura_monthly_credits`).

### Mailbox Engine
- `public.inbox_domains`: Custom receiving domains (`domain_name`, `resend_domain_id`, `verification_status`).
- `public.inbox_addresses`: Specific email mailboxes (`address`, `domain_id`, `display_name`, `is_catchall`).
- `public.inbox_threads`: Email threads grouped by conversation (`id`, `subject`, `address_id`, `last_message_at`, `status`).
- `public.inbox_messages`: Individual email messages (`id`, `thread_id`, `sender_email`, `recipient_email`, `html`, `text`, `occurred_at`).
- `public.inbox_forwarders`: Per-address forwarding rules (`address_id`, `forward_to_email`, `is_active`).

### Platform & AI Controls
- `public.app_branding`: White-label app settings (`app_name`, `app_url`, `logo_url`, `primary_color`).
- `public.aura_config`: LLM Engine keys & model preferences (keys stored in `vault.decrypted_secrets`).
- `public.aura_knowledge_bases`: RAG knowledge bases attached to tenant inboxes.

---

## 3. Row-Level Security (RLS) Policies

All tables must enforce RLS:
```sql
alter table public.<table_name> enable row level security;
```

### Security Definer Predicates
`public.inbox_is_staff()` evaluates whether the authenticated user is a platform owner/admin:
```sql
create or replace function public.inbox_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff
     where auth_user_id = auth.uid()
       and role in ('owner','admin')
  )
$$;
```

### Policy Rules Summary
- **Public Read (White-labeling)**: `app_branding` is readable by `anon` and `authenticated`. Writes are restricted to `inbox_is_staff()`.
- **Tenant Isolation**: Members can only read threads/messages associated with inboxes they have seat access to in `tenant_memberships`.
- **Super Admin Overrides**: `inbox_is_staff()` bypasses tenant boundaries for global administration.
