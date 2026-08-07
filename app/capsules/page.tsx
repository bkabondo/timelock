import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Navbar } from '@/components/Navbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Countdown } from '@/components/Countdown'

type Capsule = {
  id: string
  title: string
  tags: string[] | null
  unlock_date: string
  is_public: boolean
  created_at: string
}

function TagEmoji({ tags }: { tags: string[] | null }) {
  const tagEmojiMap: Record<string, string> = {
    birthday: '🎂',
    letter: '✉️',
    goals: '🎯',
    memory: '💭',
    other: '📦',
  }
  const firstTag = tags?.[0]
  return <span>{(firstTag && tagEmojiMap[firstTag]) ?? '⏳'}</span>
}

export default async function CapsulesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('timelock_users')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'
  const now = new Date().toISOString()

  // Metadata only — letters live in timelock_capsule_contents, encrypted.
  const { data: capsules } = await supabase
    .from('timelock_capsules')
    .select('id, title, tags, unlock_date, is_public, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const sealed = capsules?.filter(c => c.unlock_date > now) ?? []
  const revealed = capsules?.filter(c => c.unlock_date <= now) ?? []

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={user} isAdmin={isAdmin} />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">
              My Time Capsules
            </h1>
            <p className="text-muted-foreground mt-1">
              {capsules?.length ?? 0} capsule{capsules?.length !== 1 ? 's' : ''} — {sealed.length} sealed, {revealed.length} revealed
            </p>
          </div>
          <Link href="/capsules/new">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              + New Capsule
            </Button>
          </Link>
        </div>

        {/* Sealed Capsules */}
        {sealed.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span>🔒</span>
              <span>Sealed</span>
              <Badge variant="secondary">{sealed.length}</Badge>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sealed.map((capsule: Capsule) => (
                <Link href={`/capsules/${capsule.id}`} key={capsule.id}>
                  <Card className="capsule-sealed hover:border-primary/30 transition-all cursor-pointer h-full">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <TagEmoji tags={capsule.tags} />
                        <span className="text-xs text-muted-foreground">
                          {capsule.is_public ? '🌍 Public' : '🔒 Private'}
                        </span>
                      </div>
                      <CardTitle className="text-base mt-2">{capsule.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-muted-foreground mb-3">
                        Unlocks {new Date(capsule.unlock_date).toLocaleDateString()}
                      </div>
                      <Countdown unlockDate={capsule.unlock_date} />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Revealed Capsules */}
        {revealed.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span>✨</span>
              <span>Revealed</span>
              <Badge variant="secondary">{revealed.length}</Badge>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {revealed.map((capsule: Capsule) => (
                <Link href={`/capsules/${capsule.id}`} key={capsule.id}>
                  <Card className="capsule-revealed animate-pulse-gold hover:border-primary/60 transition-all cursor-pointer h-full">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <TagEmoji tags={capsule.tags} />
                        <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                          Revealed ✨
                        </Badge>
                      </div>
                      <CardTitle className="text-base mt-2">{capsule.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        🗝️ Open with your reveal link to read the letter
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Unlocked {new Date(capsule.unlock_date).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {(!capsules || capsules.length === 0) && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">⏳</div>
            <h2 className="text-2xl font-bold mb-2">No capsules yet</h2>
            <p className="text-muted-foreground mb-6">
              Create your first time capsule and seal a memory across time.
            </p>
            <Link href="/capsules/new">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                Create Your First Capsule
              </Button>
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
