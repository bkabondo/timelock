'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { generateCapsuleKey, encryptLetter } from '@/lib/capsule-crypto'
import { humanizeDbError } from '@/lib/db-errors'
import { Navbar } from '@/components/Navbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from 'sonner'

const THEMES = [
  { value: 'birthday', label: '🎂 Birthday', desc: 'Celebrate a special day' },
  { value: 'letter', label: '✉️ Letter', desc: 'A message to the future' },
  { value: 'goals', label: '🎯 Goals', desc: 'Dreams and ambitions' },
  { value: 'memory', label: '💭 Memory', desc: 'Cherish a moment' },
  { value: 'other', label: '📦 Other', desc: 'Something unique' },
]

const MAX_HINTS = 3
const MAX_HINT_LENGTH = 100

export default function NewCapsulePage() {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [tags, setTags] = useState<string[]>(['memory'])
  const [unlockDate, setUnlockDate] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [recipients, setRecipients] = useState('')
  const [hints, setHints] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [sealed, setSealed] = useState<{ url: string; key: string; title: string; unlockDate: string; isGuest: boolean } | null>(null)

  // Min date: tomorrow
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split('T')[0]

  function setHint(index: number, value: string) {
    setHints(prev => prev.map((h, i) => (i === index ? value : h)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !message.trim() || !unlockDate) {
      toast.error('Please fill in all required fields')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const recipientList = recipients.trim()
        ? recipients.split(',').map(r => r.trim()).filter(Boolean)
        : null
      const hintList = hints.map(h => h.trim()).filter(Boolean).slice(0, MAX_HINTS)

      // The letter is encrypted before anything leaves the browser. The key
      // exists only here, and after this function only in the reveal link.
      const key = await generateCapsuleKey()
      const { ciphertext, iv } = await encryptLetter(key, message.trim())

      let capsuleId: string
      let guestToken: string | null = null

      if (user) {
        // timelock_capsules.user_id has a foreign key to timelock_users, but
        // auth.users is shared across all ten apps in this Supabase project and
        // nothing creates a TimeLock profile except this app's own signup form.
        // So an account made in another app, or through Google, authenticates
        // fine and then fails here on the foreign key. Fill the gap at the
        // moment of the first write — which is also the right moment for a
        // TimeLock account to start existing.
        const profileRes = await fetch('/api/auth/create-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ full_name: user.user_metadata?.full_name }),
        })
        if (!profileRes.ok) {
          toast.error('We could not set up your TimeLock account. Please try again.')
          return
        }

        const { data, error } = await supabase
          .from('timelock_capsules')
          .insert({
            user_id: user.id,
            title: title.trim(),
            tags,
            unlock_date: new Date(unlockDate).toISOString(),
            is_public: isPublic,
            recipients: recipientList,
          })
          .select('id')
          .single()

        if (error) {
          toast.error(humanizeDbError(error, 'Could not seal your capsule. Please try again.'))
          return
        }
        capsuleId = data.id

        const { error: contentError } = await supabase
          .from('timelock_capsule_contents')
          .insert({ capsule_id: capsuleId, body: ciphertext, iv, is_encrypted: true })
        if (contentError) {
          // A capsule without its letter is junk — undo the metadata row.
          await supabase.from('timelock_capsules').delete().eq('id', capsuleId)
          toast.error(humanizeDbError(contentError, 'Could not save your letter. Please try again.'))
          return
        }

        if (hintList.length) {
          const { error: hintError } = await supabase
            .from('timelock_capsule_hints')
            .insert(hintList.map((text, i) => ({ capsule_id: capsuleId, position: i + 1, text })))
          if (hintError) {
            toast.error(
              `Capsule sealed, but the hints did not save. ${humanizeDbError(hintError, 'You can still share the reveal link.')}`
            )
          }
        }
      } else {
        // A logged-out visitor has no identity to authorise against, so the
        // capsule is sealed server-side and reachable only via its secret
        // link. The letter is already ciphertext by the time it leaves here.
        const res = await fetch('/api/capsules/guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            tags,
            unlock_date: new Date(unlockDate).toISOString(),
            is_public: isPublic,
            recipients: recipientList,
            ciphertext,
            iv,
            hints: hintList,
          }),
        })
        const payload = await res.json()
        if (!res.ok) {
          toast.error(payload.error ?? 'Could not seal capsule')
          return
        }
        capsuleId = payload.id
        guestToken = payload.token
      }

      // Send email notifications to recipients
      if (recipientList?.length) {
        const senderName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Someone'
        fetch('/api/email/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipients: recipientList, capsuleTitle: title.trim(), unlockDate: new Date(unlockDate).toISOString(), senderName }),
        }).catch(() => {})
        toast.info(`Email sent to ${recipientList.length} recipient${recipientList.length > 1 ? 's' : ''}`)
      }

      // Both secrets ride in the fragment, which browsers strip before sending:
      // the access token that authorises the read, and the key that decrypts
      // the letter. Neither reaches the server, so neither can land in an
      // access log — the token used to be ?t=, and query strings are logged.
      // Referrer-Policy: no-referrer keeps them from leaking onward too.
      const fragment = guestToken ? `#t=${guestToken}&key=${key}` : `#key=${key}`
      const url = `${window.location.origin}/capsules/${capsuleId}${fragment}`
      setSealed({ url, key, title: title.trim(), unlockDate, isGuest: guestToken !== null })
      toast.success('Capsule sealed! ⏳')
    } catch {
      toast.error('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function copyRevealLink() {
    if (!sealed) return
    navigator.clipboard.writeText(sealed.url).then(
      () => toast.success('Reveal link copied'),
      () => toast.error('Could not copy — select and copy it manually')
    )
  }

  function downloadBackup() {
    if (!sealed) return
    const text = [
      'TimeLock capsule key backup',
      '===========================',
      `Capsule: ${sealed.title}`,
      `Unlocks: ${new Date(sealed.unlockDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
      '',
      `Reveal link: ${sealed.url}`,
      `Capsule key: ${sealed.key}`,
      '',
      'Keep this file safe. The letter is encrypted in your browser and',
      'TimeLock never sees the key — if it is lost, the letter is gone',
      'forever. No one can recover it for you.',
      ...(sealed.isGuest
        ? [
            '',
            'This capsule was sealed without an account, so the reveal link is',
            'also the only way to find it again. It is not listed anywhere and',
            'cannot be recovered from an email address.',
            '',
            'Save the link exactly as it appears above, including everything',
            'after the # — that part is both the key and the proof the capsule',
            'is yours, and a link truncated at the # will not open it.',
          ]
        : []),
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    a.download = `timelock-key-${sealed.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (sealed) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
          <Card className="capsule-sealed">
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="text-3xl">🔐</span>
                <div>
                  <CardTitle>Capsule sealed — save your key</CardTitle>
                  <CardDescription>
                    Your letter was encrypted in this browser. This is the only time the key is shown.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-sm text-red-300">
                  ⚠️ Without this link (or the key inside it) the letter is <strong>unrecoverable</strong> — TimeLock
                  never sees the key and cannot reset it. Save it somewhere safe before leaving this page.
                </p>
              </div>

              {sealed.isGuest && (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/40 space-y-2">
                  <p className="text-sm text-amber-200 font-medium">
                    🔑 You sealed this without an account — this link is your only way back
                  </p>
                  <p className="text-xs text-amber-200/80">
                    The capsule is not attached to any account, so it will not appear in a
                    &ldquo;my capsules&rdquo; list and cannot be found by searching or by email. Nobody can
                    look it up for you, and support cannot restore it. Copy the link below or download the
                    backup file now.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>{sealed.isGuest ? 'Your recovery link (contains your key)' : 'Reveal link (contains your key)'}</Label>
                <div className="flex gap-2">
                  <Input readOnly value={sealed.url} className="bg-background/50 font-mono text-xs" onFocus={e => e.currentTarget.select()} />
                  <Button type="button" onClick={copyRevealLink}>Copy</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Everything after the <code>#</code> stays in your browser and never reaches our servers
                  {sealed.isGuest ? ' — it is both the key and the proof this capsule is yours, so copy the link whole' : ''}.
                  Anyone you give this link to can read the letter once it unlocks, so share it only with people
                  you mean to.
                </p>
              </div>

              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={downloadBackup}>
                  ⬇️ Download key backup
                </Button>
                <a href={sealed.url} className="flex-1">
                  <Button type="button" className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                    View capsule →
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <div className="mb-6">
          <Link href="/capsules" className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1">
            ← Back to capsules
          </Link>
        </div>

        <Card className="capsule-sealed">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="text-3xl">⏳</span>
              <div>
                <CardTitle>Create a Time Capsule</CardTitle>
                <CardDescription>Seal your message until the perfect moment</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Letter to My Future Self"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  disabled={loading}
                  maxLength={100}
                  className="bg-background/50"
                />
                <p className="text-xs text-muted-foreground">{title.length}/100</p>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {THEMES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTags(prev =>
                        prev.includes(t.value)
                          ? prev.filter(x => x !== t.value)
                          : [...prev, t.value]
                      )}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        tags.includes(t.value)
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border hover:border-primary/40 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="font-medium text-sm">{t.label}</div>
                      <div className="text-xs opacity-70 mt-0.5">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div className="space-y-2">
                <Label htmlFor="message">Message *</Label>
                <Textarea
                  id="message"
                  placeholder="Write your message to the future..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  disabled={loading}
                  className="bg-background/50 min-h-[150px] resize-none"
                  maxLength={5000}
                />
                <p className="text-xs text-muted-foreground">
                  {message.length}/5000 · 🔐 Encrypted in your browser — nobody can read it before the unlock
                  date, not even TimeLock.
                </p>
              </div>

              {/* Hints */}
              <div className="space-y-2">
                <Label>Hints (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Up to {MAX_HINTS} teasers shown on the sealed capsule while everyone waits. Hints are not
                  encrypted — never put secrets in them.
                </p>
                {hints.map((hint, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      value={hint}
                      onChange={(e) => setHint(i, e.target.value)}
                      placeholder={`Hint ${i + 1} — e.g., "It involves a promise"`}
                      maxLength={MAX_HINT_LENGTH}
                      disabled={loading}
                      className="bg-background/50"
                    />
                    <span className="text-xs text-muted-foreground w-14 text-right">{hint.length}/{MAX_HINT_LENGTH}</span>
                    <Button type="button" variant="outline" size="sm" disabled={loading}
                      onClick={() => setHints(prev => prev.filter((_, x) => x !== i))}>
                      ✕
                    </Button>
                  </div>
                ))}
                {hints.length < MAX_HINTS && (
                  <Button type="button" variant="outline" size="sm" disabled={loading}
                    onClick={() => setHints(prev => [...prev, ''])}>
                    + Add hint
                  </Button>
                )}
              </div>

              {/* Unlock Date */}
              <div className="space-y-2">
                <Label htmlFor="unlockDate">Unlock Date *</Label>
                <Input
                  id="unlockDate"
                  type="date"
                  min={minDate}
                  value={unlockDate}
                  onChange={(e) => setUnlockDate(e.target.value)}
                  required
                  disabled={loading}
                  className="bg-background/50"
                />
                <p className="text-xs text-muted-foreground">Must be at least tomorrow — and it can never be changed once sealed</p>
              </div>

              {/* Recipients */}
              <div className="space-y-2">
                <Label htmlFor="recipients">Recipients (optional)</Label>
                <Input
                  id="recipients"
                  type="text"
                  placeholder="friend@example.com, another@example.com"
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  disabled={loading}
                  className="bg-background/50"
                />
                <p className="text-xs text-muted-foreground">Comma-separated emails of people to share with</p>
              </div>

              {/* Public Toggle */}
              <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-background/30">
                <div>
                  <div className="font-medium text-sm">Make Public</div>
                  <div className="text-xs text-muted-foreground">
                    Others can discover this capsule after it unlocks
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPublic(!isPublic)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isPublic ? 'bg-primary' : 'bg-secondary'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isPublic ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {unlockDate && (
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                  <p className="text-sm text-primary">
                    ⏳ This capsule will be sealed until{' '}
                    <strong>{new Date(unlockDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="submit"
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={loading}
                >
                  {loading ? 'Sealing...' : '🔒 Seal Capsule'}
                </Button>
                <Link href="/capsules">
                  <Button type="button" variant="outline" disabled={loading}>
                    Cancel
                  </Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
