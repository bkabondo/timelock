import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit, clientIp } from '@/lib/rate-limit'

// Creates a capsule for a logged-out visitor. Guests have no identity, so the
// row is written server-side with a secret access_token; whoever holds the
// returned link can reach it, and nobody else can — not even an admin.
// The letter arrives here already encrypted (AES-GCM in the browser), so this
// route never sees plaintext. The insert goes through the admin client
// because RLS (correctly) refuses anonymous writes.
export async function POST(request: NextRequest) {
  try {
    // Unauthenticated write backed by the service role — throttle it.
    const limit = rateLimit(`guest:${clientIp(request)}`, 5)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many capsules. Try again in a minute.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
      )
    }

    const { title, tags, unlock_date, is_public, recipients, ciphertext, iv, hints } = await request.json()

    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (title.length > 100) {
      return NextResponse.json({ error: 'Title must be 100 characters or less' }, { status: 400 })
    }
    if (typeof ciphertext !== 'string' || !ciphertext || typeof iv !== 'string' || !iv) {
      return NextResponse.json({ error: 'Encrypted letter is required' }, { status: 400 })
    }
    // 5000 chars of UTF-8 ≈ 20 KB of base64 ciphertext at worst.
    if (ciphertext.length > 30000 || iv.length > 64) {
      return NextResponse.json({ error: 'Letter is too long' }, { status: 400 })
    }
    const unlock = new Date(unlock_date)
    if (isNaN(unlock.getTime()) || unlock <= new Date()) {
      return NextResponse.json({ error: 'Unlock date must be in the future' }, { status: 400 })
    }
    const hintList: string[] = Array.isArray(hints)
      ? hints.filter((h): h is string => typeof h === 'string' && h.trim().length > 0).map(h => h.trim())
      : []
    if (hintList.length > 3 || hintList.some(h => h.length > 100)) {
      return NextResponse.json({ error: 'Up to 3 hints of 100 characters each' }, { status: 400 })
    }

    const token = crypto.randomUUID()
    const adminClient = createAdminClient()

    const { data, error } = await adminClient
      .from('timelock_capsules')
      .insert({
        user_id: null,
        title: title.trim(),
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

    const { error: contentError } = await adminClient
      .from('timelock_capsule_contents')
      .insert({ capsule_id: data.id, body: ciphertext, iv, is_encrypted: true })
    if (contentError) {
      // A capsule without its letter is junk — undo the metadata row.
      await adminClient.from('timelock_capsules').delete().eq('id', data.id)
      console.error('Guest capsule content error:', contentError)
      return NextResponse.json({ error: 'Could not seal capsule' }, { status: 500 })
    }

    if (hintList.length) {
      const { error: hintError } = await adminClient
        .from('timelock_capsule_hints')
        .insert(hintList.map((text, i) => ({ capsule_id: data.id, position: i + 1, text })))
      if (hintError) console.error('Guest capsule hint error:', hintError)
    }

    return NextResponse.json({ id: data.id, token })
  } catch (err) {
    console.error('Guest capsule error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
