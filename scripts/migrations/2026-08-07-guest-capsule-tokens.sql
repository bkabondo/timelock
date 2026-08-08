-- TimeLock guest-capsule access tokens (2026-08-07, second migration)
--
-- Closes the gap left by 2026-08-07-capsule-privacy.sql. That migration's read
-- policy is (user_id = auth.uid() OR is_public = true), so a capsule written by
-- a logged-out visitor — user_id NULL, is_public false — matches neither branch
-- and is unreachable by everyone, including the person who just wrote it. The
-- row is written successfully and then silently orphaned.
--
-- This adds a third way in: a bearer token carried in the request. Whoever
-- holds the token can read that one capsule. That is the whole security model —
-- the token IS the credential, so anyone with the link is the audience.
--
-- HOW THE TOKEN REACHES THE POLICY
-- --------------------------------
-- Through the PostgREST request header `x-capsule-token`. PostgREST publishes
-- every request header to Postgres as the `request.headers` GUC, so a policy
-- can read it with current_setting(). timelock_request_token() below wraps that
-- lookup; the three read policies then compare it against the stored column.
--
-- The client attaches the header when it constructs the Supabase client:
--
--   createClient(url, anonKey, {
--     global: { headers: { 'x-capsule-token': token } },
--   })
--
-- Why a header rather than the alternatives:
--
--   * vs. a SECURITY DEFINER function — an RPC would have to re-implement
--     every read (metadata, hints, contents, and the unlock-date gate) in
--     function bodies that run with the definer's rights. Any bug there is a
--     full bypass. With a header the existing policies stay the single gate and
--     gain one more OR branch.
--   * vs. today's service-role admin client — app/capsules/[id]/page.tsx
--     currently reads guest capsules through createAdminClient(), which
--     bypasses RLS entirely. The database is trusting the application to have
--     compared the token correctly. After this migration that read goes back
--     through the anon key and the token is checked by Postgres, so an
--     application bug can no longer expose a capsule.
--   * vs. a query parameter matched in app code — same problem: the check
--     lives outside the database.
--
-- The header is not a secret channel, just a channel: it is sent over TLS,
-- never placed in a URL, and so never lands in an access log or a Referer.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ------------------------------------------------------------------- column
-- gen_random_uuid() is volatile, so ADD COLUMN evaluates it per row and every
-- existing capsule is backfilled with its own distinct token rather than one
-- shared value. 122 bits of entropy; not guessable, not enumerable.
ALTER TABLE timelock_capsules
  ADD COLUMN IF NOT EXISTS access_token TEXT NOT NULL DEFAULT gen_random_uuid()::text;

-- Unique so a token identifies exactly one capsule, and so the equality test in
-- the policies below is an index lookup instead of a scan.
CREATE UNIQUE INDEX IF NOT EXISTS timelock_capsules_access_token_key
  ON timelock_capsules (access_token);

-- --------------------------------------------------------- token accessor
-- Returns the token presented by the current request, or NULL.
--
-- current_setting(..., true) is the missing_ok form: it returns NULL instead of
-- raising when the GUC is unset, which is what happens outside PostgREST (the
-- SQL editor, psql, a migration). NULL then makes every `access_token = ...`
-- comparison below evaluate to NULL — never true — so a caller with no header
-- gets exactly the old owner/public behaviour and this migration cannot widen
-- access for anything that is not presenting a token.
--
-- nullif(..., '') keeps an empty header from being treated as a real value.
CREATE OR REPLACE FUNCTION timelock_request_token() RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
  SELECT nullif(
    current_setting('request.headers', true)::json ->> 'x-capsule-token',
    ''
  );
$fn$;

-- ------------------------------------------------------------------ policies
-- Metadata. Third branch added; the first two are unchanged.
DROP POLICY IF EXISTS "tl_capsules_read" ON timelock_capsules;
CREATE POLICY "tl_capsules_read" ON timelock_capsules FOR SELECT USING (
  user_id = auth.uid()
  OR is_public = true
  OR access_token = timelock_request_token()
);

-- The letter. The token is a fourth way to be authorised, NOT a way to skip the
-- clock: unlock_date <= now() still has to hold, so a token holder waiting for a
-- sealed capsule gets nothing back from this table. Still no UPDATE or DELETE
-- policy, so contents remain append-only.
DROP POLICY IF EXISTS "tl_contents_read" ON timelock_capsule_contents;
CREATE POLICY "tl_contents_read" ON timelock_capsule_contents FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.timelock_capsules c
    WHERE c.id = capsule_id
      AND c.unlock_date <= now()
      AND (
        c.user_id = auth.uid()
        OR c.is_public = true
        OR c.access_token = timelock_request_token()
      )
  )
);

-- Hints are the sealed-capsule experience, so they are readable before unlock —
-- gated on the capsule, exactly like metadata.
DROP POLICY IF EXISTS "tl_hints_read" ON timelock_capsule_hints;
CREATE POLICY "tl_hints_read" ON timelock_capsule_hints FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.timelock_capsules c
    WHERE c.id = capsule_id
      AND (
        c.user_id = auth.uid()
        OR c.is_public = true
        OR c.access_token = timelock_request_token()
      )
  )
);

-- INSERT policies are deliberately untouched: they still require
-- user_id = auth.uid(), so anonymous writes remain impossible through RLS and
-- guest creation keeps going through /api/capsules/guest, which validates input
-- and mints the token behind the service role.

COMMIT;

-- ---------------------------------------------------------------- verification
-- Run after COMMIT.
--
-- 1. Column and index exist:
--      SELECT column_name, is_nullable, column_default
--        FROM information_schema.columns
--       WHERE table_name = 'timelock_capsules' AND column_name = 'access_token';
--      SELECT indexdef FROM pg_indexes
--       WHERE indexname = 'timelock_capsules_access_token_key';
--
-- 2. Every capsule got a distinct token (both counts must match):
--      SELECT count(*), count(DISTINCT access_token) FROM timelock_capsules;
--
-- 3. Nine policies still, with the token branch in three of them:
--      SELECT tablename, policyname, cmd, qual FROM pg_policies
--       WHERE tablename LIKE 'timelock%' ORDER BY tablename, policyname;
--
-- 4. No header means no widening — this must return NULL, not an error:
--      SELECT timelock_request_token();
--
-- 5. End to end, from a shell (anon key only, no service role). Take a guest
--    capsule's id and token from the created_at-newest ownerless row:
--      SELECT id, access_token FROM timelock_capsules WHERE user_id IS NULL
--       ORDER BY created_at DESC LIMIT 1;
--
--    Without the header — must be []:
--      curl -s "$URL/rest/v1/timelock_capsules?id=eq.$ID&select=id" \
--           -H "apikey: $ANON"
--    With it — must return the row:
--      curl -s "$URL/rest/v1/timelock_capsules?id=eq.$ID&select=id" \
--           -H "apikey: $ANON" -H "x-capsule-token: $TOKEN"
--    With a wrong token — must be []:
--      curl -s "$URL/rest/v1/timelock_capsules?id=eq.$ID&select=id" \
--           -H "apikey: $ANON" -H "x-capsule-token: not-the-token"
--    Sealed capsule contents, correct token — must still be []:
--      curl -s "$URL/rest/v1/timelock_capsule_contents?capsule_id=eq.$ID&select=body" \
--           -H "apikey: $ANON" -H "x-capsule-token: $TOKEN"
