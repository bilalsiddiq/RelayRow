<script setup>
// /inbox — the mail client.  D-073
//
// The mailboxes listed here are the addresses the signed-in member holds a SEAT on
// (`inbox_address_members`). RLS enforces that; this view only renders it, so a
// crafted request cannot reach someone else's mail.
//
// ── THE ONE THING THAT MUST NOT BE GOT WRONG ────────────────────────────────
// Inbound HTML is written by strangers and rendered inside a staff session. It is
// contained by THREE independent mechanisms, because any one of them alone has a
// bypass:
//
//   1. `sandbox` with NO allow tokens → unique opaque origin, no script, no forms,
//      no top-level navigation. Even same-origin reads are impossible.
//   2. A CSP inside the srcdoc: `default-src 'none'` — so no fetch, no font, no
//      frame, no beacon, whatever slips past the sandbox.
//   3. Remote images blocked until asked for. A loaded <img> is a read receipt and
//      an IP leak; every mail client on earth defaults this off, and so do we.
//
// We do NOT sanitise the HTML string. Stripping tags is a losing arms race, and
// with 1–3 in place the document is inert: the worst a hostile mail can do is look
// strange inside its own frame.
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink } from 'vue-router'
import {
  listMyMailboxes, listThreads, listSentThreads, searchThreads, listMessages,
  listMessageAttachments, markMessagesRead, updateThread, threadCounts,
  wakeSnoozedThreads, subscribeThreads,
  sendMail, attachmentUrl, rescanMessage,
  pendingSuggestion, decideSuggestion,
} from '@/services/inbox'
import { useAuthStore } from '@/stores/auth'

// ── HOST-APP BINDINGS — auth adapter + admin route; the only app coupling ────
// A port replaces these four lines with its own auth store / route names.
const auth = useAuthStore()
const HOST = {
  uid: () => auth.user?.id || null,     // the signed-in member's auth uid
  isStaff: () => !!auth.isSuperAdmin,   // may see the admin surface
  adminRoute: '/admin',                // where addresses/seats are managed
}
const myUid = computed(() => HOST.uid())
const isStaff = computed(() => HOST.isStaff())

const boxes = ref([])
const boxId = ref('')
const folder = ref('open')            // open | sent | snoozed | spam | closed
const counts = ref({ open: 0, sent: 0, snoozed: 0, closed: 0, spam: 0 })
const search = ref('')                // non-empty → the list shows search hits instead
const labelFilter = ref('')           // non-empty → folder list narrowed to one label

// 'sent' is a direction filter, not a thread status — a thread can be in both
// Open and Sent, so it must not be removed from the Sent list on triage.
// A live search overrides the folder entirely (it looks across all statuses
// of this mailbox — finding a closed thread is the point of searching).
const loadThreads = () => search.value.trim()
  ? searchThreads(boxId.value, search.value.trim())
  : folder.value === 'sent'
    ? listSentThreads(boxId.value)
    : listThreads(boxId.value, { status: folder.value, label: labelFilter.value })

const threads = ref([])
const openThread = ref(null)
const messages = ref([])
const attachments = ref([])

const loading = ref(true)
const busy = ref('')
const error = ref('')
const notice = ref('')
const showImages = ref({})            // message_id → allow remote images

// composer
const replying = ref(false)
const draft = ref({ to: '', cc: '', subject: '', html: '' })

const box = computed(() => boxes.value.find((b) => b.id === boxId.value) || null)

async function guard(name, fn) {
  busy.value = name; error.value = ''
  try { return await fn() } catch (e) { error.value = e.message } finally { busy.value = '' }
}
function flash(m) { notice.value = m; setTimeout(() => { if (notice.value === m) notice.value = '' }, 4000) }

onMounted(async () => {
  loading.value = true
  try {
    // Lazy snooze wake-up (the mailer-drain pattern): overdue snoozes flip back
    // to open before the first list renders. Fire-and-forget — a failure here
    // must not block reading mail.
    wakeSnoozedThreads().catch(() => {})
    boxes.value = await listMyMailboxes()
    if (boxes.value.length) boxId.value = boxes.value[0].id
  } catch (e) { error.value = e.message } finally { loading.value = false }
})

