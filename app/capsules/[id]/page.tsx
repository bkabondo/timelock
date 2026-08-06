import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canViewCapsuleContents } from '@/lib/capsule-privacy'
import { Navbar } from '@/components/Navbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Countdown } from '@/components/Countdown'
import { HintButton } from './HintButton'
import { DeleteButton } from './DeleteButton'

const TAG_STYLES: Record<string, { emoji: string; label: string; color: string }> = {
  birthday: { emoji: '🎂', label: 'Birthday', color: 'text-pink-400' },
  letter: { emoji: '✉️', label: 'Letter', color: 'text-blue-400' },
  goals: { emoji: '🎯', label: 'Goals', color: 'text-green-400' },
  memory: { emoji: '💭', label: 'Memory', color: 'text-purple-400' },
  other: { emoji: '📦', label: 'Other', color: 'text-gray-400' },
  default: { emoji: '⏳', label: 'Capsule', color: 'text-primary' },
}

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
    .select('*')
    .eq('id', id)
    .single()

  // Guest capsules have no owner, so RLS hides them from everyone. They open
  // only for a caller presenting the secret token from their link, matched
  // here before anything is rendered.
  let hasValidGuestToken = false
  if (!capsule && guestToken) {
    const { data: guestCapsule } = await createAdminClient()
      .from('timelock_capsules')
      .select('*')
      .eq('id', id)
      .eq('access_token', guestToken)
      .is('user_id', null)
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
                    <div className="text-foreground leading-relaxed whitespace-pre-wrap text-lg">
                      {capsule.message}
                    </div>
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

                {canViewContents && capsule.ai_letter && (
                  <div className="border-t border-border/40 pt-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">AI Letter</p>
                    <p className="text-foreground italic leading-relaxed">{capsule.ai_letter}</p>
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

                {/* Existing hint */}
                {isOwner && capsule.has_hint && capsule.hint_text && (
                  <div className="border-t border-border/40 pt-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2 text-center">Oracle Hint</p>
                    <p className="text-foreground italic text-center">&ldquo;{capsule.hint_text}&rdquo;</p>
                  </div>
                )}

                {/* AI Hint Button */}
                {isOwner && (
                  <div className="border-t border-border/40 pt-4">
                    <p className="text-sm text-muted-foreground mb-3 text-center">
                      Curious? Get an oracle hint about what&apos;s inside...
                    </p>
                    <HintButton
                      capsuleId={capsule.id}
                      title={capsule.title}
                      tags={(capsule.tags as string[] | null) ?? []}
                    />
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
