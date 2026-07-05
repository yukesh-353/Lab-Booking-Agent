import { NextRequest, NextResponse } from 'next/server'
import { destroySession, getSessionCookieName } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const cookie = req.headers.get('cookie') || ''
  const match = cookie.match(new RegExp(`${getSessionCookieName()}=([^;]+)`))
  destroySession(match?.[1])
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(getSessionCookieName())
  return res
}
