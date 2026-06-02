import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Navbar } from '@/components/Navbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('timelock_users')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    redirect('/capsules')
  }

  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  // Get all stats
  const [
    { count: totalCapsules },
    { count: sealedCount },
    { count: publicCount },
    { count: totalUsers },
    { data: recentCapsules },
    { data: allUsers },
  ] = await Promise.all([
    adminClient.from('timelock_capsules').select('*', { count: 'exact', head: true }),
    adminClient.from('timelock_capsules').select('*', { count: 'exact', head: true }).gt('unlock_date', now),
    adminClient.from('timelock_capsules').select('*', { count: 'exact', head: true }).eq('is_public', true),
    adminClient.from('timelock_users').select('*', { count: 'exact', head: true }),
    adminClient.from('timelock_capsules')
      .select('*, timelock_users!timelock_capsules_user_id_fkey(email, full_name)')
      .order('created_at', { ascending: false })
      .limit(10),
    adminClient.from('timelock_users')
      .select('*')
      .order('created_at', { ascending: false }),
  ])

  const revealedCount = (totalCapsules ?? 0) - (sealedCount ?? 0)
  const revealedPct = totalCapsules ? Math.round((revealedCount / totalCapsules) * 100) : 0

  const stats = [
    { label: 'Total Capsules', value: totalCapsules ?? 0, icon: '⏳' },
    { label: 'Sealed', value: sealedCount ?? 0, icon: '🔒' },
    { label: 'Revealed', value: revealedCount, icon: '✨' },
    { label: 'Public', value: publicCount ?? 0, icon: '🌍' },
    { label: 'Total Users', value: totalUsers ?? 0, icon: '👥' },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={user} isAdmin={true} />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚙️</span>
            <div>
              <h1 className="text-3xl font-bold">Admin Dashboard</h1>
              <p className="text-muted-foreground">Platform overview and management</p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          {stats.map((stat) => (
            <Card key={stat.label} className="capsule-sealed">
              <CardContent className="p-4 text-center">
                <div className="text-2xl mb-1">{stat.icon}</div>
                <div className="text-2xl font-bold text-primary">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Revealed Progress */}
        {(totalCapsules ?? 0) > 0 && (
          <Card className="capsule-sealed mb-8">
            <CardHeader>
              <CardTitle className="text-base">Capsule Unlock Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">Revealed</span>
                <span className="text-primary font-medium">{revealedPct}%</span>
              </div>
              <Progress value={revealedPct} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>{revealedCount} revealed</span>
                <span>{sealedCount} still sealed</span>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Capsules */}
          <Card className="capsule-sealed">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span>⏳</span>
                Recent Capsules
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentCapsules && recentCapsules.length > 0 ? (
                <div className="space-y-3">
                  {recentCapsules.map((capsule) => {
                    const isRevealed = new Date(capsule.unlock_date) <= new Date()
                    const creator = (capsule.timelock_users as { email?: string; full_name?: string } | null)
                    return (
                      <div key={capsule.id} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                        <div className="flex-1 min-w-0">
                          <Link href={`/capsules/${capsule.id}`} className="font-medium text-sm hover:text-primary truncate block">
                            {capsule.title}
                          </Link>
                          <p className="text-xs text-muted-foreground truncate">
                            {creator?.full_name ?? creator?.email ?? 'Unknown'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          {capsule.is_public && <Badge variant="outline" className="text-xs">Public</Badge>}
                          <Badge
                            className={`text-xs ${
                              isRevealed
                                ? 'bg-primary/20 text-primary border-primary/30'
                                : 'bg-secondary text-secondary-foreground'
                            }`}
                          >
                            {isRevealed ? '✨' : '🔒'}
                          </Badge>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No capsules yet</p>
              )}
            </CardContent>
          </Card>

          {/* Users List */}
          <Card className="capsule-sealed">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span>👥</span>
                Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              {allUsers && allUsers.length > 0 ? (
                <div className="space-y-3">
                  {allUsers.map((u) => (
                    <div key={u.id} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{u.full_name ?? 'No name'}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <Badge
                          className={`text-xs ${
                            u.role === 'admin'
                              ? 'bg-primary/20 text-primary border-primary/30'
                              : 'bg-secondary text-secondary-foreground'
                          }`}
                        >
                          {u.role}
                        </Badge>
                        <p className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(u.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No users yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Separator className="my-8" />

        <div className="text-center text-sm text-muted-foreground">
          <p>TimeLock Admin Panel — All data is real-time</p>
        </div>
      </main>
    </div>
  )
}
