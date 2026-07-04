import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/session?email=...  — look up a user by email for demo login
// POST /api/session           — create or update a session user
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const email = url.searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const user = await db.user.findUnique({ where: { email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  return NextResponse.json({ user })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { email, name, role, department } = body
  if (!email || !name || !role) {
    return NextResponse.json({ error: 'email, name, role are required' }, { status: 400 })
  }
  const user = await db.user.upsert({
    where: { email },
    update: { name, role, department },
    create: { email, name, role, department },
  })
  return NextResponse.json({ user })
}
