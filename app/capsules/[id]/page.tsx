import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createTokenClient } from '@/lib/supabase/token-client'
import { canViewCapsuleContents } from '@/lib/capsule-privacy'
import { Navbar } from '@/components/Navbar'
import { CapsuleView, type CapsuleMeta, type CapsuleLetter } from './CapsuleView'
import { GuestCapsuleLoader } from './GuestCapsuleLoader'

// Metadata only — the letter lives in timelock_capsule_contents and is
// fetched separately, so a sealed capsule's response never contains it.
const CAPSULE_META = 'id, user_id, title, unlock_date, is_public, recipients, tags, created_at'

export default async function CapsuleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { id } = await params
  // Legacy links carry the token as ?t=. New links put it in the fragment,
  // which never reaches the server — those are resolved by GuestCapsuleLoader
  // below. Both are honoured; only this one is visible from here.
  const { t: legacyToken } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase
      .from('timelock_users')
      .select('role')
      .eq('id', user.id)
      .single()
    isAdmin = profile?.role === 'admin'
  }

  // RLS lets this through only for the capsule's author or a published capsule.
  let { data: capsule } = await supabase
    .from('timelock_capsules')
    .select(CAPSULE_META)
    .eq('id', id)
    .maybeSingle()

  // A guest capsule on an old ?t= link. The token goes out as the
  // x-capsule-token header and the policy compares it; this client holds the
  // anon key, not the service role, so a wrong token simply returns no row.
  let hasValidGuestToken = false
  let tokenClient: ReturnType<typeof createTokenClient> | null = null
  if (!capsule && legacyToken) {
    tokenClient = createTokenClient(legacyToken)
    const { data: guestCapsule } = await tokenClient
      .from('timelock_capsules')
      .select(CAPSULE_META)
      .eq('id', id)
      .maybeSingle()
    if (guestCapsule) {
      capsule = guestCapsule
      hasValidGuestToken = true
    }
  }

  const backLink = (
    <div className="mb-6">
      <Link href={user ? '/capsules' : '/'} className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1">
        {user ? '← Back to capsules' : '← Back to home'}
      </Link>
    </div>
  )

  // Nothing visible from the server. That is either a capsule that does not
  // exist, or a guest capsule whose token is in the fragment — indistinguishable
  // here, because the fragment was never transmitted. So this cannot be a
  // notFound(): hand off to the browser, which can read it. Both cases render
  // the same not-found UI, so existence still is not disclosed.
  if (!capsule) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar user={user} isAdmin={isAdmin} />
        <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
          {backLink}
          <GuestCapsuleLoader id={id} />
        </main>
      </div>
    )
  }

  const isOwner = user ? capsule.user_id === user.id : false
  const canViewContents = canViewCapsuleContents({
    isOwner,
    isPublic: capsule.is_public,
    hasValidGuestToken,
  })
  const isUnlocked = new Date(capsule.unlock_date) <= new Date()

  // Hints are teasers, not secrets — RLS shows them to whoever can see the
  // metadata. Guest capsules read them through the token-authorised client.
  const { data: hintRows } = await (hasValidGuestToken ? tokenClient! : supabase)
    .from('timelock_capsule_hints')
    .select('position, text')
    .eq('capsule_id', id)
    .order('position')

  // The letter (ciphertext) is fetched only once unlocked AND authorised.
  // RLS re-checks both conditions against the database clock for every caller —
  // token holders included, since the token authorises but does not skip the
  // clock — so this query, not the if, is the real gate.
  let letter: CapsuleLetter | null = null
  if (isUnlocked && canViewContents) {
    const { data } = await (hasValidGuestToken ? tokenClient! : supabase)
      .from('timelock_capsule_contents')
      .select('body, iv, is_encrypted')
      .eq('capsule_id', id)
      .maybeSingle()
    letter = data ?? null
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={user} isAdmin={isAdmin} />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        {backLink}
        <CapsuleView
          capsule={capsule as CapsuleMeta}
          hints={hintRows ?? []}
          letter={letter}
          isOwner={isOwner}
          canViewContents={canViewContents}
          isUnlocked={isUnlocked}
        />
      </main>
    </div>
  )
}
