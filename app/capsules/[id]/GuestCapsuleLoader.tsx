'use client'

import { useEffect, useState } from 'react'
import { createTokenClient } from '@/lib/supabase/token-client'
import { readCurrentFragment } from '@/lib/capsule-fragment'
import { canViewCapsuleContents } from '@/lib/capsule-privacy'
import {
  CapsuleView,
  CapsuleNotFound,
  type CapsuleMeta,
  type CapsuleHint,
  type CapsuleLetter,
} from './CapsuleView'

const CAPSULE_META = 'id, user_id, title, unlock_date, is_public, recipients, tags, created_at'

type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'found'; capsule: CapsuleMeta; hints: CapsuleHint[]; letter: CapsuleLetter | null; isUnlocked: boolean }

/**
 * Resolves a guest capsule whose access token lives in the URL fragment.
 *
 * The server never sees a fragment, so it cannot render these — it renders this
 * component instead, and the token is read here, after mount, then sent as the
 * x-capsule-token header. RLS does the comparison, exactly as on the server
 * path; this component holds the anon key and can see nothing the token does
 * not unlock.
 *
 * The token is deliberately left in the address bar. It is the only route back
 * to a capsule that belongs to no account, so stripping it would strand the
 * person who wrote it.
 */
export function GuestCapsuleLoader({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { token } = readCurrentFragment()
      if (!token) {
        if (!cancelled) setState({ status: 'missing' })
        return
      }

      const supabase = createTokenClient(token)

      const { data: capsule } = await supabase
        .from('timelock_capsules')
        .select(CAPSULE_META)
        .eq('id', id)
        .maybeSingle()

      if (cancelled) return
      if (!capsule) {
        setState({ status: 'missing' })
        return
      }

      const isUnlocked = new Date(capsule.unlock_date) <= new Date()

      const { data: hintRows } = await supabase
        .from('timelock_capsule_hints')
        .select('position, text')
        .eq('capsule_id', id)
        .order('position')

      // Same shape as the server path: ask for the letter only once unlocked,
      // and let RLS re-check the clock rather than trusting this comparison.
      let letter: CapsuleLetter | null = null
      if (isUnlocked) {
        const { data } = await supabase
          .from('timelock_capsule_contents')
          .select('body, iv, is_encrypted')
          .eq('capsule_id', id)
          .maybeSingle()
        letter = data ?? null
      }

      if (cancelled) return
      setState({
        status: 'found',
        capsule: capsule as CapsuleMeta,
        hints: hintRows ?? [],
        letter,
        isUnlocked,
      })
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  if (state.status === 'loading') {
    return <p className="text-muted-foreground text-center py-16">Opening capsule…</p>
  }
  if (state.status === 'missing') {
    return <CapsuleNotFound />
  }

  return (
    <CapsuleView
      capsule={state.capsule}
      hints={state.hints}
      letter={state.letter}
      isOwner={false}
      canViewContents={canViewCapsuleContents({
        isOwner: false,
        isPublic: state.capsule.is_public,
        hasValidGuestToken: true,
      })}
      isUnlocked={state.isUnlocked}
    />
  )
}
