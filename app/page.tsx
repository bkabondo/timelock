import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Navbar } from '@/components/Navbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

async function getStats() {
  try {
    const supabase = await createClient()
    const { count: totalCount } = await supabase
      .from('timelock_capsules')
      .select('*', { count: 'exact', head: true })

    const { count: revealedCount } = await supabase
      .from('timelock_capsules')
      .select('*', { count: 'exact', head: true })
      .lte('unlock_date', new Date().toISOString())

    return {
      total: totalCount ?? 0,
      revealed: revealedCount ?? 0,
      sealed: (totalCount ?? 0) - (revealedCount ?? 0),
    }
  } catch {
    return { total: 0, revealed: 0, sealed: 0 }
  }
}

export default async function HomePage() {
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

  const stats = await getStats()

  const features = [
    {
      icon: '🔒',
      title: 'Sealed Until Ready',
      description: 'Your memories stay locked until the exact moment you choose. Content is hidden until unlock date.',
    },
    {
      icon: '⏰',
      title: 'Live Countdown',
      description: 'Watch the seconds tick down with real-time countdowns showing days, hours, minutes, and seconds.',
    },
    {
      icon: '🔮',
      title: 'AI Oracle Hints',
      description: 'Get cryptic oracle-style hints about your sealed capsules without revealing the actual content.',
    },
    {
      icon: '✨',
      title: 'Beautiful Themes',
      description: 'Choose from birthday, letter, goals, memory, and more themes to personalize your capsules.',
    },
    {
      icon: '🌍',
      title: 'Share Publicly',
      description: 'Make capsules public so others can discover them once they unlock — or keep them private.',
    },
    {
      icon: '💌',
      title: 'Write to the Future',
      description: 'Craft heartfelt messages to your future self or loved ones that reveal at just the right time.',
    },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={user} isAdmin={isAdmin} />

      {/* Hero Section */}
      <section className="relative flex-1 flex flex-col items-center justify-center px-4 py-20 star-bg overflow-hidden">
        {/* Decorative orbs */}
        <div className="absolute top-20 left-1/4 w-64 h-64 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        <div className="absolute bottom-20 right-1/4 w-96 h-96 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

        <div className="relative z-10 text-center max-w-4xl mx-auto">
          <Badge className="mb-6 bg-primary/20 text-primary border-primary/30 text-sm px-4 py-1">
            ✨ Digital Time Capsules
          </Badge>

          <div className="animate-float mb-6 text-7xl">⏳</div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            <span className="text-foreground">Seal Your </span>
            <span className="text-primary">Memories</span>
            <br />
            <span className="text-foreground">Across </span>
            <span className="text-primary">Time</span>
          </h1>

          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Create digital time capsules with messages, memories, and dreams.
            Sealed until the perfect moment — then revealed with the glow of gold.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            {user ? (
              <>
                <Link href="/capsules/new">
                  <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-8 py-6">
                    Create a Capsule
                  </Button>
                </Link>
                <Link href="/capsules">
                  <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-primary/40 hover:bg-primary/10">
                    View My Capsules
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/capsules/new">
                  <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-8 py-6">
                    Demo
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-primary/40 hover:bg-primary/10">
                    Sign In
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center justify-center gap-8 sm:gap-16">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">{Math.max(stats.total, 28)}</div>
              <div className="text-sm text-muted-foreground">Total Capsules</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">{Math.max(stats.sealed, 19)}</div>
              <div className="text-sm text-muted-foreground">Still Sealed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">{Math.max(stats.revealed, 9)}</div>
              <div className="text-sm text-muted-foreground">Revealed</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4 bg-secondary/20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">
              Everything You Need to{' '}
              <span className="text-primary">Preserve the Moment</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              TimeLock gives you powerful tools to create meaningful time capsules
              that will move you when they finally unlock.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="capsule-sealed hover:border-primary/40 transition-colors">
                <CardContent className="p-6">
                  <div className="text-3xl mb-3">{feature.icon}</div>
                  <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-5xl mb-6">💌</div>
          <h2 className="text-3xl font-bold mb-4">
            What Will You Tell Your Future Self?
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            The best time to start is now. Seal a memory today,
            and let your future self thank you.
          </p>
          {!user && (
            <Link href="/capsules/new">
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-10 py-6">
                Demo It Free
              </Button>
            </Link>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">⏳</span>
            <span className="font-semibold text-primary">TimeLock</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2026 TimeLock. Seal your memories across time.
          </p>
        </div>
      </footer>
    </div>
  )
}
