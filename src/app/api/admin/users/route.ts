import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/admin/users?userId=... — list all users (admin only)
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const users = await db.user.findMany({
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, email: true, role: true, department: true, createdAt: true, _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } } },
  })
  return NextResponse.json({ users })
}

// POST /api/admin/users — create a new user (admin only)
// Body: { userId, name, email, role, department? }
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const { userId, name, email, role, department } = body
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

  const admin = await db.user.findUnique({ where: { id: userId } })
  if (!admin) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (admin.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (!name?.trim() || !email?.trim() || !role) {
    return NextResponse.json({ error: 'name, email, and role are required' }, { status: 400 })
  }
  const emailStr = String(email).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }
  if (!['STUDENT', 'FACULTY', 'STAFF', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const existing = await db.user.findUnique({ where: { email: emailStr } })
  if (existing) return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })

  const newUser = await db.user.create({
    data: { name: name.trim(), email: emailStr, role, department: department?.trim() || null },
    select: { id: true, name: true, email: true, role: true, department: true, createdAt: true },
  })
  return NextResponse.json({ user: newUser }, { status: 201 })
}
