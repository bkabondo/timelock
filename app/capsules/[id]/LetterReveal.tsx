'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { decryptLetter } from '@/lib/capsule-crypto'

/**
 * Decrypts and renders an unlocked letter entirely in the browser.
 * The server hands this component ciphertext only; the key arrives via the
 * URL fragment (#key=...), which is never sent to the server, or is pasted
 * from the author's backup.
 */
export function LetterReveal({
  body,
  iv,
  isEncrypted,
}: {
  body: string
  iv: string | null
  isEncrypted: boolean
}) {
  const [plaintext, setPlaintext] = useState<string | null>(isEncrypted ? null : body)
  const [manualKey, setManualKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checkedFragment, setCheckedFragment] = useState(!isEncrypted)

  const tryKey = useCallback(
    async (key: string) => {
      try {
        setError(null)
        setPlaintext(await decryptLetter(key.trim(), body, iv ?? ''))
      } catch {
        setError('That key does not fit this capsule.')
      }
    },
    [body, iv]
  )

  useEffect(() => {
    if (!isEncrypted) return
    const match = window.location.hash.match(/key=([A-Za-z0-9_-]+)/)
    if (match) void tryKey(match[1])
    setCheckedFragment(true)
  }, [isEncrypted, tryKey])

  if (plaintext !== null) {
    return (
      <div className="text-foreground leading-relaxed whitespace-pre-wrap text-lg">
        {plaintext}
      </div>
    )
  }

  if (!checkedFragment) {
    return <p className="text-muted-foreground text-center py-6">Opening capsule…</p>
  }

  return (
    <div className="text-center py-6 space-y-4">
      <div className="text-4xl">🗝️</div>
      <p className="text-muted-foreground">
        This letter is encrypted. Open it with your original reveal link, or paste your capsule key.
      </p>
      <form
        className="flex gap-2 max-w-md mx-auto"
        onSubmit={(e) => {
          e.preventDefault()
          if (manualKey.trim()) void tryKey(manualKey)
        }}
      >
        <Input
          value={manualKey}
          onChange={(e) => setManualKey(e.target.value)}
          placeholder="Paste capsule key…"
          className="bg-background/50 font-mono text-sm"
        />
        <Button type="submit" disabled={!manualKey.trim()}>
          Unlock
        </Button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <p className="text-xs text-muted-foreground">
        The key was shown once, when this capsule was sealed. Without it the letter cannot be
        recovered — not even by TimeLock.
      </p>
    </div>
  )
}
