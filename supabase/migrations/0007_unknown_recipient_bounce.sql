-- ============================================================================
-- 0007_unknown_recipient_bounce.sql — Expand unknown_recipient check constraint
-- ============================================================================

alter table public.inbox_domains drop constraint if exists inbox_domains_unknown_recipient_check;
alter table public.inbox_domains add constraint inbox_domains_unknown_recipient_check
  check (unknown_recipient in ('catch_all', 'drop', 'bounce'));
