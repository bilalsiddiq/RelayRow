<script setup>
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useBrandingStore } from '@/stores/branding'

const brandingStore = useBrandingStore()
const notice = ref('')

function saveBranding() {
  brandingStore.updateBranding(brandingStore.branding)
  notice.value = 'Branding configuration updated successfully!'
  setTimeout(() => { notice.value = '' }, 3000)
}
</script>

<template>
  <section class="mx-auto max-w-5xl">
    <header class="flex flex-wrap items-center justify-between gap-4 mb-10 pb-5 border-b border-white/10">
      <div>
        <h2 class="text-2xl font-extrabold flex items-center gap-2 tracking-tight">
          <span>🎨</span> RelayRow Design System & Branding
        </h2>
        <p class="mt-2 text-sm text-white/60 leading-relaxed">
          Configure runtime branding, theme presets, logo marks, typography, and color tokens.
        </p>
      </div>
      <RouterLink to="/inbox" class="pill">Open Inbox →</RouterLink>
    </header>

    <p v-if="notice" class="ok mb-6">{{ notice }}</p>

    <!-- ── PRESET COLOR THEMES ─────────────────────────────────────────── -->
    <div class="panel mb-8">
      <h3 class="text-base font-bold mb-1">Preset Color Themes</h3>
      <p class="muted text-xs mb-4">Select a curated theme preset for platform white-labeling.</p>

      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div v-for="preset in brandingStore.THEME_PRESETS" :key="preset.id"
          class="preset-card cursor-pointer transition-all p-4 rounded-xl border"
          :class="{ active: brandingStore.branding.themePreset === preset.id }"
          @click="brandingStore.updateBranding({ themePreset: preset.id })">
          <div class="flex items-center justify-between w-full mb-3">
            <span class="preset-name font-semibold text-sm">{{ preset.name }}</span>
            <span v-if="brandingStore.branding.themePreset === preset.id" class="preview-badge text-xs">Active</span>
          </div>
          <div class="flex gap-2 items-center">
            <span class="preset-color" :style="{ background: preset.accentColor }" title="Accent"></span>
            <span class="preset-color" :style="{ background: preset.bgColor }" title="Background"></span>
            <span class="preset-color" :style="{ background: preset.surfaceColor }" title="Surface"></span>
            <span class="preset-color" :style="{ background: preset.textColor }" title="Text"></span>
            <span class="preset-color" :style="{ background: preset.borderColor }" title="Border"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── CUSTOM BRAND IDENTITY ────────────────────────────────────────── -->
    <div class="panel mb-8">
      <h3 class="text-base font-bold mb-1">Brand Identity & Assets</h3>
      <p class="muted text-xs mb-4">Customize app name, domain URLs, and custom SVG lockup.</p>

      <div class="grid2 gap-4">
        <label class="f">
          <span>Application Name</span>
          <input v-model="brandingStore.branding.appName" placeholder="RelayRow" />
        </label>
        <label class="f">
          <span>Application URL</span>
          <input v-model="brandingStore.branding.appUrl" placeholder="https://relayrow.com" />
        </label>
        <label class="f">
          <span>Logo Image URL (Optional)</span>
          <input v-model="brandingStore.branding.logoUrl" placeholder="https://example.com/logo.png" />
        </label>
        <label class="f">
          <span>Inline SVG Code</span>
          <input v-model="brandingStore.branding.logoSvg" placeholder="<svg ...></svg>" />
        </label>
      </div>

      <button class="pill primary mt-4" @click="saveBranding">
        Save Custom Branding
      </button>
    </div>

    <!-- ── COMPONENT & TOKEN SANDBOX ────────────────────────────────────── -->
    <div class="panel">
      <h3 class="text-base font-bold mb-1">Interactive Component Sandbox</h3>
      <p class="muted text-xs mb-4">Live preview of buttons, badges, and layout surfaces under the active theme.</p>

      <div class="grid2 gap-4">
        <div class="p-4 rounded-xl bg-black/20 border border-white/10">
          <h4 class="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Buttons</h4>
          <div class="flex flex-wrap gap-3">
            <button class="btn primary">Primary Action</button>
            <button class="btn secondary">Secondary Action</button>
            <button class="btn danger">Danger Action</button>
          </div>
        </div>
        <div class="p-4 rounded-xl bg-black/20 border border-white/10">
          <h4 class="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">Status Badges</h4>
          <div class="flex flex-wrap gap-2">
            <span class="badge good">Verified</span>
            <span class="badge bad">Pending MX</span>
            <span class="preview-badge">Active Theme</span>
          </div>
        </div>
      </div>
    </div>
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

.preset-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 14px;
  border-radius: var(--xe-radius-lg);
  background: var(--xe-bg-hover);
  border: 1px solid var(--rr-border);
  transition: all var(--xe-transition);
}
.preset-card:hover, .preset-card.active {
  border-color: var(--rr-accent);
  background: var(--rr-accent-transparent);
}
.preset-color {
  width: 22px;
  height: 22px;
  min-width: 22px;
  min-height: 22px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

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

.btn {
  padding: 9px 18px;
  border-radius: var(--xe-radius);
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all var(--xe-transition);
}
.btn.primary { background: var(--rr-accent); color: #ffffff; }
.btn.secondary { background: var(--xe-bg-hover); color: var(--rr-text); border: 1px solid var(--rr-border); }
.btn.danger { background: rgba(239, 68, 68, 0.15); color: var(--xe-danger); border: 1px solid var(--rr-border); }

.badge { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
.badge.good { background: rgba(16, 185, 129, 0.15); color: var(--xe-success); }
.badge.bad { background: rgba(245, 158, 11, 0.15); color: var(--xe-warning); }
.preview-badge { padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; background: var(--rr-accent-transparent); color: var(--rr-accent); }
.ok { padding: 10px 14px; border-radius: var(--xe-radius); background: rgba(16, 185, 129, 0.15); color: var(--xe-success); font-size: 13px; }
.grid2 { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
</style>