const reloadList = async () => {
  threads.value = await loadThreads()
  counts.value = await threadCounts(boxId.value)
}

watch([boxId, folder, labelFilter], async () => {
  openThread.value = null; messages.value = []
  if (!boxId.value) return
  await guard('threads', reloadList)
}, { immediate: true })

// Debounced live search: typing narrows the list; clearing restores the folder.
let searchTimer = null
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { if (boxId.value) guard('threads', reloadList) }, 300)
})

// ── realtime: the thread list follows the database ───────────────────────────
// One subscription per open mailbox; any thread change (new mail, a teammate's
// triage) reloads the list. RLS gates which rows produce events for us. The
// reload is cheap (one indexed page) and self-debounces via `rtPending`.
let unsubscribe = null
let rtPending = false
watch(boxId, (id, _old, onCleanup) => {
  unsubscribe?.()
  unsubscribe = id ? subscribeThreads(id, () => {
    if (rtPending) return
    rtPending = true
    setTimeout(async () => {
      rtPending = false
      try { await reloadList() } catch { /* transient */ }
    }, 400)
  }) : null
  onCleanup(() => { unsubscribe?.(); unsubscribe = null })
}, { immediate: true })
onBeforeUnmount(() => unsubscribe?.())

async function open(t) {
  openThread.value = t
  replying.value = false
  suggestion.value = null
  await guard('thread', async () => {
    messages.value = await listMessages(t.id)
    const ids = messages.value.map((m) => m.id)
    attachments.value = ids.length ? await listMessageAttachments(ids) : []
    suggestion.value = await pendingSuggestion(t.id)
    if (t.unread_count > 0) {
      await markMessagesRead(t.id)
      t.unread_count = 0
      messages.value = messages.value.map((m) => ({ ...m, is_read: true }))
    }
  })
}

// ── AI suggestion (D-089): the card's textarea IS the draft — edits are what
// gets approved, so there is no separate edit mode to juggle.
const suggestion = ref(null)

async function decideAi(verdict) {
  const sug = suggestion.value; if (!sug) return
  await guard('suggest', async () => {
    await decideSuggestion(sug.id, verdict, verdict === 'approve' ? sug.draft_text : undefined)
    suggestion.value = null
    flash(verdict === 'approve' ? 'AI reply approved and sent.' : 'Suggestion rejected.')
    if (verdict === 'approve' && openThread.value) {
      messages.value = await listMessages(openThread.value.id)
    }
  })
}

const attachmentsOf = (mid) => attachments.value.filter((a) => a.message_id === mid && !a.is_inline)

async function download(a) {
  await guard(`att-${a.id}`, async () => {
    const r = await attachmentUrl(a.id)
    // Signed for 60 seconds and never stored: the bucket is private and has no
    // read policy at all, so this URL is the only door.
    if (r.url) window.open(r.url, '_blank', 'noopener')
  })
}

/** Wrap untrusted HTML in an inert document. See the header comment. */
function frameDoc(m) {
  const imgSrc = showImages.value[m.id] ? "img-src data: https: http:;" : "img-src data:;"
  const csp = `default-src 'none'; style-src 'unsafe-inline'; ${imgSrc}`
  const body = m.html
    || `<pre style="white-space:pre-wrap;font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif">${
        (m.body_text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`
  return `<!doctype html><html><head><meta charset="utf-8">`
    + `<meta http-equiv="Content-Security-Policy" content="${csp}">`
    + `<base target="_blank">`
    + `<style>html,body{margin:0;padding:14px;background:#fff;color:#16181d;`
    + `font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;word-break:break-word}`
    + `img{max-width:100%;height:auto}a{color:#0b6bcb}</style></head><body>${body}</body></html>`
}

