<script setup>
import { RouterView, RouterLink } from 'vue-router'
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useBrandingStore } from '@/stores/branding'

const auth = useAuthStore()
const { branding, loadBranding } = useBrandingStore()

onMounted(() => {
  auth.init()
  loadBranding()
})
</script>

<template>
  <div id="xe-app">
    <!-- Top bar (Hidden on landing page root to prevent double header stack) -->
    <header class="xe-header" v-if="auth.user && $route.path !== '/'">
      <nav class="xe-nav">
        <RouterLink to="/inbox" class="xe-nav-brand">
          <div v-if="branding.logoSvg" v-html="branding.logoSvg" class="rr-logo-svg"></div>
          <img v-else-if="branding.logoUrl" :src="branding.logoUrl" alt="Logo" class="rr-logo-img" />
          <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 236 64" width="118" height="32" class="rr-logo-svg" role="img" aria-label="RelayRow">
            <defs>
              <linearGradient id="rrHdrA" x1="6" y1="38" x2="58" y2="26" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#818CF8"/>
                <stop offset="1" stop-color="#22D3EE"/>
              </linearGradient>
              <linearGradient id="rrHdrB" x1="150" y1="46" x2="220" y2="20" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#818CF8"/>
                <stop offset="1" stop-color="#22D3EE"/>
              </linearGradient>
            </defs>
            <rect x="6" y="13" width="30" height="8" rx="4" fill="#818CF8" opacity=".45"/>
            <rect x="6" y="28" width="38" height="8" rx="4" fill="url(#rrHdrA)"/>
            <rect x="6" y="43" width="22" height="8" rx="4" fill="#818CF8" opacity=".45"/>
            <circle cx="54" cy="32" r="4" fill="#22D3EE"/>
            <text x="78" y="43" font-family="Inter, system-ui, sans-serif" font-size="30" font-weight="600" letter-spacing="-.6" fill="var(--rr-text)">Relay<tspan fill="url(#rrHdrB)">Row</tspan></text>
          </svg>
        </RouterLink>
        <div class="xe-nav-links">
          <RouterLink to="/inbox" active-class="active">Inbox</RouterLink>
          <template v-if="auth.isSuperAdmin">
            <RouterLink to="/admin/domains" active-class="active">Domains & Mailboxes</RouterLink>
            <RouterLink to="/admin/tenants" active-class="active">Tenants & Billing</RouterLink>
            <RouterLink to="/admin/aura" active-class="active">✨ AURA AI Engine</RouterLink>
            <RouterLink to="/admin/design" active-class="active">🎨 Design System</RouterLink>
            <RouterLink to="/admin/logs" active-class="active">📜 System Logs</RouterLink>
          </template>
        </div>
        <div class="xe-nav-right">
          <span class="xe-user-badge" v-if="auth.isSuperAdmin">👑 Super Admin</span>
          <span class="xe-user-email">{{ auth.user?.email }}</span>
          <button @click="auth.signOut()" class="xe-btn-sign-out">Sign out</button>
        </div>
      </nav>
    </header>

    <main class="xe-main">
      <RouterView />
    </main>
  </div>
</template>

<style>
/* ── RelayRow dynamic design system ──────────────────────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  /* Dynamic tokens from branding store (fallback values) */
  --rr-accent: #6366f1;
  --rr-accent-hover: #4f46e5;
  --rr-accent-transparent: rgba(99, 102, 241, 0.15);
  --rr-bg: #020617;
  --rr-bg-surface: #0f172a;
  --rr-border: #1e293b;
  --rr-text: #f8fafc;
  --rr-font: 'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif;

  /* Aliased XE tokens for backward compatibility */
  --xe-bg: var(--rr-bg);
  --xe-bg-surface: var(--rr-bg-surface);
  --xe-bg-elevated: #1a2332;
  --xe-bg-hover: rgba(255, 255, 255, 0.06);
  --xe-border: var(--rr-border);
  --xe-border-focus: var(--rr-accent);
  --xe-text: var(--rr-text);
  --xe-text-muted: #94a3b8;
  --xe-text-dim: #64748b;
  --xe-accent: var(--rr-accent);
  --xe-accent-hover: var(--rr-accent-hover);
  --xe-success: #10b981;
  --xe-warning: #f59e0b;
  --xe-danger: #ef4444;
  --xe-radius: 8px;
  --xe-radius-lg: 12px;
  --xe-shadow: 0 4px 6px -1px rgba(0,0,0,.3), 0 2px 4px -2px rgba(0,0,0,.2);
  --xe-transition: 150ms ease;
  --xe-font: var(--rr-font);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; }

html, body {
  height: 100%;
  font-family: var(--xe-font);
  background: var(--xe-bg);
  color: var(--xe-text);
  -webkit-font-smoothing: antialiased;
}

#xe-app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.xe-header {
  background: var(--xe-bg-surface);
  border-bottom: 1px solid var(--xe-border);
  padding: 0 24px;
  height: 60px;
  display: flex;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(12px);
}

