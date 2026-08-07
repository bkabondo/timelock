-- TimeLock capsule-privacy migration (2026-08-07)
-- Splits letter content out of timelock_capsules, adds user-written hints,
-- locks unlock_date with a trigger, and rewrites RLS. Idempotent: safe to
-- re-run. Identical to the SQL applied by POST /api/setup.
--
-- What it does to EXISTING data:
--   * every letter moves from timelock_capsules.message into
--     timelock_capsule_contents (plaintext, is_encrypted = false)
--   * old AI oracle hints (hint_text) become hint #1 in timelock_capsule_hints
--   * THEN the message / hint_text / has_hint / ai_letter columns are DROPPED
--     (destructive, but only after the copies above have been made)

BEGIN;

-- ---------------------------------------------------------------- contents
CREATE TABLE IF NOT EXISTS timelock_capsule_contents (
  capsule_id UUID PRIMARY KEY REFERENCES timelock_capsules(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  iv TEXT,
  is_encrypted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT ALL ON timelock_capsule_contents TO anon, authenticated;
ALTER TABLE timelock_capsule_contents ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------- hints
CREATE TABLE IF NOT EXISTS timelock_capsule_hints (
  capsule_id UUID NOT NULL REFERENCES timelock_capsules(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 3),
  text TEXT NOT NULL CHECK (char_length(text) <= 100),
  PRIMARY KEY (capsule_id, position)
);
GRANT ALL ON timelock_capsule_hints TO anon, authenticated;
ALTER TABLE timelock_capsule_hints ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------- migrate then drop columns
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='timelock_capsules' AND column_name='message') THEN
    INSERT INTO timelock_capsule_contents (capsule_id, body, is_encrypted)
    SELECT id, message, false FROM timelock_capsules
    ON CONFLICT (capsule_id) DO NOTHING;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='timelock_capsules' AND column_name='hint_text') THEN
    INSERT INTO timelock_capsule_hints (capsule_id, position, text)
    SELECT id, 1, left(hint_text, 100) FROM timelock_capsules
    WHERE hint_text IS NOT NULL AND hint_text <> ''
    ON CONFLICT (capsule_id, position) DO NOTHING;
  END IF;
END $$;
ALTER TABLE timelock_capsules DROP COLUMN IF EXISTS message;
ALTER TABLE timelock_capsules DROP COLUMN IF EXISTS hint_text;
ALTER TABLE timelock_capsules DROP COLUMN IF EXISTS has_hint;
ALTER TABLE timelock_capsules DROP COLUMN IF EXISTS ai_letter;

-- --------------------------------------------- unlock_date is immutable
CREATE OR REPLACE FUNCTION timelock_freeze_unlock_date() RETURNS trigger AS $fn$
BEGIN
  IF NEW.unlock_date IS DISTINCT FROM OLD.unlock_date THEN
    RAISE EXCEPTION 'unlock_date is immutable: capsules cannot be resealed or unsealed early';
  END IF;
  RETURN NEW;
END $fn$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tl_capsules_freeze_unlock ON timelock_capsules;
CREATE TRIGGER tl_capsules_freeze_unlock BEFORE UPDATE ON timelock_capsules
  FOR EACH ROW EXECUTE FUNCTION timelock_freeze_unlock_date();

-- -------------------------------------------------------------- policies
-- Metadata: owner full access; public capsules visible while sealed (the
-- countdown-and-hints page IS the sealed experience). No admin access.
DROP POLICY IF EXISTS "tl_capsules_user"   ON timelock_capsules;
DROP POLICY IF EXISTS "tl_capsules_select" ON timelock_capsules;
DROP POLICY IF EXISTS "tl_capsules_read"   ON timelock_capsules;
DROP POLICY IF EXISTS "tl_capsules_insert" ON timelock_capsules;
DROP POLICY IF EXISTS "tl_capsules_update" ON timelock_capsules;
DROP POLICY IF EXISTS "tl_capsules_delete" ON timelock_capsules;
CREATE POLICY "tl_capsules_read"   ON timelock_capsules FOR SELECT USING (user_id=auth.uid() OR is_public=true);
CREATE POLICY "tl_capsules_insert" ON timelock_capsules FOR INSERT WITH CHECK (user_id=auth.uid());
CREATE POLICY "tl_capsules_update" ON timelock_capsules FOR UPDATE USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY "tl_capsules_delete" ON timelock_capsules FOR DELETE USING (user_id=auth.uid());

-- The letter: readable ONLY after unlock (database clock), and only by the
-- owner or on a public capsule. No UPDATE/DELETE policies — immutable.
DROP POLICY IF EXISTS "tl_contents_read"   ON timelock_capsule_contents;
DROP POLICY IF EXISTS "tl_contents_insert" ON timelock_capsule_contents;
CREATE POLICY "tl_contents_read" ON timelock_capsule_contents FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM timelock_capsules c
    WHERE c.id = capsule_id
      AND c.unlock_date <= now()
      AND (c.user_id = auth.uid() OR c.is_public = true)
  )
);
CREATE POLICY "tl_contents_insert" ON timelock_capsule_contents FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM timelock_capsules c WHERE c.id = capsule_id AND c.user_id = auth.uid())
);

-- Hints: gated exactly like metadata, sealed or not. Immutable.
DROP POLICY IF EXISTS "tl_hints_read"   ON timelock_capsule_hints;
DROP POLICY IF EXISTS "tl_hints_insert" ON timelock_capsule_hints;
CREATE POLICY "tl_hints_read" ON timelock_capsule_hints FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM timelock_capsules c
    WHERE c.id = capsule_id AND (c.user_id = auth.uid() OR c.is_public = true)
  )
);
CREATE POLICY "tl_hints_insert" ON timelock_capsule_hints FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM timelock_capsules c WHERE c.id = capsule_id AND c.user_id = auth.uid())
);

COMMIT;

-- Verification (run after COMMIT):
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
--   SELECT policyname, tablename, cmd FROM pg_policies
--     WHERE tablename LIKE 'timelock%' ORDER BY tablename, policyname;
--   UPDATE timelock_capsules SET unlock_date = now() WHERE id =
--     (SELECT id FROM timelock_capsules LIMIT 1);   -- must FAIL with the trigger error
