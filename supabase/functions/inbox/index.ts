// ============================================================================
// inbox — the receive side of the mail module.  D-073 / D-074
// ============================================================================
// Companion to `mailer/` (0010). That folder sends; this one receives, threads,
// forwards and replies. Neither needs a mail server: Resend is the only transport,
// Postgres is the archive, and this app is the mail client.
//
// See .agents/knowledge/inbox_module.md.
//
// ── THE RECEIVE PATH ────────────────────────────────────────────────────────
//   Resend MX (catch-all on the domain)
//     → POST here  ?action=receive&t=<per-domain webhook token>
//       → match recipient to an inbox_addresses row (else the domain's catch-all)
//       → GET /emails/receiving/{id}          (the webhook has NO body — by design)
//       → inbox_ingest()  ← ONE transaction: dedupe, find/create thread, insert
//       → store attachments in the private `inbox` bucket
//       → AURA scan, written back as an advisory verdict
//       → fan out to this address's forwarders
//
// Mail is DURABLE BEFORE ANYTHING CLEVER HAPPENS: ingest runs before scanning and
// before attachment download, so a provider hiccup in step 5 or 6 can never lose a
// message that already arrived. Everything after ingest is best-effort and logged.
//
// ── KEYS ────────────────────────────────────────────────────────────────────
// PER DOMAIN, in Supabase Vault (0024). `inbox_get_domain_key()` is service-role
// only, so the key never leaves this function and a stolen admin JWT cannot read
// it. `zexpo.world` and a future second product can run different Resend accounts
// in the same deployment.
//
// ── AUTH, per action ────────────────────────────────────────────────────────
//   receive         per-domain webhook token (no JWT — Resend has none)
//   send            user JWT + can_send_as_inbox_address()
//   attachment_url  user JWT + can_read_inbox_address()   → 60s signed URL
//   rescan          user JWT + can_read_inbox_address()
//   webhook_url / test_domain / status / backfill    super admin JWT
//
// `verify_jwt = false` in config.toml for the same reason as `mailer`: one gateway
// rule cannot express "webhook token OR user JWT OR admin JWT".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  resendSend, getReceivedEmail, getAttachment, checkKey,
  headerOf, headersToObject, parseRefs, parseAddress, parseAddressList,
  type ReceivedEmail,
} from './resend.ts'
import { scanEmail, scannerOff, isBulkMail, SCANNER_FEATURE, type ScanResult } from './scan.ts'
import {
  aiChat, aiConfig, knowledgeFor, threadHistory, buildReplyPrompt, parseReply,
  listEnabledProviders, type AiConfigRow,
} from './ai.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-inbox-token',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'content-type': 'application/json' } })

const URL_ = Deno.env.get('SUPABASE_URL')!
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

// ── HOST-APP BINDINGS — the only places this module touches the host's world ──
// Overridable by env so the folder stays a drop-in (same pattern as the mailer's
// MAILER_* block); defaults are Zexpo's, so Zexpo sets nothing.
//   INBOX_ADMIN_RPC  boolean RPC deciding "is this caller platform staff".
//                    The canonical SQL ships `inbox_is_staff()` for this; Zexpo's
//                    live deployment predates it and still answers via
//                    `is_super_admin()` (the two are bound equal by 0034).
//   INBOX_BUCKET     private storage bucket for attachment bytes.
// Scanner bindings (INBOX_SCANNER_GATEWAY / INBOX_SCANNER_FEATURE) live in scan.ts.
const ADMIN_RPC = Deno.env.get('INBOX_ADMIN_RPC') ?? 'is_super_admin'
const BUCKET = Deno.env.get('INBOX_BUCKET') ?? 'inbox'
// Re-attaching bytes to a forwarded copy costs base64 in memory. Past this the
// forward carries a note instead — the files are always still in the app.
const FORWARD_ATTACH_BUDGET = 7 * 1024 * 1024

async function logRow(row: Record<string, unknown>) {
  try { await admin.from('inbox_log').insert(row) } catch { /* logging must never break mail */ }
}

// ── receive ─────────────────────────────────────────────────────────────────

interface DomainRow {
  id: string; domain: string; app_id: string
  inbound_enabled: boolean; scan_enabled: boolean; spam_threshold: number
  unknown_recipient: string; default_from_name: string | null
}

/** Which of OUR addresses is this message for? Envelope order: to, then cc, then
 *  bcc (a bcc'd message never names us in `to`), then the domain's catch-all. */
async function resolveRecipients(dom: DomainRow, data: Record<string, any>) {
  const candidates = [
    ...parseAddressList(data.to),
    ...parseAddressList(data.cc),
    ...parseAddressList(data.bcc),
  ].filter((e) => e.endsWith(`@${dom.domain}`))

  const { data: rows } = await admin
    .from('inbox_addresses')
    .select('id, address, display_name, signature_html, scan_enabled, event_id, org_id, is_catch_all, ai_reply_mode')
    .eq('domain_id', dom.id)
    .eq('is_active', true)

  const all = rows || []
  const matched = all.filter((a) => candidates.includes(a.address))
  if (matched.length) return matched

  if (dom.unknown_recipient === 'catch_all') {
    const c = all.find((a) => a.is_catch_all)
    if (c) return [c]
  }
  return []
}

async function storeAttachments(
  key: string, emailId: string, addressId: string, messageId: string,
  refs: { id?: string; filename?: string; content_type?: string; content_id?: string }[],
): Promise<{ stored: number; bytes: { filename: string; content_type?: string; b64: string; size: number }[]; errors: string[] }> {
  const errors: string[] = []
  const bytes: { filename: string; content_type?: string; b64: string; size: number }[] = []
  let stored = 0
  let budget = FORWARD_ATTACH_BUDGET

  for (const r of refs) {
    if (!r.id) continue
    try {
      const got = await getAttachment(key, emailId, r.id)
      if (!got.ok || !got.att?.download_url) { errors.push(`${r.filename || r.id}: ${got.error || 'no download_url'}`); continue }

      const res = await fetch(got.att.download_url)
      if (!res.ok) { errors.push(`${r.filename || r.id}: download ${res.status}`); continue }
      const buf = new Uint8Array(await res.arrayBuffer())

      // Storage keys must stay ASCII-safe and cannot contain path separators.
      const safe = (r.filename || got.att.filename || 'attachment')
        .replace(/[\\/]/g, '_').replace(/[^\w.\- ]/g, '_').slice(0, 120)
      const path = `${addressId}/${messageId}/${safe}`

      const up = await admin.storage.from(BUCKET).upload(path, buf, {
        contentType: r.content_type || got.att.content_type || 'application/octet-stream',
        upsert: true,
      })
      if (up.error) { errors.push(`${safe}: ${up.error.message}`); continue }

      await admin.from('inbox_attachments').insert({
        message_id: messageId, address_id: addressId,
        filename: safe, content_type: r.content_type || got.att.content_type,
        size_bytes: buf.byteLength, storage_path: path,
        provider_attachment_id: r.id, content_id: r.content_id || null,
        is_inline: !!r.content_id,
      })
      stored++

      if (buf.byteLength <= budget) {
        budget -= buf.byteLength
        // btoa needs a binary string; chunked to avoid blowing the argument limit
        // on a multi-MB file.
        let s = ''
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
        bytes.push({ filename: safe, content_type: r.content_type || got.att.content_type, b64: btoa(s), size: buf.byteLength })
      }
    } catch (e) {
      errors.push(`${r.filename || r.id}: ${(e as Error).message}`)
    }
  }
  return { stored, bytes, errors }
}

