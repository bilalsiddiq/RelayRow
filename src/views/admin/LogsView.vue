<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { listInboxLog } from '@/services/inbox'

const loading = ref(true)
const log = ref([])
const busy = ref(false)

async function loadLog() {
  busy.value = true
  try {
    log.value = (await listInboxLog(100)) || []
  } catch (err) {
    console.warn('Failed to load log', err)
  } finally {
    busy.value = false
    loading.value = false
  }
}

onMounted(loadLog)

const fmt = (s) => (s ? new Date(s).toLocaleString() : '—')
</script>

<template>
  <section class="mx-auto max-w-6xl">
    <header class="flex flex-wrap items-center justify-between gap-4 mb-10 pb-5 border-b border-white/10">
      <div>
        <h2 class="text-2xl font-extrabold flex items-center gap-2 tracking-tight">
          <span>📜</span> System Ingestion & Decision Audit Log
        </h2>
        <p class="mt-2 text-sm text-white/60 leading-relaxed">
          Real-time record of every webhook ingest, Svix HMAC decision, AURA triage, and delivery status.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <button class="zx-btn primary text-xs" :disabled="busy" @click="loadLog">
          {{ busy ? 'Refreshing...' : 'Refresh Log' }}
        </button>
        <RouterLink to="/inbox" class="zx-btn secondary">Open Inbox →</RouterLink>
      </div>
    </header>

    <div class="zx-panel">
      <p v-if="loading" class="muted text-sm">Loading audit log events…</p>
      <p v-else-if="!log.length" class="muted text-sm">No log records captured yet.</p>
      <div v-else v-for="r in log" :key="r.id" class="line">
        <span class="dot" :class="r.action"></span>
        <div class="min-w-0">
          <strong class="text-sm text-white">{{ r.action }}</strong>
          <span class="muted text-xs"> · {{ r.to_email || r.domain }}<template v-if="r.from_email"> ← {{ r.from_email }}</template></span>
          <p v-if="r.detail" class="muted text-xs mt-0.5 font-mono">{{ r.detail }}</p>
        </div>
        <span class="muted text-xs ml-auto whitespace-nowrap font-mono text-white/50">{{ fmt(r.ts) }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.muted { color: var(--xe-text-muted); }

.line { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
.line:last-child { border-bottom: 0; }
.dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 5px; flex: none; background: #6b7280; }
.dot.stored, .dot.sent, .dot.forwarded, .dot.scanned { background: var(--xe-success); box-shadow: 0 0 8px var(--xe-success); }
.dot.error, .dot.send_failed, .dot.forward_failed, .dot.scan_failed { background: var(--xe-danger); box-shadow: 0 0 8px var(--xe-danger); }
.dot.dropped, .dot.duplicate { background: var(--xe-warning); box-shadow: 0 0 8px var(--xe-warning); }
</style>
