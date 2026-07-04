import { NextRequest, NextResponse } from 'next/server'
import { destroySession, getSessionCookieName } from '@/lib/auth'

// POST /api/auth/logout — clear the session cookie
export async function POST(req: NextRequest) {
  const cookie = req.headers.get('cookie') || ''
  const match = cookie.match(new RegExp(`${getSessionCookieName()}=([^;]+)`))
  const token = match?.[1]
  destroySession(token)
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(getSessionCookieName())
  return res
}
