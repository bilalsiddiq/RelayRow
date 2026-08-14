import { reactive, ref } from 'vue'
import { supabase } from '@/lib/supabase'

const SUPER_ADMIN_EMAIL = 'bilalsiddiq@gmail.com'
const SUPER_ADMIN_PASS = 'welcomeme123'
const LOCAL_STORAGE_KEY = 'xe_mailbox_demo_session'

const user = ref(null)
const session = ref(null)
const isStaff = ref(false)
const loading = ref(true)

async function init() {
  loading.value = true

  // Check stored demo session first
  const savedDemoSession = localStorage.getItem(LOCAL_STORAGE_KEY)
  if (savedDemoSession) {
    try {
      const parsed = JSON.parse(savedDemoSession)
      user.value = parsed.user
      session.value = parsed.session
      isStaff.value = !!parsed.isStaff
      loading.value = false
      return
    } catch {
      localStorage.removeItem(LOCAL_STORAGE_KEY)
    }
  }

  try {
    const { data: { session: s } } = await supabase.auth.getSession()
    session.value = s
    user.value = s?.user || null

    if (user.value) {
      if (user.value.email?.toLowerCase() === SUPER_ADMIN_EMAIL) {
        isStaff.value = true
      } else {
        const { data } = await supabase.rpc('inbox_is_staff')
        isStaff.value = !!data
      }
    }
  } catch (e) {
    console.warn('Supabase session check error:', e)
  }
  loading.value = false
}

// Listen for auth changes
supabase.auth.onAuthStateChange(async (_event, s) => {
  const savedDemoSession = localStorage.getItem(LOCAL_STORAGE_KEY)
  if (savedDemoSession) return

  session.value = s
  user.value = s?.user || null
  if (user.value) {
    if (user.value.email?.toLowerCase() === SUPER_ADMIN_EMAIL) {
      isStaff.value = true
    } else {
      const { data } = await supabase.rpc('inbox_is_staff')
      isStaff.value = !!data
    }
  } else {
    isStaff.value = false
  }
})

async function signIn(emailInput, passwordInput) {
  const cleanEmail = (emailInput || '').trim().toLowerCase()

  // Try standard Supabase auth first
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: passwordInput,
    })
    if (!error && data?.session) {
      session.value = data.session
      user.value = data.user
      if (cleanEmail === SUPER_ADMIN_EMAIL) {
        isStaff.value = true
      } else {
        const { data: staffData } = await supabase.rpc('inbox_is_staff')
        isStaff.value = !!staffData
      }
      localStorage.removeItem(LOCAL_STORAGE_KEY)
      return data
    }
  } catch (e) {
    // If Supabase API is unconfigured or unreachable, proceed to fallback logic
  }

  // Super Admin Owner credentials check
  if (cleanEmail === SUPER_ADMIN_EMAIL && passwordInput === SUPER_ADMIN_PASS) {
    const superAdminUser = {
      id: '00000000-0000-0000-0000-000000000001',
      email: SUPER_ADMIN_EMAIL,
      user_metadata: {
        display_name: 'Bilal Siddiq (Super Admin Owner)',
        role: 'owner',
      },
      role: 'authenticated',
    }
    const demoSession = {
      access_token: 'demo-superadmin-token',
      user: superAdminUser,
    }

    user.value = superAdminUser
    session.value = demoSession
    isStaff.value = true

    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        user: superAdminUser,
        session: demoSession,
        isStaff: true,
      })
    )

    return { user: superAdminUser, session: demoSession }
  }

  throw new Error('Invalid email or password. Please check your credentials.')
}

async function signOut() {
  localStorage.removeItem(LOCAL_STORAGE_KEY)
  try {
    await supabase.auth.signOut()
  } catch {}
  user.value = null
  session.value = null
  isStaff.value = false
}

// Singleton pattern — same shape every view expects
const store = reactive({
  user,
  session,
  isSuperAdmin: isStaff, // alias for the InboxView HOST.isStaff binding
  loading,
  init,
  signIn,
  signOut,
})

export function useAuthStore() {
  return store
}

