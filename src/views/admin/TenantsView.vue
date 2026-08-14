<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import {
  listTenants, saveTenant, deleteTenant,
  listMembershipPlans, saveMembershipPlan, deleteMembershipPlan
} from '@/services/inbox'

const loading = ref(true)
const error = ref('')
const notice = ref('')
const busy = ref('')

const tenants = ref([])
const plans = ref([])

const newTenant = ref({ name: '', slug: '' })
const newPlan = ref({
  name: '', slug: '', price_monthly: 29, price_yearly: 290,
  max_domains: 5, max_inboxes: 20, max_seats: 10, monthly_ai_credits: 5000,
})

async function loadData() {
  loading.value = true
  try {
    const [tList, pList] = await Promise.all([
      listTenants().catch(() => []),
      listMembershipPlans().catch(() => []),
    ])
    tenants.value = tList || []
    plans.value = pList || []
  } catch (err) {
    error.value = err.message || 'Failed to load tenant data'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

async function createTenant() {
  if (!newTenant.value.name.trim() || !newTenant.value.slug.trim()) return
  busy.value = 'add-tenant'
  error.value = ''; notice.value = ''
  try {
    await saveTenant(newTenant.value)
    notice.value = 'Tenant account created successfully!'
    newTenant.value = { name: '', slug: '' }
    await loadData()
  } catch (err) {
    error.value = err.message || 'Failed to create tenant'
  } finally {
    busy.value = ''
  }
}

async function removeTenant(t) {
  if (!confirm(`Delete tenant ${t.name}?`)) return
  busy.value = `del-t-${t.id}`
  try {
    await deleteTenant(t.id)
    await loadData()
  } catch (err) {
    error.value = err.message || 'Failed to delete tenant'
  } finally {
    busy.value = ''
  }
}

async function createPlan() {
  if (!newPlan.value.name.trim() || !newPlan.value.slug.trim()) return
  busy.value = 'add-plan'
  error.value = ''; notice.value = ''
  try {
    await saveMembershipPlan(newPlan.value)
    notice.value = 'Membership plan saved successfully!'
    await loadData()
  } catch (err) {
    error.value = err.message || 'Failed to save plan'
  } finally {
    busy.value = ''
  }
}

async function removePlan(p) {
  if (!confirm(`Delete plan ${p.name}?`)) return
  busy.value = `del-p-${p.id}`
  try {
    await deleteMembershipPlan(p.id)
    await loadData()
  } catch (err) {
    error.value = err.message || 'Failed to delete plan'
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
          <span>🏢</span> Multi-Tenant Accounts & Membership Plans
        </h2>
        <p class="mt-2 text-sm text-white/60 leading-relaxed">
          Manage member organizations, capacity quotas, and subscription pricing plans.
        </p>
      </div>
      <RouterLink to="/inbox" class="zx-btn secondary">Open Inbox →</RouterLink>
    </header>

    <p v-if="error" class="err mb-6">{{ error }}</p>
    <p v-if="notice" class="ok mb-6">{{ notice }}</p>
    <p v-if="loading" class="muted text-sm">Loading tenants and subscription plans…</p>

    <template v-else>
      <!-- ── TENANTS ─────────────────────────────────────────────────────── -->
      <div class="zx-panel mb-8">
        <h3 class="text-base font-bold mb-1">Create Member Organization Account</h3>
        <p class="muted text-xs mb-4">Add a new tenant account to the platform.</p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label class="zx-field">
            <span>Organization Name</span>
            <input v-model="newTenant.name" class="zx-input" placeholder="Acme Inc" />
          </label>
          <label class="zx-field">
            <span>Slug Identifier</span>
            <input v-model="newTenant.slug" class="zx-input" placeholder="acme" />
          </label>
        </div>
        <button class="zx-btn primary mt-4" :disabled="busy === 'add-tenant'" @click="createTenant">
          Create Tenant
        </button>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-6">
          <div v-for="t in tenants" :key="t.id" class="zx-card flex justify-between items-center">
            <div>
              <strong class="text-base font-bold text-white">{{ t.name }}</strong>
              <div class="muted text-xs mt-0.5">Slug: <code class="text-cyan-300">{{ t.slug }}</code></div>
            </div>
            <button class="zx-btn danger text-xs" @click="removeTenant(t)">Delete</button>
          </div>
        </div>
      </div>

      <!-- ── MEMBERSHIP PLANS ────────────────────────────────────────────── -->
      <div class="zx-panel">
        <h3 class="text-base font-bold mb-1">Membership Plans & Pricing Tiers</h3>
        <p class="muted text-xs mb-4">Define subscription plans, prices, and resource quotas.</p>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <label class="zx-field"><span>Plan Name</span><input v-model="newPlan.name" class="zx-input" placeholder="Pro Business" /></label>
          <label class="zx-field"><span>Slug</span><input v-model="newPlan.slug" class="zx-input" placeholder="pro" /></label>
          <label class="zx-field"><span>Monthly Price ($)</span><input v-model="newPlan.price_monthly" type="number" class="zx-input" /></label>
          <label class="zx-field"><span>Yearly Price ($)</span><input v-model="newPlan.price_yearly" type="number" class="zx-input" /></label>
          <label class="zx-field"><span>Max Domains</span><input v-model="newPlan.max_domains" type="number" class="zx-input" /></label>
          <label class="zx-field"><span>Max Inboxes</span><input v-model="newPlan.max_inboxes" type="number" class="zx-input" /></label>
          <label class="zx-field"><span>Max Seats</span><input v-model="newPlan.max_seats" type="number" class="zx-input" /></label>
          <label class="zx-field"><span>Monthly AI Credits</span><input v-model="newPlan.monthly_ai_credits" type="number" class="zx-input" /></label>
        </div>
        <button class="zx-btn primary mt-4" :disabled="busy === 'add-plan'" @click="createPlan">
          Save Membership Plan
        </button>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div v-for="p in plans" :key="p.id" class="zx-card">
            <div class="flex justify-between items-center mb-2">
              <strong class="text-base font-bold text-white">{{ p.name }}</strong>
              <span class="zx-badge zx-badge-success">${{ p.price_monthly }}/mo</span>
            </div>
            <div class="muted text-xs mb-3">Slug: <code class="text-cyan-300">{{ p.slug }}</code> | Yearly: ${{ p.price_yearly }}/yr</div>
            <div class="grid grid-cols-2 text-xs gap-2 bg-black/40 p-3 rounded-lg border border-white/10">
              <div>Domains: <strong class="text-white">{{ p.max_domains }}</strong></div>
              <div>Inboxes: <strong class="text-white">{{ p.max_inboxes }}</strong></div>
              <div>Seats: <strong class="text-white">{{ p.max_seats }}</strong></div>
              <div>AI Credits: <strong class="text-cyan-300">{{ p.monthly_ai_credits?.toLocaleString() }}</strong></div>
            </div>
            <button class="zx-btn danger text-xs mt-3 w-full" @click="removePlan(p)">Delete Plan</button>
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
