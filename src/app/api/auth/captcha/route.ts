import { NextResponse } from 'next/server'
import { generateCaptcha } from '@/lib/auth'

// GET /api/auth/captcha — returns a new math captcha challenge
export async function GET() {
  const { id, question } = await generateCaptcha()
  return NextResponse.json({ id, question })
}
