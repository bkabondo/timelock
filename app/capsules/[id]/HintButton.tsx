'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface HintButtonProps {
  capsuleId: string
  title: string
  tags: string[]
}

export function HintButton({ capsuleId, title, tags }: HintButtonProps) {
  const [hint, setHint] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function getHint() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/capsules/${capsuleId}/hint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, tags }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to get hint')
      } else {
        setHint(data.hint)
      }
    } catch {
      setError('Failed to get hint')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <Button
          onClick={getHint}
          disabled={loading}
          variant="outline"
          className="border-primary/40 hover:bg-primary/10 text-primary"
        >
          {loading ? '🔮 Consulting the Oracle...' : '🔮 Get AI Oracle Hint'}
        </Button>
      </div>

      {error && (
        <p className="text-destructive text-sm text-center">{error}</p>
      )}

      {hint && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-widest">Oracle Speaks</p>
            <p className="text-foreground italic leading-relaxed">&ldquo;{hint}&rdquo;</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
