import { reactive, ref } from 'vue'
import { supabase } from '@/lib/supabase'

const user = ref(null)
const session = ref(null)
const isStaff = ref(false)
const loading = ref(true)

async function checkStaffStatus() {
  if (!user.value) {
    isStaff.value = false
    return false
  }
  try {
    const { data } = await supabase.rpc('inbox_is_staff')
    isStaff.value = !!data
  } catch (e) {
    console.warn('Error checking staff status via RPC:', e)
    isStaff.value = false
  }
  return isStaff.value
}

async function init() {
  loading.value = true
  try {
    const { data: { session: s } } = await supabase.auth.getSession()
    session.value = s
    user.value = s?.user || null
    await checkStaffStatus()
  } catch (e) {
    console.warn('Supabase auth session error:', e)
  } finally {
    loading.value = false
  }
}

// Listen for real auth state changes
supabase.auth.onAuthStateChange(async (_event, s) => {
  session.value = s
  user.value = s?.user || null
  await checkStaffStatus()
})

async function signIn(email, password) {
  const cleanEmail = (email || '').trim().toLowerCase()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  })

  if (error) {
    throw new Error(error.message || 'Sign in failed')
  }

  session.value = data.session
  user.value = data.user
  await checkStaffStatus()
  return data
}

async function signUp(email, password, displayName = '') {
  const cleanEmail = (email || '').trim().toLowerCase()
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: { display_name: displayName },
    },
  })

  if (error) {
    throw new Error(error.message || 'Sign up failed')
  }

  session.value = data.session
  user.value = data.user
  await checkStaffStatus()
  return data
}

async function signOut() {
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
  isSuperAdmin: isStaff,
  loading,
  init,
  signIn,
  signUp,
  signOut,
})

export function useAuthStore() {
  return store
}


