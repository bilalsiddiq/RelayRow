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

const newDomain = ref({ domain: '', label: '', default_from_name: '', unknown_recipient: 'catch_all' })
const newAddr = ref({ address: '', display_name: '', is_catch_all: false })
const domainKeyInput = ref({})

const showDnsGuide = ref({})
const copiedField = ref('')

function toggleDnsGuide(domainId) {
  showDnsGuide.value[domainId] = !showDnsGuide.value[domainId]
}

function copyText(txt, label) {
  navigator.clipboard.writeText(txt)
  copiedField.value = label
  setTimeout(() => { copiedField.value = '' }, 2000)
}

async function loadData() {
  loading.value = true
  try {
    const [dList, aList] = await Promise.all([
      listDomains().catch(() => []),
      listAddresses().catch(() => []),
    ])
    domains.value = dList || []
    addresses.value = aList || []
    if (domains.value.length && !openDomainId.value) {
      openDomainId.value = domains.value[0].id
    }
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
    newDomain.value = { domain: '', label: '', default_from_name: '', unknown_recipient: 'catch_all' }
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
  <section class="mx-auto max-w-6xl">
    <header class="flex flex-wrap items-center justify-between gap-4 mb-10 pb-5 border-b border-white/10">
      <div>
        <h2 class="text-2xl font-extrabold flex items-center gap-2 tracking-tight">
          <span>🌐</span> Receiving Domains & Email Addresses
        </h2>
        <p class="mt-2 text-sm text-white/60 leading-relaxed">
          Manage custom mail domains, Resend Vault API keys, address routing, and catch-all mailboxes.
        </p>
      </div>
      <RouterLink to="/inbox" class="zx-btn secondary">Open Inbox →</RouterLink>
    </header>

    <p v-if="error" class="err mb-6">{{ error }}</p>
    <p v-if="notice" class="ok mb-6">{{ notice }}</p>
    <p v-if="loading" class="muted text-sm">Loading domains and addresses…</p>

    <template v-else>
      <!-- ── DOMAINS ─────────────────────────────────────────────────────── -->
      <div class="zx-panel mb-8">
        <h3 class="text-base font-bold mb-1">Add Receiving Subdomain</h3>
        <p class="muted text-xs mb-4">Add your custom receiving domain (e.g. <code>mail.company.com</code>).</p>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <label class="zx-field">
            <span>Domain</span>
            <input v-model="newDomain.domain" class="zx-input" placeholder="mail.company.com" />
          </label>
          <label class="zx-field">
            <span>Label</span>
            <input v-model="newDomain.label" class="zx-input" placeholder="Company Inbound" />
          </label>
          <label class="zx-field">
            <span>Default From Name</span>
            <input v-model="newDomain.default_from_name" class="zx-input" placeholder="Company Support" />
          </label>
          <label class="zx-field">
            <span>Unknown Recipient Behavior</span>
            <select v-model="newDomain.unknown_recipient" class="zx-select">
              <option value="bounce">Bounce</option>
              <option value="catch_all">Route to Catch-All</option>
              <option value="drop">Silently Drop</option>
            </select>
          </label>
        </div>
        <button class="zx-btn primary mt-4" :disabled="busy === 'add-domain'" @click="addDomain">
          Add Domain
        </button>

        <div class="grid grid-cols-1 gap-4 mt-6">
          <div v-for="d in domains" :key="d.id" class="zx-card">
            <div class="flex flex-wrap justify-between items-center mb-3">
              <div class="flex items-center gap-3">
                <strong class="text-base font-bold text-white">{{ d.domain }}</strong>
                <span class="zx-badge zx-badge-accent">{{ d.label || 'Inbound' }}</span>
              </div>
              <button class="zx-btn danger text-xs" @click="removeDomain(d)">Delete Domain</button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 pt-3 border-t border-white/10">
              <div class="zx-field">
                <span>Resend Vault API Key</span>
                <div class="flex gap-2">
                  <input v-model="domainKeyInput[d.id]" type="password" placeholder="re_123456789..." class="zx-input text-xs" />
                  <button class="zx-btn primary text-xs" :disabled="busy === `key-${d.id}`" @click="updateDomainKey(d)">Save Key</button>
                </div>
              </div>
              <div class="zx-field">
                <span>Webhook Ingestion URL</span>
                <input :value="domainWebhookUrl(d.id)" readonly class="zx-input text-xs select-all bg-black/50 text-cyan-300 font-mono" />
              </div>
            </div>

            <!-- DNS Setup Guidelines Drawer Button -->
            <div class="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
              <button class="zx-btn secondary text-xs" @click="toggleDnsGuide(d.id)">
                <span>⚡ {{ showDnsGuide[d.id] ? 'Hide DNS & MX Instructions' : '📖 View DNS & MX Setup Guidelines' }}</span>
              </button>
              <span class="text-xs text-white/50">Required for routing live emails</span>
            </div>

            <!-- DNS Setup Guidelines Drawer Content -->
            <div v-if="showDnsGuide[d.id]" class="mt-4 p-4 rounded-xl bg-black/60 border border-cyan-500/30 text-xs">
              <h4 class="text-sm font-bold text-cyan-300 mb-2 flex items-center gap-2">
                <span>📋</span> Required DNS Records for <code class="text-white">{{ d.domain }}</code>
              </h4>
              <p class="text-white/70 mb-4 leading-relaxed">
                Add the following DNS records in your domain registrar (Cloudflare, Namecheap, GoDaddy, AWS Route 53) to route incoming emails to RelayRow via Resend catch-all webhooks:
              </p>

              <!-- Table of DNS Records -->
              <div class="overflow-x-auto mb-4">
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr class="border-b border-white/10 text-white/50 text-[11px] uppercase">
                      <th class="py-2 px-2">Type</th>
                      <th class="py-2 px-2">Host / Name</th>
                      <th class="py-2 px-2">Value / Target</th>
                      <th class="py-2 px-2">Priority</th>
                      <th class="py-2 px-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-white/5 font-mono">
                    <!-- MX Record -->
                    <tr>
                      <td class="py-2.5 px-2 font-bold text-amber-400">MX</td>
                      <td class="py-2.5 px-2 text-white">@ <span class="text-white/40">(or {{ d.domain }})</span></td>
                      <td class="py-2.5 px-2 text-cyan-300">inbound.resend.com</td>
                      <td class="py-2.5 px-2 text-white">10</td>
                      <td class="py-2.5 px-2 text-right">
                        <button class="zx-btn secondary text-[11px] py-1 px-2" @click="copyText('inbound.resend.com', `mx-${d.id}`)">
                          {{ copiedField === `mx-${d.id}` ? '✓ Copied' : 'Copy Target' }}
                        </button>
                      </td>
                    </tr>

                    <!-- SPF Record -->
                    <tr>
                      <td class="py-2.5 px-2 font-bold text-emerald-400">TXT</td>
                      <td class="py-2.5 px-2 text-white">@ <span class="text-white/40">(or {{ d.domain }})</span></td>
                      <td class="py-2.5 px-2 text-cyan-300">v=spf1 include:amazonses.com ~all</td>
                      <td class="py-2.5 px-2 text-white">—</td>
                      <td class="py-2.5 px-2 text-right">
                        <button class="zx-btn secondary text-[11px] py-1 px-2" @click="copyText('v=spf1 include:amazonses.com ~all', `spf-${d.id}`)">
                          {{ copiedField === `spf-${d.id}` ? '✓ Copied' : 'Copy Value' }}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Resend Webhook Configuration Instructions -->
              <div class="p-3 rounded-lg bg-indigo-950/40 border border-indigo-500/30">
                <h5 class="font-bold text-indigo-300 mb-1 flex items-center gap-1.5">
                  <span>🔗</span> Resend Inbound Webhook Setup
                </h5>
                <ol class="list-decimal list-inside space-y-1 text-white/80 leading-relaxed pl-1">
                  <li>Log into your <strong>Resend Dashboard</strong> ➔ <strong>Webhooks</strong>.</li>
                  <li>Click <strong>Add Webhook</strong> and paste your RelayRow Webhook URL:
                    <code class="block mt-1 p-2 rounded bg-black/60 text-cyan-300 select-all font-mono text-[11px]">{{ domainWebhookUrl(d.id) }}</code>
                  </li>
                  <li>Select event: <code>email.received</code>.</li>
                  <li>Copy your Resend API Key into the <strong>Resend Vault API Key</strong> field above.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── EMAIL ADDRESSES & SEATS ────────────────────────────────────── -->
      <div class="zx-panel">
        <h3 class="text-base font-bold mb-1">Create Email Address</h3>
        <p class="muted text-xs mb-4">Create unlimited custom email seats (e.g. <code>support@mail.company.com</code>).</p>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label class="zx-field">
            <span>Select Domain</span>
            <select v-model="openDomainId" class="zx-select">
              <option :value="null" disabled>Choose a domain...</option>
              <option v-for="d in domains" :key="d.id" :value="d.id">{{ d.domain }}</option>
            </select>
          </label>
          <label class="zx-field">
            <span>Full Email Address</span>
            <input v-model="newAddr.address" class="zx-input" placeholder="support@mail.company.com" />
          </label>
          <label class="zx-field">
            <span>Display Name</span>
            <input v-model="newAddr.display_name" class="zx-input" placeholder="Acme Support" />
          </label>
        </div>
        <button class="zx-btn primary mt-4" :disabled="busy === 'add-addr' || !openDomainId" @click="addAddr">
          Create Address
        </button>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-6">
          <div v-for="a in addresses" :key="a.id" class="zx-card flex justify-between items-center">
            <div>
              <strong class="text-sm font-bold text-white">{{ a.address }}</strong>
              <div class="muted text-xs mt-0.5">{{ a.display_name || 'No display name' }}</div>
            </div>
            <button class="zx-btn danger text-xs" @click="removeAddr(a)">Delete</button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.muted { color: var(--xe-text-muted); }
.err { padding: 10px 14px; border-radius: var(--xe-radius); background: rgba(239, 68, 68, 0.15); color: var(--xe-danger); font-size: 13px; border: 1px solid rgba(239, 68, 68, 0.3); }
.ok { padding: 10px 14px; border-radius: var(--xe-radius); background: rgba(16, 185, 129, 0.15); color: var(--xe-success); font-size: 13px; border: 1px solid rgba(16, 185, 129, 0.3); }
</style>
