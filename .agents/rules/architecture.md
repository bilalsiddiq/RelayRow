# RelayRow Architectural Rules & Patterns

## 1. Domain & Tenant Hierarchy

RelayRow follows a multi-tenant hierarchy:
- **Platform (Super Admin)**: Manages platform-wide LLM keys (Supabase Vault), overall tenants, global capacity, and membership plans.
- **Tenants / Organizations**: Possess domain bindings (e.g. `company.com`) and seat allocations.
- **Mailboxes / Inboxes**: Owned by domains with address-level permission scoping (e.g., `support@company.com`, `sales@company.com`).

## 2. Inbound Pipeline & Threading
- **Message Deduplication**: Deduplicated on `message_id` or `resend_email_id`.
- **Threading Logic**: Uses `In-Reply-To` and `References` header matching to chain messages into `inbox_threads`.
- **Idempotency**: Ingest pipeline is 100% idempotent. Inbound webhooks can be replayed safely via the `backfill` action.

## 3. UI & Styling Principles
- Uses Vanilla CSS variables prefixed with `--xe-*` (e.g., `--xe-bg`, `--xe-accent`, `--xe-border`).
- Rich dark/glassmorphic theme aesthetics.
- Clean Vue 3 script setup with composition API.
