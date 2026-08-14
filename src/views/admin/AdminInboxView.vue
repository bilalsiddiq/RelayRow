<script setup>
// Admin → Inbox. Where receiving domains and email ADDRESSES are managed.  D-073
//
// The thing to understand before reading this: creating `support@zexpo.world` is
// one INSERT. Resend has no per-address resource — MX on a domain is a catch-all,
// and sending is allowed from any address at a verified domain. So an address is
// a row, addresses are unlimited and free, and routing is entirely ours.
//
// Each domain carries its OWN Resend key (write-only: it goes into Supabase Vault
// and only a masked tail comes back) and its own webhook token, so a second product
// can share this deployment on a different Resend account.
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useBrandingStore } from '@/stores/branding'
import {
  listDomains, saveDomain, deleteDomain, setDomainKey, clearDomainKey,
  domainWebhookUrl, testDomainKey, setSigningSecret, inboxStatus,
  listAddresses, saveAddress, deleteAddress,
  listAddressMembers, addAddressMember, removeAddressMember, listMembersForSeats,
  listForwarders, saveForwarder, deleteForwarder,
  listInboxLog,
  listAiProviders, saveAiProvider, deleteAiProvider, setAiKey, clearAiKey, testAiProvider,
  getAiConfig, saveAiConfig, listAiKnowledge, saveAiKnowledge, deleteAiKnowledge,
  AI_PROVIDER_CATALOG, aiCatalogFor,
  listTenants, saveTenant, deleteTenant, listTenantCapacities, saveTenantCapacity,
} from '@/services/inbox'

// ── HOST-APP BINDINGS — routes, tenant label, brand samples; the only app
// coupling in this view. A port edits this block (and nothing below it).
const HOST = {
  appId: 'relayrow-app',
  inboxRoute: '/inbox',
  adminHomeRoute: '/',
  scannerAdminRoute: '',
  sampleName: 'Bilal Siddiq',
  sampleRole: 'Super Admin Owner',
  sampleLocal: 'admin',
}

const brandingStore = useBrandingStore()
const tab = ref('design') // design | tenants | domains | addresses | ai | log
const loading = ref(true)
const error = ref('')
const notice = ref('')
const busy = ref('')

const domains = ref([])
const status = ref(null)
const log = ref([])

// Design system & Branding editing state
const brandEdit = ref({
  appName: brandingStore.branding.appName,
  appUrl: brandingStore.branding.appUrl,
  logoUrl: brandingStore.branding.logoUrl,
  logoSvg: brandingStore.branding.logoSvg,
  accentColor: brandingStore.branding.accentColor,
  surfaceColor: brandingStore.branding.surfaceColor,
  bgColor: brandingStore.branding.bgColor,
  textColor: brandingStore.branding.textColor,
  themePreset: brandingStore.branding.themePreset,
})

// Tenants & Capacities state
const tenants = ref([])
const capacities = ref([])
const newTenant = ref({
  name: '',
  slug: '',
  status: 'active',
  max_domains: 5,
  max_inboxes: 50,
  max_storage_gb: 10,
  max_seats: 20,
})

async function applyPresetTheme(presetId) {
  brandEdit.value.themePreset = presetId
  await brandingStore.updateBranding({ themePreset: presetId })
  brandEdit.value.accentColor = brandingStore.branding.accentColor
  brandEdit.value.surfaceColor = brandingStore.branding.surfaceColor
  brandEdit.value.bgColor = brandingStore.branding.bgColor
  brandEdit.value.textColor = brandingStore.branding.textColor
  flash('Applied theme preset.')
}

async function saveBrandingSettings() {
  await guard('save-branding', async () => {
    await brandingStore.updateBranding({
      appName: brandEdit.value.appName.trim() || 'RelayRow',
      appUrl: brandEdit.value.appUrl.trim() || 'https://RelayRow.com',
      logoUrl: brandEdit.value.logoUrl.trim(),
      logoSvg: brandEdit.value.logoSvg.trim(),
      accentColor: brandEdit.value.accentColor,
      surfaceColor: brandEdit.value.surfaceColor,
      bgColor: brandEdit.value.bgColor,
      textColor: brandEdit.value.textColor,
    })
    flash('Design system & branding updated successfully!')
  })
}

async function loadTenantsData() {
  await guard('tenants', async () => {
    tenants.value = await listTenants()
    capacities.value = await listTenantCapacities()
  })
}

async function createTenant() {
  if (!newTenant.value.name.trim() || !newTenant.value.slug.trim()) {
    error.value = 'Please provide tenant name and slug.'
    return
  }
  await guard('add-tenant', async () => {
    const created = await saveTenant({
      name: newTenant.value.name.trim(),
      slug: newTenant.value.slug.trim().toLowerCase(),
      status: newTenant.value.status,
    })
    if (created?.id) {
      await saveTenantCapacity({
        tenant_id: created.id,
        max_domains: Number(newTenant.value.max_domains) || 5,
        max_inboxes: Number(newTenant.value.max_inboxes) || 50,
        max_storage_gb: Number(newTenant.value.max_storage_gb) || 10,
        max_seats: Number(newTenant.value.max_seats) || 20,
      })
    }
    newTenant.value = { name: '', slug: '', status: 'active', max_domains: 5, max_inboxes: 50, max_storage_gb: 10, max_seats: 20 }
    await loadTenantsData()
    flash('Tenant and capacities created successfully!')
  })
}

async function updateCapacities(cap) {
  await guard(`cap-${cap.id}`, async () => {
    await saveTenantCapacity({
      id: cap.id,
      tenant_id: cap.tenant_id,
      max_domains: Number(cap.max_domains),
      max_inboxes: Number(cap.max_inboxes),
      max_storage_gb: Number(cap.max_storage_gb),
      max_seats: Number(cap.max_seats),
    })
    flash('Tenant capacities saved.')
  })
}

async function removeTenant(t) {
  if (!window.confirm(`Delete tenant "${t.name}"?`)) return
  await guard(`del-tenant-${t.id}`, async () => {
    await deleteTenant(t.id)
    await loadTenantsData()
    flash('Tenant deleted.')
  })
}

function getCapForTenant(tenantId) {
  return capacities.value.find(c => c.tenant_id === tenantId) || {
    max_domains: 5, max_inboxes: 50, max_storage_gb: 10, max_seats: 20
  }
}

const newDomain = ref({ domain: '', label: '', default_from_name: '', app_id: HOST.appId })
const keyInput = ref({})          // domain_id → pasted key
const webhook = ref({})           // domain_id → url
const keyTest = ref({})           // domain_id → last test result
const signInput = ref({})         // domain_id → pasted Svix signing secret

