import { Pool } from 'pg'
import { NextResponse } from 'next/server'

/**
 * Reachability probe for DATABASE_URL.
 *
 * Exists because /api/setup cannot answer this question: it is gated behind
 * SETUP_TOKEN and, past that gate, runs DDL — so an unauthenticated 401 proves
 * only that the route is deployed, and an authenticated call would alter the
 * schema. This runs SELECT 1 and nothing else.
 *
 * Unauthenticated on purpose: it discloses only whether this deployment can
 * open a connection. It never returns the driver's error, which quotes the
 * host and user of the connection it failed to make.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 10

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
    return NextResponse.json({ db: rows[0]?.ok === 1 ? 'ok' : 'unexpected' })
  } catch {
    return NextResponse.json({ db: 'unreachable' }, { status: 503 })
  } finally {
    await pool.end().catch(() => {})
  }
}