const hasRemoteImages = (m) => /<img[^>]+src=["']?https?:/i.test(m.html || '')

// ── triage ─────────────────────────────────────────────────────────────────
async function setStatus(status) {
  const t = openThread.value; if (!t) return
  await guard('status', async () => {
    await updateThread(t.id, { status, snoozed_until: null })
    if (folder.value !== 'sent') threads.value = threads.value.filter((x) => x.id !== t.id)
    counts.value = await threadCounts(boxId.value)
    openThread.value = null
    flash(status === 'spam' ? 'Filed as spam.' : status === 'closed' ? 'Closed.' : 'Reopened.')
  })
}

// ── snooze ─────────────────────────────────────────────────────────────────
const snoozing = ref(false)           // the picker is open
function snoozeChoices() {
  const now = new Date()
  const at = (d, h) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x }
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const nextWeek = new Date(now); nextWeek.setDate(now.getDate() + (8 - now.getDay()) % 7 || 7)
  return [
    { label: 'In 4 hours', until: new Date(now.getTime() + 4 * 3600e3) },
    { label: 'Tomorrow 9:00', until: at(tomorrow, 9) },
    { label: 'Next Monday 9:00', until: at(nextWeek, 9) },
  ]
}

async function snooze(until) {
  const t = openThread.value; if (!t) return
  snoozing.value = false
  await guard('status', async () => {
    await updateThread(t.id, { status: 'snoozed', snoozed_until: until.toISOString() })
    if (folder.value !== 'sent') threads.value = threads.value.filter((x) => x.id !== t.id)
    counts.value = await threadCounts(boxId.value)
    openThread.value = null
    flash(`Snoozed until ${until.toLocaleString()}.`)
  })
}

// ── labels ─────────────────────────────────────────────────────────────────
const newLabel = ref('')

async function addLabel() {
  const t = openThread.value
  const l = newLabel.value.trim().toLowerCase()
  if (!t || !l) return
  if ((t.labels || []).includes(l)) { newLabel.value = ''; return }
  await guard('label', async () => {
    const labels = [...(t.labels || []), l]
    await updateThread(t.id, { labels })
    t.labels = labels
    newLabel.value = ''
  })
}

async function removeLabel(l) {
  const t = openThread.value; if (!t) return
  await guard('label', async () => {
    const labels = (t.labels || []).filter((x) => x !== l)
    await updateThread(t.id, { labels })
    t.labels = labels
    if (labelFilter.value === l) labelFilter.value = ''
  })
}

// Labels present in the current list — feeds the filter dropdown.
const visibleLabels = computed(() =>
  [...new Set(threads.value.flatMap((t) => t.labels || []))].sort())

async function assignSelf() {
  const t = openThread.value; if (!t) return
  await guard('assign', async () => {
    await updateThread(t.id, { assigned_to: myUid.value })
    t.assigned_to = myUid.value
    flash('Assigned to you.')
  })
}

async function rescan(m) {
  await guard(`scan-${m.id}`, async () => {
    const r = await rescanMessage(m.id)
    Object.assign(m, { aura_verdict: r.verdict, aura_score: r.score, aura_reasons: r.reasons, aura_summary: r.summary })
  })
}

// ── compose ────────────────────────────────────────────────────────────────
const lastInbound = computed(() =>
  [...messages.value].reverse().find((m) => m.direction === 'inbound') || null)

// ── device-local drafts ──────────────────────────────────────────────────────
// localStorage, keyed per mailbox + conversation. Deliberately NOT a table:
// zero backend, no sync conflicts — the UI says "saved on this device" so
// nobody mistakes it for cross-device drafts.
const draftKey = () => `inbox:draft:${boxId.value}:${openThread.value?.id || 'new'}`
const draftRestored = ref(false)

