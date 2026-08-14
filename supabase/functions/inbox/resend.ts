// Minimal Resend client for the inbox module — fetch only, no SDK.
//
// Same shape as `mailer/resend.ts` (deliberately: two tiny copies beat a shared
// import that couples two droppable folders), plus the RECEIVE side.
//
// Endpoints, from Resend's own reference — https://resend.com/docs/dashboard/receiving
// and github.com/resend/resend-skills/blob/main/skills/resend/references/receiving.md :
//
//   POST /emails                                                   send
//   GET  /emails/receiving/{email_id}                              full received email
//   GET  /emails/receiving/{email_id}/attachments                  list
//   GET  /emails/receiving/{email_id}/attachments/{attachment_id}  → { download_url, expires_at }
//   GET  /domains                                                  key health check
//
// The inbound WEBHOOK carries metadata only — no body, no headers, no attachment
// bytes. That is Resend's design (it keeps big attachments out of a serverless
// request body), and it is why receiving is a fetch-back rather than a parse.

const API = 'https://api.resend.com'

export interface SendArgs {
  from: string
  to: string | string[]
  cc?: string[]
  subject: string
  html?: string
  text?: string
  replyTo?: string
  headers?: Record<string, string>
  attachments?: { filename: string; content: string; content_type?: string }[]
  idempotencyKey?: string
}

export interface SendResult { ok: boolean; id?: string; error?: string }

async function call(
  key: string, path: string, init?: RequestInit & { idempotencyKey?: string },
): Promise<{ ok: boolean; status: number; body: any; error?: string }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  }
  if (init?.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey
  try {
    const r = await fetch(`${API}${path}`, { ...init, headers })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) {
      return { ok: false, status: r.status, body, error: body?.message || body?.error?.message || `Resend error ${r.status}` }
    }
    return { ok: true, status: r.status, body }
  } catch (e) {
    return { ok: false, status: 0, body: null, error: (e as Error).message || 'Network error calling Resend' }
  }
}

export async function resendSend(key: string, a: SendArgs): Promise<SendResult> {
  const body: Record<string, unknown> = {
    from: a.from,
    to: Array.isArray(a.to) ? a.to : [a.to],
    subject: a.subject,
  }
  if (a.cc?.length) body.cc = a.cc
  if (a.html) body.html = a.html
  if (a.text) body.text = a.text
  if (a.replyTo) body.reply_to = a.replyTo
  if (a.headers && Object.keys(a.headers).length) body.headers = a.headers
  if (a.attachments?.length) body.attachments = a.attachments

  const r = await call(key, '/emails', {
    method: 'POST', body: JSON.stringify(body), idempotencyKey: a.idempotencyKey,
  })
  return r.ok ? { ok: true, id: r.body?.id } : { ok: false, error: r.error }
}

export interface ReceivedEmail {
  email_id?: string
  id?: string
  from?: string
  to?: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  html?: string
  text?: string
  // Resend returns headers as an object in current docs, but header collections
  // are an array of {name,value} in plenty of APIs (and were in the beta). Both
  // are accepted by `headerOf()` below rather than betting on one.
  headers?: Record<string, string> | { name: string; value: string }[]
  created_at?: string
  attachments?: { id?: string; filename?: string; content_type?: string; content_id?: string; content_disposition?: string }[]
  [k: string]: unknown
}

export async function getReceivedEmail(key: string, emailId: string): Promise<{ ok: boolean; email?: ReceivedEmail; error?: string }> {
  const r = await call(key, `/emails/receiving/${encodeURIComponent(emailId)}`)
  return r.ok ? { ok: true, email: r.body as ReceivedEmail } : { ok: false, error: r.error }
}

export interface AttachmentRef {
  id?: string
  filename?: string
  content_type?: string
  size?: number
  content_id?: string
  download_url?: string
  expires_at?: string
}

export async function getAttachment(
  key: string, emailId: string, attachmentId: string,
): Promise<{ ok: boolean; att?: AttachmentRef; error?: string }> {
  const r = await call(key, `/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`)
  return r.ok ? { ok: true, att: r.body as AttachmentRef } : { ok: false, error: r.error }
}

/** Health check for a stored key. `GET /domains` is cheap and needs no arguments. */
export async function checkKey(key: string): Promise<{ ok: boolean; domains?: any[]; error?: string; status: number }> {
  const r = await call(key, '/domains')
  return { ok: r.ok, domains: r.ok ? (r.body?.data || []) : undefined, error: r.error, status: r.status }
}

// ── header helpers ───────────────────────────────────────────────────────────

/** Case-insensitive header read that tolerates both object and array shapes. */
export function headerOf(h: ReceivedEmail['headers'], name: string): string | undefined {
  if (!h) return undefined
  const want = name.toLowerCase()
  if (Array.isArray(h)) {
    const hit = h.find((x) => String(x?.name || '').toLowerCase() === want)
    return hit?.value ?? undefined
  }
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === want) return typeof v === 'string' ? v : String(v)
  }
  return undefined
}

/** Flatten headers to a plain object for storage, whichever shape arrived. */
export function headersToObject(h: ReceivedEmail['headers']): Record<string, string> {
  if (!h) return {}
  if (Array.isArray(h)) {
    const o: Record<string, string> = {}
    for (const x of h) if (x?.name) o[String(x.name)] = String(x.value ?? '')
    return o
  }
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, typeof v === 'string' ? v : String(v)]))
}

/** `<a@b> <c@d>` → ['<a@b>','<c@d>']. Message-IDs keep their angle brackets: that
 *  is how they appear in In-Reply-To/References, so matching stays literal. */
export function parseRefs(raw?: string): string[] {
  if (!raw) return []
  const found = raw.match(/<[^<>\s]+>/g)
  if (found?.length) return found
  return raw.split(/\s+/).map((s) => s.trim()).filter(Boolean)
}

/** `"Ada Lovelace" <ada@x.com>` → { email, name } */
export function parseAddress(raw?: string): { email: string; name?: string } {
  const s = (raw || '').trim()
  if (!s) return { email: '' }
  const m = s.match(/^(.*?)\s*<([^>]+)>\s*$/)
  if (m) {
    const name = m[1].trim().replace(/^"(.*)"$/, '$1')
    return { email: m[2].trim().toLowerCase(), name: name || undefined }
  }
  return { email: s.toLowerCase() }
}

export function parseAddressList(raw?: string | string[]): string[] {
  if (!raw) return []
  const arr = Array.isArray(raw) ? raw : raw.split(',')
  return arr.map((s) => parseAddress(String(s)).email).filter(Boolean)
}
