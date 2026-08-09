const { Pool } = require('pg')

// Connects as the `postgres` superuser, which is not subject to RLS. Read it
// from the environment — never inline it. This file held a literal connection
// string from 2026-06-01 (390c9f7) until 2026-08-08 in a public repository;
// that password has since been rotated.
//
// Set DATABASE_URL before running, e.g.
//   DATABASE_URL='postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres?sslmode=require' \
//     node scripts/migrate.js
//
// !! OBSOLETE — DO NOT RUN AGAINST THE CURRENT DATABASE !!
// The SQL below describes the June 2026 schema. It is wrong in two ways that
// matter now:
//   1. It creates timelock_capsules with creator_id/content/theme. The live
//      schema uses user_id and keeps the letter in timelock_capsule_contents,
//      so the CREATE POLICY statements reference columns that no longer exist
//      and will error out partway through.
//   2. Its tl_capsules_select policy grants read access to role='admin'.
//      Capsule contents are deliberately private from admins; that path was
//      removed on purpose and must not come back.
// Kept only as a record of the original schema. The authoritative migrations
// are in scripts/migrations/.
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Refusing to run.')
  process.exit(1)
}

async function run() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS timelock_users (
        id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        email TEXT NOT NULL UNIQUE, full_name TEXT,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      GRANT ALL ON timelock_users TO anon, authenticated;
      ALTER TABLE timelock_users ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "tl_users_select" ON timelock_users;
      CREATE POLICY "tl_users_select" ON timelock_users FOR SELECT USING (auth.uid()=id OR EXISTS(SELECT 1 FROM timelock_users u WHERE u.id=auth.uid() AND u.role='admin'));
      DROP POLICY IF EXISTS "tl_users_insert" ON timelock_users;
      CREATE POLICY "tl_users_insert" ON timelock_users FOR INSERT WITH CHECK (auth.uid()=id);
      DROP POLICY IF EXISTS "tl_users_update" ON timelock_users;
      CREATE POLICY "tl_users_update" ON timelock_users FOR UPDATE USING (auth.uid()=id);

      CREATE TABLE IF NOT EXISTS timelock_capsules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        creator_id UUID NOT NULL REFERENCES timelock_users(id) ON DELETE CASCADE,
        title TEXT NOT NULL, content TEXT NOT NULL, theme TEXT DEFAULT 'default',
        unlock_date TIMESTAMPTZ NOT NULL, is_public BOOLEAN DEFAULT FALSE,
        recipient_email TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      GRANT ALL ON timelock_capsules TO anon, authenticated;
      ALTER TABLE timelock_capsules ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "tl_capsules_select" ON timelock_capsules;
      CREATE POLICY "tl_capsules_select" ON timelock_capsules FOR SELECT USING (
        creator_id=auth.uid() OR (is_public=TRUE AND unlock_date<=NOW()) OR
        EXISTS(SELECT 1 FROM timelock_users WHERE id=auth.uid() AND role='admin')
      );
      DROP POLICY IF EXISTS "tl_capsules_insert" ON timelock_capsules;
      CREATE POLICY "tl_capsules_insert" ON timelock_capsules FOR INSERT WITH CHECK (creator_id=auth.uid());
      DROP POLICY IF EXISTS "tl_capsules_delete" ON timelock_capsules;
      CREATE POLICY "tl_capsules_delete" ON timelock_capsules FOR DELETE USING (creator_id=auth.uid());
    `)
    console.log('Done')
  } finally { client.release(); await pool.end() }
}
run().catch(console.error)