function loadDraft() {
  draftRestored.value = false
  try {
    const raw = localStorage.getItem(draftKey())
    if (!raw) return false
    const saved = JSON.parse(raw)
    if (!saved?.html && !saved?.subject && !saved?.to) return false
    draft.value = { to: '', cc: '', subject: '', html: '', ...saved }
    draftRestored.value = true
    return true
  } catch { return false }
}
function clearDraft() { try { localStorage.removeItem(draftKey()) } catch { /* */ } }

let draftTimer = null
watch(draft, () => {
  if (!replying.value) return
  clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    try {
      const d = draft.value
      if (d.html || d.subject || d.to) localStorage.setItem(draftKey(), JSON.stringify(d))
      else localStorage.removeItem(draftKey())
    } catch { /* storage full/blocked — drafts are best-effort */ }
  }, 400)
}, { deep: true })

function startReply() {
  const src = lastInbound.value
  const subj = openThread.value?.subject || ''
  replying.value = true
  if (loadDraft()) return
  draft.value = {
    to: src?.reply_to || src?.from_email || '',
    cc: '',
    subject: /^re:/i.test(subj) ? subj : `Re: ${subj}`,
    html: '',
  }
}

function startNew() {
  openThread.value = null; messages.value = []
  replying.value = true
  if (loadDraft()) return
  draft.value = { to: '', cc: '', subject: '', html: '' }
}

