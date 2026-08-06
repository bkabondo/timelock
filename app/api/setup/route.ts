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
      CREATE TABLE IF NOT EXISTS timelock_capsules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES timelock_users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        unlock_date TIMESTAMPTZ NOT NULL,
        is_public BOOLEAN DEFAULT false,
        recipients TEXT[],
        has_hint BOOLEAN DEFAULT false,
        hint_text TEXT,
        ai_letter TEXT,
        tags TEXT[],
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      GRANT ALL ON timelock_capsules TO anon, authenticated;
      ALTER TABLE timelock_capsules ENABLE ROW LEVEL SECURITY;
      -- Capsule contents are private. Admins deliberately get NO read access:
      -- ownership (or the author marking it public) is the only thing that
      -- reveals a capsule, so platform operators cannot read users' letters.
      -- Recreated unconditionally so existing databases pick up the change.
      DROP POLICY IF EXISTS "tl_capsules_user" ON timelock_capsules;
      -- Leftover from an earlier migration. Postgres ORs permissive policies
      -- together, so leaving it would widen tl_capsules_read below.
      DROP POLICY IF EXISTS "tl_capsules_select" ON timelock_capsules;
      DROP POLICY IF EXISTS "tl_capsules_read" ON timelock_capsules;
      DROP POLICY IF EXISTS "tl_capsules_insert" ON timelock_capsules;
      DROP POLICY IF EXISTS "tl_capsules_update" ON timelock_capsules;
      DROP POLICY IF EXISTS "tl_capsules_delete" ON timelock_capsules;
      CREATE POLICY "tl_capsules_read" ON timelock_capsules FOR SELECT USING (user_id=auth.uid() OR is_public=true);
      CREATE POLICY "tl_capsules_insert" ON timelock_capsules FOR INSERT WITH CHECK (user_id=auth.uid());
      CREATE POLICY "tl_capsules_update" ON timelock_capsules FOR UPDATE USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
      CREATE POLICY "tl_capsules_delete" ON timelock_capsules FOR DELETE USING (user_id=auth.uid());
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