.xe-nav {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.xe-nav::-webkit-scrollbar { display: none; }

.xe-nav-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--xe-text);
  font-weight: 700;
  font-size: 16px;
  letter-spacing: -0.02em;
  flex-shrink: 0;
}

.xe-logo {
  font-size: 22px;
  color: var(--rr-accent);
}

.rr-logo-svg svg, .rr-logo-img {
  max-height: 28px;
  width: auto;
  object-fit: contain;
}

.xe-nav-links {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  white-space: nowrap;
}

.xe-nav-links a {
  padding: 6px 14px;
  border-radius: var(--xe-radius);
  text-decoration: none;
  color: var(--xe-text-muted);
  font-size: 13px;
  font-weight: 500;
  transition: all var(--xe-transition);
  flex-shrink: 0;
  white-space: nowrap;
}

.xe-nav-links a:hover { color: var(--xe-text); background: var(--xe-bg-hover); }
.xe-nav-links a.active { color: var(--xe-accent); background: var(--rr-accent-transparent); font-weight: 600; }

.xe-nav-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
  white-space: nowrap;
}

.xe-user-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 20px;
  background: var(--rr-accent-transparent);
  color: var(--xe-accent);
  border: 1px solid var(--rr-accent-transparent);
}

.xe-user-email {
  font-size: 12px;
  color: var(--xe-text-dim);
}

.xe-btn-sign-out {
  padding: 5px 12px;
  border-radius: var(--xe-radius);
  border: 1px solid var(--xe-border);
  background: transparent;
  color: var(--xe-text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--xe-transition);
}

.xe-btn-sign-out:hover {
  color: var(--xe-danger);
  border-color: var(--xe-danger);
}

/* ── Main ────────────────────────────────────────────────────────────────── */
.xe-main {
  flex: 1;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
  padding: 32px 24px 48px;
}

/* ── Zexpo Design System Utility Classes ────────────────────────────────────── */
.zx-panel {
  padding: 24px;
  border-radius: var(--xe-radius-lg);
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  transition: border-color var(--xe-transition);
}

.zx-card {
  padding: 16px;
  border-radius: var(--xe-radius-lg);
  background: rgba(2, 6, 23, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all var(--xe-transition);
}

.zx-card:hover {
  border-color: var(--rr-accent-transparent);
  background: rgba(15, 23, 42, 0.8);
}

.zx-field {
  display: block;
  margin-bottom: 14px;
}

.zx-field span {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--xe-text-muted);
  margin-bottom: 6px;
  letter-spacing: 0.01em;
}

.zx-input, .zx-select, .zx-textarea {
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--xe-radius);
  font-size: 14px;
  background: rgba(2, 6, 23, 0.7);
  border: 1px solid var(--rr-border);
  color: var(--rr-text);
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.zx-input:focus, .zx-select:focus, .zx-textarea:focus {
  border-color: var(--rr-accent);
  box-shadow: 0 0 0 3px var(--rr-accent-transparent);
}

/* Chrome/Edge Autofill Override - Prevents Blinding White Inputs */
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
textarea:-webkit-autofill,
select:-webkit-autofill {
  -webkit-text-fill-color: #ffffff !important;
  -webkit-box-shadow: 0 0 0px 1000px #090d16 inset !important;
  transition: background-color 5000s ease-in-out 0s;
}

.zx-btn {
  padding: 8px 18px;
  border-radius: var(--xe-radius);
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  user-select: none;
  text-decoration: none;
}

.zx-btn.primary {
  background: var(--rr-accent);
  color: #ffffff;
  box-shadow: 0 4px 14px var(--rr-accent-transparent);
}

.zx-btn.primary:hover:not(:disabled) {
  background: var(--rr-accent-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px var(--rr-accent-transparent);
}

.zx-btn.primary:active:not(:disabled) {
  transform: translateY(0px) scale(0.97);
}

.zx-btn.secondary {
  background: var(--xe-bg-hover);
  color: var(--rr-text);
  border: 1px solid var(--rr-border);
}

.zx-btn.secondary:hover:not(:disabled) {
  border-color: var(--rr-accent);
  background: var(--rr-accent-transparent);
  transform: translateY(-1px);
}

.zx-btn.danger {
  background: rgba(239, 68, 68, 0.15);
  color: var(--xe-danger);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.zx-btn.danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
  transform: translateY(-1px);
}

.zx-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.zx-badge-accent { background: var(--rr-accent-transparent); color: var(--rr-accent); border: 1px solid var(--rr-accent-transparent); }
.zx-badge-success { background: rgba(16, 185, 129, 0.15); color: var(--xe-success); border: 1px solid rgba(16, 185, 129, 0.3); }
.zx-badge-warning { background: rgba(245, 158, 11, 0.15); color: var(--xe-warning); border: 1px solid rgba(245, 158, 11, 0.3); }
.zx-badge-danger { background: rgba(239, 68, 68, 0.15); color: var(--xe-danger); border: 1px solid rgba(239, 68, 68, 0.3); }

/* ── Scrollbars ──────────────────────────────────────────────────────────── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--xe-border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--xe-text-dim); }
</style>

