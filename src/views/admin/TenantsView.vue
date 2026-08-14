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
  <section class="mx-auto max-w-5xl">
    <header class="flex flex-wrap items-center justify-between gap-4 mb-10 pb-5 border-b border-white/10">
      <div>
        <h2 class="text-2xl font-extrabold flex items-center gap-2 tracking-tight">
          <span>🏢</span> Multi-Tenant Accounts & Membership Plans
        </h2>
        <p class="mt-2 text-sm text-white/60 leading-relaxed">
          Manage member organizations, capacity quotas, and subscription pricing plans.
        </p>
      </div>
      <RouterLink to="/inbox" class="pill">Open Inbox →</RouterLink>
    </header>

    <p v-if="error" class="err mb-6">{{ error }}</p>
    <p v-if="notice" class="ok mb-6">{{ notice }}</p>
    <p v-if="loading" class="muted">Loading tenants and subscription plans…</p>

    <template v-else>
      <!-- ── TENANTS ─────────────────────────────────────────────────────── -->
      <div class="panel mb-8">
        <h3 class="text-base font-bold mb-1">Create Member Organization Account</h3>
        <p class="muted text-xs mb-4">Add a new tenant account to the platform.</p>

        <div class="grid2 gap-4">
          <label class="f">
            <span>Organization Name</span>
            <input v-model="newTenant.name" placeholder="Acme Inc" />
          </label>
          <label class="f">
            <span>Slug Identifier</span>
            <input v-model="newTenant.slug" placeholder="acme" />
          </label>
        </div>
        <button class="pill primary mt-4" :disabled="busy === 'add-tenant'" @click="createTenant">
          Create Tenant
        </button>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <div v-for="t in tenants" :key="t.id" class="p-4 rounded-xl bg-black/20 border border-white/10 flex justify-between items-center">
            <div>
              <strong class="text-base font-bold">{{ t.name }}</strong>
              <div class="muted text-xs">Slug: <code>{{ t.slug }}</code></div>
            </div>
            <button class="btn-text danger text-xs" @click="removeTenant(t)">Delete</button>
          </div>
        </div>
      </div>

      <!-- ── MEMBERSHIP PLANS ────────────────────────────────────────────── -->
      <div class="panel">
        <h3 class="text-base font-bold mb-1">Membership Plans & Pricing Tiers</h3>
        <p class="muted text-xs mb-4">Define subscription plans, prices, and resource quotas.</p>

        <div class="grid2 gap-4">
          <label class="f"><span>Plan Name</span><input v-model="newPlan.name" placeholder="Pro Business" /></label>
          <label class="f"><span>Slug</span><input v-model="newPlan.slug" placeholder="pro" /></label>
          <label class="f"><span>Monthly Price ($)</span><input v-model="newPlan.price_monthly" type="number" /></label>
          <label class="f"><span>Yearly Price ($)</span><input v-model="newPlan.price_yearly" type="number" /></label>
          <label class="f"><span>Max Domains</span><input v-model="newPlan.max_domains" type="number" /></label>
          <label class="f"><span>Max Inboxes</span><input v-model="newPlan.max_inboxes" type="number" /></label>
          <label class="f"><span>Max Seats</span><input v-model="newPlan.max_seats" type="number" /></label>
          <label class="f"><span>Monthly AI Credits</span><input v-model="newPlan.monthly_ai_credits" type="number" /></label>
        </div>
        <button class="pill primary mt-4" :disabled="busy === 'add-plan'" @click="createPlan">
          Save Membership Plan
        </button>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <div v-for="p in plans" :key="p.id" class="p-4 rounded-xl bg-black/20 border border-white/10">
            <div class="flex justify-between items-center mb-2">
              <strong class="text-base font-bold">{{ p.name }}</strong>
              <span class="badge good">${{ p.price_monthly }}/mo</span>
            </div>
            <div class="muted text-xs mb-3">Slug: <code>{{ p.slug }}</code> | Yearly: ${{ p.price_yearly }}/yr</div>
            <div class="grid grid-cols-2 text-xs gap-2 bg-black/30 p-3 rounded-lg border border-white/10">
              <div>Domains: <strong>{{ p.max_domains }}</strong></div>
              <div>Inboxes: <strong>{{ p.max_inboxes }}</strong></div>
              <div>Seats: <strong>{{ p.max_seats }}</strong></div>
              <div>AI Credits: <strong>{{ p.monthly_ai_credits?.toLocaleString() }}</strong></div>
            </div>
            <button class="btn-text danger text-xs mt-3" @click="removePlan(p)">Delete Plan</button>
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
.f input {
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--xe-radius);
  font-size: 14px;
  background: var(--rr-bg);
  border: 1px solid var(--rr-border);
  color: var(--rr-text);
  outline: none;
}
.f input:focus { border-color: var(--rr-accent); }

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
.badge.good { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: rgba(16, 185, 129, 0.15); color: var(--xe-success); }
.err { padding: 10px 14px; border-radius: var(--xe-radius); background: rgba(239, 68, 68, 0.15); color: var(--xe-danger); font-size: 13px; }
.ok { padding: 10px 14px; border-radius: var(--xe-radius); background: rgba(16, 185, 129, 0.15); color: var(--xe-success); font-size: 13px; }
.grid2 { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
</style>
