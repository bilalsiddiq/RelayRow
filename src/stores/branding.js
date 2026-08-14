import { reactive, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'

const LOCAL_STORAGE_KEY = 'relayrow_branding_settings'

export const THEME_PRESETS = [
  {
    id: 'relayrow-indigo',
    name: 'RelayRow Indigo (Default)',
    accentColor: '#6366f1',
    surfaceColor: '#0f172a',
    bgColor: '#020617',
    textColor: '#f8fafc',
    borderColor: '#1e293b',
  },
  {
    id: 'electric-violet',
    name: 'Electric Violet',
    accentColor: '#8b5cf6',
    surfaceColor: '#180e29',
    bgColor: '#0b0514',
    textColor: '#faf5ff',
    borderColor: '#2e1c47',
  },
  {
    id: 'obsidian-teal',
    name: 'Obsidian Teal',
    accentColor: '#14b8a6',
    surfaceColor: '#0f1d24',
    bgColor: '#040d12',
    textColor: '#f0fdfa',
    borderColor: '#1e3845',
  },
  {
    id: 'cyber-emerald',
    name: 'Cyber Emerald',
    accentColor: '#10b981',
    surfaceColor: '#062016',
    bgColor: '#020f09',
    textColor: '#ecfdf5',
    borderColor: '#133e2c',
  },
  {
    id: 'sunset-amber',
    name: 'Sunset Amber',
    accentColor: '#f59e0b',
    surfaceColor: '#1f160b',
    bgColor: '#0f0a04',
    textColor: '#fffbeb',
    borderColor: '#3b2a16',
  },
]

// Default Branding state
const branding = reactive({
  appName: 'RelayRow',
  appUrl: 'https://RelayRow.com',
  logoUrl: '',
  logoSvg: '',
  accentColor: '#6366f1',
  surfaceColor: '#0f172a',
  bgColor: '#020617',
  textColor: '#f8fafc',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  themePreset: 'relayrow-indigo',
  customCss: '',
})

const loading = ref(false)

function applyThemeToDOM() {
  const root = document.documentElement
  root.style.setProperty('--rr-accent', branding.accentColor)
  root.style.setProperty('--rr-bg', branding.bgColor)
  root.style.setProperty('--rr-bg-surface', branding.surfaceColor)
  root.style.setProperty('--rr-text', branding.textColor)
  root.style.setProperty('--rr-font', branding.fontFamily)
  
  // Calculate hover & muted colors
  root.style.setProperty('--rr-accent-hover', adjustColorBrightness(branding.accentColor, -15))
  root.style.setProperty('--rr-accent-transparent', hexToRgba(branding.accentColor, 0.15))
}

function hexToRgba(hex, alpha = 1) {
  if (!hex || !hex.startsWith('#')) return `rgba(99, 102, 241, ${alpha})`
  const cleanHex = hex.replace('#', '')
  const fullHex = cleanHex.length === 3
    ? cleanHex.split('').map(c => c + c).join('')
    : cleanHex
  const num = parseInt(fullHex, 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function adjustColorBrightness(hex, percent) {
  if (!hex || !hex.startsWith('#')) return hex
  let num = parseInt(hex.replace('#', ''), 16)
  let amt = Math.round(2.55 * percent)
  let R = (num >> 16) + amt
  let G = (num >> 8 & 0x00FF) + amt
  let B = (num & 0x0000FF) + amt
  return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1)
}

async function loadBranding() {
  loading.value = true
  
  // Try local storage first
  const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      Object.assign(branding, parsed)
      applyThemeToDOM()
    } catch (e) {
      console.warn('Failed to parse local branding settings:', e)
    }
  }

  // Try loading from database
  try {
    const { data, error } = await supabase
      .from('app_branding')
      .select('*')
      .limit(1)
      .maybeSingle()

    if (!error && data) {
      branding.appName = data.app_name || branding.appName
      branding.appUrl = data.app_url || branding.appUrl
      branding.logoUrl = data.logo_url || ''
      branding.logoSvg = data.logo_svg || ''
      branding.accentColor = data.accent_color || branding.accentColor
      branding.surfaceColor = data.surface_color || branding.surfaceColor
      branding.bgColor = data.bg_color || branding.bgColor
      branding.textColor = data.text_color || branding.textColor
      branding.fontFamily = data.font_family || branding.fontFamily
      branding.themePreset = data.theme_preset || branding.themePreset
      branding.customCss = data.custom_css || ''

      applyThemeToDOM()
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(branding))
    }
  } catch (e) {
    // Fallback stays active
  } finally {
    loading.value = false
  }
}

async function updateBranding(patch) {
  Object.assign(branding, patch)

  if (patch.themePreset) {
    const preset = THEME_PRESETS.find(p => p.id === patch.themePreset)
    if (preset) {
      branding.accentColor = preset.accentColor
      branding.surfaceColor = preset.surfaceColor
      branding.bgColor = preset.bgColor
      branding.textColor = preset.textColor
    }
  }

  applyThemeToDOM()
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(branding))

  try {
    const payload = {
      app_name: branding.appName,
      app_url: branding.appUrl,
      logo_url: branding.logoUrl,
      logo_svg: branding.logoSvg,
      accent_color: branding.accentColor,
      surface_color: branding.surfaceColor,
      bg_color: branding.bgColor,
      text_color: branding.textColor,
      font_family: branding.fontFamily,
      theme_preset: branding.themePreset,
      custom_css: branding.customCss,
      updated_at: new Date().toISOString(),
    }

    const { data: existing } = await supabase.from('app_branding').select('id').limit(1).maybeSingle()
    if (existing?.id) {
      await supabase.from('app_branding').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('app_branding').insert(payload)
    }
  } catch (e) {
    console.warn('Could not save branding to Supabase database:', e)
  }
}

// Initialise theme execution on script load
applyThemeToDOM()

export function useBrandingStore() {
  return {
    branding,
    loading,
    THEME_PRESETS,
    loadBranding,
    updateBranding,
    applyThemeToDOM,
  }
}
