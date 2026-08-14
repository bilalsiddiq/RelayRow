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

function fillSuperAdmin() {
  email.value = 'bilalsiddiq@gmail.com'
  password.value = 'welcomeme123'
}

async function quickLoginSuperAdmin() {
  fillSuperAdmin()
  await handleLogin()
}

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
        <span v-else class="login-logo">⚡</span>
        <h1>{{ branding.appName }}</h1>
        <p class="login-subtitle">Multi-tenant email platform · {{ branding.appUrl }}</p>
      </div>


      <!-- Quick Super Admin Card -->
      <div class="quick-admin-banner">
        <div class="banner-title">
          <span class="badge-crown">👑</span> Super Admin Owner
        </div>
        <div class="banner-credentials">
          <div><strong>Email:</strong> <code>bilalsiddiq@gmail.com</code></div>
          <div><strong>Pass:</strong> <code>welcomeme123</code></div>
        </div>
        <div class="banner-actions">
          <button type="button" class="banner-btn secondary" @click="fillSuperAdmin">
            Fill Fields
          </button>
          <button type="button" class="banner-btn primary" :disabled="loading" @click="quickLoginSuperAdmin">
            Quick Sign In
          </button>
        </div>
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

.quick-admin-banner {
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.25);
  border-radius: var(--xe-radius);
  padding: 12px 14px;
  margin-bottom: 20px;
  font-size: 12px;
}

.banner-title {
  font-weight: 600;
  color: var(--xe-text);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.badge-crown {
  font-size: 14px;
}

.banner-credentials {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--xe-text-muted);
  margin-bottom: 10px;
}

.banner-credentials code {
  background: rgba(0, 0, 0, 0.2);
  padding: 1px 5px;
  border-radius: 4px;
  color: var(--xe-text);
  font-family: monospace;
}

.banner-actions {
  display: flex;
  gap: 8px;
}

.banner-btn {
  flex: 1;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: opacity 0.2s;
}

.banner-btn.primary {
  background: var(--xe-accent);
  color: #fff;
}

.banner-btn.secondary {
  background: rgba(255, 255, 255, 0.08);
  color: var(--xe-text);
  border: 1px solid var(--xe-border);
}

.banner-btn:hover {
  opacity: 0.9;
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
  background: var(--xe-accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--xe-transition);
}

.login-btn:hover:not(:disabled) { background: var(--xe-accent-hover); }
.login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>

