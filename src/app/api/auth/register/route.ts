import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, createSessionToken, getSessionCookieOptions, getSessionCookieName } from '@/lib/auth'

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const { name, email, password, role, department } = body
  if (!name?.trim() || !email?.trim() || !password) return NextResponse.json({ error: 'Name, email, and password are required.' }, { status: 400 })

  const emailStr = String(email).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) return NextResponse.json({ error: 'Invalid email format.' }, { status: 400 })
  if (typeof password !== 'string' || password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
  if (name.trim().length < 2 || name.trim().length > 100) return NextResponse.json({ error: 'Name must be 2-100 characters.' }, { status: 400 })

  const allowedRoles = ['STUDENT', 'FACULTY', 'STAFF']
  const finalRole = allowedRoles.includes(role) ? role : 'STUDENT'

  const existing = await db.user.findUnique({ where: { email: emailStr } })
  if (existing) return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 })

  const passwordHash = await hashPassword(password)
  const user = await db.user.create({ data: { name: name.trim(), email: emailStr, passwordHash, role: finalRole, department: department?.trim() || null } })
  const token = await createSessionToken(user.id)
  const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department } }, { status: 201 })
  res.cookies.set(getSessionCookieName(), token, getSessionCookieOptions())
  return res
}
