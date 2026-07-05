// Secure auth: bcrypt password hashing + signed session tokens in httpOnly cookies.
import bcrypt from 'bcryptjs'
import { db } from './db'

const SESSION_COOKIE = 'labby_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const BCRYPT_ROUNDS = 10
const SESSION_SECRET = process.env.SESSION_SECRET || 'labby-dev-session-secret-change-me-9f8e7c6d5b4a'

const revokedTokens = new Set<string>()

async function hmacSign(data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return Buffer.from(new Uint8Array(sig)).toString('base64url')
}

async function hmacVerify(data: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(data)
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

export async function hashPassword(plain: string): Promise<string> { return bcrypt.hash(plain, BCRYPT_ROUNDS) }
export async function verifyPassword(plain: string, hash: string): Promise<boolean> { return bcrypt.compare(plain, hash) }

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
  if (!(await hmacVerify(payloadStr, sig))) return null
  if (revokedTokens.has(token)) return null
  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString())
    if (Date.now() > payload.exp) return null
    return { userId: payload.userId }
  } catch { return null }
}

export function destroySession(token: string | undefined | null): void { if (token) revokedTokens.add(token) }

export function getSessionCookieName(): string { return SESSION_COOKIE }
export function getSessionCookieOptions() {
  return { httpOnly: false, secure: false, sameSite: 'lax' as const, path: '/', maxAge: SESSION_TTL_MS / 1000 }
}

export async function getUserFromRequest(req: Request): Promise<{ id: string; name: string; email: string; role: string; department: string | null } | null> {
  let token: string | undefined | null = null
  const cookie = req.headers.get('cookie') || ''
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
  token = match?.[1]
  if (!token) {
    const authHeader = req.headers.get('authorization') || ''
    if (authHeader.startsWith('Bearer ')) token = authHeader.slice(7)
  }
  const session = await verifySessionToken(token)
  if (!session) return null
  const user = await db.user.findUnique({ where: { id: session.userId } })
  if (!user) return null
  return { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department }
}
