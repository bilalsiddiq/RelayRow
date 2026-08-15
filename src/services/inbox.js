import { supabase } from '@/lib/supabase'

// ── HOST-APP BINDINGS — the only lines a port edits ──────────────────────────
// The import above (the app's supabase singleton) and this block are the entire
// host coupling of this file. `profileAuthCol` matters: seats are keyed by
// auth.users.id (`inbox_address_members.member_id`), and some hosts' profile
// table has its own PK with a separate auth FK — CircleRev's `members` uses
// `auth_user_id`. The picker must return the AUTH id as the seat key.
const HOST = {
  fn: 'inbox',                  // edge function slug
  profileTable: 'staff',        // XE-MAILBOX's own staff table
  profileAuthCol: 'auth_user_id', // column equal to auth.users.id
  profileName: 'display_name',
  profileEmail: 'email',
}

// ─────────────────────────────────────────────────────────────────────────────
// Client for the `inbox` module (D-073 / D-074).
//
// SPLIT BY WHO HOLDS THE CREDENTIAL, the same rule as services/mail.js:
//
//   • edge function — anything needing the Resend key (send), a service-role read
//     (the webhook token), a signed URL, or an LLM call (rescan).
//   • direct PostgREST — everything RLS can gate on its own. Domains/addresses/
//     forwarders are super-admin CRUD; threads and messages are gated on
//     `inbox_address_members` via can_read_inbox_address(). Routing those through
//     the function would only add a hop and a second authorisation path to audit.
//
// The per-domain Resend key is WRITE-ONLY from the browser: `inbox_set_domain_key`
// puts it in Supabase Vault and the schema keeps only a masked tail. There is no
// read path — not for a member, not for a super admin.
// ─────────────────────────────────────────────────────────────────────────────

async function fnErr(error) {
  try { const j = await error.context.json(); return j.error || error.message } catch { return error.message }
}

async function invokeInbox(body) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Your session has expired — reload the page or sign in again, then retry.')
  }
  const { data, error } = await supabase.functions.invoke(HOST.fn, {
    body, headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) throw new Error(await fnErr(error))
  if (data?.error) throw new Error(data.error)
  return data
}

const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data }

// ── edge function ────────────────────────────────────────────────────────────

/** Send or reply. `reply_to_message_id` sets the RFC threading headers server-side. */
export const sendMail = (payload) => invokeInbox({ action: 'send', ...payload })

/** 60-second signed URL for one attachment, minted only after a membership check. */
export const attachmentUrl = (attachment_id) => invokeInbox({ action: 'attachment_url', attachment_id })

/** Re-run the AURA verdict on one message (e.g. after enabling a provider). */
export const rescanMessage = (message_id) => invokeInbox({ action: 'rescan', message_id })

// super admin
export const domainWebhookUrl = (domain_id) => {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://hhyywwmkniujffyzovak.supabase.co'
  return `${baseUrl}/functions/v1/inbox?domain_id=${domain_id}`
}
/** Store (or clear, with '') the Svix signing secret — enables webhook signature verification. */
export const setSigningSecret = (domain_id, secret) => invokeInbox({ action: 'set_signing_secret', domain_id, secret })
export const testDomainKey = (domain_id) => invokeInbox({ action: 'test_domain', domain_id })
export const inboxStatus = () => invokeInbox({ action: 'status' })

// ── domains (super admin — RLS enforces it) ──────────────────────────────────

export const listDomains = () => supabase
  .from('inbox_domains')
  .select('*')
  .order('domain')
  .then(ok)

// UPDATE when an id is present, INSERT otherwise — never upsert a partial patch.
// An upsert's INSERT path runs BEFORE-INSERT triggers and NOT NULL checks against
// the patch alone, so `{id, is_catch_all}` died with "unknown domain_id <NULL>".
const saveRow = (table, patch) => {
  const { id, ...rest } = patch
  const q = id
    ? supabase.from(table).update(rest).eq('id', id)
    : supabase.from(table).insert(patch)
  return q.select().maybeSingle().then(ok)
}

export const saveDomain = (patch) => saveRow('inbox_domains', patch)