async function saveSigningSecret(d) {
  await guard(`sign-${d.id}`, async () => {
    const r = await setSigningSecret(d.id, (signInput.value[d.id] || '').trim())
    signInput.value[d.id] = ''
    flash(r.signing === 'enforced'
      ? 'Signing secret stored — the webhook now also verifies Resend\'s Svix signature.'
      : 'Signing secret cleared — webhook auth is URL-token only again.')
  })
}

// addresses tab
const activeDomainId = ref('')
const addresses = ref([])
const newAddress = ref({ local_part: '', display_name: '', designation: '', kind: 'shared' })
const openAddressId = ref('')
const seats = ref([])
const memberSearch = ref('')
const memberHits = ref([])
const forwarders = ref([])
const newForward = ref({ target_email: '', keep_local: true, include_spam: false })

const activeDomain = computed(() => domains.value.find((d) => d.id === activeDomainId.value) || null)
const openAddress = computed(() => addresses.value.find((a) => a.id === openAddressId.value) || null)

function flash(msg) { notice.value = msg; setTimeout(() => { if (notice.value === msg) notice.value = '' }, 4000) }
async function guard(name, fn) {
  busy.value = name; error.value = ''
  try { return await fn() } catch (e) { error.value = e.message } finally { busy.value = '' }
}

async function load() {
  loading.value = true; error.value = ''
  try {
    domains.value = await listDomains()
    if (!activeDomainId.value && domains.value.length) activeDomainId.value = domains.value[0].id
    try { status.value = await inboxStatus() } catch { status.value = null }
  } catch (e) { error.value = e.message } finally { loading.value = false }
}
onMounted(load)

// ── domains ────────────────────────────────────────────────────────────────
async function addDomain() {
  if (!newDomain.value.domain.trim()) return
  await guard('add-domain', async () => {
    await saveDomain({ ...newDomain.value, domain: newDomain.value.domain.trim().toLowerCase() })
    newDomain.value = { domain: '', label: '', default_from_name: '', app_id: HOST.appId }
    await load()
    flash('Domain added. Paste its Resend key, then set the MX + webhook.')
  })
}

async function patchDomain(d, patch) {
  await guard(`d-${d.id}`, async () => {
    await saveDomain({ id: d.id, ...patch })
    Object.assign(d, patch)
  })
}

const sigOpen = ref({})           // domain_id → signature editor expanded
async function saveSignature(d) {
  await guard(`sig-${d.id}`, async () => {
    await saveDomain({ id: d.id, signature_html: d.signature_html || null, signature_text: d.signature_text || null })
    flash('Signature saved — every address on this domain now signs with it.')
  })
}

const fillSigPreview = (tpl, d) => (tpl || '')
  .replace(/\{\{\s*name\s*\}\}/gi, HOST.sampleName)
  .replace(/\{\{\s*designation\s*\}\}/gi, HOST.sampleRole)
  .replace(/\{\{\s*email\s*\}\}/gi, `${HOST.sampleLocal}@${d.domain}`)
  .trim()

function sigPreviewHtml(d) {
  const sig = fillSigPreview(d.signature_html, d)
  const body = sig
    ? `<p style="color:#555">…the message text ends here.</p><div class="sig">${sig}</div>`
    : `<p style="color:#999">No HTML signature — emails go out unsigned.</p>`
  return `<!doctype html><html><head><meta charset="utf-8">`
    + `<style>body{margin:0;padding:14px;background:#fff;color:#16181d;`
    + `font:14px/1.6 Arial,Helvetica,sans-serif;word-break:break-word}</style>`
    + `</head><body>${body}</body></html>`
}

function sigPreviewText(d) {
  const sig = fillSigPreview(d.signature_text, d)
  return sig
    ? `…the message text ends here.\n\n-- \n${sig}`
    : '(no plain-text signature)'
}

async function saveKey(d) {
  const k = (keyInput.value[d.id] || '').trim()
  if (!k) return
  await guard(`key-${d.id}`, async () => {
    await setDomainKey(d.id, k)
    keyInput.value[d.id] = ''
    await load()
    flash('Key stored in Vault. It cannot be read back — only replaced.')
  })
}

async function dropKey(d) {
  await guard(`key-${d.id}`, async () => { await clearDomainKey(d.id); await load() })
}

async function showWebhook(d) {
  await guard(`hook-${d.id}`, async () => {
    const r = await domainWebhookUrl(d.id)
    webhook.value[d.id] = r.url
  })
}

async function runTest(d) {
  await guard(`test-${d.id}`, async () => { keyTest.value[d.id] = await testDomainKey(d.id) })
}

async function removeDomain(d) {
  if (!window.confirm(`Delete ${d.domain}? Every address, thread and message on it goes too.`)) return
  await guard(`d-${d.id}`, async () => {
    await deleteDomain(d.id)
    if (activeDomainId.value === d.id) activeDomainId.value = ''
    await load()
  })
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); flash('Copied.') } catch { /* clipboard blocked */ }
}

// ── addresses ──────────────────────────────────────────────────────────────
async function loadAddresses() {
  if (!activeDomainId.value) { addresses.value = []; return }
  await guard('addresses', async () => { addresses.value = await listAddresses(activeDomainId.value) })
}

async function addAddress() {
  const lp = newAddress.value.local_part.trim().toLowerCase()
  if (!lp || !activeDomainId.value) return
  await guard('add-address', async () => {
    await saveAddress({ ...newAddress.value, local_part: lp, domain_id: activeDomainId.value })
    newAddress.value = { local_part: '', display_name: '', designation: '', kind: 'shared' }
    await loadAddresses()
    flash('Address created — no DNS, no provisioning, it can receive immediately.')
  })
}

async function patchAddress(a, patch) {
  await guard(`a-${a.id}`, async () => { await saveAddress({ id: a.id, ...patch }); Object.assign(a, patch) })
}

async function removeAddress(a) {
  if (!window.confirm(`Delete ${a.address} and all of its threads?`)) return
  await guard(`a-${a.id}`, async () => {
    await deleteAddress(a.id)
    if (openAddressId.value === a.id) openAddressId.value = ''
    await loadAddresses()
  })
}

async function openDetail(a) {
  openAddressId.value = openAddressId.value === a.id ? '' : a.id
  if (!openAddressId.value) return
  await guard('detail', async () => {
    seats.value = await listAddressMembers(a.id)
    forwarders.value = await listForwarders(a.id)
    addrKnowledge.value = await listAiKnowledge(a.id)
  })
}

// ── AI tab (D-089) ──────────────────────────────────────────────────────────
const aiProviders = ref([])
const aiCfg = ref(null)
const aiKeyInput = ref({})        // provider_id → pasted key
const aiTest = ref({})            // provider_id → last test result
const newProvider = ref({ catalogId: 'anthropic', model: AI_PROVIDER_CATALOG[0].models[0].id,
  customModel: '', key: '', label: '', base_url: '' })
