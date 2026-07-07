import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

export async function POST(request: Request) {
  const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { recipients, capsuleTitle, unlockDate, senderName } = await request.json()
  if (!recipients?.length) return NextResponse.json({ error: 'No recipients' }, { status: 400 })

  const unlockFormatted = new Date(unlockDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const results = []
  for (const email of recipients) {
    const { error } = await resend.emails.send({
      from: 'TimeLock <onboarding@resend.dev>',
      to: email,
      subject: `${senderName} sealed a time capsule for you ⏳`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0f172a;color:#f1f5f9;border-radius:16px;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="font-size:48px;">⏳</div>
            <h1 style="color:#f59e0b;margin:8px 0;">TimeLock</h1>
          </div>
          <h2 style="color:#f1f5f9;margin-bottom:8px;">${senderName} sealed a capsule for you</h2>
          <p style="color:#94a3b8;line-height:1.6;">A time capsule titled <strong style="color:#f1f5f9;">"${capsuleTitle}"</strong> has been sealed and shared with you.</p>
          <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;margin:20px 0;text-align:center;">
            <p style="color:#94a3b8;margin:0 0 4px;font-size:12px;">This capsule unlocks on</p>
            <p style="color:#f59e0b;font-size:18px;font-weight:bold;margin:0;">${unlockFormatted}</p>
          </div>
          <p style="color:#94a3b8;font-size:14px;">You'll be notified when it's time to open it. Until then, it remains sealed.</p>
        </div>
      `,
    })
    results.push({ email, ok: !error, error: error?.message })
  }

  return NextResponse.json({ results })
}
