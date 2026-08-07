/**
 * Best-effort in-process rate limiter for unauthenticated endpoints.
 *
 * Serverless caveat: each Lambda instance keeps its own counters, so this
 * throttles a single attacker's burst but is not a global quota. It exists to
 * stop casual abuse (a script hammering the guest endpoint to inflate the
 * database or the bill). For a hard guarantee, put Vercel Firewall or an
 * Upstash-backed limiter in front of it.
 */
const WINDOW_MS = 60_000
const buckets = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(key: string, limit: number): { ok: boolean; retryAfter: number } {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    // Opportunistic sweep so the map cannot grow without bound.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k)
    }
    return { ok: true, retryAfter: 0 }
  }

  bucket.count++
  if (bucket.count > limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) }
  }
  return { ok: true, retryAfter: 0 }
}

/** Client IP as seen through Vercel's proxy. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  return fwd?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown'
}
