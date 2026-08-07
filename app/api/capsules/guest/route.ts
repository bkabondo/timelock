import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Creates a capsule for a logged-out visitor. Guests have no identity, so the
// row is written server-side with a secret access_token; whoever holds the
// returned link can read it, and nobody else can — not even an admin.
// The insert goes through the admin client because RLS (correctly) refuses
// anonymous writes.
export async function POST(request: NextRequest) {
  try {
    const { title, message, tags, unlock_date, is_public, recipients } = await request.json()

    if (typeof title !== 'string' || typeof message !== 'string' || !title.trim() || !message.trim()) {
      return NextResponse.json({ error: 'Title and message are required' }, { status: 400 })
    }
    if (title.length > 100) {
      return NextResponse.json({ error: 'Title must be 100 characters or less' }, { status: 400 })
    }
    if (message.length > 10000) {
      return NextResponse.json({ error: 'Message is too long' }, { status: 400 })
    }
    const unlock = new Date(unlock_date)
    if (isNaN(unlock.getTime()) || unlock <= new Date()) {
      return NextResponse.json({ error: 'Unlock date must be in the future' }, { status: 400 })
    }

    const token = crypto.randomUUID()

    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('timelock_capsules')
      .insert({
        user_id: null,
        title: title.trim(),
        message: message.trim(),
        tags: Array.isArray(tags) ? tags : null,
        unlock_date: unlock.toISOString(),
        is_public: is_public === true,
        recipients: Array.isArray(recipients) && recipients.length ? recipients : null,
        access_token: token,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Guest capsule creation error:', error)
      return NextResponse.json({ error: 'Could not seal capsule' }, { status: 500 })
    }

    return NextResponse.json({ id: data.id, token })
  } catch (err) {
    console.error('Guest capsule error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
