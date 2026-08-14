# Deployment & Operational Runbook

This document details deployment procedures, post-port verification, troubleshooting steps, and the 12-step validation matrix.

---

## 1. Five Common Deployment Gotchas

1. **Webhook Endpoint Redirects (Svix Failure)**:
   - Svix does **not** follow 3xx redirects. Webhook URL registered in Resend MUST return 2xx directly.
   - Verify with: `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' "<webhook_url>"`

2. **Inbound Metadata Fetch-back**:
   - Inbound webhook payloads contain metadata only. Message body contents and attachments must be fetched back via `GET /emails/receiving/{id}`.

3. **JSON-Quoted Header Strings**:
   - Resend header fields arrive JSON-encoded (`"2026-08-04T20:54:00.000Z"`). Always unquote before running `Date.parse()`.

4. **Revoke-First RLS Policies**:
   - Supabase default-grants `ALL` to `anon` and `authenticated`.
   - Ensure default table grants are revoked before adding narrow RLS write policies.

5. **Staff Predicate Guard**:
   - All super admin APIs and policies evaluate `public.inbox_is_staff()`. A stub predicate that returns `true` creates a security breach.

---

## 2. 12-Step Post-Port Verification Matrix

Run these validation steps whenever deploying database schema changes or updating Edge Functions:

| # | Validation Hop | Verification Command | Expected Output |
|---|---|---|---|
| 1 | Domain & Receiving | `curl -s -H "Authorization: Bearer $KEY" https://api.resend.com/domains` | `status: verified`, `capabilities.receiving: "enabled"` |
| 2 | DNS MX Records | `nslookup -type=MX <domain>` | `inbound-smtp.<region>.amazonaws.com` |
| 3 | Webhook Registration | `curl -s -H "Authorization: Bearer $KEY" https://api.resend.com/webhooks` | 1 entry with `events: ["email.received"]` |
| 4 | Endpoint Direct Response | `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' "$WH"` | `200` or `401 Bad signature` (NOT 301/308 redirect) |
| 5 | Bad Token Refusal | Same as step 4 with invalid signature token | `401 Unauthorized` |
| 6 | Resend Inbound Logs | `curl -s -H "Authorization: Bearer $KEY" https://api.resend.com/emails/receiving` | Received emails appear in list |
| 7 | Database Storage | `select action, detail, ts from inbox_log order by ts desc limit 5;` | `stored` rows |
| 8 | Body & Threading Check | `select subject, length(html), message_id is not null from inbox_messages;` | Non-zero body length, valid message_id |
| 9 | Send Time Preservation | `select occurred_at, created_at from inbox_messages order by created_at desc limit 5;` | `occurred_at` matches original email headers |
| 10 | RLS Policies Active | Run RLS security check query on `inbox_%` tables | `rls_on: true` on all tables |
| 11 | Staff Predicate Active | `select public.inbox_is_staff();` as non-admin user | `false` |
| 12 | Svix Signature Check | Dispatch HMAC valid vs tampered Svix headers | `200` / `401` |
