<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { getAuraAiConfig, saveAuraAiConfig, addTenantAiCredits, listTenants } from '@/services/inbox'

const loading = ref(true)
const error = ref('')
const notice = ref('')
const busy = ref('')

const auraConfig = ref({
  provider: 'openai',
  model: 'gpt-4o-mini',
  credit_rate_triage: 1,
  credit_rate_reply: 2,
})

const tenants = ref([])
const topUpAmount = ref({})

onMounted(async () => {
  try {
    const [cfg, tens] = await Promise.all([
      getAuraAiConfig().catch(() => null),
      listTenants().catch(() => []),
    ])
    if (cfg) Object.assign(auraConfig.value, cfg)
    tenants.value = tens || []
  } catch (err) {
    error.value = err.message || 'Failed to load AURA settings'
  } finally {
    loading.value = false
  }
})

async function saveAuraSettings() {
  busy.value = 'save-aura'
  error.value = ''; notice.value = ''
  try {
    await saveAuraAiConfig(auraConfig.value)
    notice.value = 'Platform AURA AI config updated successfully!'
    setTimeout(() => { notice.value = '' }, 3000)
  } catch (err) {
    error.value = err.message || 'Failed to save AURA config'
  } finally {
    busy.value = ''
  }
}

async function topUpCredits(tenantId) {
  const amt = Number(topUpAmount.value[tenantId] || 0)
  if (!amt || amt <= 0) return
  busy.value = `topup-${tenantId}`
  error.value = ''; notice.value = ''
  try {
    await addTenantAiCredits(tenantId, amt)
    notice.value = `Added ${amt.toLocaleString()} AI credits to tenant!`
    topUpAmount.value[tenantId] = ''
    setTimeout(() => { notice.value = '' }, 3000)
  } catch (err) {
    error.value = err.message || 'Credit top-up failed'
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
          <span>✨</span> Platform AURA AI Engine
        </h2>
        <p class="mt-2 text-sm text-white/60 leading-relaxed">
          Configure platform LLM provider catalog, model inference, credit rates, and tenant allocations.
        </p>
      </div>
      <RouterLink to="/inbox" class="pill">Open Inbox →</RouterLink>
    </header>

    <p v-if="error" class="err mb-6">{{ error }}</p>
    <p v-if="notice" class="ok mb-6">{{ notice }}</p>
    <p v-if="loading" class="muted">Loading AURA AI configuration…</p>

    <template v-else>
      <!-- ── PLATFORM LLM CONFIGURATION ──────────────────────────────────── -->
      <div class="panel mb-8">
        <h3 class="text-base font-bold mb-1">Platform-Wide LLM Provider Setup</h3>
        <p class="muted text-xs mb-4">
          Super Admin configures platform API keys in Supabase Vault. Member accounts consume platform AURA credits.
        </p>

        <div class="grid2 gap-4">
          <label class="f">
            <span>AI Provider</span>
            <select v-model="auraConfig.provider">
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="openrouter">OpenRouter</option>
              <option value="groq">Groq</option>
            </select>
          </label>
          <label class="f">
            <span>Default Model</span>
            <input v-model="auraConfig.model" placeholder="gpt-4o-mini / claude-3-5-sonnet" />
          </label>
          <label class="f">
            <span>Triage Rate (Credits/Email)</span>
            <input v-model="auraConfig.credit_rate_triage" type="number" />
          </label>
          <label class="f">
            <span>Reply Draft Rate (Credits/Draft)</span>
            <input v-model="auraConfig.credit_rate_reply" type="number" />
          </label>
        </div>

        <button class="pill primary mt-4" :disabled="busy === 'save-aura'" @click="saveAuraSettings">
          {{ busy === 'save-aura' ? 'Saving...' : 'Save Platform AURA Config' }}
        </button>
      </div>

      <!-- ── TENANT AI CREDIT TOP-UP ──────────────────────────────────────── -->
      <div class="panel">
        <h3 class="text-base font-bold mb-1">Tenant AI Credit Allocations</h3>
        <p class="muted text-xs mb-4">Grant bonus AURA AI credits to tenant organizations.</p>

        <div v-if="!tenants.length" class="muted text-sm">No member organizations found.</div>

        <div v-for="t in tenants" :key="t.id" class="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-black/20 border border-white/10 mb-3">
          <div>
            <strong class="text-sm">{{ t.name }}</strong>
            <span class="muted text-xs ml-2"><code>{{ t.slug }}</code></span>
          </div>
          <div class="flex items-center gap-3">
            <input v-model="topUpAmount[t.id]" type="number" placeholder="1000" class="w-28 text-xs p-2 rounded border border-white/20 bg-black/30 text-white" />
            <button class="pill primary" :disabled="busy === `topup-${t.id}`" @click="topUpCredits(t.id)">
              + Add Credits
            </button>
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

.err { padding: 10px 14px; border-radius: var(--xe-radius); background: rgba(239, 68, 68, 0.15); color: var(--xe-danger); font-size: 13px; }
.ok { padding: 10px 14px; border-radius: var(--xe-radius); background: rgba(16, 185, 129, 0.15); color: var(--xe-success); font-size: 13px; }
.grid2 { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
</style>
