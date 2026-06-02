const { createClient } = require('@supabase/supabase-js')
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}})
const accounts = [
  {email:'kabondobenjamin1@gmail.com',password:'Admin@Kabondo123!',full_name:'Benjamin Kabondo',role:'admin'},
  {email:'testuser1@proj.com',password:'TestUser1@123',full_name:'Alice Johnson',role:'user'},
  {email:'testuser2@proj.com',password:'TestUser2@123',full_name:'Bob Smith',role:'user'},
  {email:'testuser3@proj.com',password:'TestUser3@123',full_name:'Carol Davis',role:'user'},
]
async function seed() {
  const {data:{users:existing}} = await admin.auth.admin.listUsers()
  const uids = {}
  for (const acc of accounts) {
    let uid = existing.find(u=>u.email===acc.email)?.id
    if (!uid) { const {data,error} = await admin.auth.admin.createUser({email:acc.email,password:acc.password,email_confirm:true}); if(error){console.error(error.message);continue}; uid=data.user.id }
    await admin.from('timelock_users').upsert({id:uid,email:acc.email,full_name:acc.full_name,role:acc.role},{onConflict:'id'})
    uids[acc.email] = uid
    console.log('seeded',acc.email)
  }
  // Seed sample capsules for test users
  for (const email of ['testuser1@proj.com','testuser2@proj.com','testuser3@proj.com']) {
    const uid = uids[email]
    if (!uid) continue
    await admin.from('timelock_capsules').upsert([
      {creator_id:uid,title:'A Memory from the Past',content:'Dear future me, remember when we used to stay up late coding and dreaming about the future. Those were magical times full of possibility and wonder.',theme:'memory',unlock_date:new Date(Date.now()-86400000).toISOString()},
      {creator_id:uid,title:'Goals for 2027',content:'By 2027, I want to have accomplished so much - a thriving career, meaningful relationships, and the courage to chase every dream I have today.',theme:'goals',unlock_date:new Date(Date.now()+365*86400000).toISOString()}
    ])
  }
  process.exit(0)
}
seed().catch(e=>{console.error(e);process.exit(1)})
