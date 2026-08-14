# RelayRow (XE-MAILBOX) — Master Agent Guidelines & Project Documentation Index

Welcome to **RelayRow** (XE-MAILBOX), a standalone, multi-tenant email platform engine built with Vue 3 (Composition API), Supabase (PostgreSQL + Deno Edge Functions), and Resend.

---

## 1. Executive Summary & Architecture

RelayRow allows multi-tenant organizations to receive, thread, forward, triage, and reply to real emails on custom domains with per-seat permissions, RBAC controls, and an LLM-powered triage engine (AURA AI Engine).

- **Frontend Application**: Vue 3, Vue Router, Reactive State Stores (`src/stores/auth.js`, `src/stores/branding.js`), Vanilla CSS design system (`var(--xe-*)`).
- **Edge Backend**: Supabase Deno Edge Function (`supabase/functions/inbox/index.ts`).
- **Database Architecture**: PostgreSQL with Row-Level Security (RLS) and custom functions (`public.inbox_is_staff()`, `public.se_is_platform_admin()`).
- **Inbound Pipeline**: Resend Inbound Webhooks -> Svix Signature Verification -> Metadata Ingest -> Resend `GET /emails/receiving/{id}` Fetch-back -> Threading & Storage.

---

## 2. Documentation Directory Map

Detailed rules and operational runbooks live in `.agents/rules/`:

| Topic Document | Location | Purpose & Scope |
| :--- | :--- | :--- |
| **Architecture & Patterns** | [architecture.md](file:///x:/RelayRow-app/.agents/rules/architecture.md) | Multi-tenant hierarchy, domain scope, threading logic, and design system principles |
| **Database & RLS Schema** | [database-schema.md](file:///x:/RelayRow-app/.agents/rules/database-schema.md) | Migrations 0001–0006, table definitions, RLS security policies, and RPC functions |
| **Inbound Webhooks & Ingest** | [inbound-webhook.md](file:///x:/RelayRow-app/.agents/rules/inbound-webhook.md) | Ingestion flow, Svix HMAC verification, fetch-back pattern, header unquoting, and backfill |
| **AURA AI Engine & Triage** | [aura-ai-triage.md](file:///x:/RelayRow-app/.agents/rules/aura-ai-triage.md) | LLM provider catalog, Supabase Vault storage, spam heuristics scanner, and automated reply drafting |
| **Frontend & UI System** | [frontend-design.md](file:///x:/RelayRow-app/.agents/rules/frontend-design.md) | Vue 3 stores, router guards, view architecture, and `--xe-*` vanilla CSS tokens |
| **Deployment & Runbook** | [deployment-runbook.md](file:///x:/RelayRow-app/.agents/rules/deployment-runbook.md) | 12-Step post-port verification table, top 5 deployment gotchas, and backfill CLI commands |

---

## 3. Key Rules & Constraints for AI Agents

1. **Authentication Integrity**:
   - Authentication uses real Supabase Auth (`supabase.auth.signInWithPassword(...)`).
   - Platform administration relies strictly on `public.inbox_is_staff()`. Never mock or bypass staff checks in production code.
   - Do **not** print hardcoded passwords or seed credentials on public login forms.

2. **Database & RLS Safety**:
   - All tables MUST enable Row-Level Security (`alter table ... enable row level security;`).
   - Standard grants to `anon`/`authenticated` are restricted; write policies are explicitly gated on `inbox_is_staff()` or membership predicates.
   - Functions evaluating permissions MUST set `search_path = public` and use `security definer`.

3. **Inbound Webhook Conventions**:
   - Webhook endpoints must return `2xx` directly (Svix does not follow `3xx` redirects).
   - Inbound webhook payloads contain metadata only — body contents and attachments are retrieved via `GET /emails/receiving/{id}`.
   - Resend header strings arrive JSON-quoted (e.g. `"2026-08-04T20:54:00.000Z"`). Always unquote before parsing.
