const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
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
