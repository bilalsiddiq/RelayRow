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
    <!-- Top bar -->
    <header class="xe-header" v-if="auth.user">
      <nav class="xe-nav">
        <RouterLink to="/inbox" class="xe-nav-brand">
          <div v-if="branding.logoSvg" v-html="branding.logoSvg" class="rr-logo-svg"></div>
          <img v-else-if="branding.logoUrl" :src="branding.logoUrl" alt="Logo" class="rr-logo-img" />
          <span v-else class="xe-logo">⚡</span>
          <span class="xe-name">{{ branding.appName }}</span>
        </RouterLink>
        <div class="xe-nav-links">
          <RouterLink to="/inbox" active-class="active">Inbox</RouterLink>
          <RouterLink to="/admin" active-class="active" v-if="auth.isSuperAdmin">Admin & Design System</RouterLink>
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
  gap: 32px;
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
}

.xe-nav-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--xe-text);
  font-weight: 700;
  font-size: 16px;
  letter-spacing: -0.02em;
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
}

.xe-nav-links a {
  padding: 6px 14px;
  border-radius: var(--xe-radius);
  text-decoration: none;
  color: var(--xe-text-muted);
  font-size: 13px;
  font-weight: 500;
  transition: all var(--xe-transition);
}

.xe-nav-links a:hover { color: var(--xe-text); background: var(--xe-bg-hover); }
.xe-nav-links a.active { color: var(--xe-accent); background: var(--rr-accent-transparent); font-weight: 600; }

.xe-nav-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 14px;
}

.xe-user-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 20px;
  background: var(--rr-accent-transparent);
  color: var(--xe-accent);
  border: 1px solid rgba(99, 102, 241, 0.3);
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
  padding: 0 24px;
}

/* ── Scrollbars ──────────────────────────────────────────────────────────── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--xe-border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--xe-text-dim); }
</style>

