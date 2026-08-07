import { Pool } from 'pg'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('token') !== process.env.SETUP_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS timelock_users (
        id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT,
        role TEXT DEFAULT 'user' CHECK (role IN ('admin','user')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      GRANT ALL ON timelock_users TO anon, authenticated;
      ALTER TABLE timelock_users ENABLE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tl_users_self' AND tablename = 'timelock_users') THEN
          CREATE POLICY "tl_users_self" ON timelock_users FOR ALL USING (auth.uid()=id OR (SELECT role FROM timelock_users WHERE id=auth.uid())='admin');
        END IF;
      END $$;

      -- Capsule METADATA only. The letter itself lives in
      -- timelock_capsule_contents: RLS is row-level, not column-level, so the
      -- secret must be a separate row to be gated separately from the
      -- countdown page.
      CREATE TABLE IF NOT EXISTS timelock_capsules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES timelock_users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        unlock_date TIMESTAMPTZ NOT NULL,
        is_public BOOLEAN DEFAULT false,
        recipients TEXT[],
        tags TEXT[],
        access_token TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      GRANT ALL ON timelock_capsules TO anon, authenticated;
      ALTER TABLE timelock_capsules ENABLE ROW LEVEL SECURITY;
      -- Guest capsules have no owner.
      ALTER TABLE timelock_capsules ALTER COLUMN user_id DROP NOT NULL;
      ALTER TABLE timelock_capsules ADD COLUMN IF NOT EXISTS access_token TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS timelock_capsules_access_token_key
        ON timelock_capsules (access_token) WHERE access_token IS NOT NULL;

      -- The letter. Stored as AES-256-GCM ciphertext for new capsules; the key
      -- lives only in the author's reveal link, never on the server. Legacy
      -- rows migrated from the old message column stay plaintext and are
      -- marked is_encrypted = false.
      CREATE TABLE IF NOT EXISTS timelock_capsule_contents (
        capsule_id UUID PRIMARY KEY REFERENCES timelock_capsules(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        iv TEXT,
        is_encrypted BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      GRANT ALL ON timelock_capsule_contents TO anon, authenticated;
      ALTER TABLE timelock_capsule_contents ENABLE ROW LEVEL SECURITY;

      -- User-written hints: at most 3, at most 100 chars, immutable once
      -- sealed. Hints are teasers, not secrets — they show on the sealed
      -- countdown page, so they are gated like metadata, not like the letter.
      CREATE TABLE IF NOT EXISTS timelock_capsule_hints (
        capsule_id UUID NOT NULL REFERENCES timelock_capsules(id) ON DELETE CASCADE,
        position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 3),
        text TEXT NOT NULL CHECK (char_length(text) <= 100),
        PRIMARY KEY (capsule_id, position)
      );
      GRANT ALL ON timelock_capsule_hints TO anon, authenticated;
      ALTER TABLE timelock_capsule_hints ENABLE ROW LEVEL SECURITY;

      -- Migrate letters and old AI hints out of timelock_capsules, then drop
      -- the columns. Guarded so this block is a no-op once the columns are gone.
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

      -- Nobody shortens the timer to read early — unlock_date is immutable.
      -- Triggers fire for every role, service_role included.
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

      -- Metadata policies. Admins deliberately get NO read access; public
      -- capsules are visible while sealed on purpose (the countdown-and-hints
      -- page IS the sealed experience) — only the letter is time-gated.
      DROP POLICY IF EXISTS "tl_capsules_user" ON timelock_capsules;
      DROP POLICY IF EXISTS "tl_capsules_select" ON timelock_capsules;
      DROP POLICY IF EXISTS "tl_capsules_read" ON timelock_capsules;
      DROP POLICY IF EXISTS "tl_capsules_insert" ON timelock_capsules;
      DROP POLICY IF EXISTS "tl_capsules_update" ON timelock_capsules;
      DROP POLICY IF EXISTS "tl_capsules_delete" ON timelock_capsules;
      CREATE POLICY "tl_capsules_read" ON timelock_capsules FOR SELECT USING (user_id=auth.uid() OR is_public=true);
      CREATE POLICY "tl_capsules_insert" ON timelock_capsules FOR INSERT WITH CHECK (user_id=auth.uid());
      CREATE POLICY "tl_capsules_update" ON timelock_capsules FOR UPDATE USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
      CREATE POLICY "tl_capsules_delete" ON timelock_capsules FOR DELETE USING (user_id=auth.uid());

      -- The letter opens ONLY after unlock, and only for the owner or a
      -- public capsule's viewers. now() is the database clock, so a client
      -- with a wrong clock gains nothing. No UPDATE/DELETE policies exist:
      -- sealed letters are immutable (row deletion happens via FK cascade
      -- when the capsule is deleted, which bypasses RLS by design).
      DROP POLICY IF EXISTS "tl_contents_read" ON timelock_capsule_contents;
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
        EXISTS (
          SELECT 1 FROM timelock_capsules c
          WHERE c.id = capsule_id AND c.user_id = auth.uid()
        )
      );

      -- Hints are visible whenever the capsule metadata is, sealed or not.
      DROP POLICY IF EXISTS "tl_hints_read" ON timelock_capsule_hints;
      DROP POLICY IF EXISTS "tl_hints_insert" ON timelock_capsule_hints;
      CREATE POLICY "tl_hints_read" ON timelock_capsule_hints FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM timelock_capsules c
          WHERE c.id = capsule_id AND (c.user_id = auth.uid() OR c.is_public = true)
        )
      );
      CREATE POLICY "tl_hints_insert" ON timelock_capsule_hints FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM timelock_capsules c
          WHERE c.id = capsule_id AND c.user_id = auth.uid()
        )
      );
    `)
    return NextResponse.json({ status: 'Migration complete' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  } finally {
    client.release()
    await pool.end()
  }
}