export const deleteDomain = (id) => supabase
  .from('inbox_domains').delete().eq('id', id).then(ok)

/** Store a Resend key for one domain. Goes straight into Vault; nothing readable. */
export const setDomainKey = (domain_id, key) => supabase
  .rpc('inbox_set_domain_key', { p_domain_id: domain_id, p_key: key })
  .then(ok)

export const clearDomainKey = (domain_id) => supabase
  .rpc('inbox_clear_domain_key', { p_domain_id: domain_id })
  .then(ok)

// ── addresses ────────────────────────────────────────────────────────────────

/**
 * Every address on a domain. Creating one is JUST THIS INSERT — Resend has no
 * per-address resource, so there is nothing to provision and no DNS to wait for.
 */
export const listAddresses = (domain_id) => supabase
  .from('inbox_addresses')
  .select('*')
  .eq('domain_id', domain_id)
  .order('local_part')
  .then(ok)

export const saveAddress = (patch) => saveRow('inbox_addresses', patch)

export const deleteAddress = (id) => supabase
  .from('inbox_addresses').delete().eq('id', id).then(ok)

/** The mailboxes the SIGNED-IN member may open. Drives the inbox switcher. */
export const listMyMailboxes = () => supabase
  .from('inbox_addresses')
  .select('id, address, display_name, kind, event_id, org_id')
  .order('address')
  .then(ok)

// ── seats ────────────────────────────────────────────────────────────────────

// `member_id`'s FK targets auth.users, which PostgREST cannot embed across — an
// inline `members:member_id(...)` select 400s. Resolve names in a second query
// against the host's profile table (HOST bindings).
export const listAddressMembers = async (address_id) => {
  const rows = await supabase
    .from('inbox_address_members')
    .select('address_id, member_id, role, added_at')
    .eq('address_id', address_id)
    .then(ok)
  if (!rows.length) return rows
  const { data } = await supabase
    .from(HOST.profileTable)
    .select(`${HOST.profileAuthCol}, ${HOST.profileName}, ${HOST.profileEmail}`)
    .in(HOST.profileAuthCol, rows.map((r) => r.member_id))
  const by = Object.fromEntries((data || []).map((m) =>
    [m[HOST.profileAuthCol], { display_name: m[HOST.profileName], email: m[HOST.profileEmail] }]))
  return rows.map((r) => ({ ...r, members: by[r.member_id] || null }))
}

export const addAddressMember = (address_id, member_id, role = 'agent') => supabase
  .from('inbox_address_members')
  .upsert({ address_id, member_id, role }, { onConflict: 'address_id,member_id' })
  .then(ok)

export const removeAddressMember = (address_id, member_id) => supabase
  .from('inbox_address_members')
  .delete().eq('address_id', address_id).eq('member_id', member_id)
  .then(ok)

/**
 * THE ONLY HOST-APP TABLE THIS MODULE READS: the profile table (HOST bindings),
 * to pick who gets a seat. The edge function keeps its app bindings in env vars
 * for the same reason. Rows come back normalised to {id, display_name, email}
 * where `id` is ALWAYS the auth uid — that's what a seat row stores.
 */
export const listMembersForSeats = async (search = '') => {
  let q = supabase.from(HOST.profileTable)
    .select(`${HOST.profileAuthCol}, ${HOST.profileName}, ${HOST.profileEmail}`)
    .order(HOST.profileName).limit(50)
  if (search.trim()) {
    q = q.or(`${HOST.profileEmail}.ilike.%${search.trim()}%,${HOST.profileName}.ilike.%${search.trim()}%`)
  }
  const rows = await q.then(ok)
  return rows.map((m) => ({
    id: m[HOST.profileAuthCol], display_name: m[HOST.profileName], email: m[HOST.profileEmail],
  }))
}

// ── forwarders ───────────────────────────────────────────────────────────────
// Optional, per address, many targets. A DB trigger refuses a target that is
// itself an inbox address (that would loop mail through Resend forever).

export const listForwarders = (address_id) => supabase
  .from('inbox_forwarders')
  .select('*')
  .eq('address_id', address_id)
  .order('created_at')
  .then(ok)

export const saveForwarder = (patch) => saveRow('inbox_forwarders', patch)

