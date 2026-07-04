// Secure auth: bcrypt password hashing + signed session tokens + captcha challenges.
// Session tokens and captchas are stateless (signed with HMAC-SHA256) so they
// survive Next.js dev hot reloads — no in-memory store needed for verification.
// Logout uses a small in-memory blocklist of revoked tokens.
import bcrypt from 'bcryptjs'
import { db } from './db'

const SESSION_COOKIE = 'labby_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const BCRYPT_ROUNDS = 10

// ---- Secret (in production, set SESSION_SECRET env var) ----
const SESSION_SECRET = process.env.SESSION_SECRET || 'labby-dev-session-secret-change-me-9f8e7c6d5b4a'

// ---- In-memory blocklist for logged-out tokens (so logout actually invalidates) ----
// Note: this resets on server restart, which is acceptable — tokens also expire by time.
const revokedTokens = new Set<string>()

// ---- Captcha replay-protection (one-shot) ----
const usedCaptchas = new Set<string>()

// ---- HMAC-SHA256 signing (Web Crypto API, available in Node 18+ / Edge) ----
async function hmacSign(data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return Buffer.from(new Uint8Array(sig)).toString('base64url')
}

async function hmacVerify(data: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(data)
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return diff === 0
}

// ---- Password hashing ----
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

// ---- Session token create/verify (stateless — signature is self-contained) ----
export async function createSessionToken(userId: string): Promise<string> {
  const payload = { userId, iat: Date.now(), exp: Date.now() + SESSION_TTL_MS }
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = await hmacSign(payloadStr)
  return `${payloadStr}.${sig}`
}

export async function verifySessionToken(token: string | undefined | null): Promise<{ userId: string } | null> {
  if (!token) return null
  const [payloadStr, sig] = token.split('.')
  if (!payloadStr || !sig) return null

  const valid = await hmacVerify(payloadStr, sig)
  if (!valid) return null

  // Check if revoked (logged out)
  if (revokedTokens.has(token)) return null

  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString())
    if (Date.now() > payload.exp) return null
    return { userId: payload.userId }
  } catch {
    return null
  }
}

export function destroySession(token: string | undefined | null): void {
  if (token) revokedTokens.add(token)
}

// ---- Cookie helpers ----
export function getSessionCookieName(): string {
  return SESSION_COOKIE
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_MS / 1000, // seconds
  }
}

// ---- Captcha: self-contained signed tokens (survives dev hot reloads) ----
// The captcha "id" is a signed token containing the answer + expiry, so verification
// doesn't depend on an in-memory store that gets wiped on hot reload.
interface CaptchaPayload {
  answer: string
  exp: number
}

// Generates a simple math challenge (e.g. "3 + 7 = ?")
export async function generateCaptcha(): Promise<{ id: string; question: string }> {
  const a = Math.floor(Math.random() * 9) + 1 // 1-9
  const b = Math.floor(Math.random() * 9) + 1 // 1-9
  const ops = ['+', '-'] as const
  const op = ops[Math.floor(Math.random() * ops.length)]
  const answer = op === '+' ? a + b : a - b
  const question = `${a} ${op} ${b} = ?`
  const payload: CaptchaPayload = { answer: String(answer), exp: Date.now() + 5 * 60 * 1000 }
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = await hmacSign(payloadStr)
  const id = `${payloadStr}.${sig}`
  return { id, question }
}

// Verifies the captcha answer (one-shot — token can't be reused)
export async function verifyCaptcha(id: string, userAnswer: string): Promise<boolean> {
  if (!id || !userAnswer) return false
  // One-shot: if already used, reject
  if (usedCaptchas.has(id)) {
    if (usedCaptchas.size > 1000) usedCaptchas.clear()
    return false
  }
  const [payloadStr, sig] = id.split('.')
  if (!payloadStr || !sig) return false
  const valid = await hmacVerify(payloadStr, sig)
  if (!valid) return false
  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString()) as CaptchaPayload
    if (Date.now() > payload.exp) return false
    const ok = payload.answer.trim() === String(userAnswer).trim()
    if (ok) usedCaptchas.add(id)
    return ok
  } catch {
    return false
  }
}

// ---- Get current user from request (helper for API routes) ----
export async function getUserFromRequest(req: Request): Promise<{ id: string; name: string; email: string; role: string; department: string | null } | null> {
  const cookie = req.headers.get('cookie') || ''
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
  const token = match?.[1]
  const session = await verifySessionToken(token)
  if (!session) return null
  const user = await db.user.findUnique({ where: { id: session.userId } })
  if (!user) return null
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
  }
}
