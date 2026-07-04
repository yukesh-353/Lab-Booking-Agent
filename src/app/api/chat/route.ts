import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { runAgent, type ChatMessage } from '@/lib/agent'

// POST /api/chat — runs the booking agent for the current session user
// Body: { message, history }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const { message, history } = body as {
    message: string
    history?: ChatMessage[]
  }

  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const reply = await runAgent(message, {
    user: {
      id: session.user.id,
      name: session.user.name || session.user.email,
      role: session.user.role,
      email: session.user.email,
      department: session.user.department,
    },
    history: Array.isArray(history) ? history : [],
  })

  return NextResponse.json({ reply })
}