export const deleteForwarder = (id) => supabase
  .from('inbox_forwarders').delete().eq('id', id).then(ok)

// ── threads + messages (membership-gated by RLS) ─────────────────────────────

export const listThreads = (address_id, { status = 'open', label = '', limit = 60 } = {}) => {
  let q = supabase
    .from('inbox_threads')
    .select('*')
    .eq('address_id', address_id)
    .eq('status', status)
  if (label) q = q.contains('labels', [label])
  return q.order('last_message_at', { ascending: false }).limit(limit).then(ok)
}

/** Full-text search over subject + participants (0035's generated tsvector). */
export const searchThreads = (address_id, query, limit = 60) => supabase
  .from('inbox_threads')
  .select('*')
  .eq('address_id', address_id)
  .textSearch('search_tsv', query, { type: 'websearch', config: 'simple' })
  .order('last_message_at', { ascending: false })
  .limit(limit)
  .then(ok)

/** Flip overdue snoozes back to open. Called lazily on inbox load. */
export const wakeSnoozedThreads = () => supabase.rpc('inbox_wake_snoozed').then(ok)

/** Unread total across the CALLER's seats — feeds the nav badge. */
export const inboxUnreadCount = () => supabase.rpc('inbox_unread_count').then(ok)

/**
 * Live thread-list updates for one mailbox. RLS decides which rows the
 * subscriber may see. Returns an unsubscribe function.
 */
