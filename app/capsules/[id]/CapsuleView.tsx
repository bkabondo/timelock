'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Countdown } from '@/components/Countdown'
import { LetterReveal } from './LetterReveal'
import { DeleteButton } from './DeleteButton'

/**
 * Presentation for a single capsule, sealed or revealed.
 *
 * Split out of page.tsx so both render paths can share it: the server component
 * renders it directly for owner / public / legacy ?t= capsules, and
 * GuestCapsuleLoader renders it in the browser for capsules whose token lives
 * in the URL fragment. It holds no fetching and no authorisation logic — every
 * decision is made by the caller and, underneath that, by RLS.
 *
 * `isUnlocked` is a prop rather than a fresh `new Date()` comparison so the
 * server and the client cannot disagree across a hydration boundary.
 */

export type CapsuleMeta = {
  id: string
  user_id: string | null
  title: string
  unlock_date: string
  is_public: boolean | null
  recipients: string[] | null
  tags: string[] | null
  created_at: string
}

export type CapsuleHint = { position: number; text: string }
export type CapsuleLetter = { body: string; iv: string | null; is_encrypted: boolean }

const TAG_STYLES: Record<string, { emoji: string; label: string; color: string }> = {
  birthday: { emoji: '🎂', label: 'Birthday', color: 'text-pink-400' },
  letter: { emoji: '✉️', label: 'Letter', color: 'text-blue-400' },
  goals: { emoji: '🎯', label: 'Goals', color: 'text-green-400' },
  memory: { emoji: '💭', label: 'Memory', color: 'text-purple-400' },
  other: { emoji: '📦', label: 'Other', color: 'text-gray-400' },
  default: { emoji: '⏳', label: 'Capsule', color: 'text-primary' },
}

export function CapsuleView({
  capsule,
  hints,
  letter,
  isOwner,
  canViewContents,
  isUnlocked,
}: {
  capsule: CapsuleMeta
  hints: CapsuleHint[]
  letter: CapsuleLetter | null
  isOwner: boolean
  canViewContents: boolean
  isUnlocked: boolean
}) {
  const unlockDate = new Date(capsule.unlock_date)
  const firstTag = capsule.tags?.[0] ?? 'default'
  const tagStyle = TAG_STYLES[firstTag] ?? TAG_STYLES.default

  if (isUnlocked) {
    return (
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
              {capsule.tags && capsule.tags.length > 0 && (
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

            {isOwner && capsule.recipients && capsule.recipients.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground border-t border-border/40 pt-4">
                <span>💌 Shared with:</span>
                <span className="text-primary">{capsule.recipients.join(', ')}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
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
            {capsule.tags && capsule.tags.length > 0 && (
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
  )
}

/** Shown when a capsule cannot be resolved — missing, or not ours to see. */
export function CapsuleNotFound() {
  return (
    <div className="text-center py-16 space-y-3">
      <div className="text-5xl">🕳️</div>
      <h1 className="text-xl font-semibold">This capsule isn&apos;t here</h1>
      <p className="text-muted-foreground text-sm max-w-md mx-auto">
        It may never have existed, or it may be private. If you sealed it without an account, open
        it with the full recovery link you saved — the part after the <code>#</code> is what proves
        it is yours.
      </p>
    </div>
  )
}
