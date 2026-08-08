import { createClient } from '@supabase/supabase-js'

/**
 * Anon-key client that presents a capsule access token on every request.
 *
 * Guest capsules have no owner, so there is no identity for RLS to check. The
 * token stands in for one: `tl_capsules_read` and its two sibling policies
 * compare `access_token` against the `x-capsule-token` header, which PostgREST
 * exposes to Postgres as `request.headers`.
 *
 * The point of routing guest reads through here rather than through
 * createAdminClient() is that the database stays the gate. The service-role
 * client bypasses RLS entirely, which means a mistake in page code — a dropped
 * .eq(), a widened select — is a data leak. With this client the anon key can
 * only ever see what the presented token unlocks, so the same mistake returns
 * nothing.
 *
 * Never log the token: it is a bearer credential, and holding it is the whole
 * of the authorisation.
 */
export function createTokenClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { 'x-capsule-token': token } },
    }
  )
}
