import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createTokenClient } from '@/lib/supabase/token-client'
import { canViewCapsuleContents } from '@/lib/capsule-privacy'
import { Navbar } from '@/components/Navbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Countdown } from '@/components/Countdown'
import { LetterReveal } from './LetterReveal'
import { DeleteButton } from './DeleteButton'

const TAG_STYLES: Record<string, { emoji: string; label: string; color: string }> = {
  birthday: { emoji: '🎂', label: 'Birthday', color: 'text-pink-400' },
  letter: { emoji: '✉️', label: 'Letter', color: 'text-blue-400' },
  goals: { emoji: '🎯', label: 'Goals', color: 'text-green-400' },
  memory: { emoji: '💭', label: 'Memory', color: 'text-purple-400' },
  other: { emoji: '📦', label: 'Other', color: 'text-gray-400' },
  default: { emoji: '⏳', label: 'Capsule', color: 'text-primary' },
}

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
  const { t: guestToken } = await searchParams
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
    .single()

  // Guest capsules have no owner, so the owner/public branches of RLS never
  // match and the query above returns nothing. They open only for a caller
  // presenting the token from their link, which travels as the x-capsule-token
  // header and is compared inside the policy — this client holds the anon key,
  // not the service role, so a wrong or absent token simply returns no row.
  let hasValidGuestToken = false
  let tokenClient: ReturnType<typeof createTokenClient> | null = null
  if (!capsule && guestToken) {
    tokenClient = createTokenClient(guestToken)
    const { data: guestCapsule } = await tokenClient
      .from('timelock_capsules')
      .select(CAPSULE_META)
      .eq('id', id)
      .single()
    if (guestCapsule) {
      capsule = guestCapsule
      hasValidGuestToken = true
    }
  }

  if (!capsule) notFound()

  const isOwner = user ? capsule.user_id === user.id : false
  const canViewContents = canViewCapsuleContents({
    isOwner,
    isPublic: capsule.is_public,
    hasValidGuestToken,
  })
  const now = new Date()
  const unlockDate = new Date(capsule.unlock_date)
  const isUnlocked = unlockDate <= now
  const firstTag = (capsule.tags as string[] | null)?.[0] ?? 'default'
  const tagStyle = TAG_STYLES[firstTag] ?? TAG_STYLES.default

  // Hints are teasers, not secrets — RLS shows them to whoever can see the
  // metadata. Guest capsules read them through the token-authorised client.
  const { data: hintRows } = await (hasValidGuestToken ? tokenClient! : supabase)
    .from('timelock_capsule_hints')
    .select('position, text')
    .eq('capsule_id', id)
    .order('position')
  const hints = hintRows ?? []

  // The letter (ciphertext) is fetched only once unlocked AND authorised.
  // RLS re-checks both conditions against the database clock for every caller —
  // token holders included, since the token authorises but does not skip the
  // clock — so this query, not the if, is the real gate.
  let letter: { body: string; iv: string | null; is_encrypted: boolean } | null = null
  if (isUnlocked && canViewContents) {
    const { data } = await (hasValidGuestToken ? tokenClient! : supabase)
      .from('timelock_capsule_contents')
      .select('body, iv, is_encrypted')
      .eq('capsule_id', id)
      .single()
    letter = data
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={user} isAdmin={isAdmin} />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <div className="mb-6">
          <Link href={user ? '/capsules' : '/'} className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1">
            {user ? '← Back to capsules' : '← Back to home'}
          </Link>
        </div>

        {isUnlocked ? (
          /* Revealed Capsule */
          <div className="space-y-6">
            <Card className="capsule-revealed gold-glow">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">{tagStyle.emoji}</span>
                    <div>
                      <Badge className="bg-primary/20 text-primary border-primary/30 mb-1">
                        ✨ Revealed
                      </Badge>
                      <CardTitle className="text-2xl">{capsule.title}</CardTitle>
                    </div>
                  </div>
                  {capsule.is_public && (
                    <Badge variant="outline" className="text-xs">🌍 Public</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <span>Created {new Date(capsule.created_at).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>Unlocked {unlockDate.toLocaleDateString()}</span>
                  {capsule.tags && (capsule.tags as string[]).length > 0 && (
                    <>
                      <span>•</span>
                      <span className={tagStyle.color}>{tagStyle.label}</span>
                    </>
                  )}
                </div>

                <div className="border-t border-border/40 pt-4">
                  {canViewContents ? (
                    letter ? (
                      <LetterReveal body={letter.body} iv={letter.iv} isEncrypted={letter.is_encrypted} />
                    ) : (
                      <p className="text-muted-foreground text-center py-6">
                        The letter isn&apos;t available yet — if this capsule just unlocked, refresh in a moment.
                      </p>
                    )
                  ) : (
                    <div className="text-center py-6">
                      <div className="text-4xl mb-3">🤫</div>
                      <p className="text-muted-foreground">
                        This capsule is private. Only the person who wrote it can read what&apos;s inside.
                      </p>
                    </div>
                  )}
                </div>

                {isOwner && capsule.recipients && (capsule.recipients as string[]).length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground border-t border-border/40 pt-4">
                    <span>💌 Shared with:</span>
                    <span className="text-primary">{(capsule.recipients as string[]).join(', ')}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Sealed Capsule */
          <div className="space-y-6">
            <Card className="capsule-sealed">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">{tagStyle.emoji}</span>
                    <div>
                      <Badge variant="secondary" className="mb-1">🔒 Sealed</Badge>
                      <CardTitle className="text-2xl">{capsule.title}</CardTitle>
                    </div>
                  </div>
                  {capsule.is_public && (
                    <Badge variant="outline" className="text-xs">🌍 Public</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <span>Created {new Date(capsule.created_at).toLocaleDateString()}</span>
                  {capsule.tags && (capsule.tags as string[]).length > 0 && (
                    <>
                      <span>•</span>
                      <span className={tagStyle.color}>{tagStyle.label}</span>
                    </>
                  )}
                </div>

                {/* Lock Visual */}
                <div className="text-center py-8">
                  <div className="text-7xl mb-4 animate-float">🔒</div>
                  <p className="text-muted-foreground mb-2">
                    This capsule is sealed until
                  </p>
                  <p className="text-primary font-semibold text-lg">
                    {unlockDate.toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>

                {/* Countdown */}
                <div className="bg-background/30 rounded-xl p-4 border border-border">
                  <p className="text-center text-sm text-muted-foreground mb-3">Time remaining</p>
                  <Countdown unlockDate={capsule.unlock_date} />
                </div>

                {/* Hints from the author */}
                {hints.length > 0 && (
                  <div className="border-t border-border/40 pt-4 space-y-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest text-center">
                      Whispers from inside
                    </p>
                    {hints.map((hint) => (
                      <div key={hint.position} className="bg-background/30 border border-border rounded-lg p-3 text-center">
                        <p className="text-xs text-muted-foreground mb-1">
                          Hint {hint.position} of {hints.length}
                        </p>
                        <p className="text-foreground italic">&ldquo;{hint.text}&rdquo;</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {isOwner && (
              <div className="text-center">
                <DeleteButton capsuleId={capsule.id} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