async function send() {
  if (!draft.value.to.trim()) { error.value = 'A recipient is required.'; return }
  await guard('send', async () => {
    const r = await sendMail({
      address_id: boxId.value,
      to: draft.value.to,
      cc: draft.value.cc || undefined,
      subject: draft.value.subject,
      // Plain text typed into a textarea, turned into minimal HTML. A rich composer
      // is worth having, but a broken one that mangles quoting is not.
      html: draft.value.html.split(/\n{2,}/).map((p) =>
        `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join(''),
      text: draft.value.html,
      reply_to_message_id: lastInbound.value?.id || undefined,
    })
    clearDraft()
    replying.value = false
    flash('Sent.')
    if (r.thread_id) {
      threads.value = await loadThreads()
      counts.value = await threadCounts(boxId.value)
      const t = threads.value.find((x) => x.id === r.thread_id)
      if (t) await open(t)
    }
  })
}

const fmt = (s) => (s ? new Date(s).toLocaleString() : '')
const who = (m) => m.from_name || m.from_email || '(unknown)'
const verdictClass = (v) => ({
  legitimate: 'v-ok', promotional: 'v-promo', suspicious: 'v-warn',
  spam: 'v-bad', phishing: 'v-bad',
}[v] || 'v-unknown')
</script>

<template>
  <section class="wrap">
    <header class="head">
      <div>
        <h2 class="text-2xl font-bold">Inbox</h2>
        <select v-if="boxes.length > 1" v-model="boxId" class="boxsel">
          <option v-for="b in boxes" :key="b.id" :value="b.id">{{ b.address }}</option>
        </select>
        <p v-else-if="box" class="muted text-sm mt-1">{{ box.address }}</p>
      </div>
      <div class="row ml-auto">
        <button class="zx-btn sm" :disabled="!boxId" @click="startNew">New message</button>
        <RouterLink v-if="isStaff" :to="HOST.adminRoute" class="pill">Manage addresses</RouterLink>
      </div>
    </header>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="notice" class="ok">{{ notice }}</p>
    <p v-if="loading" class="muted">Loading…</p>

    <p v-else-if="!boxes.length" class="empty">
      You don't have a mailbox yet. A super admin gives you a seat on an address in
      <RouterLink v-if="isStaff" :to="HOST.adminRoute" class="lnk">Admin → Inbox</RouterLink>
      <span v-else>Admin → Inbox</span>.
    </p>

    <div v-else class="cols">
      <!-- ── list ──────────────────────────────────────────────────────── -->
      <aside class="list">
        <div class="searchrow">
          <input v-model="search" class="searchbox" type="search"
            placeholder="Search subject or people…" />
        </div>

        <div v-if="!search.trim()" class="tabs">
          <button v-for="f in ['open', 'sent', 'snoozed', 'spam', 'closed']" :key="f"
            class="tab" :class="{ on: folder === f }" @click="folder = f">
            {{ f }} <span class="ct">{{ counts[f] }}</span>
          </button>
        </div>
        <p v-else class="muted px-3 pb-1 text-xs">
          Search results across this whole mailbox — clear to go back to {{ folder }}.
        </p>

        <div v-if="!search.trim() && (visibleLabels.length || labelFilter)" class="labelrow">
          <select v-model="labelFilter" class="labelsel">
            <option value="">all labels</option>
            <option v-for="l in visibleLabels" :key="l" :value="l">{{ l }}</option>
            <option v-if="labelFilter && !visibleLabels.includes(labelFilter)" :value="labelFilter">
              {{ labelFilter }}
            </option>
          </select>
        </div>

        <p v-if="busy === 'threads'" class="muted p-3 text-xs">Loading…</p>
        <p v-else-if="!threads.length" class="muted p-3 text-xs">
          {{ search.trim() ? 'No matches.' : `Nothing in ${folder}.` }}
        </p>

        <button v-for="t in threads" :key="t.id" class="titem"
          :class="{ on: openThread?.id === t.id, unread: t.unread_count > 0 }" @click="open(t)">
          <div class="row items-center gap-2">
            <strong class="tsubj">{{ t.subject || '(no subject)' }}</strong>
            <span v-if="t.aura_verdict && t.aura_verdict !== 'legitimate'"
              class="vdot" :class="verdictClass(t.aura_verdict)" :title="`${t.aura_verdict} · ${t.aura_score}/100`"></span>
          </div>
          <p class="tmeta">{{ (t.participants || []).slice(0, 2).join(', ') }}</p>
          <p class="tmeta">
            {{ fmt(t.last_message_at) }} · {{ t.message_count }} msg
            <span v-if="t.assigned_to === myUid"> · you</span>
          </p>
        </button>
      </aside>

      <!-- ── reader / composer ─────────────────────────────────────────── -->
      <main class="pane">
        <!-- composer -->
        <div v-if="replying" class="panel">
          <div class="row items-center mb-3">
            <strong class="text-sm">{{ openThread ? 'Reply' : 'New message' }}</strong>
            <span class="muted text-xs">from {{ box?.address }}</span>
            <button class="pill ml-auto" @click="replying = false">Cancel</button>
          </div>
          <label class="f"><span>To</span><input v-model="draft.to" placeholder="someone@example.com" /></label>
          <label class="f"><span>Cc</span><input v-model="draft.cc" placeholder="optional" /></label>
          <label class="f"><span>Subject</span><input v-model="draft.subject" /></label>
          <textarea class="ta" v-model="draft.html" placeholder="Write your message…"></textarea>
          <p class="muted text-xs mt-1">
            The address's signature is appended automatically — no need to type one.
            <span v-if="draftRestored"> · Draft restored (saved on this device as you type).</span>
          </p>
          <div class="row mt-3">
            <button class="zx-btn sm" :disabled="busy === 'send'" @click="send">
              {{ busy === 'send' ? 'Sending…' : 'Send' }}
            </button>
            <span v-if="openThread" class="muted text-xs self-center">
              Threading headers are set server-side, so the reply lands in this conversation.
            </span>
          </div>
        </div>

        <p v-else-if="!openThread" class="empty">Pick a conversation.</p>

        <!-- thread -->
        <template v-else>
          <div class="thead">
            <h3 class="text-lg font-semibold">{{ openThread.subject || '(no subject)' }}</h3>

            <div class="row mt-2 items-center">
              <span v-for="l in openThread.labels || []" :key="l" class="lchip">
                {{ l }}<button class="lx" :title="`Remove label ${l}`" @click="removeLabel(l)">×</button>
              </span>
              <input v-model="newLabel" class="linput" placeholder="+ label"
                @keyup.enter="addLabel" />
            </div>

            <div class="row mt-2">
              <button class="pill" @click="startReply">Reply</button>
              <button class="pill" @click="assignSelf">Assign to me</button>
              <span class="rel">
                <button class="pill" @click="snoozing = !snoozing">Snooze ▾</button>
                <span v-if="snoozing" class="snoozemenu">
                  <button v-for="c in snoozeChoices()" :key="c.label" class="snoozeopt"
                    @click="snooze(c.until)">{{ c.label }}</button>
                </span>
              </span>
              <button v-if="folder !== 'closed'" class="pill" @click="setStatus('closed')">Close</button>
              <button v-if="folder !== 'spam'" class="pill" @click="setStatus('spam')">Spam</button>
              <button v-if="folder === 'spam' || folder === 'closed' || folder === 'snoozed'" class="pill" @click="setStatus('open')">Move to inbox</button>
            </div>
            <p v-if="openThread.status === 'snoozed' && openThread.snoozed_until" class="muted text-xs mt-1">
              Snoozed until {{ fmt(openThread.snoozed_until) }} — an incoming reply wakes it early.
            </p>
          </div>

          <!-- AI-drafted reply awaiting a decision (D-089) -->
          <div v-if="suggestion" class="aicard">
            <div class="row items-center">
              <strong class="text-sm">🤖 AI-drafted reply</strong>
              <span class="muted text-xs">to {{ suggestion.to_email }} ·
                confidence {{ suggestion.confidence }}/100<template v-if="suggestion.model"> · {{ suggestion.model }}</template></span>
            </div>
            <p v-if="suggestion.reasoning" class="muted text-xs mt-1">{{ suggestion.reasoning }}</p>
            <textarea class="ta mt-2" rows="6" v-model="suggestion.draft_text"></textarea>
            <div class="row mt-2">
              <button class="zx-btn sm" :disabled="busy === 'suggest'" @click="decideAi('approve')">
                {{ busy === 'suggest' ? 'Working…' : 'Approve & send' }}
              </button>
              <button class="pill" :disabled="busy === 'suggest'" @click="decideAi('reject')">Reject</button>
              <span class="muted text-xs self-center">
                Edit freely — what's in the box is what goes out. Signature is appended automatically.
              </span>
            </div>
          </div>

          <article v-for="m in messages" :key="m.id" class="msg" :class="m.direction">
            <div class="mhead">
              <strong class="text-sm">{{ m.direction === 'outbound' ? `${box?.address} → ${(m.to_emails || []).join(', ')}` : who(m) }}</strong>
              <span class="muted text-xs">{{ fmt(m.occurred_at) }}</span>
              <span v-if="m.send_status === 'failed'" class="badge bad" :title="m.send_error">send failed</span>
              <span v-if="m.direction === 'inbound' && m.aura_verdict" class="badge" :class="verdictClass(m.aura_verdict)">
                {{ m.aura_verdict }} {{ m.aura_score }}/100
              </span>
              <button v-if="m.direction === 'inbound'" class="pill ml-auto"
                :disabled="busy === `scan-${m.id}`" @click="rescan(m)">Rescan</button>
            </div>

            <p v-if="m.send_error" class="mini bad-t">{{ m.send_error }}</p>

            <div v-if="m.direction === 'inbound' && hasRemoteImages(m) && !showImages[m.id]" class="imgbar">
              Remote images are blocked — loading them tells the sender you opened this.
              <button class="pill" @click="showImages[m.id] = true">Show images</button>
            </div>

            <!-- Inert by construction: opaque-origin sandbox + CSP + blocked images. -->
            <iframe class="frame" sandbox :srcdoc="frameDoc(m)" :title="`Message from ${who(m)}`"></iframe>

            <div v-if="attachmentsOf(m.id).length" class="atts">
              <button v-for="a in attachmentsOf(m.id)" :key="a.id" class="att"
                :disabled="busy === `att-${a.id}`" @click="download(a)">
                📎 {{ a.filename }}
                <span class="muted">{{ a.size_bytes ? `${Math.ceil(a.size_bytes / 1024)} KB` : '' }}</span>
              </button>
            </div>
          </article>
        </template>
      </main>
    </div>
  </section>
</template>

<style scoped>
.wrap { max-width: 1200px; margin: 0 auto; padding: 26px 20px 40px; }
.head { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 14px; }
.muted { color: var(--xe-text-muted); }
.lnk { color: var(--rr-accent); text-decoration: underline; }
.mini { font-size: 12px; } .bad-t { color: var(--xe-danger); }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
.boxsel { margin-top: 6px; padding: 7px 10px; border-radius: var(--xe-radius); font-size: 13px;
  background: var(--xe-bg-hover); border: 1px solid var(--rr-border); color: var(--rr-text); }

.cols { display: grid; gap: 16px; margin-top: 18px; grid-template-columns: 320px minmax(0, 1fr); }
@media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }

.list { border-radius: var(--xe-radius-lg); background: var(--rr-bg-surface);
  border: 1px solid var(--rr-border); overflow: hidden; align-self: start; }
.tabs { display: flex; gap: 4px; padding: 10px; border-bottom: 1px solid var(--rr-border); }
.tab { flex: 1; padding: 6px 8px; border-radius: var(--xe-radius); font-size: 12px; font-weight: 600;
  cursor: pointer; text-transform: capitalize; background: var(--xe-bg-hover);
  border: 1px solid var(--rr-border); color: var(--xe-text-muted); }
.searchrow { padding: 10px 10px 0; }
.searchbox { width: 100%; padding: 8px 12px; border-radius: var(--xe-radius); font-size: 13px;
  background: var(--rr-bg); border: 1px solid var(--rr-border);
  color: var(--rr-text); outline: none; }
.searchbox:focus { border-color: var(--rr-accent); }
.labelrow { padding: 0 10px 8px; }
.labelsel { width: 100%; padding: 5px 8px; border-radius: var(--xe-radius); font-size: 12px;
  background: var(--rr-bg); border: 1px solid var(--rr-border);
  color: var(--xe-text-muted); }
.lchip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px;
  border-radius: 999px; font-size: 11px; font-weight: 600;
  background: var(--rr-accent-transparent); border: 1px solid var(--rr-border); color: var(--rr-accent); }
.lx { cursor: pointer; background: none; border: 0; color: inherit; font-size: 13px;
  line-height: 1; padding: 0; opacity: .7; }
.lx:hover { opacity: 1; }
.linput { width: 84px; padding: 2px 8px; border-radius: 999px; font-size: 11px;
  background: var(--rr-bg); border: 1px dashed var(--rr-border);
  color: var(--rr-text); outline: none; }
.linput:focus { border-color: var(--rr-accent); border-style: solid; }
.rel { position: relative; }
.aicard { margin: 0 0 14px; padding: 14px 16px; border-radius: var(--xe-radius-lg);
  background: var(--rr-accent-transparent); border: 1px solid var(--rr-border); }
.snoozemenu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 20;
  display: flex; flex-direction: column; min-width: 170px; padding: 4px;
  border-radius: var(--xe-radius); background: var(--xe-bg-elevated);
  border: 1px solid var(--rr-border); box-shadow: var(--xe-shadow); }
.snoozeopt { text-align: left; padding: 7px 10px; border-radius: 7px; font-size: 12.5px;
  cursor: pointer; background: none; border: 0; color: var(--rr-text); }
.snoozeopt:hover { background: var(--rr-accent-transparent); }
.tab.on { background: var(--rr-accent-transparent); border-color: var(--rr-accent); color: var(--rr-accent); }
.ct { opacity: .6; font-size: 11px; font-variant-numeric: tabular-nums; }

.titem { display: block; width: 100%; text-align: left; padding: 11px 13px; cursor: pointer;
  background: transparent; border: 0; border-bottom: 1px solid var(--rr-border); }
.titem:hover { background: var(--xe-bg-hover); }
.titem.on { background: var(--rr-accent-transparent); }
.titem.unread .tsubj { color: var(--rr-text); }
.tsubj { font-size: 13px; font-weight: 600; color: var(--xe-text-muted); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.titem.unread { border-left: 2px solid var(--rr-accent); }
.tmeta { font-size: 11px; color: var(--xe-text-dim); margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.vdot { width: 7px; height: 7px; border-radius: 50%; flex: none; }

.pane { min-width: 0; }
.panel { padding: 18px; border-radius: var(--xe-radius-lg); background: var(--rr-bg-surface);
  border: 1px solid var(--rr-border); }
.thead { padding-bottom: 12px; border-bottom: 1px solid var(--rr-border); }
.empty { padding: 40px 20px; text-align: center; font-size: 13px; color: var(--xe-text-dim); }

.msg { margin-top: 14px; padding: 14px; border-radius: var(--xe-radius); background: var(--xe-bg-elevated);
  border: 1px solid var(--rr-border); }
.msg.outbound { background: var(--rr-accent-transparent); border-color: var(--rr-border); }
.mhead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.verdict { font-size: 12px; margin-bottom: 8px; padding: 8px 11px; border-radius: var(--xe-radius);
  background: var(--rr-bg); color: var(--xe-text-muted); }
.imgbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px;
  margin-bottom: 8px; padding: 8px 11px; border-radius: var(--xe-radius); color: var(--xe-warning);
  background: rgba(245,158,11,.1); border: 1px solid var(--rr-border); }
.frame { width: 100%; height: 380px; border: 0; border-radius: var(--xe-radius); background: #ffffff; }

.atts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.att { padding: 6px 11px; border-radius: var(--xe-radius); font-size: 12px; cursor: pointer;
  background: var(--xe-bg-hover); border: 1px solid var(--rr-border); color: var(--rr-text); }
.att:hover { background: var(--rr-accent-transparent); }

.badge { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; }
.v-ok { background: rgba(16,185,129,.15); color: var(--xe-success); }
.v-promo { background: var(--rr-accent-transparent); color: var(--rr-accent); }
.v-warn { background: rgba(245,158,11,.15); color: var(--xe-warning); }
.v-bad { background: rgba(239,68,68,.15); color: var(--xe-danger); }
.v-unknown { background: var(--xe-bg-hover); color: var(--xe-text-dim); }
.vdot.v-ok { background: var(--xe-success); } .vdot.v-promo { background: var(--rr-accent); }
.vdot.v-warn { background: var(--xe-warning); } .vdot.v-bad { background: var(--xe-danger); }
.vdot.v-unknown { background: var(--xe-text-dim); }
.badge.bad { background: rgba(239,68,68,.15); color: var(--xe-danger); }

.err { margin-top: 14px; padding: 11px 14px; border-radius: var(--xe-radius); font-size: 13px;
  color: var(--xe-danger); background: rgba(239,68,68,.1); border: 1px solid var(--rr-border); }
.ok { margin-top: 14px; padding: 11px 14px; border-radius: var(--xe-radius); font-size: 13px;
  color: var(--xe-success); background: rgba(16,185,129,.1); border: 1px solid var(--rr-border); }
.f { display: block; margin-bottom: 10px; }
.f span { display: block; font-size: 12px; font-weight: 600; color: var(--xe-text-muted); margin-bottom: 4px; }
.f input, .ta { width: 100%; padding: 9px 12px; border-radius: var(--xe-radius); font-size: 14px;
  background: var(--rr-bg);
  border: 1px solid var(--rr-border); color: var(--rr-text); outline: none; }
.f input:focus, .ta:focus { border-color: var(--rr-accent); }
.ta { min-height: 190px; resize: vertical; line-height: 1.6; }
.pill { padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer;
  background: var(--xe-bg-hover); border: 1px solid var(--rr-border);
  color: var(--rr-text); text-decoration: none; white-space: nowrap; }
.pill:hover { background: var(--rr-accent-transparent); }
</style>
