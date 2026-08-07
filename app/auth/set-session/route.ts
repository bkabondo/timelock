import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const access_token = searchParams.get('access_token')
  const refresh_token = searchParams.get('refresh_token')

  if (access_token && refresh_token) {
    const supabase = await createClient()
    const { error } = await supabase.auth.setSession({ access_token, refresh_token })
    if (!error) {
      return NextResponse.redirect(`${origin}/capsules`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
