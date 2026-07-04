import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { runAgent, type ChatMessage } from '@/lib/agent'

// POST /api/chat — runs the booking agent for the current user
// Body: { userId, message, history }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { userId, message, history } = body as {
    userId: string
    message: string
    history?: ChatMessage[]
  }

  if (!userId || !message) {
    return NextResponse.json({ error: 'userId and message are required' }, { status: 400 })
  }

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const reply = await runAgent(message, {
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
      department: user.department,
    },
    history: Array.isArray(history) ? history : [],
  })

  return NextResponse.json({ reply })
}
