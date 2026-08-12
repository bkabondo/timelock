import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Creates this app's profile row for the signed-in user, if it is missing.
 *
 * auth.users is shared by all ten apps in this Supabase project, but each app
 * keeps its own <app>_users table and timelock_capsules.user_id has a foreign
 * key to timelock_users. So an account created in any other app — or through
 * Google, or before this route existed — authenticates into TimeLock perfectly
 * well and then fails on the first write with a foreign key violation. That is
 * the bug a user hit.
 *
 * Deliberately create-if-missing rather than a backfill: a TimeLock profile
 * should come into being because someone did something in TimeLock, not
 * because they signed up for a different app.
 */
export async function POST(request: NextRequest) {
  try {
    // The body is a hint, not an authority. Identity comes from the session.
    const body = await request.json().catch(() => ({}))

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const email = user.email
    if (!email) {
      return NextResponse.json({ error: 'Account has no email address' }, { status: 400 })
    }
    const fullName =
      (typeof body.full_name === 'string' && body.full_name.trim()) ||
      (user.user_metadata?.full_name as string | undefined) ||
      email.split('@')[0]

    // ignoreDuplicates, NOT upsert: an upsert here would rewrite role to 'user'
    // on every call and silently demote an admin. This must only ever fill a
    // gap, never overwrite an existing profile.
    const adminClient = createAdminClient()
    const { error } = await adminClient
      .from('timelock_users')
      .upsert(
        { id: user.id, email, full_name: fullName, role: 'user' },
        { onConflict: 'id', ignoreDuplicates: true }
      )

    if (error) {
      console.error('Profile creation error:', `${error.code ?? '?'}: ${error.message ?? '?'}`)
      return NextResponse.json({ error: 'Could not set up your account' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Create profile error:', err instanceof Error ? err.name : 'unknown')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
