import { NextRequest, NextResponse } from 'next/server'
import { devMailbox } from '@/lib/auth'

// GET /api/auth/dev-mailbox?email=...
// Returns the latest magic link for an email (dev-only — used when no SMTP is configured)
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const email = url.searchParams.get('email')?.toLowerCase().trim()
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const entry = devMailbox.get(email)
  if (!entry) {
    return NextResponse.json({ found: false })
  }
  if (Date.now() > entry.expires) {
    devMailbox.delete(email)
    return NextResponse.json({ found: false, expired: true })
  }
  return NextResponse.json({
    found: true,
    url: entry.url,
    expires: entry.expires,
    sentAt: entry.sentAt,
  })
}

// DELETE /api/auth/dev-mailbox?email=...
// Clears a magic link after it's been used
export async function DELETE(req: NextRequest) {
  const url = new URL(req.url)
  const email = url.searchParams.get('email')?.toLowerCase().trim()
  if (email) devMailbox.delete(email)
  return NextResponse.json({ ok: true })
}
