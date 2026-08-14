<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import {
  listDomains, saveDomain, deleteDomain, testDomainKey, setDomainKey, clearDomainKey,
  domainWebhookUrl, setSigningSecret,
  listAddresses, saveAddress, deleteAddress
} from '@/services/inbox'

const loading = ref(true)
const error = ref('')
const notice = ref('')
const busy = ref('')

const domains = ref([])
const addresses = ref([])
const openDomainId = ref(null)

const newDomain = ref({ domain: '', label: '', default_from_name: '', unknown_recipient: 'bounce' })
const newAddr = ref({ address: '', display_name: '', is_catch_all: false })
const domainKeyInput = ref({})
const signingSecretInput = ref({})

async function loadData() {
  loading.value = true
  try {
    const [dList, aList] = await Promise.all([
      listDomains().catch(() => []),
      listAddresses().catch(() => []),
    ])
    domains.value = dList || []
    addresses.value = aList || []
  } catch (err) {
    error.value = err.message || 'Failed to load domain data'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

async function addDomain() {
  if (!newDomain.value.domain.trim()) return
  busy.value = 'add-domain'
  error.value = ''; notice.value = ''
  try {
    await saveDomain(newDomain.value)
    notice.value = 'Domain added successfully!'
    newDomain.value = { domain: '', label: '', default_from_name: '', unknown_recipient: 'bounce' }
    await loadData()
  } catch (err) {
    error.value = err.message || 'Failed to add domain'
  } finally {
    busy.value = ''
  }
}

async function removeDomain(d) {
  if (!confirm(`Delete domain ${d.domain}?`)) return
  busy.value = `del-d-${d.id}`
  try {
    await deleteDomain(d.id)
    await loadData()
  } catch (err) {
    error.value = err.message || 'Failed to delete domain'
  } finally {
    busy.value = ''
  }
}

async function updateDomainKey(d) {
  const k = (domainKeyInput.value[d.id] || '').trim()
  if (!k) return
  busy.value = `key-${d.id}`
  try {
    await setDomainKey(d.id, k)
    notice.value = 'Resend API key updated in Vault!'
    domainKeyInput.value[d.id] = ''
    await loadData()
  } catch (err) {
    error.value = err.message || 'Failed to update key'
  } finally {
    busy.value = ''
  }
}

async function addAddr() {
  if (!newAddr.value.address.trim() || !openDomainId.value) return
  busy.value = 'add-addr'
  error.value = ''; notice.value = ''
  try {
    await saveAddress({ ...newAddr.value, domain_id: openDomainId.value })
    notice.value = 'Email address created!'
    newAddr.value = { address: '', display_name: '', is_catch_all: false }
    await loadData()
  } catch (err) {
    error.value = err.message || 'Failed to create email address'
  } finally {
    busy.value = ''
  }
}

async function removeAddr(a) {
  if (!confirm(`Delete address ${a.address}?`)) return
  busy.value = `del-a-${a.id}`
  try {
    await deleteAddress(a.id)
    await loadData()
  } catch (err) {
    error.value = err.message || 'Failed to delete address'
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <section class="mx-auto max-w-5xl">
    <header class="flex flex-wrap items-center justify-between gap-4 mb-10 pb-5 border-b border-white/10">
      <div>
        <h2 class="text-2xl font-extrabold flex items-center gap-2 tracking-tight">
          <span>🌐</span> Receiving Domains & Email Addresses
        </h2>
        <p class="mt-2 text-sm text-white/60 leading-relaxed">
          Manage custom mail domains, Resend Vault API keys, address routing, and catch-all mailboxes.
        </p>
      </div>
      <RouterLink to="/inbox" class="pill">Open Inbox →</RouterLink>
    </header>

    <p v-if="error" class="err mb-6">{{ error }}</p>
    <p v-if="notice" class="ok mb-6">{{ notice }}</p>
    <p v-if="loading" class="muted">Loading domains and addresses…</p>

    <template v-else>
      <!-- ── DOMAINS ─────────────────────────────────────────────────────── -->
      <div class="panel mb-8">
        <h3 class="text-base font-bold mb-1">Add Receiving Subdomain</h3>
        <p class="muted text-xs mb-4">Add your custom receiving domain (e.g. <code>mail.company.com</code>).</p>

        <div class="grid2 gap-4">
          <label class="f"><span>Domain</span><input v-model="newDomain.domain" placeholder="mail.company.com" /></label>
          <label class="f"><span>Label</span><input v-model="newDomain.label" placeholder="Company Inbound" /></label>
          <label class="f"><span>Default From Name</span><input v-model="newDomain.default_from_name" placeholder="Company Support" /></label>
          <label class="f"><span>Unknown Recipient Behavior</span>
            <select v-model="newDomain.unknown_recipient">
              <option value="bounce">Bounce</option>
              <option value="catch_all">Route to Catch-All</option>
              <option value="drop">Silently Drop</option>
            </select>
          </label>
        </div>
        <button class="pill primary mt-4" :disabled="busy === 'add-domain'" @click="addDomain">
          Add Domain
        </button>

        <div class="grid grid-cols-1 gap-4 mt-6">
          <div v-for="d in domains" :key="d.id" class="p-4 rounded-xl bg-black/20 border border-white/10">
            <div class="flex flex-wrap justify-between items-center mb-2">
              <div>
                <strong class="text-base font-bold">{{ d.domain }}</strong>
                <span class="muted text-xs ml-2">Label: {{ d.label || '—' }}</span>
              </div>
              <button class="btn-text danger text-xs" @click="removeDomain(d)">Delete Domain</button>
            </div>

            <div class="grid2 gap-3 mt-3">
              <div class="f">
                <span>Resend Vault API Key</span>
                <div class="flex gap-2">
                  <input v-model="domainKeyInput[d.id]" type="password" placeholder="re_123456789..." class="text-xs" />
                  <button class="pill primary" :disabled="busy === `key-${d.id}`" @click="updateDomainKey(d)">Save Key</button>
                </div>
              </div>
              <div class="f">
                <span>Webhook Ingestion URL</span>
                <input :value="domainWebhookUrl(d.id)" readonly class="text-xs select-all bg-black/40" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── EMAIL ADDRESSES & SEATS ────────────────────────────────────── -->
      <div class="panel">
        <h3 class="text-base font-bold mb-1">Create Email Address</h3>
        <p class="muted text-xs mb-4">Create unlimited custom email seats (e.g. <code>support@mail.company.com</code>).</p>

        <div class="grid2 gap-4">
          <label class="f"><span>Select Domain</span>
            <select v-model="openDomainId">
              <option :value="null" disabled>Choose a domain...</option>
              <option v-for="d in domains" :key="d.id" :value="d.id">{{ d.domain }}</option>
            </select>
          </label>
          <label class="f"><span>Full Email Address</span><input v-model="newAddr.address" placeholder="support@mail.company.com" /></label>
          <label class="f"><span>Display Name</span><input v-model="newAddr.display_name" placeholder="Acme Support" /></label>
        </div>
        <button class="pill primary mt-4" :disabled="busy === 'add-addr' || !openDomainId" @click="addAddr">
          Create Address
        </button>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <div v-for="a in addresses" :key="a.id" class="p-4 rounded-xl bg-black/20 border border-white/10 flex justify-between items-center">
            <div>
              <strong class="text-sm font-bold">{{ a.address }}</strong>
              <div class="muted text-xs">{{ a.display_name || 'No display name' }}</div>
            </div>
            <button class="btn-text danger text-xs" @click="removeAddr(a)">Delete</button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.panel {
  padding: 24px;
  border-radius: var(--xe-radius-lg);
  background: var(--rr-bg-surface);
  border: 1px solid var(--rr-border);
}
.muted { color: var(--xe-text-muted); }

.f { display: block; }
.f span { display: block; font-size: 12px; font-weight: 600; color: var(--xe-text-muted); margin-bottom: 6px; }
.f input, .f select {
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--xe-radius);
  font-size: 14px;
  background: var(--rr-bg);
  border: 1px solid var(--rr-border);
  color: var(--rr-text);
  outline: none;
}
.f input:focus, .f select:focus { border-color: var(--rr-accent); }

.pill {
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: var(--xe-bg-hover);
  border: 1px solid var(--rr-border);
  color: var(--rr-text);
  text-decoration: none;
}
.pill.primary {
  background: var(--rr-accent);
  color: #ffffff;
  border: none;
}
.pill:hover { opacity: 0.9; }

.btn-text.danger { color: var(--xe-danger); background: none; border: none; cursor: pointer; }
.err { padding: 10px 14px; border-radius: var(--xe-radius); background: rgba(239, 68, 68, 0.15); color: var(--xe-danger); font-size: 13px; }
.ok { padding: 10px 14px; border-radius: var(--xe-radius); background: rgba(16, 185, 129, 0.15); color: var(--xe-success); font-size: 13px; }
.grid2 { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
</style>