export function subscribeThreads(address_id, onChange) {
  const ch = supabase
    .channel(`inbox-threads-${address_id}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'inbox_threads', filter: `address_id=eq.${address_id}` },
      onChange)
    .subscribe()
  return () => supabase.removeChannel(ch)
}

/**
 * The Sent folder. Not a thread status — a thread is "sent" when it contains at
 * least one outbound message, and it can simultaneously sit in open/closed/spam.
 * The !inner embed makes the direction filter apply to the PARENT rows.
 */
export const listSentThreads = (address_id, limit = 60) => supabase
  .from('inbox_threads')
  .select('*, sent:inbox_messages!inner(id)')
  .eq('address_id', address_id)
  .eq('sent.direction', 'outbound')
  .order('last_message_at', { ascending: false })
  .limit(limit)
  .then(ok)

export const listMessages = (thread_id) => supabase
  .from('inbox_messages')
  .select('*')
  .eq('thread_id', thread_id)
  .order('occurred_at')
  .then(ok)

export const listMessageAttachments = (message_ids) => supabase
  .from('inbox_attachments')
  .select('id, message_id, filename, content_type, size_bytes, is_inline')
  .in('message_id', message_ids)
  .then(ok)

/** Read state is the one message column a member may write (column-level grant). */
export const markMessagesRead = (thread_id) => supabase
  .from('inbox_messages')
  .update({ is_read: true, read_at: new Date().toISOString() })
  .eq('thread_id', thread_id)
  .eq('is_read', false)
  .then(ok)

/** Triage: assign, close, snooze, label, or move to spam/trash. */
export const updateThread = (id, patch) => supabase
  .from('inbox_threads').update(patch).eq('id', id).then(ok)

export const threadCounts = async (address_id) => {
  const of = async (status) => {
    const { count, error } = await supabase
      .from('inbox_threads')
      .select('id', { count: 'exact', head: true })
      .eq('address_id', address_id).eq('status', status)
    if (error) throw new Error(error.message)
    return count || 0
  }
  const sentOf = async () => {
    const { count, error } = await supabase
      .from('inbox_threads')
      .select('id, inbox_messages!inner(id)', { count: 'exact', head: true })
      .eq('address_id', address_id)
      .eq('inbox_messages.direction', 'outbound')
    if (error) throw new Error(error.message)
    return count || 0
  }
  const [open, snoozed, closed, spam, sent] = await Promise.all(
    [of('open'), of('snoozed'), of('closed'), of('spam'), sentOf()])
  return { open, snoozed, closed, spam, sent }
}

// ── AI layer (D-089): providers, settings, knowledge, suggestions ────────────
// Providers/config/knowledge are staff-only via RLS; keys go to Vault via RPC
// (write-only, like the domain keys). Suggestion decisions go through the edge
// function, which enforces send permission.

/**
 * Preconfigured provider catalog (the Dimitra AURA pattern): the admin picks a
 * provider, pastes ONLY the API key, and selects a model — base URLs and API
 * styles are our problem, not theirs. `base_url` includes its version path;
 * the edge function appends only /chat/completions (or /messages).
 * Model lists are curated defaults, not exhaustive — every entry also accepts
 * a custom model id, and 'custom' covers any OpenAI-compatible endpoint.
 */
export const AI_PROVIDER_CATALOG = [
  {
    id: 'anthropic', label: 'Anthropic (Claude)', kind: 'anthropic', base_url: null,
    keyHint: 'sk-ant-…', keyFrom: 'console.anthropic.com',
    models: [
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — best quality/cost' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — fast & cheap' },
      { id: 'claude-opus-5', label: 'Claude Opus 5 — highest quality' },
    ],
  },
  {
    id: 'openai', label: 'OpenAI', kind: 'openai', base_url: 'https://api.openai.com/v1',
    keyHint: 'sk-…', keyFrom: 'platform.openai.com',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini — fast & cheap' },
      { id: 'gpt-4o', label: 'GPT-4o' },
    ],
  },
  {
    id: 'gemini', label: 'Google Gemini', kind: 'openai',
    base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyHint: 'AIza…', keyFrom: 'aistudio.google.com',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite — cheapest' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
  },
  {
    id: 'groq', label: 'Groq', kind: 'openai', base_url: 'https://api.groq.com/openai/v1',
    keyHint: 'gsk_…', keyFrom: 'console.groq.com',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant — fastest' },
    ],
  },
  {
    id: 'xai', label: 'xAI (Grok)', kind: 'openai', base_url: 'https://api.x.ai/v1',
    keyHint: 'xai-…', keyFrom: 'console.x.ai',
    models: [
      { id: 'grok-3-mini', label: 'Grok 3 Mini — fast & cheap' },
      { id: 'grok-3', label: 'Grok 3' },
    ],
  },
  {
    id: 'custom', label: 'Custom (any OpenAI-compatible)', kind: 'openai', base_url: '',
    keyHint: 'api key', keyFrom: '', models: [],
  },
]

/** Match a stored provider row back to its catalog entry (for the model picker). */
export const aiCatalogFor = (p) => AI_PROVIDER_CATALOG.find((c) =>
  c.id !== 'custom' && (c.base_url === p.base_url || (c.kind === 'anthropic' && p.kind === 'anthropic' && !p.base_url))) || null

export const listAiProviders = () => supabase
  .from('inbox_ai_providers').select('*').order('priority').then(ok)
export const saveAiProvider = (patch) => saveRow('inbox_ai_providers', patch)
export const deleteAiProvider = (id) => supabase
  .from('inbox_ai_providers').delete().eq('id', id).then(ok)
export const setAiKey = (provider_id, key) => supabase
  .rpc('inbox_ai_set_key', { p_provider_id: provider_id, p_key: key }).then(ok)
export const clearAiKey = (provider_id) => supabase
  .rpc('inbox_ai_clear_key', { p_provider_id: provider_id }).then(ok)
export const testAiProvider = (provider_id) => invokeInbox({ action: 'ai_test_provider', provider_id })

export const getAiConfig = () => supabase
  .from('inbox_ai_config').select('*').eq('id', true).maybeSingle().then(ok)
export const saveAiConfig = (patch) => supabase
  .from('inbox_ai_config').update(patch).eq('id', true).select().maybeSingle().then(ok)

/** address_id null = the central knowledge every mailbox shares. */
export const listAiKnowledge = (address_id = null) => {
  let q = supabase.from('inbox_ai_knowledge').select('*').order('created_at')
  q = address_id ? q.eq('address_id', address_id) : q.is('address_id', null)
  return q.then(ok)
}
export const saveAiKnowledge = (patch) => saveRow('inbox_ai_knowledge', patch)
export const deleteAiKnowledge = (id) => supabase
  .from('inbox_ai_knowledge').delete().eq('id', id).then(ok)

// Explicit columns, never '*': decide_token is excluded from the SELECT grant
// on purpose (a viewer may read the queue but must not be able to approve).
const SUGGESTION_COLS = 'id, thread_id, address_id, reply_to_message_id, to_email, draft_text, '
  + 'confidence, reasoning, model, status, decided_by, decided_via, decided_at, '
  + 'sent_message_id, send_error, created_at'
export const pendingSuggestion = (thread_id) => supabase
  .from('inbox_ai_suggestions').select(SUGGESTION_COLS)
  .eq('thread_id', thread_id).eq('status', 'pending')
  .order('created_at', { ascending: false }).limit(1).maybeSingle().then(ok)
/** verdict: 'approve' | 'reject'. Optional `text` = the approver's edited reply. */
export const decideSuggestion = (id, verdict, text) =>
  invokeInbox({ action: 'ai_decide', id, verdict, ...(text ? { text } : {}) })

// ── audit (super admin) ──────────────────────────────────────────────────────
// RULE #2 in one call: what the webhook decided, and why.

export const listInboxLog = (limit = 100) => supabase
  .from('inbox_log')
  .select('*')
  .order('ts', { ascending: false })
  .limit(limit)
  .then(ok)

// ── tenants & capacities (super admin) ───────────────────────────────────────

export const listTenants = async () => {
  try {
    const tenants = await supabase.from('tenants').select('*').order('created_at', { ascending: false }).then(ok)
    if (!tenants || !tenants.length) {
      return [{
        id: 'default-tenant-01',
        name: 'Default Organization (RelayRow)',
        slug: 'default-org',
        status: 'active',
        created_at: new Date().toISOString(),
      }]
    }
    return tenants
  } catch {
    return [{
      id: 'default-tenant-01',
      name: 'Default Organization (RelayRow)',
      slug: 'default-org',
      status: 'active',
      created_at: new Date().toISOString(),
    }]
  }
}

export const saveTenant = (patch) => saveRow('tenants', patch)

export const deleteTenant = (id) => supabase
  .from('tenants').delete().eq('id', id).then(ok)

export const listTenantCapacities = async () => {
  try {
    const caps = await supabase.from('tenant_capacities').select('*').then(ok)
    if (!caps || !caps.length) {
      return [{
        id: 'default-cap-01',
        tenant_id: 'default-tenant-01',
        max_domains: 10,
        max_inboxes: 100,
        max_storage_gb: 25,
        max_seats: 50,
      }]
    }
    return caps
  } catch {
    return [{
      id: 'default-cap-01',
      tenant_id: 'default-tenant-01',
      max_domains: 10,
      max_inboxes: 100,
      max_storage_gb: 25,
      max_seats: 50,
    }]
  }
}

export const saveTenantCapacity = (patch) => saveRow('tenant_capacities', patch)

// ── membership plans (super admin) ─────────────────────────────────────────

export const listMembershipPlans = async () => {
  try {
    const plans = await supabase.from('membership_plans').select('*').order('price_monthly', { ascending: true }).then(ok)
    if (plans && plans.length) return plans
  } catch (e) {
    console.warn('Membership plans error:', e)
  }
  return [
    { id: 'p1', name: 'Starter Plan', slug: 'starter', price_monthly: 29, price_yearly: 290, max_domains: 3, max_inboxes: 20, max_seats: 5, max_storage_gb: 10, monthly_ai_credits: 2000, features: ['3 Domains', '20 Inboxes', '2,000 AI Credits', '5 Team Seats'] },
    { id: 'p2', name: 'Pro Business', slug: 'pro', price_monthly: 79, price_yearly: 790, max_domains: 10, max_inboxes: 100, max_seats: 25, max_storage_gb: 50, monthly_ai_credits: 10000, features: ['10 Domains', '100 Inboxes', '10,000 AI Credits', '25 Team Seats', 'Priority AURA Cascade'] },
    { id: 'p3', name: 'Enterprise', slug: 'enterprise', price_monthly: 249, price_yearly: 2490, max_domains: 50, max_inboxes: 500, max_seats: 100, max_storage_gb: 250, monthly_ai_credits: 50000, features: ['50 Domains', '500 Inboxes', '50,000 AI Credits', '100 Team Seats', 'Dedicated Support'] },
  ]
}

export const saveMembershipPlan = (patch) => saveRow('membership_plans', patch)
export const deleteMembershipPlan = (id) => supabase.from('membership_plans').delete().eq('id', id).then(ok)

// ── tenant subscriptions & AI credits ────────────────────────────────────────

export const listTenantSubscriptions = async () => {
  try {
    const subs = await supabase.from('tenant_subscriptions').select('*, membership_plans(*)').then(ok)
    if (subs && subs.length) return subs
  } catch (e) {
    console.warn('Tenant subscriptions error:', e)
  }
  return []
}

export const saveTenantSubscription = (patch) => saveRow('tenant_subscriptions', patch)

export const addTenantAiCredits = async (tenant_id, creditsToAdd) => {
  try {
    const { data: sub } = await supabase.from('tenant_subscriptions').select('id, ai_credits_balance').eq('tenant_id', tenant_id).maybeSingle()
    if (sub) {
      const newBal = (sub.ai_credits_balance || 0) + Number(creditsToAdd)
      return saveRow('tenant_subscriptions', { id: sub.id, ai_credits_balance: newBal })
    }
  } catch (e) {
    console.warn('Add AI credits error:', e)
  }
}

// ── platform AURA AI engine module (super admin) ────────────────────────────

export const getAuraAiConfig = async () => {
  try {
    const cfg = await supabase.from('aura_ai_config').select('*').eq('is_active', true).limit(1).maybeSingle().then(ok)
    if (cfg) return cfg
  } catch (e) {
    console.warn('Aura config read error:', e)
  }
  return { provider: 'openai', model: 'gpt-4o-mini', credit_rate_triage: 1, credit_rate_reply: 2, is_active: true }
}

export const saveAuraAiConfig = (patch) => saveRow('aura_ai_config', patch)

export const listTenantAiUsage = async (tenant_id = null) => {
  try {
    let q = supabase.from('tenant_ai_usage').select('*').order('created_at', { ascending: false }).limit(100)
    if (tenant_id) q = q.eq('tenant_id', tenant_id)
    const logs = await q.then(ok)
    if (logs && logs.length) return logs
  } catch (e) {
    console.warn('Tenant AI usage error:', e)
  }
  return []
}

// ── tenant sub-members & RBAC (member accounts) ────────────────────────────

export const listTenantMembers = async (tenant_id) => {
  try {
    const members = await supabase.from('tenant_members').select('*').order('created_at', { ascending: false }).then(ok)
    if (members && members.length) return members
  } catch (e) {
    console.warn('Tenant members list error:', e)
  }
  return [
    { id: 'tm-01', email: 'owner@company.com', display_name: 'Org Owner', role: 'owner', inbox_access: ['*'] },
    { id: 'tm-02', email: 'support.lead@company.com', display_name: 'Support Admin', role: 'admin', inbox_access: ['*'] },
  ]
}

export const saveTenantMember = (patch) => saveRow('tenant_members', patch)
export const deleteTenantMember = (id) => supabase.from('tenant_members').delete().eq('id', id).then(ok)

// ── inbox knowledge base / RAG context (member accounts) ─────────────────────

export const listKnowledgeBase = async (tenant_id = null) => {
  try {
    let q = supabase.from('inbox_knowledge_base').select('*').order('created_at', { ascending: false })
    if (tenant_id) q = q.eq('tenant_id', tenant_id)
    const docs = await q.then(ok)
    if (docs && docs.length) return docs
  } catch (e) {
    console.warn('Knowledge base list error:', e)
  }
  return [
    { id: 'kb-01', title: 'Return & Refund Policy', content: 'Customers can request refunds within 30 days of purchase.', category: 'Policy', is_active: true },
    { id: 'kb-02', title: 'Technical Support Hours', content: 'Our support team is available Mon-Fri 9am to 6pm EST.', category: 'Support', is_active: true }
  ]
}

export const saveKnowledgeBase = (patch) => saveRow('inbox_knowledge_base', patch)
export const deleteKnowledgeBase = (id) => supabase.from('inbox_knowledge_base').delete().eq('id', id).then(ok)