const newCatalog = computed(() =>
  AI_PROVIDER_CATALOG.find((c) => c.id === newProvider.value.catalogId) || AI_PROVIDER_CATALOG[0])
function onCatalogPick() {
  newProvider.value.model = newCatalog.value.models[0]?.id || ''
  newProvider.value.customModel = ''
}
const centralKnowledge = ref([])
const newKnowledge = ref({ title: '', content: '' })
const addrKnowledge = ref([])     // knowledge of the open address
const newAddrKnowledge = ref({ title: '', content: '' })

async function loadAi() {
  await guard('ai', async () => {
    aiProviders.value = await listAiProviders()
    aiCfg.value = await getAiConfig()
    centralKnowledge.value = await listAiKnowledge(null)
  })
}

async function addProvider() {
  const cat = newCatalog.value
  const isCustom = cat.id === 'custom'
  const model = (newProvider.value.model === '__custom' || isCustom
    ? newProvider.value.customModel : newProvider.value.model).trim()
  const key = newProvider.value.key.trim()
  if (!model) { error.value = 'Pick or type a model.'; return }
  if (!key) { error.value = 'Paste the API key.'; return }
  await guard('add-provider', async () => {
    const row = await saveAiProvider({
      label: isCustom ? (newProvider.value.label.trim() || 'Custom') : cat.label,
      kind: cat.kind,
      model,
      base_url: isCustom ? (newProvider.value.base_url.trim() || null) : cat.base_url,
      priority: (aiProviders.value.length + 1) * 10,
    })
    await setAiKey(row.id, key)
    await saveAiProvider({ id: row.id, is_enabled: true })
    newProvider.value = { catalogId: 'anthropic', model: AI_PROVIDER_CATALOG[0].models[0].id,
      customModel: '', key: '', label: '', base_url: '' }
    aiProviders.value = await listAiProviders()
    aiTest.value[row.id] = await testAiProvider(row.id).catch((e) => ({ ok: false, error: e.message }))
    flash(aiTest.value[row.id]?.ok
      ? `${cat.label} is connected and answering.`
      : 'Provider added — the self-test failed, check the key/model below.')
  })
}

function modelOptions(p) {
  const cat = aiCatalogFor(p)
  const base = cat ? [...cat.models] : []
  if (p.model && !base.some((m) => m.id === p.model)) base.unshift({ id: p.model, label: p.model })
  return base
}

async function patchProvider(p, patch) {
  await guard(`p-${p.id}`, async () => { await saveAiProvider({ id: p.id, ...patch }); Object.assign(p, patch) })
}

async function removeProvider(p) {
  if (!window.confirm(`Remove provider ${p.label}?`)) return
  await guard(`p-${p.id}`, async () => {
    await deleteAiProvider(p.id)
    aiProviders.value = await listAiProviders()
  })
}

async function storeAiKey(p) {
  const key = (aiKeyInput.value[p.id] || '').trim()
  if (!key) return
  await guard(`pkey-${p.id}`, async () => {
    await setAiKey(p.id, key)
    aiKeyInput.value[p.id] = ''
    aiProviders.value = await listAiProviders()
    flash('Key stored in Vault — enable the provider and Test.')
  })
}

async function dropAiKey(p) {
  await guard(`pkey-${p.id}`, async () => {
    await clearAiKey(p.id)
    aiProviders.value = await listAiProviders()
  })
}

async function runAiTest(p) {
  await guard(`ptest-${p.id}`, async () => { aiTest.value[p.id] = await testAiProvider(p.id) })
}

async function saveCfg() {
  await guard('ai-cfg', async () => {
    const { id, updated_at, updated_by, ...patch } = aiCfg.value
    await saveAiConfig(patch)
    flash('AI settings saved.')
  })
}

async function addKnowledgeRow(address_id, form) {
  if (!form.value.title.trim() || !form.value.content.trim()) return
  await guard('knowledge', async () => {
    await saveAiKnowledge({ address_id, title: form.value.title.trim(), content: form.value.content })
    form.value = { title: '', content: '' }
    if (address_id) addrKnowledge.value = await listAiKnowledge(address_id)
    else centralKnowledge.value = await listAiKnowledge(null)
  })
}

async function patchKnowledge(k) {
  await guard(`k-${k.id}`, async () => {
    await saveAiKnowledge({ id: k.id, title: k.title, content: k.content, is_active: k.is_active })
    flash('Knowledge saved.')
  })
}

async function removeKnowledge(k) {
  await guard(`k-${k.id}`, async () => {
    await deleteAiKnowledge(k.id)
    if (k.address_id) addrKnowledge.value = await listAiKnowledge(k.address_id)
    else centralKnowledge.value = await listAiKnowledge(null)
  })
}

async function findMembers() {
  await guard('members', async () => { memberHits.value = await listMembersForSeats(memberSearch.value) })
}

async function grantSeat(m, role = 'agent') {
  await guard('seat', async () => {
    await addAddressMember(openAddressId.value, m.id, role)
    seats.value = await listAddressMembers(openAddressId.value)
    memberHits.value = []; memberSearch.value = ''
  })
}

async function revokeSeat(s) {
  await guard('seat', async () => {
    await removeAddressMember(s.address_id, s.member_id)
    seats.value = await listAddressMembers(openAddressId.value)
  })
}

async function addForward() {
  if (!newForward.value.target_email.trim()) return
  await guard('forward', async () => {
    await saveForwarder({ ...newForward.value, address_id: openAddressId.value })
    newForward.value = { target_email: '', keep_local: true, include_spam: false }
    forwarders.value = await listForwarders(openAddressId.value)
    flash('Forwarder added. A copy of arriving mail is re-sent there.')
  })
}

async function patchForward(f, patch) {
  await guard(`f-${f.id}`, async () => { await saveForwarder({ id: f.id, ...patch }); Object.assign(f, patch) })
}

async function removeForward(f) {
  await guard(`f-${f.id}`, async () => {
    await deleteForwarder(f.id)
    forwarders.value = await listForwarders(openAddressId.value)
  })
}

async function loadLog() {
  await guard('log', async () => { log.value = await listInboxLog(80) })
}

function pick(t) {
  tab.value = t
  if (t === 'addresses') loadAddresses()
  if (t === 'tenants') loadTenantsData()
  if (t === 'log') loadLog()
  if (t === 'ai' && !aiCfg.value) loadAi()
}

const fmt = (s) => (s ? new Date(s).toLocaleString() : '—')
</script>

