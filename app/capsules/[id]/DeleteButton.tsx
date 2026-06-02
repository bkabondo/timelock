'use client'

import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

interface DeleteButtonProps {
  capsuleId: string
}

export function DeleteButton({ capsuleId }: DeleteButtonProps) {
  async function handleDelete() {
    if (!confirm('Delete this capsule? This cannot be undone.')) return
    const supabase = createClient()
    await supabase.from('timelock_capsules').delete().eq('id', capsuleId)
    window.location.href = '/capsules'
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="text-destructive border-destructive/30 hover:bg-destructive/10 text-sm"
      onClick={handleDelete}
    >
      🗑️ Delete Capsule
    </Button>
  )
}