async function runForwarders(
  key: string, dom: DomainRow,
  addr: { id: string; address: string; display_name: string | null },
  msg: { from_email: string; from_name?: string; subject?: string; html?: string; text?: string; message_id?: string },
  scan: ScanResult | null,
  attachments: { filename: string; content_type?: string; b64: string }[],
) {
  const { data: fwds } = await admin
    .from('inbox_forwarders').select('*').eq('address_id', addr.id).eq('is_active', true)
  if (!fwds?.length) return

  const isSpam = !!scan && (scan.verdict === 'spam' || scan.verdict === 'phishing' || scan.score >= dom.spam_threshold)

  for (const f of fwds) {
    if (isSpam && !f.include_spam) {
      await logRow({ domain: dom.domain, to_email: f.target_email, from_email: msg.from_email,
        action: 'dropped', detail: 'forward skipped: filed as spam and include_spam is off' })
      continue
    }

    const banner =
      `<div style="margin:0 0 14px;padding:9px 12px;border-radius:8px;background:#f4f5f7;` +
      `border:1px solid #e2e5ea;font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#4a5160">` +
      `Forwarded from <strong>${addr.address}</strong>` +
      (scan && scan.verdict !== 'unknown' ? ` · AURA: ${scan.verdict} (${scan.score}/100)` : '') +
      `<br>Reply in the app so the thread stays with the team — replying here answers the sender directly from your own address.` +
      `</div>`

    const r = await resendSend(key, {
      // MUST be an address on the verified domain: forwarding cannot preserve the
      // original From without failing that domain's SPF/DKIM. The original sender
      // goes in Reply-To instead, so hitting reply in Gmail still reaches them.
      from: `${msg.from_name || msg.from_email} via ${addr.display_name || addr.address} <${addr.address}>`,
      to: f.target_email,
      replyTo: msg.from_email || undefined,
      subject: msg.subject || '(no subject)',
      html: banner + (msg.html || `<pre style="white-space:pre-wrap">${(msg.text || '').replace(/</g, '&lt;')}</pre>`),
      text: msg.text ? `[Forwarded from ${addr.address}]\n\n${msg.text}` : undefined,
      attachments: attachments.length ? attachments.map((a) => ({ filename: a.filename, content: a.b64, content_type: a.content_type })) : undefined,
      // One forward per message per target, even if the webhook is replayed.
      idempotencyKey: msg.message_id ? `fwd:${f.id}:${msg.message_id}` : undefined,
    })

    if (r.ok) {
      await admin.from('inbox_forwarders').update({
        forward_count: (f.forward_count || 0) + 1,
        last_forwarded_at: new Date().toISOString(), last_error: null,
      }).eq('id', f.id)
      await logRow({ domain: dom.domain, to_email: f.target_email, from_email: msg.from_email,
        provider_id: r.id, action: 'forwarded', detail: `from ${addr.address}` })
    } else {
      await admin.from('inbox_forwarders').update({ last_error: r.error }).eq('id', f.id)
      await logRow({ domain: dom.domain, to_email: f.target_email, from_email: msg.from_email,
        action: 'forward_failed', detail: r.error })
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI auto-reply (D-089).
//
// THE ORDER OF AUTHORITY: guards → model → confidence → human.
// A message only reaches the model after every deterministic guard passes; the
// model only reaches "send" in 'auto' mode at/above the confidence bar; below
// the bar (or in 'draft' mode) a human approves — in the app, or from Slack via
// a one-time token link. Everything else degrades to a logged skip, never to a
// silent failure and never to a loop.
// ─────────────────────────────────────────────────────────────────────────────

// Signature: the DOMAIN holds the shared template (both variations); the
// address contributes only what varies. A per-address override wins.
function buildSignature(addr: any, dom: any, fromName: string | null): { sigHtml: string; sigText: string } {
  const fillSig = (tpl: string | null | undefined) => (tpl || '')
    .replace(/\{\{\s*name\s*\}\}/gi, addr.display_name || fromName || '')
    .replace(/\{\{\s*designation\s*\}\}/gi, addr.designation || '')
    .replace(/\{\{\s*email\s*\}\}/gi, addr.address)
    .trim()
  return {
    sigHtml: (addr.signature_html || '').trim() || fillSig(dom.signature_html),
    sigText: (addr.signature_text || '').trim() || fillSig(dom.signature_text),
  }
}

/** First candidate that actually parses as a date, else now.
 *
 *  Resend hands header values back JSON-ENCODED — the `date` header arrives as the
 *  string `"2026-08-04T20:54:00.000Z"` WITH the quote characters, which Date.parse
 *  rejects. Stripping them matters, and so does falling through to the next
 *  candidate rather than straight to now(): one unparseable header used to stamp
 *  every stored message with its receive time, which destroys ordering outright on
 *  a backfill and quietly misdates every message otherwise. */
function firstDate(candidates: (string | undefined | null)[]): string {
  for (const c of candidates) {
    if (!c) continue
    const s = String(c).trim().replace(/^"(.*)"$/s, '$1').replace(/^'(.*)'$/s, '$1')
    const t = Date.parse(s)
    if (Number.isFinite(t)) return new Date(t).toISOString()
  }
  return new Date().toISOString()
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const textToHtml = (t: string) =>
  t.split(/\n{2,}/).map((p) => `<p>${escHtml(p).replace(/\n/g, '<br>')}</p>`).join('')

// Case-insensitive header lookup over the stored headers object.
function hdr(headers: Record<string, unknown> | null | undefined, name: string): string {
  if (!headers) return ''
  const want = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want) return String(v ?? '')
  }
  return ''
}

// The loop-protection gauntlet. Returns a human-readable block reason, or null.
// These are the reasons auto-repliers get banned from the internet; every one
// is deterministic and runs before any model is consulted.
function replyBlockReason(addr: any, payload: any, scan: ScanResult | null): string | null {
  if ((addr.ai_reply_mode || 'off') === 'off') return 'ai off for this address'
  const h = payload.headers || {}
  const autoSub = hdr(h, 'auto-submitted')
  if (autoSub && autoSub.toLowerCase() !== 'no') return 'Auto-Submitted mail'
  // isBulkMail() also understands Resend's nested `list` object — a flat
  // list-unsubscribe/list-id lookup matches nothing Resend delivers, so this guard
  // used to let the model answer marketing blasts.
  if (isBulkMail(h)) return 'list/bulk mail'
  if (hdr(h, 'x-auto-response-suppress')) return 'X-Auto-Response-Suppress'
  const from = String(payload.from_email || '')
  if (!from) return 'no sender'
  if (/^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce|notifications?)@/i.test(from)) {
    return 'no-reply style sender'
  }
  if (from === addr.address) return 'self-addressed'
  if (scan && (scan.verdict === 'spam' || scan.verdict === 'phishing')) return `scan verdict ${scan.verdict}`
  return null
}

/**
 * Send a suggestion as the address (service-side). Used by 'auto' mode and by
 * every approval path. `overrideText` lets an approver edit before sending.
 */
async function sendSuggestionRow(
  sug: any, decidedBy: string | null, via: string, overrideText?: string,
): Promise<{ ok: boolean; error?: string; message_id?: string }> {
  const fail = async (error: string) => {
    await admin.from('inbox_ai_suggestions').update({
      status: 'failed', send_error: error, decided_by: decidedBy, decided_via: via,
      decided_at: new Date().toISOString(),
    }).eq('id', sug.id)
    return { ok: false, error }
  }

  const { data: addr } = await admin.from('inbox_addresses')
    .select('*, inbox_domains!inner(id, domain, default_from_name, outbound_enabled, signature_html, signature_text)')
    .eq('id', sug.address_id).maybeSingle()
  if (!addr) return await fail('unknown address')
  const dom = (addr as any).inbox_domains
  if (!dom.outbound_enabled) return await fail('sending disabled for this domain')

  const key = await domainKey(dom.id)
  if (!key) return await fail('no Resend key for this domain')

  const ourMessageId = `<${crypto.randomUUID()}@${dom.domain}>`
  const headers: Record<string, string> = { 'Message-ID': ourMessageId }
  let inReplyTo: string | null = null
  let refs: string[] = []
  if (sug.reply_to_message_id) {
    const { data: parent } = await admin.from('inbox_messages')
      .select('message_id, refs').eq('id', sug.reply_to_message_id).maybeSingle()
    if (parent?.message_id) {
      inReplyTo = parent.message_id
      refs = [...(parent.refs || []), parent.message_id]
      headers['In-Reply-To'] = inReplyTo
      headers['References'] = refs.join(' ')
    }
  }

  const { data: thr } = await admin.from('inbox_threads')
    .select('subject').eq('id', sug.thread_id).maybeSingle()
  const rawSubject = thr?.subject || '(no subject)'
  const subject = /^re:/i.test(rawSubject) ? rawSubject : `Re: ${rawSubject}`

  const fromName = addr.display_name || dom.default_from_name || null
  const text = String(overrideText || sug.draft_text || '').trim()
  if (!text) return await fail('empty reply text')

  const { sigHtml, sigText } = buildSignature(addr, dom, fromName)
  const html = textToHtml(text) + (sigHtml ? `<div class="sig">${sigHtml}</div>` : '')
  const bodyText = sigText ? `${text}\n\n-- \n${sigText}` : text

  const sent = await resendSend(key, {
    from: fromName ? `${fromName} <${addr.address}>` : addr.address,
    to: [sug.to_email], subject, html, text: bodyText,
    replyTo: addr.default_reply_to || undefined, headers,
    idempotencyKey: `ai-sug:${sug.id}`,
  })

  const ing = await admin.rpc('inbox_ingest', {
    p_address_id: sug.address_id,
    p_msg: {
      direction: 'outbound',
      message_id: ourMessageId, in_reply_to: inReplyTo, refs,
      provider_id: sent.id || null,
      from_email: addr.address, from_name: fromName,
      to_emails: [sug.to_email], cc_emails: [], subject,
      html, body_text: bodyText,
      send_status: sent.ok ? 'sent' : 'failed', sent_by: decidedBy,
      occurred_at: new Date().toISOString(),
    },
  })
  const out = ing.data as { message_id: string } | null

  await admin.from('inbox_ai_suggestions').update({
    status: sent.ok ? 'sent' : 'failed',
    send_error: sent.error || null,
    sent_message_id: out?.message_id || null,
    draft_text: text,   // keep what actually went out (approver may have edited)
    decided_by: decidedBy, decided_via: via, decided_at: new Date().toISOString(),
  }).eq('id', sug.id)

  await logRow({
    domain: dom.domain, to_email: sug.to_email, from_email: addr.address,
    action: sent.ok ? 'sent' : 'send_failed', message_id: out?.message_id || null,
    detail: `AI reply (${via}${decidedBy ? '' : ', unattended'}): ${subject}`,
  })

  return sent.ok ? { ok: true, message_id: out?.message_id } : { ok: false, error: sent.error }
}

// Approval notification. Slack today (incoming webhook — one URL in the AI
// settings, no app install); the message carries one-time approve/reject links
// so more channels later are the same pattern with a different POST.
async function slackNotify(cfg: AiConfigRow, slug: string, addr: any, sug: any, confidence: number, reasoning: string) {
  if (!cfg.slack_webhook_url) return
  try {
    const base = `${URL_}/functions/v1/${slug}?action=ai_decide&id=${sug.id}&t=${sug.decide_token}`
    const app = (cfg.app_url || '').replace(/\/$/, '')
    const preview = String(sug.draft_text || '').slice(0, 600).split('\n').map((l: string) => `>${l}`).join('\n')
    const text = [
      `📬 *AI drafted a reply* for *${addr.address}* → ${sug.to_email}`,
      `*Confidence:* ${confidence}/100 — ${reasoning}`,
      '',
      preview,
      '',
      `<${base}&verdict=approve|✅ Approve & send> · <${base}&verdict=reject|❌ Reject>${app ? ` · <${app}/inbox|Open inbox>` : ''}`,
    ].join('\n')
    await fetch(cfg.slack_webhook_url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch { /* notification is best-effort; the suggestion is already queued */ }
}

/** The pipeline step, called per stored inbound message. Never throws. */
async function maybeAutoReply(
  dom: DomainRow, addr: any, out: { message_id: string; thread_id: string },
  payload: any, scan: ScanResult | null, slug: string,
) {
  try {
    const mode = addr.ai_reply_mode || 'off'
    if (mode === 'off') return
    const blocked = replyBlockReason(addr, payload, scan)
    if (blocked) {
      await logRow({ domain: dom.domain, to_email: addr.address, from_email: payload.from_email,
        action: 'ai_skipped', message_id: out.message_id, detail: blocked })
      return
    }

    const cfg = await aiConfig()

    // Per-sender daily brake: counts every suggestion (sent or not) to this
    // sender from this address — a griefing loop stops here, not at the model.
    const replyTo = payload.reply_to || payload.from_email
    const since = new Date(Date.now() - 86_400_000).toISOString()
    const { count } = await admin.from('inbox_ai_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('address_id', addr.id).eq('to_email', replyTo).gte('created_at', since)
    if ((count || 0) >= cfg.max_auto_per_sender_day) {
      await logRow({ domain: dom.domain, to_email: addr.address, from_email: payload.from_email,
        action: 'ai_skipped', message_id: out.message_id,
        detail: `per-sender cap (${cfg.max_auto_per_sender_day}/day) reached` })
      return
    }

    if (!(await listEnabledProviders()).length) {
      await logRow({ domain: dom.domain, to_email: addr.address, from_email: payload.from_email,
        action: 'ai_skipped', message_id: out.message_id, detail: 'no enabled AI provider' })
      return
    }

    const [knowledge, history] = await Promise.all([
      knowledgeFor(addr.id),
      threadHistory(out.thread_id, cfg.history_messages),
    ])
    const prompt = buildReplyPrompt({
      persona: cfg.persona, knowledge, history,
      address: addr.address, displayName: addr.display_name,
      from: `${payload.from_name ? payload.from_name + ' ' : ''}<${payload.from_email}>`,
      subject: payload.subject, text: String(payload.body_text || '').trim(),
    })
    const r = await aiChat({
      system: prompt.system, user: prompt.user,
      temperature: Number(cfg.temperature), maxTokens: cfg.max_tokens,
    })
    if (!r.ok) {
      await logRow({ domain: dom.domain, to_email: addr.address, from_email: payload.from_email,
        action: 'ai_skipped', message_id: out.message_id, detail: `model unavailable: ${r.error}` })
      return
    }

    const draft = parseReply(r.text || '')
    if (!draft || !draft.should_reply) {
      await logRow({ domain: dom.domain, to_email: addr.address, from_email: payload.from_email,
        action: 'ai_skipped', message_id: out.message_id,
        detail: `model declined: ${draft?.reasoning || 'unparseable answer'}` })
      return
    }

    const { data: sug, error } = await admin.from('inbox_ai_suggestions').insert({
      thread_id: out.thread_id, address_id: addr.id, reply_to_message_id: out.message_id,
      to_email: replyTo, draft_text: draft.reply_text, confidence: draft.confidence,
      reasoning: draft.reasoning, model: r.provider || null,
    }).select().single()
    if (error || !sug) return

    if (mode === 'auto' && draft.confidence >= cfg.auto_min_confidence) {
      await sendSuggestionRow(sug, null, 'auto')
    } else {
      await logRow({ domain: dom.domain, to_email: addr.address, from_email: payload.from_email,
        action: 'ai_suggested', message_id: out.message_id,
        detail: `draft ${draft.confidence}/100 awaiting approval${mode === 'auto' ? ` (below the ${cfg.auto_min_confidence} auto bar)` : ''}` })
      await slackNotify(cfg, slug, addr, sug, draft.confidence, draft.reasoning)
    }
  } catch (e) {
    await logRow({ domain: dom.domain, to_email: addr?.address, action: 'error',
      message_id: out?.message_id, detail: `auto-reply: ${String((e as Error)?.message || e)}` })
  }
}

// Svix signature check (Resend signs webhooks via Svix). Signed content is
// `${svix-id}.${svix-timestamp}.${raw body}`, HMAC-SHA256 with the base64
// secret (after the `whsec_` prefix), compared against any of the
// space-separated `v1,<base64>` entries in svix-signature.
async function svixVerify(secret: string, req: Request, raw: string): Promise<boolean> {
  try {
    const id = req.headers.get('svix-id') || ''
    const ts = req.headers.get('svix-timestamp') || ''
    const sigHeader = req.headers.get('svix-signature') || ''
    if (!id || !ts || !sigHeader || !raw) return false
    const secretBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), (c) => c.charCodeAt(0))
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${raw}`))
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
    return sigHeader.split(' ').some((p) => p.split(',')[1] === expected)
  } catch { return false }
}

async function handleReceive(req: Request, url: URL, body: any, rawBody: string) {
  const token = (url.searchParams.get('t') || req.headers.get('x-inbox-token') || '').trim()
  if (!token) return json({ error: 'missing token' }, 401)

  const { data: sec } = await admin
    .from('inbox_domain_secrets')
    .select('domain_id, webhook_signing_secret')
    .eq('webhook_token', token).maybeSingle()
  if (!sec) return json({ error: 'bad token' }, 401)

  // ADDITIVE second factor: only enforced once a signing secret is stored for
  // the domain (Admin → Inbox → domain → signing secret). The URL token above
  // stays the always-on gate, so stored webhook URLs keep working unchanged.
  if (sec.webhook_signing_secret) {
    if (!(await svixVerify(sec.webhook_signing_secret, req, rawBody))) {
      await logRow({ action: 'error', detail: 'svix signature verification failed' })
      return json({ error: 'bad signature' }, 401)
    }
  }

  const { data: dom } = await admin
    .from('inbox_domains').select('*').eq('id', sec.domain_id).maybeSingle<DomainRow>()
  if (!dom) return json({ error: 'unknown domain' }, 404)

  // Resend sends several event types down one webhook. Anything that is not an
  // arriving email is acknowledged and ignored — a non-2xx would make it retry.
  const type = String(body?.type || '')
  if (type && type !== 'email.received') return json({ ok: true, ignored: type })

  const data = body?.data || {}
  const emailId = String(data.email_id || data.id || '')
  if (!emailId) return json({ error: 'no email_id in payload' }, 400)

  if (!dom.inbound_enabled) {
    await logRow({ domain: dom.domain, provider_id: emailId, action: 'dropped',
      detail: 'inbound_enabled is false for this domain' })
    return json({ ok: true, dropped: 'inbound disabled' })
  }

  const targets = await resolveRecipients(dom, data)
  if (!targets.length) {
    await logRow({
      domain: dom.domain, provider_id: emailId,
      to_email: parseAddressList(data.to)[0] || null,
      from_email: parseAddress(String(data.from || '')).email || null,
      action: 'dropped',
      detail: dom.unknown_recipient === 'catch_all'
        ? 'no matching address and no catch-all is set for this domain'
        : 'no matching address (unknown_recipient = drop)',
    })
    return json({ ok: true, dropped: 'no matching address' })
  }

  const key = await domainKey(dom.id)
  if (!key) {
    await logRow({ domain: dom.domain, provider_id: emailId, action: 'error',
      detail: 'no Resend key set for this domain — cannot fetch the body' })
    // 503 so Resend retries: this is usually a half-finished setup, not a dead end.
    return json({ error: 'no key for domain' }, 503)
  }

  return await ingestReceivedEmail(dom, targets, key, emailId, data, url)
}

// ── ingestReceivedEmail ─────────────────────────────────────────────────────
// Factored out of handleReceive so the live webhook AND a backfill/replay both
// call one code path. Ingest dedupes on provider_id, so replay is safe to
// re-run. If mail arrived while a BROKEN version was deployed, delete those
// shell rows first — plain dedupe reports them as duplicates and leaves them
// empty forever.
async function ingestReceivedEmail(
  dom: DomainRow,
  targets: { id: string; address: string; display_name: string | null; signature_html?: string; scan_enabled?: boolean; event_id?: string; org_id?: string; is_catch_all?: boolean; ai_reply_mode?: string }[],
  key: string, emailId: string,
  webhookData: Record<string, any>,
  url: URL,
): Promise<Response> {
  const got = await getReceivedEmail(key, emailId)
  if (!got.ok || !got.email) {
    await logRow({ domain: dom.domain, provider_id: emailId, action: 'error',
      detail: `fetch failed: ${got.error}` })
    return json({ error: got.error || 'fetch failed' }, 502)
  }

  const email: ReceivedEmail = got.email
  const hdrs = headersToObject(email.headers)
  const from = parseAddress(String(email.from || webhookData.from || ''))
  const attRefs = (email.attachments?.length ? email.attachments : webhookData.attachments) || []

  const payloadBase = {
    direction: 'inbound',
    message_id: headerOf(email.headers, 'message-id') || null,
    in_reply_to: parseRefs(headerOf(email.headers, 'in-reply-to'))[0] || null,
    refs: parseRefs(headerOf(email.headers, 'references')),
    provider_id: emailId,
    from_email: from.email,
    from_name: from.name || null,
    to_emails: parseAddressList(email.to || webhookData.to),
    cc_emails: parseAddressList(email.cc || webhookData.cc),
    reply_to: parseAddress(headerOf(email.headers, 'reply-to')).email || null,
    subject: email.subject ?? webhookData.subject ?? null,
    html: email.html ?? null,
    body_text: email.text ?? null,
    headers: hdrs,
    auth_results: {
      'authentication-results': headerOf(email.headers, 'authentication-results') || null,
      'received-spf': headerOf(email.headers, 'received-spf') || null,
      'dkim-signature': headerOf(email.headers, 'dkim-signature') ? 'present' : null,
      // Resend groups List-* into a nested `list` object, so a flat
      // 'list-unsubscribe' lookup is always null. Record the real answer.
      'list-unsubscribe': headerOf(email.headers, 'list-unsubscribe')
        || (isBulkMail(hdrs) ? 'present' : null),
    },
    has_attachments: attRefs.length > 0,
    // The sender's own Date header, so the message sorts where it belongs rather
    // than at "whenever we happened to receive it".
    occurred_at: firstDate([
      headerOf(email.headers, 'date'),
      email.created_at,
      webhookData.created_at,
    ]),
  }

  const results: Record<string, unknown>[] = []

  // One stored copy per matched address: mail to support@ AND sales@ is genuinely
  // two mailbox items, and each has its own read state, assignee and forwarders.
  for (const addr of targets) {
    const ing = await admin.rpc('inbox_ingest', { p_address_id: addr.id, p_msg: payloadBase })
    if (ing.error) {
      await logRow({ domain: dom.domain, to_email: addr.address, from_email: from.email,
        provider_id: emailId, action: 'error', detail: `ingest: ${ing.error.message}` })
      results.push({ address: addr.address, error: ing.error.message })
      continue
    }

    const out = ing.data as { message_id: string; thread_id: string; duplicate: boolean }
    if (out.duplicate) {
      await logRow({ domain: dom.domain, to_email: addr.address, from_email: from.email,
        provider_id: emailId, action: 'duplicate', detail: 'already stored — webhook replay',
        message_id: out.message_id })
      results.push({ address: addr.address, duplicate: true })
      continue
    }

    await logRow({ domain: dom.domain, to_email: addr.address, from_email: from.email,
      provider_id: emailId, action: 'stored', message_id: out.message_id,
      detail: payloadBase.subject || null })

    // ── attachments ──
    let bytes: { filename: string; content_type?: string; b64: string }[] = []
    if (attRefs.length) {
      const st = await storeAttachments(key, emailId, addr.id, out.message_id, attRefs)
      bytes = st.bytes
      if (st.errors.length) {
        await logRow({ domain: dom.domain, to_email: addr.address, action: 'error',
          message_id: out.message_id, detail: `attachments: ${st.errors.join('; ')}` })
      }
      if (st.stored === 0) {
        await admin.from('inbox_messages').update({ has_attachments: false }).eq('id', out.message_id)
      }
    }

    // ── AURA triage (advisory) ──
    let scan: ScanResult | null = null
    if (dom.scan_enabled && addr.scan_enabled !== false) {
      scan = await scanEmail({
        from: from.email, fromName: from.name, replyTo: payloadBase.reply_to || undefined,
        to: payloadBase.to_emails, subject: payloadBase.subject || undefined,
        text: payloadBase.body_text || undefined, html: payloadBase.html || undefined,
        authResults: { ...payloadBase.auth_results },
        attachmentNames: attRefs.map((a: any) => a.filename).filter(Boolean),
      }, { orgId: addr.org_id, eventId: addr.event_id })

      await admin.from('inbox_messages').update({
        aura_verdict: scan.verdict, aura_score: scan.score, aura_reasons: scan.reasons,
        aura_summary: scan.summary || null, aura_model: scan.model || null,
        aura_scanned_at: new Date().toISOString(),
      }).eq('id', out.message_id)

      // Filing, not rejection: the thread moves to the spam view and stays readable.
      const spam = scan.verdict === 'phishing' || scan.verdict === 'spam' || scan.score >= dom.spam_threshold
      if (spam) await admin.from('inbox_threads').update({ status: 'spam' }).eq('id', out.thread_id)

      await logRow({ domain: dom.domain, to_email: addr.address, from_email: from.email,
        action: scan.model ? 'scanned' : 'scan_failed', message_id: out.message_id,
        detail: `${scan.verdict} ${scan.score}/100${scan.model ? ` · ${scan.model}` : ' · heuristics only'}` })
    }

    // ── AI auto-reply (D-089) — after the mail is durable, after the verdict ──
    await maybeAutoReply(dom, addr, out, payloadBase, scan,
      url.pathname.match(/\/functions\/v1\/([^/?]+)/)?.[1] ?? 'inbox')

    // ── forwarders ──
    await runForwarders(key, dom, addr, {
      from_email: from.email, from_name: from.name, subject: payloadBase.subject || undefined,
      html: payloadBase.html || undefined, text: payloadBase.body_text || undefined,
      message_id: payloadBase.message_id || emailId,
    }, scan, bytes)

    // A pure forwarder's mailbox should not accumulate open threads.
    const { data: anyKeep } = await admin.from('inbox_forwarders')
      .select('keep_local').eq('address_id', addr.id).eq('is_active', true)
    if (anyKeep?.length && anyKeep.every((f) => f.keep_local === false)) {
      await admin.from('inbox_threads').update({ status: 'closed' }).eq('id', out.thread_id)
    }

    results.push({
      address: addr.address, thread_id: out.thread_id, message_id: out.message_id,
      verdict: scan?.verdict, score: scan?.score, attachments: bytes.length,
    })
  }

  return json({ ok: true, received: results })
}

async function domainKey(domainId: string): Promise<string | null> {
  const { data } = await admin.rpc('inbox_get_domain_key', { p_domain_id: domainId })
  return (data as string | null) || null
}

// ── HTTP entry ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)
  // Raw text kept alongside the parsed body: Svix signature verification (the
  // receive path) must HMAC the exact bytes Resend sent, not a re-serialisation.
  const rawBody = req.method === 'POST' ? await req.text().catch(() => '') : ''
  let body: any = Object.fromEntries(url.searchParams)
  if (rawBody) { try { body = JSON.parse(rawBody) } catch { body = {} } }
  const action = body?.action || url.searchParams.get('action')

  const authHeader = req.headers.get('Authorization') || ''
  async function requireUser() {
    if (!authHeader) return null
    const asUser = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    })
    const { data: { user } } = await asUser.auth.getUser()
    return user ? { user, asUser } : null
  }
  async function requireAdmin() {
    const ctx = await requireUser(); if (!ctx) return null
    const { data: ok } = await ctx.asUser.rpc(ADMIN_RPC)
    return ok ? ctx : null
  }

  try {
    // ── the webhook ────────────────────────────────────────────────────────
    if (action === 'receive' || url.pathname.endsWith('/receive')) {
      return await handleReceive(req, url, body, rawBody)
    }

    // ── send / reply ───────────────────────────────────────────────────────
    if (action === 'send') {
      const ctx = await requireUser(); if (!ctx) return json({ error: 'Not authenticated' }, 401)

      const addressId = String(body.address_id || '')
      if (!addressId) return json({ error: 'address_id required' }, 400)

      // Authorised AS THE CALLER, so RLS and the role check are the same predicate
      // the UI sees. The browser cannot send from an address it has no seat on.
      const { data: may } = await ctx.asUser.rpc('can_send_as_inbox_address', { p_address: addressId })
      if (!may) return json({ error: 'You cannot send from that address.' }, 403)

      const { data: addr } = await admin.from('inbox_addresses')
        .select('*, inbox_domains!inner(id, domain, default_from_name, outbound_enabled, signature_html, signature_text)')
        .eq('id', addressId).maybeSingle()
      if (!addr) return json({ error: 'Unknown address' }, 404)
      const dom = (addr as any).inbox_domains
      if (!dom.outbound_enabled) return json({ error: 'Sending is disabled for this domain.' }, 400)

      const key = await domainKey(dom.id)
      if (!key) return json({ error: 'No Resend key is set for this domain.' }, 400)

      const to = (Array.isArray(body.to) ? body.to : String(body.to || '').split(','))
        .map((s: string) => parseAddress(s).email).filter(Boolean)
      if (!to.length) return json({ error: 'At least one recipient is required.' }, 400)
      const cc = (Array.isArray(body.cc) ? body.cc : String(body.cc || '').split(','))
        .map((s: string) => parseAddress(s).email).filter(Boolean)

      // ── threading ──
      // Our own Message-ID is set explicitly so the outbound copy is addressable.
      // Resend MAY replace it; that is survivable because the recipient's reply
      // also echoes the References chain, which contains the inbound Message-ID we
      // already hold — so the reply threads even if our own id is rewritten.
      const ourMessageId = `<${crypto.randomUUID()}@${dom.domain}>`
      const headers: Record<string, string> = { 'Message-ID': ourMessageId }
      let inReplyTo: string | null = null
      let refs: string[] = []

      if (body.reply_to_message_id) {
        const { data: parent } = await admin.from('inbox_messages')
          .select('message_id, refs, subject, from_email, reply_to, thread_id')
          .eq('id', body.reply_to_message_id).maybeSingle()
        if (parent?.message_id) {
          inReplyTo = parent.message_id
          refs = [...(parent.refs || []), parent.message_id]
          headers['In-Reply-To'] = inReplyTo
          headers['References'] = refs.join(' ')
        }
      }

      const fromName = addr.display_name || dom.default_from_name || null
      const subject = String(body.subject || '').trim() || '(no subject)'
      const html = String(body.html || '')

      const { sigHtml, sigText } = buildSignature(addr, dom, fromName)
      const signed = sigHtml ? `${html}<div class="sig">${sigHtml}</div>` : html
      const text = String(body.text || '')
      // "-- " on its own line is the RFC-style signature delimiter mail clients know.
      const signedText = sigText ? `${text}\n\n-- \n${sigText}` : (text || undefined)

      const sent = await resendSend(key, {
        from: fromName ? `${fromName} <${addr.address}>` : addr.address,
        to, cc: cc.length ? cc : undefined,
        subject, html: signed, text: signedText,
        replyTo: addr.default_reply_to || undefined,
        headers,
        idempotencyKey: body.idempotency_key || undefined,
      })

      // Recorded either way: a failed send must stay visible in the thread rather
      // than vanishing, so it can be retried or rewritten.
      const ing = await admin.rpc('inbox_ingest', {
        p_address_id: addressId,
        p_msg: {
          direction: 'outbound',
          message_id: ourMessageId, in_reply_to: inReplyTo, refs,
          provider_id: sent.id || null,
          from_email: addr.address, from_name: fromName,
          to_emails: to, cc_emails: cc, subject,
          html: signed, body_text: signedText || null,
          send_status: sent.ok ? 'sent' : 'failed', sent_by: ctx.user.id,
          occurred_at: new Date().toISOString(),
        },
      })
      const out = ing.data as { message_id: string; thread_id: string } | null

      if (!sent.ok && out?.message_id) {
        await admin.from('inbox_messages').update({ send_error: sent.error }).eq('id', out.message_id)
      }
      await logRow({
        domain: dom.domain, to_email: to[0], from_email: addr.address, provider_id: sent.id || null,
        action: sent.ok ? 'sent' : 'send_failed', detail: sent.error || subject,
        message_id: out?.message_id || null,
      })

      return sent.ok
        ? json({ ok: true, message_id: out?.message_id, thread_id: out?.thread_id, resend_id: sent.id })
        : json({ error: sent.error || 'Send failed', message_id: out?.message_id }, 502)
    }

    // ── attachment: 60-second signed URL, after a membership check ──────────
    // The `inbox` bucket is private with NO storage policies (0024), so this is
    // the only door to a byte of an attachment.
    if (action === 'attachment_url') {
      const ctx = await requireUser(); if (!ctx) return json({ error: 'Not authenticated' }, 401)
      const { data: att } = await admin.from('inbox_attachments')
        .select('address_id, storage_path, filename').eq('id', body.attachment_id).maybeSingle()
      if (!att?.storage_path) return json({ error: 'Not found' }, 404)

      const { data: may } = await ctx.asUser.rpc('can_read_inbox_address', { p_address: att.address_id })
      if (!may) return json({ error: 'Forbidden' }, 403)

      const { data: signed, error } = await admin.storage.from(BUCKET)
        .createSignedUrl(att.storage_path, 60, { download: att.filename })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, url: signed?.signedUrl, filename: att.filename })
    }

    // ── rescan one message ─────────────────────────────────────────────────
    if (action === 'rescan') {
      const ctx = await requireUser(); if (!ctx) return json({ error: 'Not authenticated' }, 401)
      const { data: m } = await admin.from('inbox_messages')
        .select('id, address_id, thread_id, from_email, from_name, reply_to, to_emails, subject, body_text, html, auth_results')
        .eq('id', body.message_id).maybeSingle()
      if (!m) return json({ error: 'Not found' }, 404)

      const { data: may } = await ctx.asUser.rpc('can_read_inbox_address', { p_address: m.address_id })
      if (!may) return json({ error: 'Forbidden' }, 403)

      const { data: names } = await admin.from('inbox_attachments').select('filename').eq('message_id', m.id)
      const scan = await scanEmail({
        from: m.from_email || '', fromName: m.from_name || undefined, replyTo: m.reply_to || undefined,
        to: m.to_emails || [], subject: m.subject || undefined,
        text: m.body_text || undefined, html: m.html || undefined,
        authResults: m.auth_results || {}, attachmentNames: (names || []).map((n) => n.filename),
      })
      await admin.from('inbox_messages').update({
        aura_verdict: scan.verdict, aura_score: scan.score, aura_reasons: scan.reasons,
        aura_summary: scan.summary || null, aura_model: scan.model || null,
        aura_scanned_at: new Date().toISOString(),
      }).eq('id', m.id)
      return json({ ok: true, ...scan })
    }

    // ── admin: the webhook URL to paste into Resend ────────────────────────
    if (action === 'webhook_url') {
      const ctx = await requireAdmin(); if (!ctx) return json({ error: 'Admin required' }, 403)
      const { data: sec } = await admin.from('inbox_domain_secrets')
        .select('webhook_token').eq('domain_id', body.domain_id).maybeSingle()
      if (!sec) return json({ error: 'Unknown domain' }, 404)
      // Slug derived from the request's own URL, so a host that deploys this
      // folder under another name prints the right webhook without any config.
      const slug = url.pathname.match(/\/functions\/v1\/([^/?]+)/)?.[1] ?? 'inbox'
      return json({ ok: true, url: `${URL_}/functions/v1/${slug}?action=receive&t=${sec.webhook_token}` })
    }

    // ── AI: decide a suggestion — approve (send) or reject ─────────────────
    // Two auth paths: a signed-in seat-holder with send permission (the app),
    // or the suggestion's one-time decide token (a Slack link, GET).
    if (action === 'ai_decide') {
      const id = String(body.id || url.searchParams.get('id') || '')
      const verdict = String(body.verdict || url.searchParams.get('verdict') || '')
      const token = String(body.t || url.searchParams.get('t') || '')
      const isLink = req.method === 'GET'
      const page = (title: string, detail = '', status = 200) => isLink
        ? new Response(
            `<!doctype html><meta charset="utf-8"><title>${title}</title>`
            + `<body style="font:16px/1.6 system-ui;background:#0b1120;color:#e7ecff;display:grid;place-items:center;min-height:100vh;margin:0">`
            + `<div style="text-align:center;max-width:480px;padding:24px"><h2>${title}</h2><p style="color:#94a3b8">${detail}</p></div>`,
            { status, headers: { ...CORS, 'content-type': 'text/html; charset=utf-8' } })
        : json(status < 400 ? { ok: true, result: title } : { error: title }, status)

      const { data: sug } = await admin.from('inbox_ai_suggestions').select('*').eq('id', id).maybeSingle()
      if (!sug) return page('Suggestion not found', '', 404)
      if (sug.status !== 'pending') {
        return page(`Already ${sug.status}`, 'This suggestion was decided elsewhere — nothing was sent twice.', 200)
      }

      let decidedBy: string | null = null
      let via = 'slack'
      if (token) {
        if (token !== sug.decide_token) return page('Invalid or expired link', '', 403)
      } else {
        const ctx = await requireUser(); if (!ctx) return page('Not authenticated', '', 401)
        const { data: may } = await ctx.asUser.rpc('can_send_as_inbox_address', { p_address: sug.address_id })
        if (!may) return page('You cannot send from that address', '', 403)
        decidedBy = ctx.user.id
        via = 'app'
      }

      if (verdict === 'reject') {
        await admin.from('inbox_ai_suggestions').update({
          status: 'rejected', decided_by: decidedBy, decided_via: via,
          decided_at: new Date().toISOString(),
        }).eq('id', sug.id)
        return page('Rejected ✓', 'The draft was discarded; nothing was sent.')
      }
      if (verdict === 'approve') {
        const edited = body.text ? String(body.text) : undefined
        const r = await sendSuggestionRow(sug, decidedBy, via, edited)
        return r.ok
          ? page('Approved & sent ✓', `The reply is on its way to ${sug.to_email}.`)
          : page(`Send failed: ${r.error}`, 'The suggestion is marked failed; reply manually from the inbox.', 502)
      }
      return page('Unknown verdict', 'Use approve or reject.', 400)
    }

    // ── AI: admin health-check of one provider ──────────────────────────────
    if (action === 'ai_test_provider') {
      const ctx = await requireAdmin(); if (!ctx) return json({ error: 'Admin required' }, 403)
      const { data: p } = await admin.from('inbox_ai_providers')
        .select('id, label, kind, base_url, model, secret_id, is_enabled, priority')
        .eq('id', body.provider_id).maybeSingle()
      if (!p) return json({ error: 'Unknown provider' }, 404)
      if (!p.secret_id) return json({ error: 'No key stored for this provider yet.' }, 400)
      const r = await aiChat(
        { system: 'You are a connectivity check.', user: 'Reply with exactly: ok', temperature: 0, maxTokens: 8 },
        p as any,
      )
      return json({ ok: r.ok, provider: r.provider || `${p.label}/${p.model}`, error: r.error })
    }

    // ── admin: store/clear the Svix signing secret for a domain ────────────
    // Empty secret clears it (verification reverts to URL-token-only).
    if (action === 'set_signing_secret') {
      const ctx = await requireAdmin(); if (!ctx) return json({ error: 'Admin required' }, 403)
      const secret = String(body.secret || '').trim()
      const { error } = await admin.from('inbox_domain_secrets')
        .update({ webhook_signing_secret: secret || null })
        .eq('domain_id', body.domain_id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true, signing: secret ? 'enforced' : 'off' })
    }

    // ── admin: does the stored key work? ───────────────────────────────────
    if (action === 'test_domain') {
      const ctx = await requireAdmin(); if (!ctx) return json({ error: 'Admin required' }, 403)
      const { data: dom } = await admin.from('inbox_domains')
        .select('id, domain').eq('id', body.domain_id).maybeSingle()
      if (!dom) return json({ error: 'Unknown domain' }, 404)

      const key = await domainKey(dom.id)
      if (!key) return json({ error: 'No key set for this domain.' }, 400)

      const r = await checkKey(key)
      // A send-only restricted key returns 401/403 on /domains while still being
      // able to send. Reported as-is rather than as "invalid" — mailer hit exactly
      // this and the key was fine (see notifications_email.md).
      const status = r.ok ? 'healthy' : (r.status === 401 ? 'invalid' : 'unknown_error')
      await admin.from('inbox_domains').update({
        key_status: status, last_tested_at: new Date().toISOString(), last_error: r.error || null,
      }).eq('id', dom.id)

      const match = (r.domains || []).find((d: any) => String(d.name).toLowerCase() === dom.domain)
      return json({
        ok: r.ok, status, error: r.error,
        verified_in_resend: match ? match.status : null,
        note: !r.ok && r.status !== 401
          ? 'The key may still be able to send — a restricted send-only key cannot list domains.'
          : undefined,
        domains: (r.domains || []).map((d: any) => ({ name: d.name, status: d.status })),
      })
    }

    if (action === 'status') {
      const ctx = await requireAdmin(); if (!ctx) return json({ error: 'Admin required' }, 403)
      const countOf = async (t: string, f?: (q: any) => any) => {
        try {
          let q = admin.from(t).select('*', { count: 'exact', head: true })
          if (f) q = f(q)
          const { count } = await q
          return count || 0
        } catch { return 0 }
      }
      // Hosts without AURA (or with the scanner bound off) still get a truthful
      // status: the scanner reads are wrapped so an absent table reports
      // "not ready" instead of erroring — deliberate, matching scan.ts's fallback.
      let feature: { is_enabled: boolean } | null = null
      let providers: Array<{ id: string }> | null = null
      if (!scannerOff()) {
        try {
          const f = await admin.from('aura_features').select('is_enabled').eq('id', SCANNER_FEATURE).maybeSingle()
          feature = f.data
          const p = await admin.from('aura_providers').select('id').eq('is_enabled', true).not('secret_id', 'is', null).limit(1)
          providers = p.data
        } catch { /* AURA absent in this host */ }
      }

      return json({
        ok: true,
        domains: await countOf('inbox_domains'),
        domains_receiving: await countOf('inbox_domains', (q) => q.eq('inbound_enabled', true)),
        addresses: await countOf('inbox_addresses'),
        threads_open: await countOf('inbox_threads', (q) => q.eq('status', 'open')),
        threads_spam: await countOf('inbox_threads', (q) => q.eq('status', 'spam')),
        messages: await countOf('inbox_messages'),
        scanner: {
          feature_enabled: !!feature?.is_enabled,
          provider_ready: !!providers?.length,
          // Both must be true for a real verdict; otherwise every message gets
          // heuristics only. Said plainly so "why is everything unknown" is answerable.
          ready: !!feature?.is_enabled && !!providers?.length,
        },
      })
    }

    // ── admin: replay missed emails from Resend ────────────────────────────
    // The provider keeps received mail retrievable, so a broken pipe is
    // replayable. Ingest dedupes on provider_id, so replay is safe to re-run.
    // ⚠ If mail arrived while a BROKEN version was deployed, delete those shell
    // rows first — plain dedupe reports them as duplicates and leaves them empty.
    if (action === 'backfill') {
      const ctx = await requireAdmin(); if (!ctx) return json({ error: 'Admin required' }, 403)
      const domainId = String(body.domain_id || '')
      if (!domainId) return json({ error: 'domain_id required' }, 400)

      const { data: dom } = await admin.from('inbox_domains').select('*').eq('id', domainId).maybeSingle<DomainRow>()
      if (!dom) return json({ error: 'Unknown domain' }, 404)

      const key = await domainKey(dom.id)
      if (!key) return json({ error: 'No key set for this domain.' }, 400)

      // List received emails from Resend's API, then replay each through ingest.
      const listRes = await fetch(`https://api.resend.com/emails/receiving`, {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (!listRes.ok) return json({ error: `Resend list failed: ${listRes.status}` }, 502)
      const listBody = await listRes.json().catch(() => ({ data: [] }))
      const emails = (listBody?.data || listBody || []) as { id: string; to?: string[] }[]

      const domainFilter = `@${dom.domain}`
      const relevant = emails.filter((e: any) => {
        const recipients = Array.isArray(e.to) ? e.to : []
        return recipients.some((r: string) => String(r).toLowerCase().endsWith(domainFilter))
      })

      const results: Record<string, unknown>[] = []
      for (const e of relevant) {
        try {
          // Resolve recipients from the email's to/cc/bcc, same as the live path
          const targets = await resolveRecipients(dom, { to: e.to })
          if (!targets.length) {
            results.push({ email_id: e.id, skipped: 'no matching address' })
            continue
          }
          const r = await ingestReceivedEmail(dom, targets, key, e.id, { to: e.to }, url)
          const rBody = await r.json().catch(() => ({}))
          results.push({ email_id: e.id, ...rBody })
        } catch (err) {
          results.push({ email_id: e.id, error: (err as Error).message })
        }
      }

      return json({ ok: true, total: relevant.length, results })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: (e as Error).message || 'Server error' }, 500)
  }
})
