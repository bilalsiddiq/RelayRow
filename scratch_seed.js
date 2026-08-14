import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hhyywwmkniujffyzovak.supabase.co'
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhoeXl3d21rbml1amZmeXpvdmFrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjY5NTIzNSwiZXhwIjoyMTAyMjcxMjM1fQ.RYcWBMzTaFfi7jsruKPx9iBeWrkXWRTTx2HgjG_8ZEs'

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function seedRealUser() {
  console.log('Seeding real user bilalsiddiq@gmail.com...')
  
  // 1. Check if user exists
  const { data: usersData, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) {
    console.error('List users error:', listErr)
    return
  }

  let user = usersData.users.find(u => u.email === 'bilalsiddiq@gmail.com')

  if (user) {
    console.log('User exists in auth.users:', user.id)
    // Update password
    const { data: updated, error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
      password: 'welcomeme123',
      email_confirm: true,
      user_metadata: { display_name: 'Bilal Siddiq', role: 'owner' }
    })
    if (updateErr) console.error('Update user error:', updateErr)
    else console.log('User password and metadata updated successfully!')
  } else {
    // Create real user
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: 'bilalsiddiq@gmail.com',
      password: 'welcomeme123',
      email_confirm: true,
      user_metadata: { display_name: 'Bilal Siddiq', role: 'owner' }
    })
    if (createErr) {
      console.error('Create user error:', createErr)
      return
    }
    user = created.user
    console.log('Created real user in Supabase Auth:', user.id)
  }

  // 2. Ensure entry in public.staff with role = 'owner'
  const { data: staffData, error: staffErr } = await supabase
    .from('staff')
    .upsert({
      auth_user_id: user.id,
      email: 'bilalsiddiq@gmail.com',
      display_name: 'Bilal Siddiq (Super Admin Owner)',
      role: 'owner',
    }, { onConflict: 'auth_user_id' })

  if (staffErr) {
    console.error('Staff upsert error:', staffErr)
  } else {
    console.log('Staff row updated/inserted for owner!')
  }

  // 3. Test real signInWithPassword
  const anonClient = createClient(supabaseUrl, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhoeXl3d21rbml1amZmeXpvdmFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2OTUyMzUsImV4cCI6MjEwMjI3MTIzNX0.ezff-QM7ickicbf71NVV0rwx1wPHYkQe_mRWLYq0dCs')
  const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: 'bilalsiddiq@gmail.com',
    password: 'welcomeme123',
  })

  if (signInErr) {
    console.error('Test Real Sign In failed:', signInErr)
  } else {
    console.log('Test Real Sign In SUCCESSFUL! User ID:', signInData.user.id, 'Token issued!')
  }
}

seedRealUser()
