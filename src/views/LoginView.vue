<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useBrandingStore } from '@/stores/branding'

const auth = useAuthStore()
const { branding, loadBranding } = useBrandingStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

onMounted(() => loadBranding())

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    await auth.signIn(email.value, password.value)
    router.push(route.query.redirect || '/inbox')
  } catch (e) {
    error.value = e.message || 'Sign in failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div v-if="branding.logoSvg" v-html="branding.logoSvg" class="login-logo-svg"></div>
        <img v-else-if="branding.logoUrl" :src="branding.logoUrl" alt="Logo" class="login-logo-img" />
        <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 236 64" width="177" height="48" class="login-logo-svg" role="img" aria-label="RelayRow">
          <defs>
            <linearGradient id="rrLgA" x1="6" y1="38" x2="58" y2="26" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#818CF8"/>
              <stop offset="1" stop-color="#22D3EE"/>
            </linearGradient>
            <linearGradient id="rrLgB" x1="150" y1="46" x2="220" y2="20" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="#818CF8"/>
              <stop offset="1" stop-color="#22D3EE"/>
            </linearGradient>
          </defs>
          <rect x="6" y="13" width="30" height="8" rx="4" fill="#818CF8" opacity=".45"/>
          <rect x="6" y="28" width="38" height="8" rx="4" fill="url(#rrLgA)"/>
          <rect x="6" y="43" width="22" height="8" rx="4" fill="#818CF8" opacity=".45"/>
          <circle cx="54" cy="32" r="4" fill="#22D3EE"/>
          <text x="78" y="43" font-family="Inter, system-ui, sans-serif" font-size="30" font-weight="600" letter-spacing="-.6" fill="var(--rr-text)">Relay<tspan fill="url(#rrLgB)">Row</tspan></text>
        </svg>
        <p class="login-subtitle">Multi-tenant email platform · {{ branding.appUrl }}</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="field">
          <label for="email">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            placeholder="you@example.com"
            required
            autocomplete="email"
          />
        </div>

        <div class="field">
          <label for="password">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            placeholder="••••••••"
            required
            autocomplete="current-password"
          />
        </div>

        <div v-if="error" class="login-error">{{ error }}</div>

        <button type="submit" :disabled="loading" class="login-btn">
          {{ loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--xe-bg);
  padding: 24px;
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: var(--xe-bg-surface);
  border: 1px solid var(--xe-border);
  border-radius: var(--xe-radius-lg);
  padding: 36px 28px;
  box-shadow: var(--xe-shadow);
}

.login-header {
  text-align: center;
  margin-bottom: 24px;
}

.login-logo {
  font-size: 36px;
  display: block;
  margin-bottom: 8px;
}

.login-header h1 {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--xe-text);
  margin-bottom: 4px;
}

.login-subtitle {
  font-size: 13px;
  color: var(--xe-text-dim);
}

.login-form { display: flex; flex-direction: column; gap: 16px; }

.field { display: flex; flex-direction: column; gap: 6px; }

.field label {
  font-size: 12px;
  font-weight: 600;
  color: var(--xe-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.field input {
  padding: 10px 12px;
  border-radius: var(--xe-radius);
  border: 1px solid var(--xe-border);
  background: var(--xe-bg);
  color: var(--xe-text);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color var(--xe-transition);
}

.field input:focus {
  border-color: var(--xe-border-focus);
}

.field input::placeholder { color: var(--xe-text-dim); }

.login-error {
  padding: 8px 12px;
  border-radius: var(--xe-radius);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: var(--xe-danger);
  font-size: 13px;
}

.login-btn {
  padding: 10px 16px;
  border-radius: var(--xe-radius);
  border: none;
  background: var(--rr-accent);
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 4px 14px var(--rr-accent-transparent);
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  user-select: none;
}

.login-btn:hover:not(:disabled) {
  background: var(--rr-accent-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px var(--rr-accent-transparent);
}

.login-btn:active:not(:disabled) {
  transform: translateY(0px) scale(0.98);
  box-shadow: 0 2px 8px var(--rr-accent-transparent);
}

.login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>

