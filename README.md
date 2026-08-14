# XE-MAILBOX — Standalone Multi-Tenant Email Service

Receive, thread, forward, and reply to real email on your own domain, with team mailboxes (`support@`, `info@`, etc.), per-seat permissions, signatures, and an advisory spam scanner. Postgres is the archive; there is no mail server — the app IS the mail client, and per-address forwarders are the read-anywhere escape hatch.

XE-MAILBOX runs as a standalone service. This repository contains the complete engine (running as a Supabase Edge Function), the database migrations, and the Vue 3 admin & client web interface.

---

## Directory Structure

```
supabase/
├── config.toml                    # verify_jwt = false on functions.inbox
├── functions/
│   └── inbox/                     # Deno Edge Function
│       ├── index.ts               # HTTP API handler & ingest gateway
│       ├── resend.ts              # Resend API fetch client
│       ├── scan.ts                # Spam & phishing heuristics
│       └── ai.ts                  # LLM cascade (OpenAI/Anthropic compat)
└── migrations/
    ├── 0001_inbox_core.sql        # Portable database core
    └── 0002_inbox_bindings.sql    # XE-MAILBOX staff table & bindings

src/
├── stores/
│   └── auth.js                    # Reactive auth store & staff check
├── services/
│   └── inbox.js                   # Client SDK repointed to 'staff'
├── views/
│   ├── LoginView.vue              # Sign-in view
│   ├── inbox/
│   │   └── InboxView.vue          # Member-facing client (CSP sandbox)
│   └── admin/
│       └── AdminInboxView.vue     # Administrative console
```

---

## Five Things That Break (Read Before Deploying)

1. **The webhook must be registered on the host that answers 2xx DIRECTLY.**
   Resend dispatches through Svix, and **Svix does not follow redirects**. A 3xx is a failed delivery, retried and eventually abandoned. If your platform canonicalises apex/www and you register the redirecting apex, *every* delivery fails while your logs stay empty — because your code is never invoked. Verify with:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST -d '{}' \
     -H 'content-type: application/json' "<your webhook URL>"     # must be 2xx, NOT 3xx
   ```

2. **The inbound webhook payload is METADATA ONLY.** No body, no headers, no attachment bytes. Receiving is a **fetch-back**: `GET /emails/receiving/{id}`. A port that reads `data.html` off the payload stores subject-only shells with `message_id = NULL`, which kills threading and deduplication.

3. **Resend returns header values JSON-encoded, and folds `List-*` into a nested object.**
   - `date` arrives as `"2026-08-04T20:54:00.000Z"` *including the quotes*. `Date.parse` rejects it, so `occurred_at` silently becomes the receive time. Use `firstDate()`.
   - `List-Unsubscribe` is nested: `list: {"unsubscribe":{"url":"..."}}`. A flat `list-unsubscribe` lookup returns nothing, disabling bulk filters. Use `isBulkMail()`.

4. **Grants must be revoke-first, and RLS must actually be ON.**
   Supabase default-grants `ALL` to `anon`/`authenticated` on every new table, and a column grant cannot narrow a table grant. Verify RLS and grants via:
   ```sql
   select c.relname, c.relrowsecurity as rls_on,
          (select count(*) from pg_policies p where p.tablename = c.relname) as policies,
          (select string_agg(distinct privilege_type, ',' order by privilege_type)
             from information_schema.table_privileges t
            where t.table_name = c.relname and t.grantee = 'authenticated') as auth_grants
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname like 'inbox%' and c.relkind = 'r' order by 1;
   ```

5. **`inbox_is_staff()` decides everything, so a stub predicate is a data breach.**
   Every admin surface and RLS policy delegates to it. In XE-MAILBOX, this is bound to the `public.staff` table: only users explicitly inserted into `staff` with `role = 'owner'` or `'admin'` can read keys or manage domains.

---

## 12-Step Post-Port Verification

Each step isolates one hop. Stop at the first failure. `$KEY` is the Resend key, `$WH` the webhook URL.

| # | Hop | Command | Expected |
|---|-----|---------|----------|
| 1 | Domain verified, receiving on | `curl -s -H "Authorization: Bearer $KEY" https://api.resend.com/domains` | `status: verified`, `capabilities.receiving: "enabled"` |
| 2 | MX points at Resend | `nslookup -type=MX <domain>` | `inbound-smtp.<region>.amazonaws.com` |
| 3 | Webhook registered | `curl -s -H "Authorization: Bearer $KEY" https://api.resend.com/webhooks` | one entry, `events: ["email.received"]` |
| 4 | Endpoint answers directly | `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"type":"email.delivered"}' "$WH"` | `200` or `401 Bad signature` (proves code ran). **308/301 is a redirect failure** |
| 5 | Bad token refused | same as 4 with `t=bogus` | `401` |
| 6 | Resend receiving mail | `curl -s -H "Authorization: Bearer $KEY" https://api.resend.com/emails/receiving` | test sends appear here |
| 7 | Mail reached the DB | `select action, detail, ts from inbox_log order by ts desc limit 5;` | `stored` rows |
| 8 | Bodies/threading real | `select subject, length(html), message_id is not null from inbox_messages;` | non-zero body length, message_id not null |
| 9 | Timestamps are send times | `select occurred_at, created_at from inbox_messages order by created_at desc limit 5;` | the two differ |
| 10 | Grants and RLS | Run RLS check query above | `rls_on: true` on all tables; narrow `auth_grants` |
| 11 | Staff predicate active | `select inbox_is_staff();` as a non-admin | `false` |
| 12 | Signature verification | Send HMAC valid vs tampered Svix headers | `200` / `401` |

---

## Backfill Action (Replay Missed Mail)

Resend keeps received mail retrievable. If the edge function is down or misconfigured, emails aren't lost. XE-MAILBOX has a built-in `backfill` action to pull and replay missed mail:
```bash
curl -X POST -H "Authorization: Bearer <admin-user-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"action": "backfill", "domain_id": "<domain-uuid>"}' \
  "http://localhost:54321/functions/v1/inbox"
```
Ingest is fully idempotent, so replaying is safe. If mail arrived while a broken schema was deployed, delete those shell/empty rows first before replaying.
