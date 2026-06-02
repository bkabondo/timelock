import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user owns this capsule
    const { data: capsule } = await supabase
      .from('timelock_capsules')
      .select('id, title, tags, user_id, unlock_date')
      .eq('id', id)
      .single()

    if (!capsule) {
      return NextResponse.json({ error: 'Capsule not found' }, { status: 404 })
    }

    if (capsule.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const now = new Date()
    const unlockDate = new Date(capsule.unlock_date)
    if (unlockDate <= now) {
      return NextResponse.json({ error: 'Capsule is already unlocked' }, { status: 400 })
    }

    const { title, tags } = await request.json()
    const tagList = Array.isArray(tags) ? tags.join(', ') : (tags ?? 'general')

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: `Write ONE mysterious 25-word sentence hinting at this time capsule without revealing its content. Tags: ${tagList}. Title: "${title}". Sound like an oracle prophecy.`,
        },
      ],
    })

    const hint = (message.content[0] as { type: string; text: string }).text.trim()

    return NextResponse.json({ hint })
  } catch (err) {
    console.error('Hint generation error:', err)
    return NextResponse.json(
      { error: 'Failed to generate hint' },
      { status: 500 }
    )
  }
}
