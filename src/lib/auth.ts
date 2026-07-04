// NextAuth configuration with Email (magic link) provider
// Uses PrismaAdapter for session/persistence.
// In development (no SMTP), verification links are captured in an in-memory
// mailbox and exposed via /api/auth/dev-mailbox so the login UI can show them.
import type { NextAuthOptions } from 'next-auth'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import EmailProvider from 'next-auth/providers/email'
import { db } from './db'

// Dev mailbox: stores the latest verification URL per email
// (only used when no SMTP transport is configured)
export const devMailbox = new Map<string, { url: string; expires: number; sentAt: number }>()

const CLEANUP_AFTER_MS = 10 * 60 * 1000 // 10 min

function cleanupMailbox() {
  const now = Date.now()
  for (const [email, entry] of devMailbox.entries()) {
    if (now > entry.expires + CLEANUP_AFTER_MS) {
      devMailbox.delete(email)
    }
  }
}

// Custom sendVerificationRequest:
// - In production: would use nodemailer with SMTP (configure via env vars)
// - In development: stores the URL in devMailbox and logs it to the server console
async function sendVerificationRequest({
  identifier: email,
  url,
  expires,
  provider,
}: {
  identifier: string
  url: string
  expires: Date
  provider: { server?: string; from?: string }
}) {
  cleanupMailbox()

  const expiresMs = expires.getTime()
  devMailbox.set(email, { url, expires: expiresMs, sentAt: Date.now() })

  // Always log to console for transparency
  console.log('\n========================================')
  console.log(' MAGIC LINK — Labby Login')
  console.log('========================================')
  console.log(`To: ${email}`)
  console.log(`From: ${provider.from || 'labby@campus.edu'}`)
  console.log(`Subject: Sign in to Labby`)
  console.log(`\nClick here to sign in:\n  ${url}\n`)
  console.log(`Expires: ${expires.toISOString()}`)
  console.log('========================================\n')

  // In production with SMTP configured, we would send a real email here.
  // For now (sandbox), the dev mailbox UI is the primary delivery channel.
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  session: {
    strategy: 'jwt', // JWTs work better in serverless / edge; we don't need DB-backed sessions
  },
  providers: [
    EmailProvider({
      server: process.env.EMAIL_SERVER || '',
      from: process.env.EMAIL_FROM || 'labby@campus.edu',
      maxAge: 10 * 60, // 10 minutes
      sendVerificationRequest,
    }),
  ],
  callbacks: {
    // Inject user role + department into the JWT
    async jwt({ token, user, trigger, session }) {
      // Initial sign-in: user object is the freshly-created/looked-up user
      if (user) {
        token.id = user.id
        // Look up the user record to get role + department
        const dbUser = await db.user.findUnique({ where: { email: user.email! } })
        if (dbUser) {
          token.role = dbUser.role
          token.department = dbUser.department
          token.name = dbUser.name
        }
      }
      // Allow session update (e.g. when we set the role on first login)
      if (trigger === 'update' && session) {
        if (session.role) token.role = session.role
        if (session.department) token.department = session.department
        if (session.name) token.name = session.name
      }
      return token
    },
    // Expose user role + department to the client session
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = (token.role as string) || 'STUDENT'
        session.user.department = (token.department as string | null) || null
        session.user.name = token.name as string
      }
      return session
    },
    async signIn({ user }) {
      // Allow sign-in for any email — in production you might restrict to @campus.edu
      return true
    },
  },
  pages: {
    signIn: '/', // we render our own login screen at /
    verifyRequest: '/', // we handle verification in our own UI
    error: '/',
  },
}

// Extend NextAuth types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: string
      department?: string | null
    }
  }
  interface User {
    role?: string
    department?: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: string
    department?: string | null
    name?: string | null
  }
}
