import { Pool } from 'pg'
import { NextResponse } from 'next/server'

/**
 * Reachability probe for DATABASE_URL.
 *
 * Exists because /api/setup cannot answer this question: it is gated behind
 * SETUP_TOKEN and, past that gate, runs DDL — so an unauthenticated 401 proves
 * only that the route is deployed. This runs SELECT 1 and nothing else.
 *
 * Unauthenticated on purpose, so it discloses only what it must:
 *   - never the driver's error message, which quotes host and user;
 *   - never the hostname, only which KIND of host is configured. That is the
 *     one fact needed to diagnose the common failure here: Supabase's direct
 *     host (db.<ref>.supabase.co) is IPv6-only and Vercel functions are IPv4
 *     -only outbound, so a direct host fails DNS with ENOTFOUND before it ever
 *     authenticates. The session pooler resolves over IPv4 and works.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 10

/** 'pooler' | 'direct' | 'other' — never the hostname itself. */
function hostKind(url: string | undefined): string {
  try {
    const h = new URL(url!).hostname
    if (h.endsWith('.pooler.supabase.com')) return 'pooler'
    if (h.startsWith('db.') && h.endsWith('.supabase.co')) return 'direct(ipv6-only)'
    return 'other'
  } catch {
    return 'unparseable'
  }
}

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ db: 'unconfigured' }, { status: 503 })
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
    max: 1,
  })

  try {
    const { rows } = await pool.query('SELECT 1 AS ok')
    return NextResponse.json({
      db: rows[0]?.ok === 1 ? 'ok' : 'unexpected',
      host: hostKind(process.env.DATABASE_URL),
    })
  } catch (err: unknown) {
    // Codes only. A SQLSTATE such as 28P01 means the credential is wrong;
    // a syscall errno such as ENOTFOUND or ETIMEDOUT means the server was
    // never reached at all.
    const e = err as { code?: string; syscall?: string }
    return NextResponse.json(
      {
        db: 'unreachable',
        code: e.code ?? null,
        syscall: e.syscall ?? null,
        host: hostKind(process.env.DATABASE_URL),
      },
      { status: 503 }
    )
  } finally {
    await pool.end().catch(() => {})
  }
}
