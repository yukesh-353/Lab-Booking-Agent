import { NextRequest, NextResponse } from 'next/server'
import { runAgent, type ChatMessage } from '@/lib/agent'
import { getUserFromRequest } from '@/lib/auth'

// POST /api/chat — runs the booking agent for the current session user
// Body: { message, history }
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { message, history } = body as { message: string; history?: ChatMessage[] }
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const reply = await runAgent(message, {
    user: { id: user.id, name: user.name, role: user.role, email: user.email, department: user.department },
    history: Array.isArray(history) ? history : [],
  })

  return NextResponse.json({ reply })
}
