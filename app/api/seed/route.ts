import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Seed credentials come from the environment and are never committed. This
// endpoint can mint an ADMIN account, so a password in source here is a full
// takeover of the deployed app for anyone who can read the repo.
//
// Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to use it; without them the
// route refuses to run rather than falling back to a default.
function seedUsers() {
  const email = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD
  if (!email || !password) return null
  return [
    { email, password, full_name: process.env.SEED_ADMIN_NAME ?? 'Admin', role: 'admin' as const },
  ]
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('token') !== process.env.SETUP_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const USERS = seedUsers()
  if (!USERS) {
    return NextResponse.json(
      { error: 'Seeding is disabled: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD' },
      { status: 400 }
    )
  }

  const adminClient = createAdminClient()
  const results: { email: string; status: string; error?: string }[] = []

  for (const u of USERS) {
    try {
      // Check if auth user already exists via admin
      const { data: existingList } = await adminClient.auth.admin.listUsers()
      const existing = existingList?.users?.find(au => au.email === u.email)

      let userId: string

      if (existing) {
        userId = existing.id
        results.push({ email: u.email, status: 'auth_exists' })
      } else {
        const { data, error } = await adminClient.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
          user_metadata: { full_name: u.full_name },
        })
        if (error || !data.user) {
          results.push({ email: u.email, status: 'auth_failed', error: error?.message })
          continue
        }
        userId = data.user.id
        results.push({ email: u.email, status: 'auth_created' })
      }

      // Upsert profile
      const { error: profileError } = await adminClient
        .from('timelock_users')
        .upsert({ id: userId, email: u.email, full_name: u.full_name, role: u.role }, { onConflict: 'id' })

      if (profileError) {
        results.push({ email: u.email, status: 'profile_failed', error: profileError.message })
      } else {
        const last = results[results.length - 1]
        last.status = last.status + '_profile_ok'
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ email: u.email, status: 'error', error: msg })
    }
  }

  return NextResponse.json({ results })
}
