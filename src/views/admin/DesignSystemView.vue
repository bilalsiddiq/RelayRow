<script setup>
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useBrandingStore } from '@/stores/branding'

const brandingStore = useBrandingStore()
const notice = ref('')

function saveBranding() {
  brandingStore.updateBranding(brandingStore.branding)
  notice.value = 'Branding configuration updated & saved!'
  setTimeout(() => { notice.value = '' }, 3000)
}
</script>

<template>
  <section class="mx-auto max-w-6xl">
    <header class="flex flex-wrap items-center justify-between gap-4 mb-10 pb-5 border-b border-white/10">
      <div>
        <h2 class="text-2xl font-extrabold flex items-center gap-2 tracking-tight">
          <span>🎨</span> RelayRow Design System & White-Label Customizer
        </h2>
        <p class="mt-2 text-sm text-white/60 leading-relaxed">
          Configure runtime branding, theme color presets, logo lockups, typography, and global CSS design tokens.
        </p>
      </div>
      <RouterLink to="/inbox" class="zx-btn secondary">Open Inbox →</RouterLink>
    </header>

    <p v-if="notice" class="ok mb-6">{{ notice }}</p>

    <!-- ── PRESET COLOR THEMES ─────────────────────────────────────────── -->
    <div class="zx-panel mb-8">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-base font-bold">Preset Color Themes</h3>
          <p class="muted text-xs">Select a curated theme preset for instant platform white-labeling.</p>
        </div>
        <span class="zx-badge zx-badge-accent">5 Presets Available</span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div v-for="preset in brandingStore.THEME_PRESETS" :key="preset.id"
          class="theme-card cursor-pointer p-3 rounded-xl transition-all border flex flex-col justify-between"
          :class="{ 'theme-active': brandingStore.branding.themePreset === preset.id }"
          @click="brandingStore.updateBranding({ themePreset: preset.id })">
          <div class="flex items-center justify-between mb-3">
            <span class="font-bold text-xs text-white">{{ preset.name }}</span>
            <span v-if="brandingStore.branding.themePreset === preset.id" class="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22D3EE]"></span>
          </div>

          <div class="flex gap-1 items-center justify-between bg-black/40 p-2 rounded-lg border border-white/10">
            <span class="color-dot" :style="{ background: preset.accentColor }" title="Accent"></span>
            <span class="color-dot" :style="{ background: preset.bgColor }" title="Background"></span>
            <span class="color-dot" :style="{ background: preset.surfaceColor }" title="Surface"></span>
            <span class="color-dot" :style="{ background: preset.textColor }" title="Text"></span>
            <span class="color-dot" :style="{ background: preset.borderColor }" title="Border"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── ACTIVE COLOR TOKENS ─────────────────────────────────────────── -->
    <div class="zx-panel mb-8">
      <h3 class="text-base font-bold mb-1">Active Design Tokens & CSS Variables</h3>
      <p class="muted text-xs mb-4">Real-time inspection of `:root` CSS custom properties driven by `useBrandingStore`.</p>

      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <div class="p-3 rounded-xl bg-black/30 border border-white/10 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-white/60">Accent</span>
            <span class="w-4 h-4 rounded-full border border-white/20" :style="{ background: 'var(--rr-accent)' }"></span>
          </div>
          <code class="text-xs text-cyan-300">--rr-accent</code>
        </div>
        <div class="p-3 rounded-xl bg-black/30 border border-white/10 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-white/60">Background</span>
            <span class="w-4 h-4 rounded-full border border-white/20" :style="{ background: 'var(--rr-bg)' }"></span>
          </div>
          <code class="text-xs text-cyan-300">--rr-bg</code>
        </div>
        <div class="p-3 rounded-xl bg-black/30 border border-white/10 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-white/60">Surface</span>
            <span class="w-4 h-4 rounded-full border border-white/20" :style="{ background: 'var(--rr-bg-surface)' }"></span>
          </div>
          <code class="text-xs text-cyan-300">--rr-bg-surface</code>
        </div>
        <div class="p-3 rounded-xl bg-black/30 border border-white/10 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-white/60">Border</span>
            <span class="w-4 h-4 rounded-full border border-white/20" :style="{ background: 'var(--rr-border)' }"></span>
          </div>
          <code class="text-xs text-cyan-300">--rr-border</code>
        </div>
        <div class="p-3 rounded-xl bg-black/30 border border-white/10 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-white/60">Text</span>
            <span class="w-4 h-4 rounded-full border border-white/20" :style="{ background: 'var(--rr-text)' }"></span>
          </div>
          <code class="text-xs text-cyan-300">--rr-text</code>
        </div>
      </div>
    </div>

    <!-- ── BRAND IDENTITY & ASSETS ──────────────────────────────────────── -->
    <div class="zx-panel mb-8">
      <h3 class="text-base font-bold mb-1">Brand Identity & Assets</h3>
      <p class="muted text-xs mb-4">Configure custom organization name, application URL, and SVG lockup mark.</p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label class="zx-field">
          <span>Application Name</span>
          <input v-model="brandingStore.branding.appName" class="zx-input" placeholder="RelayRow" />
        </label>
        <label class="zx-field">
          <span>Application URL</span>
          <input v-model="brandingStore.branding.appUrl" class="zx-input" placeholder="https://relayrow.com" />
        </label>
        <label class="zx-field">
          <span>Logo Image URL (Optional)</span>
          <input v-model="brandingStore.branding.logoUrl" class="zx-input" placeholder="https://example.com/logo.png" />
        </label>
        <label class="zx-field">
          <span>Inline SVG Lockup Code</span>
          <input v-model="brandingStore.branding.logoSvg" class="zx-input" placeholder="<svg ...></svg>" />
        </label>
      </div>

      <div class="flex items-center justify-between mt-4">
        <button class="zx-btn primary" @click="saveBranding">
          Save Custom Branding
        </button>
        <span class="text-xs text-white/50">Persisted in Supabase <code>app_branding</code></span>
      </div>
    </div>

    <!-- ── UI COMPONENT SANDBOX ─────────────────────────────────────────── -->
    <div class="zx-panel">
      <h3 class="text-base font-bold mb-1">Zexpo Component Sandbox</h3>
      <p class="muted text-xs mb-4">Live interactive showcase of RelayRow design system components rendering under the current theme.</p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Buttons Sandbox -->
        <div class="zx-card">
          <h4 class="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Interactive Action Buttons</h4>
          <div class="flex flex-wrap gap-2">
            <button class="zx-btn primary">Primary Action</button>
            <button class="zx-btn secondary">Secondary Pill</button>
            <button class="zx-btn danger">Danger Action</button>
          </div>
        </div>

        <!-- Badges Sandbox -->
        <div class="zx-card">
          <h4 class="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Status Badges & Chips</h4>
          <div class="flex flex-wrap gap-2">
            <span class="zx-badge zx-badge-success">Verified MX</span>
            <span class="zx-badge zx-badge-warning">Pending Sign</span>
            <span class="zx-badge zx-badge-danger">Spam Quarantined</span>
            <span class="zx-badge zx-badge-accent">Active Theme</span>
          </div>
        </div>

        <!-- Form Inputs Sandbox -->
        <div class="zx-card md:col-span-2">
          <h4 class="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Input Fields & Select Controls</h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input class="zx-input" placeholder="Search team inboxes..." />
            <select class="zx-select">
              <option>Filter by Role: All Operators</option>
              <option>Super Admin</option>
              <option>Inbox Agent</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.muted { color: var(--xe-text-muted); }

.theme-card {
  background: rgba(2, 6, 23, 0.6);
  border-color: rgba(255, 255, 255, 0.08);
  min-height: 84px;
}

.theme-card:hover {
  border-color: var(--rr-accent);
  background: rgba(15, 23, 42, 0.8);
  transform: translateY(-2px);
}

.theme-card.theme-active {
  border-color: var(--rr-accent);
  background: var(--rr-accent-transparent);
  box-shadow: 0 0 16px var(--rr-accent-transparent);
}

.color-dot {
  width: 16px;
  height: 16px;
  min-width: 16px;
  min-height: 16px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.ok {
  padding: 10px 14px;
  border-radius: var(--xe-radius);
  background: rgba(16, 185, 129, 0.15);
  color: var(--xe-success);
  border: 1px solid rgba(16, 185, 129, 0.3);
  font-size: 13px;
}
</style>
