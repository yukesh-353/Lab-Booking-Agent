import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, createSessionToken, getSessionCookieOptions, getSessionCookieName } from '@/lib/auth'

// POST /api/auth/login — log in with email + password
// Body: { email, password }
export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { email, password } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  const emailStr = String(email).trim().toLowerCase()
  const user = await db.user.findUnique({ where: { email: emailStr } })

  // Use a generic error message so attackers can't enumerate accounts
  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }

  const passwordOk = await verifyPassword(String(password), user.passwordHash)
  if (!passwordOk) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }

  // Create session token and set cookie
  const token = await createSessionToken(user.id)
  const res = NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
    },
  })
  res.cookies.set(getSessionCookieName(), token, getSessionCookieOptions())
  return res
}
