import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { runAgent, type ChatMessage } from '@/lib/agent'

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const { userId, message, history } = body as { userId: string; message: string; history?: ChatMessage[] }
  if (!userId || !message) return NextResponse.json({ error: 'userId and message are required' }, { status: 400 })
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const reply = await runAgent(message, { user: { id: user.id, name: user.name, role: user.role, email: user.email, department: user.department }, history: Array.isArray(history) ? history : [] })
  return NextResponse.json({ reply })
}
