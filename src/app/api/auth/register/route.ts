import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, verifyCaptcha, createSessionToken, getSessionCookieOptions, getSessionCookieName } from '@/lib/auth'

// POST /api/auth/register — create a new user account
// Body: { name, email, password, role, department?, captchaId, captchaAnswer }
export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, email, password, role, department, captchaId, captchaAnswer } = body

  // 1. Validate required fields
  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Name, email, and password are required.' }, { status: 400 })
  }

  // 2. Validate email format
  const emailStr = String(email).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  // 3. Validate password strength
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 })
  }
  if (password.length > 200) {
    return NextResponse.json({ error: 'Password is too long (max 200 characters).' }, { status: 400 })
  }

  // 4. Validate name length
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    return NextResponse.json({ error: 'Name must be between 2 and 100 characters.' }, { status: 400 })
  }

  // 5. Validate role — only Faculty and Staff can self-register (no Students, no Admins)
  const allowedRoles = ['FACULTY', 'STAFF']
  const finalRole = allowedRoles.includes(role) ? role : 'FACULTY'

  // 6. Verify captcha (REQUIRED for registration)
  if (!captchaId || captchaAnswer === undefined || captchaAnswer === null) {
    return NextResponse.json({ error: 'Captcha verification is required.' }, { status: 400 })
  }
  const captchaOk = await verifyCaptcha(String(captchaId), String(captchaAnswer))
  if (!captchaOk) {
    return NextResponse.json({ error: 'Captcha verification failed. Please try again.' }, { status: 400 })
  }

  // 7. Check email uniqueness
  const existing = await db.user.findUnique({ where: { email: emailStr } })
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists. Try logging in instead.' }, { status: 409 })
  }

  // 8. Hash password and create user
  const passwordHash = await hashPassword(password)
  const user = await db.user.create({
    data: {
      name: name.trim(),
      email: emailStr,
      passwordHash,
      role: finalRole,
      department: typeof department === 'string' && department.trim() ? department.trim() : null,
    },
  })

  // 9. Create session token and set cookie
  const token = await createSessionToken(user.id)
  const res = NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
    },
  }, { status: 201 })
  res.cookies.set(getSessionCookieName(), token, getSessionCookieOptions())
  return res
}
