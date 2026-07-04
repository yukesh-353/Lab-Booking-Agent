// Secure auth: bcrypt password hashing + signed session tokens + captcha challenges.
// Session tokens are signed JWT-like strings (header.payload.signature) using HMAC-SHA256.
// We store active sessions in-memory (a Map) — fine for single-instance demo deployments.
// For multi-instance production, swap the sessions Map for Redis or DB-backed sessions.
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

// ---- Captcha store: captchaId -> { answer, expiresAt } ----
interface CaptchaChallenge {
  id: string
  question: string
  answer: string
  expiresAt: number
}
const captchas = new Map<string, CaptchaChallenge>()

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
  // Constant-time-ish comparison
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
  const token = `${payloadStr}.${sig}`
  return token
}

export async function verifySessionToken(token: string | undefined | null): Promise<{ userId: string } | null> {
  if (!token) return null
  const [payloadStr, sig] = token.split('.')
  if (!payloadStr || !sig) return null

  // Check signature
  const valid = await hmacVerify(payloadStr, sig)
  if (!valid) return null

  // Check if revoked (logged out)
  if (revokedTokens.has(token)) return null

  // Parse payload
  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString())
    if (Date.now() > payload.exp) {
      return null
    }
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

// ---- Captcha generation ----
// Generates a simple math challenge (e.g. "3 + 7 = ?") — lightweight, no external service needed.
export function generateCaptcha(): { id: string; question: string } {
  const a = Math.floor(Math.random() * 9) + 1 // 1-9
  const b = Math.floor(Math.random() * 9) + 1 // 1-9
  const ops = ['+', '-'] as const
  const op = ops[Math.floor(Math.random() * ops.length)]
  const answer = op === '+' ? a + b : a - b
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const question = `${a} ${op} ${b} = ?`
  captchas.set(id, {
    id,
    question,
    answer: String(answer),
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min
  })
  return { id, question }
}

// ---- Captcha verification (consumes the challenge so it can't be reused) ----
export function verifyCaptcha(id: string, userAnswer: string): boolean {
  const challenge = captchas.get(id)
  if (!challenge) return false
  // Always delete after an attempt (one-shot)
  captchas.delete(id)
  if (Date.now() > challenge.expiresAt) return false
  return challenge.answer.trim() === userAnswer.trim()
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
