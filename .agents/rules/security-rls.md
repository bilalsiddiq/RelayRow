# RelayRow Security & RLS Guidelines

## 1. Staff & Super Admin Predicate
All staff level operations in PostgreSQL functions and RLS policies rely on `public.inbox_is_staff()`.

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

## 2. Row-Level Security Rules
- **RLS Required**: Every table in public schema must have `alter table public.<table_name> enable row level security;`.
- **Explicit Grants**: Explicitly revoke wildcard grants from `anon` and `authenticated`.
- **Vault Protection**: API keys and LLM tokens must be stored in Supabase Vault (`vault.decrypted_secrets`), readable only by `inbox_is_staff()`.