<template>
  <section class="mx-auto max-w-5xl px-6 py-10">
    <header class="flex flex-wrap items-end gap-4">
      <div>
        <h2 class="text-2xl font-bold">RelayRow Management Console</h2>
        <p class="mt-1 text-sm text-white/55">
          Super Admin Control — Design System, Branding, Tenant Capacities, Domains, & AI Automation.
        </p>
      </div>
      <RouterLink :to="HOST.inboxRoute" class="pill ml-auto">Open inbox →</RouterLink>
    </header>

    <div class="tabs">
      <button v-for="t in ['design', 'tenants', 'domains', 'addresses', 'ai', 'log']" :key="t"
        class="tab" :class="{ on: tab === t }" @click="pick(t)">
        <template v-if="t === 'design'">🎨 Design System</template>
        <template v-else-if="t === 'tenants'">🏢 Tenants & Capacities</template>
        <template v-else-if="t === 'ai'">🤖 AI Automation</template>
        <template v-else>{{ t }}</template>
      </button>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="notice" class="ok">{{ notice }}</p>
    <p v-if="loading" class="muted">Loading…</p>

    <!-- ── DOMAINS ───────────────────────────────────────────────────────── -->
    <div v-else-if="tab === 'domains'" class="panel">
      <div v-if="status" class="badges">
        <span class="badge" :class="status.domains_receiving ? 'good' : 'bad'">
          {{ status.domains_receiving }}/{{ status.domains }} receiving
        </span>
        <span class="badge good">{{ status.addresses }} addresses</span>
        <span class="badge" :class="status.scanner.ready ? 'good' : 'bad'">
          AURA scanner: {{ status.scanner.ready ? 'ready' : 'not ready' }}
        </span>
      </div>

      <p v-if="status && !status.scanner.ready" class="warn">
        <strong>The scanner will return “unknown”.</strong>
        {{ !status.scanner.feature_enabled ? 'The `inbox_scanner` feature is disabled' : 'No AURA provider has a key' }} —
        <template v-if="HOST.scannerAdminRoute">enable it in <RouterLink :to="HOST.scannerAdminRoute" class="lnk">Admin → AURA</RouterLink>.</template>
        Mail still arrives and is still stored; it just gets the deterministic checks only
        (failed SPF/DKIM, reply-to mismatch, executable attachments) instead of a model verdict.
      </p>

      <!-- add -->
      <div class="sub">
        <h3>Add a domain</h3>
        <p class="muted text-xs mb-2">
          Resend strongly recommends a <strong>subdomain</strong> (<code>mail.zexpo.world</code>) rather
          than the root: enabling inbound on a domain captures <em>all</em> mail for it, so the root can
          never also hold Google Workspace mailboxes.
        </p>
        <div class="grid2">
          <label class="f"><span>Domain</span>
            <input v-model="newDomain.domain" placeholder="mail.zexpo.world" /></label>
          <label class="f"><span>Label</span>
            <input v-model="newDomain.label" placeholder="Zexpo — main" /></label>
          <label class="f"><span>Default From name</span>
            <input v-model="newDomain.default_from_name" placeholder="Zexpo" /></label>
          <label class="f"><span>App id (tenant)</span>
            <input v-model="newDomain.app_id" placeholder="zexpo" /></label>
        </div>
        <button class="zx-btn sm" :disabled="busy === 'add-domain'" @click="addDomain">
          {{ busy === 'add-domain' ? 'Adding…' : 'Add domain' }}
        </button>
      </div>

      <p v-if="!domains.length" class="muted mt-4">No domains yet.</p>

      <div v-for="d in domains" :key="d.id" class="card">
        <div class="row items-center">
          <strong>{{ d.domain }}</strong>
          <span class="muted text-xs">{{ d.label }} · {{ d.app_id }}</span>
          <span class="badge ml-auto" :class="d.resend_key_tail ? 'good' : 'bad'">
            key: {{ d.resend_key_tail || 'not set' }}
          </span>
          <span class="badge" :class="d.key_status === 'healthy' ? 'good' : 'bad'">{{ d.key_status }}</span>
        </div>

        <!-- key -->
        <div class="row mt-3">
          <input class="grow" v-model="keyInput[d.id]" type="password" autocomplete="off"
            :placeholder="d.resend_key_tail ? 'Type a new key to replace it' : 're_…'" />
          <button class="zx-btn sm" :disabled="busy === `key-${d.id}`" @click="saveKey(d)">Store key</button>
          <button v-if="d.resend_key_tail" class="pill" @click="dropKey(d)">Clear</button>
          <button class="pill" :disabled="busy === `test-${d.id}`" @click="runTest(d)">Test</button>
        </div>
        <p v-if="keyTest[d.id]" class="mini" :class="keyTest[d.id].ok ? 'good-t' : 'bad-t'">
          {{ keyTest[d.id].ok ? 'Key works.' : `Key error: ${keyTest[d.id].error}` }}
          <template v-if="keyTest[d.id].verified_in_resend">
            · {{ d.domain }} is <strong>{{ keyTest[d.id].verified_in_resend }}</strong> in Resend.
          </template>
          <template v-else-if="keyTest[d.id].ok">
            · <strong>{{ d.domain }} is not in this Resend account</strong> — add and verify it there first.
          </template>
          <span v-if="keyTest[d.id].note"> {{ keyTest[d.id].note }}</span>
        </p>

        <!-- webhook -->
        <div class="row mt-3">
          <button class="pill" :disabled="busy === `hook-${d.id}`" @click="showWebhook(d)">
            Show webhook URL
          </button>
          <template v-if="webhook[d.id]">
            <input class="grow mono" :value="webhook[d.id]" readonly />
            <button class="pill" @click="copy(webhook[d.id])">Copy</button>
          </template>
        </div>
        <p v-if="webhook[d.id]" class="mini muted">
          Paste into Resend → Webhooks, subscribed to <code>email.received</code>. The token in the URL
          is this domain's credential — treat it like a key.
        </p>

        <!-- optional second factor: Svix signature verification -->
        <div class="row mt-2">
          <input class="grow" v-model="signInput[d.id]" type="password" autocomplete="off"
            placeholder="whsec_… (optional — Resend webhook signing secret; blank + Store = off)" />
          <button class="pill" :disabled="busy === `sign-${d.id}`" @click="saveSigningSecret(d)">
            Store signing secret
          </button>
        </div>

        <!-- switches -->
        <div class="row mt-3 gap-4">
          <label class="chk"><input type="checkbox" :checked="d.inbound_enabled"
            @change="patchDomain(d, { inbound_enabled: $event.target.checked })" /> Receiving</label>
          <label class="chk"><input type="checkbox" :checked="d.outbound_enabled"
            @change="patchDomain(d, { outbound_enabled: $event.target.checked })" /> Sending</label>
          <label class="chk"><input type="checkbox" :checked="d.scan_enabled"
            @change="patchDomain(d, { scan_enabled: $event.target.checked })" /> AURA scan</label>
          <label class="chk">Spam at
            <input class="num" type="number" min="1" max="100" :value="d.spam_threshold"
              @change="patchDomain(d, { spam_threshold: Number($event.target.value) })" />/100</label>
          <label class="chk">Unknown recipient
            <select :value="d.unknown_recipient"
              @change="patchDomain(d, { unknown_recipient: $event.target.value })">
              <option value="catch_all">→ catch-all</option>
              <option value="drop">drop</option>
            </select>
          </label>
          <button class="pill danger ml-auto" @click="removeDomain(d)">Delete</button>
        </div>

        <!-- signature template: one design for every address on the domain -->
        <div class="mt-3">
          <button class="pill" @click="sigOpen[d.id] = !sigOpen[d.id]">
            {{ sigOpen[d.id] ? 'Hide signature' : (d.signature_html || d.signature_text ? 'Signature ✓' : 'Signature') }}
          </button>
        </div>
        <div v-if="sigOpen[d.id]" class="detail">
          <p class="muted text-xs">
            Appended to every email sent from this domain. Placeholders are filled per address:
            <code v-pre>{{name}}</code> <code v-pre>{{designation}}</code> <code v-pre>{{email}}</code>.
            An address with its own signature overrides this.
          </p>
          <div class="sigcols">
            <label class="f"><span>HTML variation</span>
              <textarea class="ta" rows="7" v-model="d.signature_html"
                placeholder="&lt;p&gt;&lt;strong&gt;{{name}}&lt;/strong&gt;&lt;br&gt;{{designation}} · Zexpo&lt;br&gt;&lt;a href='mailto:{{email}}'&gt;{{email}}&lt;/a&gt;&lt;/p&gt;"></textarea></label>
            <div class="f"><span>Preview <em class="muted">(sample identity)</em></span>
              <iframe class="sigframe" sandbox :srcdoc="sigPreviewHtml(d)" title="HTML signature preview"></iframe>
            </div>
            <label class="f"><span>Plain-text variation</span>
              <textarea class="ta" rows="6" v-model="d.signature_text"
                placeholder="{{name}}&#10;{{designation}} · Zexpo&#10;{{email}}"></textarea></label>
            <div class="f"><span>Preview</span>
              <pre class="sigpre">{{ sigPreviewText(d) }}</pre>
            </div>
          </div>
          <button class="zx-btn sm" :disabled="busy === `sig-${d.id}`" @click="saveSignature(d)">
            {{ busy === `sig-${d.id}` ? 'Saving…' : 'Save signature' }}
          </button>
        </div>

        <p v-if="d.last_error" class="mini bad-t">{{ d.last_error }}</p>
      </div>
    </div>

    <!-- ── ADDRESSES ─────────────────────────────────────────────────────── -->
    <div v-else-if="tab === 'addresses'" class="panel">
      <label class="f"><span>Domain</span>
        <select v-model="activeDomainId" @change="openAddressId = ''; loadAddresses()">
          <option v-for="d in domains" :key="d.id" :value="d.id">{{ d.domain }}</option>
        </select>
      </label>

      <p v-if="!activeDomain" class="muted">Add a domain first.</p>

      <template v-else>
        <div class="sub">
          <h3>Create an address</h3>
          <div class="grid2">
            <label class="f"><span>Local part</span>
              <input v-model="newAddress.local_part" :placeholder="`support   →  support@${activeDomain.domain}`" /></label>
            <label class="f"><span>Display name</span>
              <input v-model="newAddress.display_name" placeholder="Zexpo Support" /></label>
            <label class="f"><span>Designation</span>
              <input v-model="newAddress.designation" placeholder="Customer Support · fills {{designation}} in the signature" /></label>
            <label class="f"><span>Kind</span>
              <select v-model="newAddress.kind">
                <option value="shared">shared — a team mailbox (support@, info@)</option>
                <option value="personal">personal — one person (bilal@)</option>
                <option value="system">system — automated (no-reply@)</option>
                <option value="alias">alias</option>
              </select>
            </label>
          </div>
          <button class="zx-btn sm" :disabled="busy === 'add-address'" @click="addAddress">
            {{ busy === 'add-address' ? 'Creating…' : 'Create address' }}
          </button>
        </div>

        <p v-if="!addresses.length" class="muted mt-4">
          No addresses on this domain. Mail to it will be dropped and logged.
        </p>

        <div v-for="a in addresses" :key="a.id" class="card">
          <div class="row items-center">
            <strong>{{ a.address }}</strong>
            <span class="muted text-xs">{{ a.display_name }}<template v-if="a.designation"> — {{ a.designation }}</template> · {{ a.kind }}</span>
            <span v-if="a.is_catch_all" class="badge good">catch-all</span>
            <span v-if="!a.is_active" class="badge bad">off</span>
            <button class="pill ml-auto" @click="openDetail(a)">
              {{ openAddressId === a.id ? 'Close' : 'Seats & forwarding' }}
            </button>
          </div>

          <div class="row mt-2 gap-4">
            <label class="chk"><input type="checkbox" :checked="a.is_active"
              @change="patchAddress(a, { is_active: $event.target.checked })" /> Active</label>
            <label class="chk"><input type="checkbox" :checked="a.is_catch_all"
              @change="patchAddress(a, { is_catch_all: $event.target.checked })" /> Catch-all</label>
            <label class="chk"><input type="checkbox" :checked="a.scan_enabled"
              @change="patchAddress(a, { scan_enabled: $event.target.checked })" /> AURA scan</label>
            <button class="pill danger ml-auto" @click="removeAddress(a)">Delete</button>
          </div>

          <!-- seats + forwarders -->
          <div v-if="openAddressId === a.id" class="detail">
            <h4>Identity (fills the domain signature)</h4>
            <div class="grid2">
              <label class="f"><span>Display name</span>
                <input v-model="a.display_name" placeholder="Bilal Siddiq" /></label>
              <label class="f"><span>Designation</span>
                <input v-model="a.designation" placeholder="Founder & CEO" /></label>
            </div>
            <button class="zx-btn sm mb-4" :disabled="busy === `a-${a.id}`"
              @click="patchAddress(a, { display_name: a.display_name || null, designation: a.designation || null })">
              Save identity
            </button>

            <h4>AI replies</h4>
            <p class="muted text-xs">
              <code>draft</code> queues suggestions for approval (in the app, or Slack if a webhook
              is set); <code>auto</code> sends on its own at/above the confidence bar and drafts
              below it. Needs an enabled provider in the AI tab.
            </p>
            <div class="row items-center">
              <select :value="a.ai_reply_mode || 'off'"
                @change="patchAddress(a, { ai_reply_mode: $event.target.value })">
                <option value="off">off — humans only</option>
                <option value="draft">draft — AI suggests, a human approves</option>
                <option value="auto">auto — AI sends when confident, drafts otherwise</option>
              </select>
            </div>

            <h4 class="mt-4">Mailbox knowledge <span class="muted text-xs">— only this address's AI sees these (central knowledge in the AI tab applies too)</span></h4>
            <div v-for="k in addrKnowledge" :key="k.id" class="card">
              <div class="row items-center">
                <input class="grow" v-model="k.title" />
                <label class="chk"><input type="checkbox" v-model="k.is_active" /> Active</label>
                <button class="pill" :disabled="busy === `k-${k.id}`" @click="patchKnowledge(k)">Save</button>
                <button class="pill danger" @click="removeKnowledge(k)">Delete</button>
              </div>
              <textarea class="ta mt-2" rows="3" v-model="k.content"></textarea>
            </div>
            <div class="row mt-1">
              <input class="grow" v-model="newAddrKnowledge.title" placeholder="Title (e.g. Booth pricing for this show)" />
            </div>
            <textarea class="ta mt-2" rows="3" v-model="newAddrKnowledge.content"
              placeholder="Content — the AI treats it as ground truth for this mailbox"></textarea>
            <button class="zx-btn sm mt-2 mb-4" :disabled="busy === 'knowledge'"
              @click="addKnowledgeRow(a.id, newAddrKnowledge)">Add mailbox knowledge</button>

            <h4>Who can read and reply</h4>
            <p class="muted text-xs">
              This list is the only thing separating this mailbox from another person's —
              RLS reads it directly. <code>viewer</code> reads; <code>agent</code> also replies;
              <code>owner</code> also manages forwarding.
            </p>
            <div v-for="s in seats" :key="s.member_id" class="line">
              <div class="min-w-0">
                <strong class="text-sm">{{ s.members?.display_name || s.member_id }}</strong>
                <span class="muted text-xs"> · {{ s.members?.email }} · {{ s.role }}</span>
              </div>
              <button class="pill ml-auto" @click="revokeSeat(s)">Remove</button>
            </div>
            <p v-if="!seats.length" class="muted text-xs">
              Nobody yet — only super admins can see this mailbox.
            </p>

            <div class="row mt-2">
              <input class="grow" v-model="memberSearch" placeholder="Search members by name or email"
                @keyup.enter="findMembers" />
              <button class="pill" @click="findMembers">Find</button>
            </div>
            <div v-for="m in memberHits" :key="m.id" class="line">
              <div class="min-w-0">
                <strong class="text-sm">{{ m.display_name || '(no name)' }}</strong>
                <span class="muted text-xs"> · {{ m.email }}</span>
              </div>
              <button class="pill ml-auto" @click="grantSeat(m, 'agent')">+ agent</button>
              <button class="pill" @click="grantSeat(m, 'viewer')">+ viewer</button>
              <button class="pill" @click="grantSeat(m, 'owner')">+ owner</button>
            </div>

            <h4 class="mt-5">Forwarding</h4>
            <p class="muted text-xs">
              A copy of arriving mail is re-sent to an outside address, so it can be read in Gmail or
              Outlook. The forward's <code>From</code> is this address (SPF/DKIM must align) with the
              original sender in <code>Reply-To</code> — so replying from there answers the sender
              directly, from that person's own address, outside the team thread.
            </p>
            <div v-for="f in forwarders" :key="f.id" class="line">
              <div class="min-w-0">
                <strong class="text-sm">{{ f.target_email }}</strong>
                <span class="muted text-xs">
                  · {{ f.forward_count }} sent · {{ f.keep_local ? 'kept in inbox' : 'forward only' }}
                </span>
                <p v-if="f.last_error" class="mini bad-t">{{ f.last_error }}</p>
              </div>
              <label class="chk ml-auto"><input type="checkbox" :checked="f.is_active"
                @change="patchForward(f, { is_active: $event.target.checked })" /> on</label>
              <label class="chk"><input type="checkbox" :checked="f.include_spam"
                @change="patchForward(f, { include_spam: $event.target.checked })" /> incl. spam</label>
              <button class="pill danger" @click="removeForward(f)">Remove</button>
            </div>
            <div class="row mt-2">
              <input class="grow" v-model="newForward.target_email" placeholder="someone@gmail.com" />
              <label class="chk"><input type="checkbox" v-model="newForward.keep_local" /> keep in inbox</label>
              <button class="pill" :disabled="busy === 'forward'" @click="addForward">Add</button>
            </div>

            <h4 class="mt-5">Signature</h4>
            <textarea class="ta" :value="a.signature_html || ''"
              placeholder="<p>— The Zexpo team</p>"
              @change="patchAddress(a, { signature_html: $event.target.value || null })"></textarea>
          </div>
        </div>
      </template>
    </div>

    <!-- ── AI ────────────────────────────────────────────────────────────── -->
    <div v-else-if="tab === 'ai'" class="panel">
      <p class="muted text-xs mb-4">
        The inbox's own AI: bring any LLM API key (keys live in Vault, write-only), tune how it
        behaves, feed it knowledge, and choose per address whether it drafts replies for approval
        or sends on its own. Everything below the confidence bar always waits for a human.
      </p>

      <!-- providers: preconfigured catalog — pick, paste the key, choose a model -->
      <div class="sub">
        <h3>Add a provider <span class="muted text-xs">— just the API key; endpoints are preconfigured</span></h3>
        <div class="grid2">
          <label class="f"><span>Provider</span>
            <select v-model="newProvider.catalogId" @change="onCatalogPick">
              <option v-for="c in AI_PROVIDER_CATALOG" :key="c.id" :value="c.id">{{ c.label }}</option>
            </select></label>
          <label class="f" v-if="newCatalog.id !== 'custom'"><span>Model</span>
            <select v-model="newProvider.model">
              <option v-for="m in newCatalog.models" :key="m.id" :value="m.id">{{ m.label }}</option>
              <option value="__custom">custom model id…</option>
            </select></label>
          <label class="f" v-if="newProvider.model === '__custom' || newCatalog.id === 'custom'">
            <span>Model id</span>
            <input v-model="newProvider.customModel" placeholder="exact model id" /></label>
          <template v-if="newCatalog.id === 'custom'">
            <label class="f"><span>Label</span>
              <input v-model="newProvider.label" placeholder="My Ollama box" /></label>
            <label class="f"><span>Base URL <em class="muted">(incl. version path)</em></span>
              <input v-model="newProvider.base_url" placeholder="https://host/v1" /></label>
          </template>
          <label class="f"><span>API key
            <em v-if="newCatalog.keyFrom" class="muted">— from {{ newCatalog.keyFrom }}</em></span>
            <input v-model="newProvider.key" type="password" autocomplete="off"
              :placeholder="newCatalog.keyHint" /></label>
        </div>
        <button class="zx-btn sm" :disabled="busy === 'add-provider'" @click="addProvider">
          {{ busy === 'add-provider' ? 'Connecting…' : 'Add & connect' }}
        </button>
        <span class="muted text-xs ml-2">Stores the key in Vault, enables the provider and runs a self-test.</span>
      </div>

      <p v-if="!aiProviders.length" class="muted mt-3">
        No providers yet — the scanner falls back to the host gateway or plain heuristics, and
        auto-reply stays dormant.
      </p>

      <div v-for="p in aiProviders" :key="p.id" class="card">
        <div class="row items-center">
          <strong>{{ p.label }}</strong>
          <span class="muted text-xs">{{ p.kind }} · {{ p.model }}<template v-if="p.base_url"> · {{ p.base_url }}</template></span>
          <span class="badge ml-auto" :class="p.key_tail ? 'good' : 'bad'">key: {{ p.key_tail || 'not set' }}</span>
          <span class="badge" :class="p.is_enabled ? 'good' : 'bad'">{{ p.is_enabled ? 'enabled' : 'off' }}</span>
        </div>
        <div class="row mt-3">
          <input class="grow" v-model="aiKeyInput[p.id]" type="password" autocomplete="off"
            :placeholder="p.key_tail ? 'Type a new key to replace it' : 'sk-… / api key'" />
          <button class="zx-btn sm" :disabled="busy === `pkey-${p.id}`" @click="storeAiKey(p)">Store key</button>
          <button v-if="p.key_tail" class="pill" @click="dropAiKey(p)">Clear</button>
          <button class="pill" :disabled="busy === `ptest-${p.id}` || !p.key_tail" @click="runAiTest(p)">Test</button>
        </div>
        <p v-if="aiTest[p.id]" class="mini" :class="aiTest[p.id].ok ? 'good-t' : 'bad-t'">
          {{ aiTest[p.id].ok ? `Answered as ${aiTest[p.id].provider}.` : `Failed: ${aiTest[p.id].error}` }}
        </p>
        <div class="row mt-2 gap-4">
          <label class="chk"><input type="checkbox" :checked="p.is_enabled"
            @change="patchProvider(p, { is_enabled: $event.target.checked })" /> Enabled</label>
          <label class="chk">Model
            <select :value="p.model" @change="patchProvider(p, { model: $event.target.value })">
              <option v-for="m in modelOptions(p)" :key="m.id" :value="m.id">{{ m.label }}</option>
            </select></label>
          <label class="chk">Priority
            <input class="num" type="number" min="1" max="999" :value="p.priority"
              @change="patchProvider(p, { priority: Number($event.target.value) })" /></label>
          <span v-if="p.last_error" class="mini bad-t self-center">{{ p.last_error }}</span>
          <button class="pill danger ml-auto" @click="removeProvider(p)">Delete</button>
        </div>
      </div>

      <!-- behaviour -->
      <div v-if="aiCfg" class="sub mt-4">
        <h3>Behaviour</h3>
        <label class="f"><span>Persona — who the assistant is and how it writes</span>
          <textarea class="ta" rows="4" v-model="aiCfg.persona"></textarea></label>
        <div class="grid2">
          <label class="f"><span>Temperature (0 = strict, 1 = loose)</span>
            <input type="number" step="0.1" min="0" max="1" v-model.number="aiCfg.temperature" /></label>
          <label class="f"><span>Max reply tokens</span>
            <input type="number" min="100" max="4000" v-model.number="aiCfg.max_tokens" /></label>
          <label class="f"><span>Thread history the model sees (messages)</span>
            <input type="number" min="1" max="50" v-model.number="aiCfg.history_messages" /></label>
          <label class="f"><span>Auto-send only at confidence ≥</span>
            <input type="number" min="1" max="100" v-model.number="aiCfg.auto_min_confidence" /></label>
          <label class="f"><span>Max AI replies per sender per day</span>
            <input type="number" min="1" max="20" v-model.number="aiCfg.max_auto_per_sender_day" /></label>
          <label class="f"><span>App URL (deep links in notifications)</span>
            <input v-model="aiCfg.app_url" placeholder="https://zexpo.world" /></label>
        </div>
        <label class="f"><span>Slack webhook URL — approval requests are posted there with one-time Approve/Reject links</span>
          <input v-model="aiCfg.slack_webhook_url" type="password" autocomplete="off"
            placeholder="https://hooks.slack.com/services/… (blank = off)" /></label>
        <button class="zx-btn sm" :disabled="busy === 'ai-cfg'" @click="saveCfg">
          {{ busy === 'ai-cfg' ? 'Saving…' : 'Save settings' }}
        </button>
      </div>

      <!-- central knowledge -->
      <div class="sub mt-4">
        <h3>Central knowledge <span class="muted text-xs">— every mailbox's AI sees these; per-mailbox knowledge lives on the address (Addresses → open one)</span></h3>
        <div v-for="k in centralKnowledge" :key="k.id" class="card">
          <div class="row items-center">
            <input class="grow" v-model="k.title" />
            <label class="chk"><input type="checkbox" v-model="k.is_active" /> Active</label>
            <button class="pill" :disabled="busy === `k-${k.id}`" @click="patchKnowledge(k)">Save</button>
            <button class="pill danger" @click="removeKnowledge(k)">Delete</button>
          </div>
          <textarea class="ta mt-2" rows="4" v-model="k.content"></textarea>
        </div>
        <label class="f"><span>New entry — title</span>
          <input v-model="newKnowledge.title" placeholder="Pricing / What Zexpo is / Refund policy…" /></label>
        <label class="f"><span>Content (plain text; the AI treats it as ground truth)</span>
          <textarea class="ta" rows="4" v-model="newKnowledge.content"></textarea></label>
        <button class="zx-btn sm" :disabled="busy === 'knowledge'" @click="addKnowledgeRow(null, newKnowledge)">
          Add central knowledge
        </button>
      </div>
    </div>

    <!-- ── LOG ───────────────────────────────────────────────────────────── -->
    <div v-else class="panel">
      <div class="row mb-3">
        <button class="zx-btn ghost sm" :disabled="busy === 'log'" @click="loadLog">Refresh</button>
        <span class="muted text-xs self-center">
          Every webhook decision. If a message “never arrived”, this says whether it was
          dropped, deduped or failed — and why.
        </span>
      </div>
      <p v-if="!log.length" class="muted">Nothing received yet.</p>
      <div v-for="r in log" :key="r.id" class="line">
        <span class="dot" :class="r.action"></span>
        <div class="min-w-0">
          <strong class="text-sm">{{ r.action }}</strong>
          <span class="muted text-xs"> · {{ r.to_email || r.domain }}<template v-if="r.from_email"> ← {{ r.from_email }}</template></span>
          <p v-if="r.detail" class="muted text-xs mt-0.5">{{ r.detail }}</p>
        </div>
        <span class="muted text-xs ml-auto whitespace-nowrap">{{ fmt(r.ts) }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.muted { color: rgba(226,238,255,.5); }
.lnk { color: #9df5e2; text-decoration: underline; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.mini { font-size: 12px; margin-top: 6px; }
.good-t { color: #86d7b0; } .bad-t { color: #ff9ea1; }
.tabs { display: flex; gap: 6px; margin: 22px 0 16px; }
.tab { padding: 7px 15px; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer;
  text-transform: capitalize; background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.1); color: rgba(226,238,255,.7); }
.tab.on { background: rgba(16,185,129,.18); border-color: rgba(94,234,212,.45); color: #9df5e2; }
.panel { padding: 20px; border-radius: 14px; background: rgba(255,255,255,.035);
  border: 1px solid rgba(255,255,255,.08); }
.sub { margin: 18px 0; padding: 16px; border-radius: 12px; background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.07); }
.sub h3 { font-size: 13px; font-weight: 700; margin-bottom: 8px; }
.card { margin-top: 14px; padding: 15px; border-radius: 12px; background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.08); }
.detail { margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,.08); }
/* signature editor: editor left, live preview right; stacks when narrow */
.sigcols { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); margin-bottom: 4px; }
.sigframe { width: 100%; height: 160px; border: 0; border-radius: 10px; background: #fff; }
.sigpre { white-space: pre-wrap; margin: 0; min-height: 120px; padding: 10px 12px; border-radius: 10px;
  font: 12.5px/1.6 ui-monospace, Consolas, monospace; color: rgba(226,238,255,.8);
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); }
.detail h4 { font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .04em; color: rgba(226,238,255,.6); margin-bottom: 4px; }
.badges { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.badge { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
.badge.good { background: rgba(63,143,107,.22); color: #86d7b0; }
.badge.bad { background: rgba(199,154,62,.18); color: #e3c07a; }
.warn { margin-bottom: 16px; padding: 11px 14px; border-radius: 11px; font-size: 13px;
  color: rgba(255,225,180,.9); background: rgba(199,154,62,.1); border: 1px solid rgba(199,154,62,.3); }
/* Sticky: an action deep in the page (a seat grant, a forwarder) must surface its
   result where the admin is looking, not scrolled away at the top. */
.err { margin-top: 14px; padding: 11px 14px; border-radius: 11px; font-size: 13px;
  position: sticky; top: 12px; z-index: 30; backdrop-filter: blur(6px);
  color: #ff9ea1; background: rgba(60,16,18,.92); border: 1px solid rgba(229,72,77,.4); }
.ok { margin-top: 14px; padding: 11px 14px; border-radius: 11px; font-size: 13px;
  position: sticky; top: 12px; z-index: 30; backdrop-filter: blur(6px);
  color: #86d7b0; background: rgba(14,42,30,.92); border: 1px solid rgba(63,143,107,.4); }
.grid2 { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
.f { display: block; margin-bottom: 12px; }
.f span { display: block; font-size: 12px; font-weight: 600; color: rgba(226,238,255,.55); margin-bottom: 5px; }
.f input, .f select, input, select, .ta { background: var(--zx-field-bg, rgba(255,255,255,.05));
  border: 1px solid var(--zx-field-border, rgba(255,255,255,.13)); color: #e7ecff; outline: none; }
.f input, .f select { width: 100%; padding: 9px 12px; border-radius: 10px; font-size: 14px; }
input { padding: 8px 11px; border-radius: 9px; font-size: 13px; }
select { padding: 7px 10px; border-radius: 9px; font-size: 13px; }
.f input:focus, input:focus { border-color: rgba(94,234,212,.5); }
.grow { flex: 1 1 220px; min-width: 0; }
.num { width: 62px; }
.ta { width: 100%; min-height: 70px; padding: 9px 12px; border-radius: 10px; font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; resize: vertical; }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
.chk { display: inline-flex; align-items: center; gap: 5px; font-size: 12px;
  color: rgba(226,238,255,.7); white-space: nowrap; }
.chk input { width: auto; }
.line { display: flex; align-items: flex-start; gap: 10px; padding: 9px 0;
  border-bottom: 1px solid rgba(255,255,255,.06); }
.line:last-child { border-bottom: 0; }
.dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex: none; background: #6b7280; }
.dot.stored, .dot.sent, .dot.forwarded, .dot.scanned { background: #3f8f6b; }
.dot.error, .dot.send_failed, .dot.forward_failed, .dot.scan_failed { background: #e5484d; }
.dot.dropped, .dot.duplicate { background: #c79a3e; }
.pill { padding: 6px 12px; border-radius: 9px; font-size: 12px; font-weight: 600; cursor: pointer;
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12);
  color: #e7ecff; text-decoration: none; white-space: nowrap; }
.pill:hover { background: rgba(255,255,255,.11); }
.pill.danger { color: #ff9ea1; border-color: rgba(229,72,77,.3); }

/* ── RelayRow Design System Editor Styles ── */
.desc { font-size: 13px; color: var(--xe-text-muted); margin-top: 4px; }
.input-text { width: 100%; padding: 9px 12px; border-radius: 8px; font-size: 13px;
  background: rgba(255,255,255,.05); border: 1px solid var(--rr-border, rgba(255,255,255,.12)); color: var(--rr-text); outline: none; }
.input-text:focus { border-color: var(--rr-accent); }

.preset-card { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px;
  border-radius: 10px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); cursor: pointer; transition: all 0.2s; }
.preset-card:hover { border-color: var(--rr-accent); background: rgba(255,255,255,.08); }
.preset-card.active { border-color: var(--rr-accent); background: var(--rr-accent-transparent); }
.preset-color { width: 24px; height: 24px; border-radius: 50%; border: 2px solid rgba(255,255,255,.3); }
.preset-name { font-size: 11px; font-weight: 600; text-align: center; color: var(--xe-text); }

.color-picker { width: 34px; height: 34px; padding: 0; border: none; border-radius: 6px; cursor: pointer; background: transparent; }

.theme-preview-box { padding: 16px; border-radius: 12px; background: var(--rr-bg-surface); border: 1px solid var(--rr-border); }
.btn { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; transition: all 0.2s; }
.btn.primary { background: var(--rr-accent); color: #fff; }
.btn.primary:hover { opacity: 0.9; }
.btn.secondary { background: rgba(255,255,255,.08); color: var(--rr-text); border: 1px solid var(--rr-border); }
.btn.danger { background: rgba(239,68,68,.15); color: #ef4444; border: 1px solid rgba(239,68,68,.3); }

.primary-preview { background: var(--rr-accent); color: #fff; }
.secondary-preview { background: rgba(255,255,255,.08); color: var(--rr-text); border: 1px solid var(--rr-border); }
.preview-badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; background: var(--rr-accent-transparent); color: var(--rr-accent); }
.preview-input { padding: 6px 12px; border-radius: 8px; font-size: 12px; background: var(--rr-bg); border: 1px solid var(--rr-accent); color: var(--rr-text); }
</style>

